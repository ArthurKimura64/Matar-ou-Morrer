import { createClient } from "@supabase/supabase-js"
import { supabase } from "../../config/supabaseClient"
import { RoomService } from "../../services/roomService"
import { CombatService } from "../../services/combatService"
import authService from "../../services/authService"
import { statsService } from "../../services/statsService"
import { adaptGameData, adaptLocalization } from "../../utils/gameDataAdapter"
import {
  parseDefenseDices,
  parseAttackDices,
  rollSixSidedDice,
  calculateCombatRounds,
  getWeaponForMode,
  applyModeToWeapon,
  extractPlayerWeapons
} from "../../utils/combatHelpers"
import { Utils } from "../../utils/cardFormatter"
import { getCharacterAdditionalCounters, updateAdditionalCounter, resetAdditionalCounters } from "../../utils/AdditionalCountersConfig"
import {
  serializeSelections,
  hydrateSelections,
  stripNotesFromAdditionalCounters,
  buildPublicCharacteristicsSummary
} from "../../utils/playerStateCodec"
import { PlayerPersistence } from "../../utils/playerPersistence"
import { sanitizeHtml, safeInnerHtml } from "../../utils/sanitize"
import { validatePlayerName, validateRoomName, validateRoomId, validateCounterValue, validateJsonData, escapeHtml } from "../../utils/validation"
import { AVAILABLE_THEMES, DEFAULT_THEME } from "../../config/themes"
import { isVlastActor } from "../character/VlastPowerConverter"

// ==================== MINI-FRAMEWORK DE ASSERÇÕES ====================

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Condição esperada falhou")
  }
}

function assertEqual(actual, expected, label = "Valor") {
  if (actual !== expected) {
    throw new Error(`${label}: esperado "${expected}", mas recebeu "${actual}"`)
  }
}

/**
 * Permite marcar um teste como "pulado" (aviso neutro) quando o recurso
 * depende de um ambiente específico (ex: rotas /api ou SERVICE_ROLE_KEY local).
 */
class SkipTestError extends Error {
  constructor(reason) {
    super(reason)
    this.isSkip = true
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function safeRun(fn) {
  try {
    await fn()
  } catch {
    /* ignora erro de limpeza */
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL || ""
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.REACT_APP_SUPABASE_ANON_KEY || ""

// Controla o cooldown do rate limiter de createRoomWithHost (5s) entre Suíte 6 e Suíte 7
let lastSandboxRoomCreatedAt = 0

async function createSandboxRoomRespectingCooldown(roomName, masterName) {
  const elapsed = Date.now() - lastSandboxRoomCreatedAt
  if (lastSandboxRoomCreatedAt > 0 && elapsed < 5200) {
    await sleep(5200 - elapsed)
  }
  const res = await RoomService.createRoomWithHost(roomName, masterName)
  lastSandboxRoomCreatedAt = Date.now()
  return res
}

async function cleanupSandboxRoom(roomId, playerId) {
  if (playerId) {
    await safeRun(() => CombatService.cancelPlayerCombats(playerId))
    await safeRun(() => RoomService.leaveRoom(playerId))
  }
  if (roomId) {
    await safeRun(async () => {
      const { error: rpcDelErr } = await supabase.rpc("admin_delete_room", { p_room_id: roomId })
      if (rpcDelErr) {
        await supabase.from("rooms").delete().eq("id", roomId)
      }
    })
  }
}

// ==================== HELPERS DE CAIXA PRETA (3 BOTS REAIS) ====================

async function getAdminAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  return session?.access_token || null
}

function buildRoundData(attackerLoadTime, defenderLoadTime) {
  const { totalRounds, rounds } = calculateCombatRounds(attackerLoadTime, defenderLoadTime)
  const roundData = rounds.map((r) => ({
    ...r,
    attacker: { rolled: false, roll: [], total: 0 },
    defender: { rolled: false, roll: [], total: 0 },
    completed: false
  }))
  return { totalRounds, roundData }
}

/**
 * Cria contas comuns temporárias (não-admin) e retorna clientes Supabase isolados
 * na memória (persistSession: false), garantindo que a sessão do Admin não seja alterada.
 */
async function createBlackBoxBots(labels = ["BotAlpha", "BotBeta", "BotGamma"]) {
  const adminToken = await getAdminAccessToken()
  if (!adminToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SkipTestError("Sessão Admin ou variáveis do Supabase indisponíveis.")
  }

  const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const password = `KodBot#${runTag.slice(-6)}`
  const createdBots = []

  try {
    for (let i = 0; i < labels.length; i++) {
      const displayName = `${labels[i]}_${runTag.slice(-4)}`
      const email = `kod_e2e_${i}_${runTag}@kodtest.local`

      let res
      try {
        res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminToken}`
          },
          body: JSON.stringify({ email, password, displayName })
        })
      } catch {
        throw new SkipTestError("Rota /api/admin/create-user indisponível neste host.")
      }

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        throw new SkipTestError('Rotas /api indisponíveis neste preview (rode com "npm run dev").')
      }

      const body = await res.json()
      if (!res.ok || !body?.user?.id) {
        if (res.status === 500) {
          throw new SkipTestError("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor local (.env.local) para criar bots de teste.")
        }
        throw new Error(`Falha ao criar bot ${displayName}: ${body?.error || res.status}`)
      }

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `kod_e2e_bot_${i}_${runTag}`
        }
      })

      const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
      if (signInErr) {
        throw new Error(`Falha no login do bot ${displayName}: ${signInErr.message}`)
      }

      createdBots.push({
        userId: body.user.id,
        email,
        displayName,
        client
      })
    }

    return { bots: createdBots, adminToken }
  } catch (err) {
    // Se falhar no meio da criação, apaga os bots já criados
    await destroyBlackBoxBots(createdBots, adminToken)
    throw err
  }
}

async function destroyBlackBoxBots(bots = [], adminToken = null) {
  const token = adminToken || (await getAdminAccessToken())
  await Promise.allSettled(
    bots.map(async (bot) => {
      try {
        await bot.client?.auth?.signOut()
      } catch {
        /* ignora erro de signOut */
      }
      if (!token || !bot.userId) return
      try {
        await fetch("/api/admin/delete-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ userId: bot.userId })
        })
      } catch {
        /* ignora erro de limpeza */
      }
    })
  )
}

// ==================== CONSTRUTOR DAS SUÍTES ====================

export function buildTestSuites({ gameData, localization, currentUser }) {
  return [
    // ------------------------------------------------------------------
    // SUÍTE 1: DADOS DO JOGO, ADAPTADOR, CONTADORES & TEMAS
    // ------------------------------------------------------------------
    {
      id: "data-integrity",
      title: "1. Dados do Jogo, Adaptador & Temas",
      description: "Valida integridade referencial dos JSONs, adaptador em memória, contadores especiais e temas.",
      tests: [
        {
          id: "actors-loaded",
          name: "Lista de personagens carregada e íntegra",
          run: async () => {
            const actors = gameData?.ActorDefinitions || []
            assert(actors.length > 0, "Nenhum personagem encontrado em gameData.ActorDefinitions")

            const broken = actors.filter(
              (a) =>
                !a.ID ||
                typeof a.NumberOfUnlimitedAttacks !== "number" ||
                Number.isNaN(a.NumberOfUnlimitedAttacks) ||
                typeof a.defenseDices !== "number" ||
                Number.isNaN(a.defenseDices)
            )

            assert(broken.length === 0, `Personagens com campos numéricos quebrados: ${broken.map((b) => b.ID).join(", ")}`)
            return `${actors.length} personagens validados com sucesso`
          }
        },
        {
          id: "indexes-and-refs",
          name: "Índices O(1) e integridade referencial de todas as cartas",
          run: async () => {
            const defsMap = gameData?.indexes?.definitionsMap
            const ownerMap = gameData?.indexes?.ownerActorMap
            assert(defsMap instanceof Map && defsMap.size > 0, "gameData.indexes.definitionsMap ausente ou vazio")
            assert(ownerMap instanceof Map && ownerMap.size > 0, "gameData.indexes.ownerActorMap ausente ou vazio")

            const refFields = [
              "UnlimitedAttacksData",
              "WeaponsData",
              "PassivesData",
              "PowersData",
              "DevicesData",
              "SpecialAbilitiesData",
              "PassiveSpecialAbilitiesData",
              "SpecialCharacteristics"
            ]

            const missingRefs = []
            ;(gameData.ActorDefinitions || []).forEach((actor) => {
              refFields.forEach((field) => {
                ;(actor[field] || []).forEach((id) => {
                  if (!defsMap.has(id)) {
                    missingRefs.push(`${actor.ID}.${field}->${id}`)
                  }
                })
              })
            })

            assert(missingRefs.length === 0, `Referências quebradas em GameEconomyData.json: ${missingRefs.slice(0, 5).join(", ")}`)
            return `${defsMap.size} definições indexadas e 100% das referências íntegras`
          }
        },
        {
          id: "adapter-edge-cases",
          name: 'Normalização de casos extremos ("" vazio, texto na defesa e nome numérico)',
          run: async () => {
            const adapted = adaptGameData({
              ActorDefinitions: [
                {
                  ID: "MockAbsoluto",
                  NumberOfUnlimitedAttacks: "",
                  NumberOfDefenseDices: "Não joga dados para se defender"
                }
              ]
            })
            const mock = adapted.ActorDefinitions[0]
            assertEqual(mock.NumberOfUnlimitedAttacks, 0, "String vazia em ataques")
            assertEqual(mock.defenseDices, 0, "Defesa em texto convertida para número")
            assert(Boolean(mock.defenseRuleText?.includes("Não joga dados")), "Texto da regra de defesa deveria ser preservado em defenseRuleText")

            const loc = adaptLocalization({ "Character.Name.Vinteum": 21, "Empty.Key": null })
            assertEqual(typeof loc["Character.Name.Vinteum"], "string", "Tipo do nome 21")
            assertEqual(loc["Character.Name.Vinteum"], "21", "Valor do nome 21")
            assertEqual(loc["Empty.Key"], "", "Valor nulo convertido para string vazia")

            return "Casos extremos (Absoluto, Energz e Vinteum) blindados"
          }
        },
        {
          id: "localization-all-strings",
          name: "Todas as chaves de Localization são strings válidas",
          run: async () => {
            const entries = Object.entries(localization || {})
            assert(entries.length > 0, "Objeto de localização está vazio")
            const nonStrings = entries.filter(([, val]) => typeof val !== "string")
            assert(nonStrings.length === 0, `Encontradas ${nonStrings.length} chaves não-string (ex: ${nonStrings[0]?.[0]})`)
            return `${entries.length} chaves de tradução verificadas`
          }
        },
        {
          id: "additional-counters-config",
          name: "Contadores especiais (criação, limites min/max e reset)",
          run: async () => {
            const caos = (gameData?.ActorDefinitions || []).find((a) => a.ID === "Caos")
            const kader = (gameData?.ActorDefinitions || []).find((a) => a.ID === "Kader")
            assert(caos && kader, "Personagens Caos/Kader não encontrados para teste de contadores")

            const caosCounters = getCharacterAdditionalCounters("Caos", {
              actor: caos,
              gameData,
              localization
            })
            assert(Boolean(caosCounters["SpecialCustom.Caos1"]), "Caos deveria gerar contador Aura Negra")
            assertEqual(caosCounters["SpecialCustom.Caos1"].max, 30, "Máximo da Aura Negra")

            const clampedHigh = updateAdditionalCounter(caosCounters, "SpecialCustom.Caos1", 999)
            assertEqual(clampedHigh["SpecialCustom.Caos1"].current, 30, "Limite máximo do contador")

            const clampedLow = updateAdditionalCounter(clampedHigh, "SpecialCustom.Caos1", -5)
            assertEqual(clampedLow["SpecialCustom.Caos1"].current, 0, "Limite mínimo do contador")

            const reset = resetAdditionalCounters(clampedHigh)
            assertEqual(reset["SpecialCustom.Caos1"].current, 0, "Reset do contador especial")

            const kaderCounters = getCharacterAdditionalCounters("Kader", {
              actor: kader,
              gameData,
              localization
            })
            assert(!kaderCounters["SpecialCustom.Kader1"], "Textbox (Destinos) não deve virar contador numérico")
            assert(Boolean(kaderCounters["SpecialCustom.Kader2"]), "Escudo de Kader deveria ser contador numérico")

            return "Contadores especiais e clamping validados (Caos & Kader)"
          }
        },
        {
          id: "themes-catalog",
          name: "Catálogo de temas visuais e tema ativo no DOM",
          run: async () => {
            assert(Array.isArray(AVAILABLE_THEMES) && AVAILABLE_THEMES.length >= 5, "Catálogo de temas incompleto")
            const ids = AVAILABLE_THEMES.map((t) => t.id)
            const uniqueIds = new Set(ids)
            assertEqual(uniqueIds.size, ids.length, "IDs de temas duplicados")
            assert(uniqueIds.has(DEFAULT_THEME), `DEFAULT_THEME ("${DEFAULT_THEME}") ausente no catálogo`)

            const activeAttr = document.documentElement.getAttribute("data-kod-theme")
            assert(uniqueIds.has(activeAttr), `Atributo data-kod-theme inválido no HTML: "${activeAttr}"`)

            return `${AVAILABLE_THEMES.length} temas íntegros | Ativo: ${activeAttr}`
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 2: FORMATAÇÃO DE CARTAS, MODOS & CODEC DO ESTADO PRIVADO
    // ------------------------------------------------------------------
    {
      id: "cards-codec",
      title: "2. Cartas, Modos & Codec de Estado (Ficha/Copiador/Vlast)",
      description: "Garante formatação de cartas, serialização enxuta, sigilo de notas, Especiais do Copiador e conversão da Vlast.",
      tests: [
        {
          id: "card-formatter-modes",
          name: "Formatação de ataque simples, modo duplo (Eclipse) e gatilhos (P/A/D)",
          run: async () => {
            const eclipse = (gameData?.ActorDefinitions || []).find((a) => a.ID === "EclipseKnight")
            const sword = gameData?.indexes?.definitionsMap?.get("Weapon.EclipseKnight1")
            const restrictedPassive = gameData?.indexes?.definitionsMap?.get("Passive.EclipseKnight1")
            const power = gameData?.indexes?.definitionsMap?.get("Power.Impact1")
            assert(eclipse && sword && restrictedPassive && power, "Cartas de referência ausentes")

            assert(Utils.modeSystem.hasModes(eclipse), "EclipseKnight deve ter sistema de modos")
            assert(!Utils.modeSystem.canUseItem(restrictedPassive, "mode1"), "Passiva mode2 deve bloquear no mode1")
            assert(Utils.modeSystem.canUseItem(restrictedPassive, "mode2"), "Passiva mode2 deve liberar no mode2")

            const dualHtml = Utils.createDualModeDescription(sword, localization, eclipse)
            assert(dualHtml.includes("Normal") && dualHtml.includes("Eclipse"), "Descrição dupla deve citar os 2 modos")

            const restrictedHtml = Utils.createModeRestrictedDescription(restrictedPassive, localization, eclipse)
            assert(restrictedHtml.includes("Eclipse"), "Descrição restrita deve avisar o modo exigido")

            const triggerTitle = Utils.createTriggerName(power.ID, power, localization)
            assert(triggerTitle.startsWith("(P)"), `Esperado prefixo "(P)" em "${triggerTitle}"`)

            return "Formatação de cartas, modo duplo e gatilhos verificados"
          }
        },
        {
          id: "codec-roundtrip-and-notes",
          name: "Codec: serializeSelections ↔ hydrateSelections e isolamento de _notes",
          run: async () => {
            const atk = gameData?.indexes?.definitionsMap?.get("Attack.Impact1")
            const pwr = gameData?.indexes?.definitionsMap?.get("Power.Impact1")
            const spec = gameData?.indexes?.definitionsMap?.get("SpecialAbility.Caos1")
            assert(atk && pwr && spec, "Definições de teste ausentes")

            const original = {
              attacks: [atk],
              powers: [pwr],
              copycatAssignments: { specials: { slot_0: spec } },
              convertedPowers: [pwr.ID]
            }

            const compact = serializeSelections(original)
            assertEqual(compact.attacks[0], "Attack.Impact1", "Serialização deve gravar apenas IDs")
            assertEqual(compact.copycatAssignments.specials.slot_0, "SpecialAbility.Caos1", "Cópia serializada como ID")

            const hydrated = hydrateSelections(compact, gameData)
            assertEqual(hydrated.attacks[0].Damage, atk.Damage, "Hidratação deve restaurar objeto completo")
            assertEqual(hydrated.copycatAssignments.specials.slot_0.ID, spec.ID, "Hidratação de cópia")
            assertEqual(hydrated.convertedPowers[0], pwr.ID, "Hidratação de poderes convertidos")

            const publicOnly = stripNotesFromAdditionalCounters({
              "SpecialCustom.Kader2": { current: 6, max: 20, label: "Escudo" },
              "_notes": { "SpecialCustom.Kader1": "Segredo privado" },
              "legacyString": "texto solto"
            })
            assert(!("_notes" in publicOnly), "_notes não pode vazar para a tabela pública")
            assert(!("legacyString" in publicOnly), "Strings soltas não podem ir para additional_counters público")
            assertEqual(publicOnly["SpecialCustom.Kader2"].current, 6, "Contador numérico deve ser preservado")

            return "Compactação, hidratação e filtragem de notas privadas OK"
          }
        },
        {
          id: "codec-summary-copycat-and-vlast",
          name: "Resumo público: Especiais do Copiador e conversão da Nyanja Vlast",
          run: async () => {
            const copiador = (gameData?.ActorDefinitions || []).find((a) => a.ID === "Copiador")
            const vlast = (gameData?.ActorDefinitions || []).find((a) => a.ID === "NyanjaVlast")
            const spec = gameData?.indexes?.definitionsMap?.get("SpecialAbility.Caos1")
            const passSpec = gameData?.indexes?.definitionsMap?.get("PassiveSpecialAbility.Atomico1")
            const vlastPwr1 = gameData?.indexes?.definitionsMap?.get("Power.NyanjaVlast1")
            const vlastPwr2 = gameData?.indexes?.definitionsMap?.get("Power.NyanjaVlast2")
            assert(copiador && vlast && spec && passSpec && vlastPwr1 && vlastPwr2, "Dados de Copiador/Vlast ausentes")

            const copySummary = buildPublicCharacteristicsSummary({
              actor: copiador,
              selections: {},
              usedItems: [],
              unlockedItems: [],
              copycatAssignments: {
                specials: { slot_0: spec },
                passiveSpecials: { slot_0: passSpec }
              }
            })
            assertEqual(copySummary.specials.total, 3, "Total de Especiais do Copiador")
            assertEqual(copySummary.specials.available, 1, "Especial copiada deve aparecer disponível (1/3)")
            assertEqual(copySummary.passiveSpecials.available, 0, "Especial Passiva copiada começa bloqueada (0/3)")

            assert(isVlastActor(vlast, localization), "isVlastActor deveria reconhecer NyanjaVlast")
            const vlastSummary = buildPublicCharacteristicsSummary({
              actor: vlast,
              selections: { powers: [vlastPwr1, vlastPwr2], passives: [] },
              convertedPowers: [vlastPwr1.ID]
            })
            assertEqual(vlastSummary.powers.total, 1, "Poder convertido deve sair do total de Poderes")
            assertEqual(vlastSummary.passives.total, 1, "Poder convertido deve somar no total de Passivas")
            assertEqual(vlastSummary.passives.available, 1, "Passiva convertida deve contar como disponível")

            return "Copiador (1/3 Especial) e Nyanja Vlast (Poder → Passiva) validados"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 3: REGRAS PURAS DE COMBATE & ARMAS
    // ------------------------------------------------------------------
    {
      id: "combat-rules",
      title: "3. Regras Puras de Combate & Armas",
      description: "Valida 0 dados, textos em armas, rolagem d6, cálculo de rodadas, Modo 1/2 e extração de armas da ficha.",
      tests: [
        {
          id: "zero-dices-and-text-values",
          name: '0 dados preservado e valores textuais ("??", "Infinito", Energz)',
          run: async () => {
            assertEqual(parseAttackDices("0"), 0, 'parseAttackDices("0")')
            assertEqual(parseAttackDices(0), 0, "parseAttackDices(0)")
            assertEqual(parseAttackDices("3"), 3, 'parseAttackDices("3")')
            assertEqual(parseAttackDices("??", 0), 0, 'parseAttackDices("??")')

            assertEqual(parseDefenseDices("0"), 0, 'parseDefenseDices("0")')
            assertEqual(parseDefenseDices("Não joga dados", 0), 0, "parseDefenseDices(texto)")
            assertEqual(parseDefenseDices(2), 2, "parseDefenseDices(2)")

            return "0 dados e textos especiais tratados sem NaN"
          }
        },
        {
          id: "dice-roller-bounds",
          name: "rollSixSidedDice gera d6 válidos (1–6) ordenados do maior para o menor",
          run: async () => {
            assertEqual(rollSixSidedDice(0).length, 0, "0 dados deve gerar array vazio")
            const dice = rollSixSidedDice(20)
            assertEqual(dice.length, 20, "Quantidade de dados rolados")
            for (let i = 0; i < dice.length; i++) {
              assert(dice[i] >= 1 && dice[i] <= 6, `Valor de dado fora do intervalo 1–6: ${dice[i]}`)
              if (i > 0) {
                assert(dice[i - 1] >= dice[i], "Dados deveriam estar ordenados em ordem decrescente")
              }
            }
            return "20 dados d6 gerados dentro dos limites e ordenados"
          }
        },
        {
          id: "combat-rounds-order",
          name: "Ordem e quantidade de rodadas (empate, mais rápido, mais lento e -1s)",
          run: async () => {
            const equal = calculateCombatRounds("2", "2")
            assertEqual(equal.totalRounds, 3, "Empate gera 3 rodadas (Atk, Def, Atk)")
            assertEqual(equal.rounds[0].action_type, "attack", "1ª rodada sempre do atacante")
            assertEqual(equal.rounds[1].action_type, "counter", "Penúltima rodada do defensor")
            assertEqual(equal.rounds[2].action_type, "attack", "Última rodada do atacante")

            const fastAtk = calculateCombatRounds("0", "3")
            assertEqual(fastAtk.totalRounds, 6, "Diferença de -3s dá 3 ataques extras (6 rodadas)")

            const fastDef = calculateCombatRounds("4", "1")
            assertEqual(fastDef.totalRounds, 6, "Diferença de +3s dá 3 contra-ataques extras")
            assertEqual(fastDef.rounds.filter((r) => r.action_type === "counter").length, 4, "Total de contras")

            const negativeLoad = calculateCombatRounds("-1", "1")
            assertEqual(negativeLoad.totalRounds, 5, "LoadTime -1 vs 1 gera 2 ataques extras")

            return `Empate (${equal.totalRounds}r), -3s (${fastAtk.totalRounds}r), +3s (${fastDef.totalRounds}r), -1s (${negativeLoad.totalRounds}r)`
          }
        },
        {
          id: "dual-mode-weapon-sync",
          name: "Troca de Modo 1 → Modo 2 atualiza status da arma (Eclipse)",
          run: async () => {
            const dualWeapon = {
              ID: "Weapon.TesteEclipse",
              Name: "Espada do Julgamento",
              Dices: "2",
              LoadTime: "1",
              Damage: "8",
              modes: {
                mode1: { Dices: "2", LoadTime: "1", Damage: "8" },
                mode2: { Dices: "1", LoadTime: "0", Damage: "Infinito" }
              }
            }

            const rawMode2 = getWeaponForMode(dualWeapon, "mode2")
            assertEqual(rawMode2.Damage, "Infinito", "getWeaponForMode(mode2)")

            const mode2Weapon = applyModeToWeapon(dualWeapon, "mode2")
            assertEqual(mode2Weapon.Dices, "1", "Dados no Modo 2")
            assertEqual(mode2Weapon.LoadTime, "0", "Segundos no Modo 2")
            assertEqual(mode2Weapon.Damage, "Infinito", "Dano no Modo 2")
            assertEqual(mode2Weapon.activeMode, "mode2", "Flag activeMode")

            return "Status da arma convertidos corretamente para o Modo 2"
          }
        },
        {
          id: "extract-player-weapons",
          name: "extractPlayerWeapons lê ataques, armas, cópias do Copiador e modo ativo",
          run: async () => {
            const eclipse = (gameData?.ActorDefinitions || []).find((a) => a.ID === "EclipseKnight")
            const sword = gameData?.indexes?.definitionsMap?.get("Weapon.EclipseKnight1")
            const impactAtk = gameData?.indexes?.definitionsMap?.get("Attack.Impact1")
            assert(eclipse && sword && impactAtk, "Definições para extractPlayerWeapons ausentes")

            const mockPlayer = {
              character: {
                actor: eclipse,
                selections: {
                  weapons: [sword],
                  attacks: [],
                  copycatAssignments: { attacks: { slot_0: impactAtk } }
                }
              }
            }

            const weaponsM2 = extractPlayerWeapons(mockPlayer, "mode2", localization)
            assertEqual(weaponsM2.length, 2, "Deve extrair arma própria + ataque copiado")
            const extractedSword = weaponsM2.find((w) => w.ID === sword.ID)
            assertEqual(extractedSword?.Damage, "Infinito", "Arma extraída no Modo 2 deve refletir Damage Infinito")

            return "Extração de armas próprias, copiadas e por modo validada"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 4: SEGURANÇA (XSS), VALIDAÇÕES & PERSISTÊNCIA LOCAL
    // ------------------------------------------------------------------
    {
      id: "security-validation",
      title: "4. Segurança (XSS), Validações & Persistência Local",
      description: "Garante sanitização de HTML, limites de entrada/JSONB e ciclo de leitura/escrita do PlayerPersistence.",
      tests: [
        {
          id: "xss-sanitization",
          name: "sanitizeHtml e safeInnerHtml bloqueiam <script>, eventos inline e URLs javascript:",
          run: async () => {
            const dirty =
              '<b onclick="alert(1)">Ataque</b><script>window.__xss=1</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">link</a>'
            const clean = sanitizeHtml(dirty)
            assert(!clean.toLowerCase().includes("<script"), "Tag <script> não foi removida")
            assert(!clean.toLowerCase().includes("onerror"), "Atributo onerror não foi removido")
            assert(!clean.toLowerCase().includes("onclick"), "Atributo onclick não foi removido")
            assert(!clean.toLowerCase().includes("javascript:"), "Esquema javascript: não foi removido")
            assert(clean.includes("<b>Ataque</b>"), "Tag segura <b> deveria ser preservada")

            const propObj = safeInnerHtml(dirty)
            assertEqual(propObj?.dangerouslySetInnerHTML?.__html, clean, "safeInnerHtml deve encapsular HTML limpo")

            return "XSS neutralizado mantendo formatação segura"
          }
        },
        {
          id: "input-validators",
          name: "Validadores de nome, sala, código, contador, limite JSONB (50KB) e escapeHtml",
          run: async () => {
            assert(validatePlayerName("Jogador-1").valid, "Nome válido foi rejeitado")
            assert(!validatePlayerName("   ").valid, "Nome vazio deveria ser rejeitado")
            assert(!validatePlayerName("A").valid, "Nome com 1 letra deveria ser rejeitado")
            assert(!validatePlayerName("<script>").valid, "Nome com tags deveria ser rejeitado")

            assert(validateRoomName("Mesa Principal").valid, "Nome de sala válido foi rejeitado")
            assert(!validateRoomName("").valid, "Nome de sala vazio deveria ser rejeitado")

            assert(validateRoomId("123456").valid, "Código de 6 dígitos válido foi rejeitado")
            assert(!validateRoomId("ABC").valid, "Código alfabético deveria ser rejeitado")
            assert(!validateRoomId("12345").valid, "Código com 5 dígitos deveria ser rejeitado")

            assert(validateCounterValue(10, 0, 20).valid, "Contador válido rejeitado")
            assert(!validateCounterValue(25, 0, 20).valid, "Contador acima do máximo aceito")
            assert(!validateCounterValue(1.5, 0, 20).valid, "Contador decimal aceito")

            assert(validateJsonData({ vida: 20 }).valid, "JSON pequeno válido foi rejeitado")
            assert(!validateJsonData({ big: "x".repeat(60000) }).valid, "JSON > 50KB deveria ser rejeitado")

            assertEqual(escapeHtml("<b>\"A\"&'B'</b>"), "&lt;b&gt;&quot;A&quot;&amp;&#039;B&#039;&lt;/b&gt;", "escapeHtml")

            return "Todas as regras de validação responderam como esperado"
          }
        },
        {
          id: "player-persistence-cycle",
          name: "PlayerPersistence salva, valida e limpa preservando sessão atual",
          run: async () => {
            const keys = ["killOrDie_currentPlayer", "killOrDie_currentRoom", "killOrDie_appState", "killOrDie_sessionId"]
            const backupLocal = {}
            keys.forEach((k) => {
              backupLocal[k] = localStorage.getItem(k)
            })
            const backupSession = sessionStorage.getItem("killOrDie_tabSessionId")

            try {
              const fakeRoom = { id: "999999", name: "Sala Teste" }
              const fakePlayer = { id: "00000000-0000-0000-0000-000000000001", name: "Teste", room_id: "999999" }

              PlayerPersistence.savePlayerData(fakePlayer, fakeRoom)
              assert(PlayerPersistence.validateSavedData(), "Dados salvos válidos deveriam passar na validação")

              PlayerPersistence.saveAppState({ currentView: "sheet", selectedActorId: "Impact" })
              const loadedState = PlayerPersistence.getAppState()
              assertEqual(loadedState?.selectedActorId, "Impact", "AppState restaurado")

              PlayerPersistence.clearAppState()
              assertEqual(PlayerPersistence.getAppState(), null, "clearAppState deve limpar apenas o appState")
              assert(Boolean(PlayerPersistence.getPlayerData()), "clearAppState não deve apagar player/room")

              PlayerPersistence.clearPlayerData()
              assertEqual(PlayerPersistence.getPlayerData(), null, "clearPlayerData deve limpar tudo")

              return "Ciclo completo do PlayerPersistence validado sem efeitos colaterais"
            } finally {
              keys.forEach((k) => {
                if (backupLocal[k] === null) localStorage.removeItem(k)
                else localStorage.setItem(k, backupLocal[k])
              })
              if (backupSession === null) sessionStorage.removeItem("killOrDie_tabSessionId")
              else sessionStorage.setItem("killOrDie_tabSessionId", backupSession)
            }
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 5: INFRAESTRUTURA, AUTH, RANKING, STATS & API
    // ------------------------------------------------------------------
    {
      id: "infra-auth-stats",
      title: "5. Infraestrutura, Auth, Estatísticas & API",
      description: "Verifica latência, autenticação, ranking, proteção contra wildcards, RPCs de leitura Admin e rotas /api.",
      tests: [
        {
          id: "supabase-latency",
          name: "Conexão ativa com Supabase",
          run: async () => {
            const conn = await RoomService.testConnection()
            assert(conn.connected, `Falha de conexão: ${conn.error}`)
            return `Conectado (latência: ${conn.latency}ms)`
          }
        },
        {
          id: "auth-profile-ban-admin",
          name: "Auth: Admin confirmado, perfil carregável e status de banimento íntegro",
          run: async () => {
            assert(Boolean(currentUser?.id), "Usuário não autenticado")
            const isAdmin = await authService.checkIsAdmin()
            assert(isAdmin === true, "RPC is_user_admin retornou false para esta conta")

            const [regOpen, profile, banStatus] = await Promise.all([
              authService.isRegistrationOpen(),
              authService.getProfile(currentUser.id),
              authService.checkBanStatus(currentUser.id)
            ])

            assert(typeof regOpen === "boolean", "isRegistrationOpen deve retornar booleano")
            assert(Boolean(profile?.id && profile?.display_name), "Perfil do usuário incompleto")
            assertEqual(banStatus?.banned, false, "Conta Admin atual não deveria estar banida")

            return `Admin: ${profile.display_name} | Cadastros: ${regOpen ? "Abertos" : "Fechados"}`
          }
        },
        {
          id: "ranking-service",
          name: "Ranking: getLeaderboard (ordenado) e getUserRankPosition",
          run: async () => {
            const list = await authService.getLeaderboard("composite", 10, true)
            assert(Array.isArray(list), "getLeaderboard deveria retornar um array")
            for (let i = 1; i < list.length; i++) {
              assert(
                Number(list[i - 1].composite_score) >= Number(list[i].composite_score),
                "Leaderboard fora de ordem decrescente de composite_score"
              )
            }

            const pos = await authService.getUserRankPosition(currentUser.id, "composite", true)
            if (pos !== null) {
              assert(typeof pos.position === "number" && pos.position >= 1, "Posição de ranking inválida")
            }

            return `${list.length} jogadores no top 10 | Sua posição: ${pos ? `#${pos.position}` : "sem partidas"}`
          }
        },
        {
          id: "stats-rpcs-and-wildcards",
          name: "Estatísticas públicas, brief stats e bloqueio de wildcards (%% / __)",
          run: async () => {
            const [globalRes, playerRes, briefRes, pctSearch, undSearch] = await Promise.all([
              statsService.getGlobalStats(true),
              statsService.getPlayerPublicStats(currentUser.id, true),
              supabase.rpc("get_players_brief_stats", { p_user_ids: [currentUser.id] }),
              statsService.searchPlayers("%%"),
              statsService.searchPlayers("__")
            ])

            assert(globalRes.success && globalRes.data?.overview, `Falha em getGlobalStats: ${globalRes.error}`)
            assert(playerRes.success && playerRes.data?.profile, `Falha em getPlayerPublicStats: ${playerRes.error}`)
            assert(!("email" in (playerRes.data.profile || {})), "Perfil público não deve expor email")
            assert(!briefRes.error && Array.isArray(briefRes.data), `Falha em get_players_brief_stats: ${briefRes.error?.message}`)
            assertEqual(pctSearch.players?.length, 0, 'Busca por "%%" não deve retornar contas')
            assertEqual(undSearch.players?.length, 0, 'Busca por "__" não deve retornar contas')

            return `Global (${globalRes.data.overview.total_matches} partidas) | Wildcards bloqueados`
          }
        },
        {
          id: "admin-rpcs-readonly",
          name: "RPCs de leitura do Painel Admin (dashboard, salas, usuários, auditoria e diagnóstico)",
          run: async () => {
            const [dash, rooms, usersWildcard, logs, diag] = await Promise.all([
              supabase.rpc("admin_get_dashboard"),
              supabase.rpc("admin_list_rooms", { p_include_inactive: true, p_limit: 5 }),
              supabase.rpc("admin_list_users", { p_search: "%%", p_banned_only: false, p_limit: 5 }),
              supabase.rpc("admin_get_audit_log", { p_limit: 5, p_offset: 0 }),
              supabase.rpc("test_cleanup_system")
            ])

            assert(!dash.error && dash.data, `admin_get_dashboard falhou: ${dash.error?.message}`)
            assert(!rooms.error && rooms.data?.success, `admin_list_rooms falhou: ${rooms.error?.message}`)
            assert(!usersWildcard.error && usersWildcard.data?.success, `admin_list_users falhou: ${usersWildcard.error?.message}`)
            assertEqual(usersWildcard.data.users.length, 0, 'admin_list_users deve escapar wildcard "%%"')
            assert(!logs.error && logs.data?.success, `admin_get_audit_log falhou: ${logs.error?.message}`)
            assert(!diag.error && diag.data?.test_passed, `test_cleanup_system falhou: ${diag.error?.message}`)

            return `Dashboard (${dash.data.total_users} usuários, ${dash.data.active_rooms} salas ativas) OK`
          }
        },
        {
          id: "serverless-api-endpoints",
          name: "Rotas /api: public-config (200) e proteção sem token em /api/admin/delete-user (401)",
          run: async () => {
            let cfgRes
            try {
              cfgRes = await fetch("/api/public-config")
            } catch {
              throw new SkipTestError("Servidor Serverless indisponível neste host")
            }

            const contentType = cfgRes.headers.get("content-type") || ""
            if (!cfgRes.ok || !contentType.includes("application/json")) {
              throw new SkipTestError('Rotas /api indisponíveis neste preview (rode com "npm run dev" ou na Vercel)')
            }

            const data = await cfgRes.json()
            assert(Boolean(data.supabaseUrl && data.supabaseAnonKey), "JSON de /api/public-config incompleto")

            const unauthRes = await fetch("/api/admin/delete-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000000" })
            })
            assertEqual(unauthRes.status, 401, "Rota admin sem token deve responder 401")

            return "/api/public-config OK (200) e middleware admin bloqueou sem token (401)"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 6: BANCO REAL — RLS, SALAS, SUCESSÃO & COFRE PRIVADO
    // ------------------------------------------------------------------
    {
      id: "db-rooms-rls-vault",
      title: "6. Banco Real: RLS, Salas, Sucessão & Cofre Privado",
      description: "Testa travas reais de RLS, rejeição de sala inativa, sucessão de mestre em sala vazia e sigilo do cofre privado.",
      tests: [
        {
          id: "rls-direct-write-blocks",
          name: "RLS bloqueia INSERT direto em rooms, players, combat_notifications, app_settings e audit_log",
          run: async () => {
            const [rRoom, rPlayer, rCombat, rSettings, rAudit] = await Promise.all([
              supabase.from("rooms").insert([{ id: "000001", name: "Hack", master_name: "Hack" }]),
              supabase.from("players").insert([{ room_id: "000001", name: "Hack", user_id: currentUser.id }]),
              supabase.from("combat_notifications").insert([{ room_id: "000001", attacker_name: "Hack" }]),
              supabase.from("app_settings").insert([{ key: "__rls_test__", value: "1" }]),
              supabase.from("admin_audit_log").insert([{ admin_user_id: currentUser.id, action: "__rls_test__" }])
            ])

            assert(Boolean(rRoom.error), "RLS deveria bloquear INSERT direto em rooms")
            assert(Boolean(rPlayer.error), "RLS deveria bloquear INSERT direto em players")
            assert(Boolean(rCombat.error), "RLS deveria bloquear INSERT direto em combat_notifications")
            assert(Boolean(rSettings.error), "RLS deveria bloquear INSERT direto em app_settings")
            assert(Boolean(rAudit.error), "RLS deveria bloquear INSERT direto em admin_audit_log")

            return "Todas as 5 políticas de bloqueio direto (RLS) responderam corretamente"
          }
        },
        {
          id: "join-inactive-room-blocked",
          name: "RPC join_room rejeita sala inexistente/inativa sem criar jogador fantasma",
          run: async () => {
            const { error } = await supabase.rpc("join_room", {
              p_room_id: "000000",
              p_player_name: "GhostCheck"
            })
            assert(Boolean(error), 'join_room deveria rejeitar sala inexistente "000000"')

            const { data: ghosts } = await supabase.from("players").select("id").eq("room_id", "000000")
            assertEqual((ghosts || []).length, 0, "Nenhum jogador fantasma deve ser gravado")

            return "Entrada em sala inativa bloqueada sem deixar órfãos"
          }
        },
        {
          id: "sandbox-room-vault-and-succession",
          name: "Ciclo Sandbox: Sala Atômica → Reconexão/RateLimit → Cofre Privado → Sucessão de Mestre → Limpeza",
          run: async () => {
            let sandboxRoomId = null
            let sandboxPlayerId = null
            const steps = []

            try {
              const roomRes = await createSandboxRoomRespectingCooldown("Sandbox Suite 6", "AdminTester")
              assert(roomRes.success && roomRes.room?.id && roomRes.player?.id, `Falha em createRoomWithHost: ${roomRes.error}`)
              assertEqual(roomRes.room.master_player_id, roomRes.player.id, "master_player_id inicial")
              sandboxRoomId = roomRes.room.id
              sandboxPlayerId = roomRes.player.id
              steps.push(`Sala ${sandboxRoomId}`)

              const reconnRes = await RoomService.joinRoom(sandboxRoomId, "AdminTester")
              assert(reconnRes.success && reconnRes.reconnected === true, `Falha ao reconectar: ${reconnRes.error}`)
              assertEqual(reconnRes.player.id, sandboxPlayerId, "Reconexão deve reutilizar o mesmo player_id")

              const spamRes = await RoomService.joinRoom(sandboxRoomId, "AdminTester")
              assert(spamRes.success === false, "Rate limiter de joinRoom deveria bloquear spam imediato")
              steps.push("Reconexão + RateLimit")

              const privSave = await RoomService.savePrivateState(sandboxPlayerId, {
                actor_id: "Impact",
                selections: { attacks: ["Attack.Impact1"], powers: ["Power.Impact1"] },
                used_items: ["Power.Impact1"],
                notes: { "SpecialCustom.Kader1": "Anotação secreta" }
              })
              assert(privSave.success, `Falha em savePrivateState: ${privSave.error}`)

              const privRead = await RoomService.getPrivateState(sandboxPlayerId)
              assert(
                privRead.success &&
                  privRead.data?.selections?.attacks?.includes("Attack.Impact1") &&
                  privRead.data?.notes?.["SpecialCustom.Kader1"] === "Anotação secreta",
                "Leitura do cofre privado falhou"
              )

              const pubRead = await RoomService.getPlayer(sandboxPlayerId)
              assert(!pubRead.player?.selections?.attacks, "Tabela pública players não deve conter cartas escolhidas")
              steps.push("Cofre Privado")

              const resetRes = await RoomService.resetPlayerForLobby(sandboxPlayerId)
              assert(resetRes.success, `Falha em resetPlayerForLobby: ${resetRes.error}`)
              const afterResetPriv = await RoomService.getPrivateState(sandboxPlayerId)
              assert(!afterResetPriv.data?.actor_id, "resetPlayerForLobby deveria limpar actor_id privado")
              steps.push("Reset Limpo")

              const leaveRes = await RoomService.leaveRoom(sandboxPlayerId)
              assert(leaveRes.success, `Falha ao sair da sala: ${leaveRes.error}`)
              sandboxPlayerId = null

              const emptyRoom = await RoomService.getRoomById(sandboxRoomId)
              assert(emptyRoom.success && emptyRoom.room.master_player_id === null, "Sala vazia deveria zerar master_player_id")

              const { data: rejoinData, error: rejoinErr } = await supabase.rpc("join_room", {
                p_room_id: sandboxRoomId,
                p_player_name: "NovoAnfitriao"
              })
              assert(!rejoinErr && rejoinData?.success, `Falha ao reentrar na sala vazia: ${rejoinErr?.message}`)
              sandboxPlayerId = rejoinData.player.id
              assertEqual(
                rejoinData.room.master_player_id,
                sandboxPlayerId,
                "Trigger trg_room_master_succession em INSERT deveria restaurar o anfitrião"
              )
              steps.push("Sucessão em INSERT")

              return `OK (${steps.join(" → ")}) + sala limpa`
            } finally {
              await cleanupSandboxRoom(sandboxRoomId, sandboxPlayerId)
            }
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 7: BANCO REAL — GUARDAS DE PARTIDA & RPCs DE COMBATE v5.6
    // ------------------------------------------------------------------
    {
      id: "db-match-combat-guards",
      title: "7. Banco Real: Guardas de Partida & RPCs de Combate (v5.6)",
      description: "Valida regras de bloqueio do ciclo de partida e contratos das RPCs de combate (incl. Multi-Alvo v5.6).",
      tests: [
        {
          id: "sandbox-match-lifecycle-guards",
          name: "Guardas de partida (start_match <2, declare_elimination, master_eliminate_player, end/cancel)",
          run: async () => {
            let sandboxRoomId = null
            let sandboxPlayerId = null

            try {
              const roomRes = await createSandboxRoomRespectingCooldown("Sandbox Suite 7", "AdminTester")
              assert(roomRes.success && roomRes.room?.id && roomRes.player?.id, `Falha ao criar sala sandbox: ${roomRes.error}`)
              sandboxRoomId = roomRes.room.id
              sandboxPlayerId = roomRes.player.id

              const startRes = await RoomService.startMatch(sandboxRoomId)
              assert(startRes.success === false, "start_match deveria exigir ao menos 2 jogadores")

              const combatRes = await CombatService.startCombat({
                roomId: sandboxRoomId,
                attackerId: sandboxPlayerId,
                defenderIds: [sandboxPlayerId],
                attackData: { Name: "Teste", Dices: "0", LoadTime: "1", Damage: "0" }
              })
              assert(combatRes.success === false, "start_combat deveria bloquear combate sem partida iniciada")

              const selfElim = await RoomService.declareElimination(sandboxPlayerId, null)
              assert(selfElim.success === false, "declare_elimination deveria bloquear sem partida ativa")

              const masterElim = await RoomService.masterEliminatePlayer(sandboxRoomId, sandboxPlayerId, null)
              assert(masterElim.success === false, "master_eliminate_player deveria bloquear sem partida ativa")

              const winRes = await RoomService.declareVictory(sandboxRoomId)
              assert(winRes.success === false, "end_match deveria bloquear sem partida ativa")

              const cancelRes = await RoomService.cancelMatch(sandboxRoomId)
              assert(cancelRes.success === false, "master_cancel_match deveria bloquear sem partida ativa")

              return "Todas as 6 travas do ciclo de partida responderam corretamente"
            } finally {
              await cleanupSandboxRoom(sandboxRoomId, sandboxPlayerId)
            }
          }
        },
        {
          id: "combat-rpcs-v56-contract",
          name: "Contratos das RPCs de combate v5.6 (confirm_defense_weapon, group_phase, rolls e oportunidade)",
          run: async () => {
            const fakeUuid = "00000000-0000-0000-0000-000000000000"

            const [confirmRes, phaseRes, rollRes, sharedRes, oppRes] = await Promise.all([
              CombatService.confirmDefenseWeapon({
                combatId: fakeUuid,
                defenderWeapon: null,
                roundData: [],
                totalRounds: 1
              }),
              CombatService.updateCombatGroupPhase(fakeUuid, "show_results"),
              CombatService.updateCombatRoll({
                combatId: fakeUuid,
                roundIndex: 0,
                isAttacker: true,
                roll: [6],
                total: 6
              }),
              CombatService.updateCombatGroupSharedRoll({
                combatGroupId: fakeUuid,
                roll: [6],
                total: 6
              }),
              CombatService.addOpportunityAttack({
                combatId: fakeUuid,
                playerId: fakeUuid,
                playerName: "Teste",
                weapon: { Name: "Teste", Dices: "1", LoadTime: "0", Damage: "1" },
                target: "attacker"
              })
            ])

            const isMissingRpc = (err) =>
              String(err || "")
                .toLowerCase()
                .includes("could not find the function")

            assert(!isMissingRpc(confirmRes.error), "RPC confirm_defense_weapon não encontrada no banco")
            assert(!isMissingRpc(phaseRes.error), "RPC update_combat_group_phase não encontrada no banco")
            assert(!isMissingRpc(rollRes.error), "RPC update_combat_roll não encontrada no banco")
            assert(!isMissingRpc(sharedRes.error), "RPC update_combat_group_shared_roll não encontrada no banco")
            assert(!isMissingRpc(oppRes.error), "RPC add_opportunity_attack não encontrada no banco")

            assert(confirmRes.success === false, "confirm_defense_weapon deve rejeitar ID inexistente")
            assert(phaseRes.success === false, "update_combat_group_phase deve rejeitar grupo inexistente")
            assert(rollRes.success === false, "update_combat_roll deve rejeitar combate inexistente")
            assert(sharedRes.success === false, "update_combat_group_shared_roll deve rejeitar grupo inexistente")
            assert(oppRes.success === false, "add_opportunity_attack deve rejeitar combate inexistente")

            return "Todas as 5 RPCs de combate (incl. v5.6) instaladas e validando entradas"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 8: CAIXA PRETA END-TO-END (JORNADA REAL DE 1 A 3 JOGADORES)
    // ------------------------------------------------------------------
    {
      id: "blackbox-e2e",
      title: "8. Caixa Preta End-to-End (Simulação Real de 3 Jogadores)",
      description: "Simula partidas completas como jogadores reais (RLS não-admin, Multi-Alvo, Oportunidade, Desconexão, Vitória e Stats).",
      tests: [
        {
          id: "blackbox-solo-journey",
          name: "Caixa Preta Solo: Montar → Ficha → Alterar Contadores/Itens → F5 (Restore) → Soft Reset",
          run: async () => {
            const SOLO_KEY = "killOrDie_soloSheetState"
            const backupSolo = localStorage.getItem(SOLO_KEY)
            const backupApp = localStorage.getItem("killOrDie_appState")

            try {
              const impact = (gameData?.ActorDefinitions || []).find((a) => a.ID === "Impact")
              assert(impact, "Personagem Impact não encontrado")

              const atk1 = gameData.indexes.definitionsMap.get("Attack.Impact1")
              const atk2 = gameData.indexes.definitionsMap.get("Attack.Impact2")
              const pass1 = gameData.indexes.definitionsMap.get("Passive.Impact1")
              const pwr1 = gameData.indexes.definitionsMap.get("Power.Impact1")
              const spec1 = gameData.indexes.definitionsMap.get("SpecialAbility.Impact1")

              // 1. Montagem e serialização (simulando ir para Ficha Solo)
              const selections = {
                attacks: [atk1, atk2],
                weapons: [],
                passives: [pass1],
                devices: [],
                powers: [pwr1],
                specials: [spec1],
                passiveSpecials: []
              }

              PlayerPersistence.saveAppState({
                currentView: "sheet",
                selectedActorId: impact.ID,
                characterSelections: serializeSelections(selections),
                isSoloMode: true
              })

              // 2. Simula uso na ficha (vida 12, 3 pulos, poder usado) e grava estado solo
              const soloState = {
                actorId: impact.ID,
                counters: { vida: 12, vida_max: 20, esquiva: 3, esquiva_max: 10, oport: 1, oport_max: 8, item: 0, item_max: 3 },
                soloKills: 1,
                usedItems: [pwr1.ID],
                unlockedItems: [spec1.ID],
                exposedCards: [atk1.ID],
                additionalCounters: {},
                copycatAssignments: {},
                convertedPowers: []
              }
              localStorage.setItem(SOLO_KEY, JSON.stringify(soloState))

              // 3. Simula F5: restaura appState + soloSheetState
              const restoredApp = PlayerPersistence.getAppState()
              const restoredHydrated = hydrateSelections(restoredApp.characterSelections, gameData)
              const restoredSolo = JSON.parse(localStorage.getItem(SOLO_KEY))

              assertEqual(restoredApp.selectedActorId, "Impact", "Personagem solo após F5")
              assertEqual(restoredHydrated.attacks.length, 2, "Ataques hidratados após F5")
              assertEqual(restoredSolo.counters.vida, 12, "Vida solo preservada após F5")
              assertEqual(restoredSolo.counters.esquiva, 3, "Pulos solo preservados após F5")
              assert(restoredSolo.usedItems.includes(pwr1.ID), "Poder usado preservado após F5")

              // 4. Simula Soft Reset (Limpar Ficha)
              localStorage.removeItem(SOLO_KEY)
              assertEqual(localStorage.getItem(SOLO_KEY), null, "Soft reset deve limpar estado solo")

              return "Jornada Solo completa (Montar → Jogar → F5 → Limpar Ficha) validada"
            } finally {
              if (backupSolo === null) localStorage.removeItem(SOLO_KEY)
              else localStorage.setItem(SOLO_KEY, backupSolo)

              if (backupApp === null) localStorage.removeItem("killOrDie_appState")
              else localStorage.setItem("killOrDie_appState", backupApp)
            }
          }
        },
        {
          id: "blackbox-e2e-3players-combats",
          name: "Caixa Preta 3 Jogadores: RLS Não-Admin → Cofre → Multi-Alvo (Único & Completo + Race) → Oportunidade",
          run: async () => {
            let bots = []
            let adminToken = null
            let roomId = null

            try {
              const created = await createBlackBoxBots(["BotAlpha", "BotBeta", "BotGamma"])
              bots = created.bots
              adminToken = created.adminToken
              const [botA, botB, botC] = bots

              // 1. Bot A cria a sala
              const createRes = await botA.client.rpc("create_room_with_host", {
                p_room_name: "E2E Combates",
                p_master_name: botA.displayName
              })
              assert(!createRes.error && createRes.data?.success, `BotA create_room falhou: ${createRes.error?.message}`)
              roomId = createRes.data.room.id
              const playerA = createRes.data.player

              // 2. RLS REAL com conta comum (não-admin): Bot B ANTES de entrar NÃO pode ver a sala nem jogadores
              const [leakedRooms, leakedPlayers] = await Promise.all([
                botB.client.from("rooms").select("id").eq("id", roomId),
                botB.client.from("players").select("id").eq("room_id", roomId)
              ])
              assertEqual((leakedRooms.data || []).length, 0, "RLS falhou: conta comum fora da sala viu a sala")
              assertEqual((leakedPlayers.data || []).length, 0, "RLS falhou: conta comum fora da sala viu jogadores")

              // 3. Bot B e Bot C entram na sala
              const [joinB, joinC] = await Promise.all([
                botB.client.rpc("join_room", { p_room_id: roomId, p_player_name: botB.displayName }),
                botC.client.rpc("join_room", { p_room_id: roomId, p_player_name: botC.displayName })
              ])
              assert(!joinB.error && joinB.data?.success, `BotB join_room falhou: ${joinB.error?.message}`)
              assert(!joinC.error && joinC.data?.success, `BotC join_room falhou: ${joinC.error?.message}`)
              const playerB = joinB.data.player
              const playerC = joinC.data.player

              // 4. Todos escolhem personagem, gravam cartas secretas no cofre e ficam prontos
              await Promise.all([
                botA.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Impact", character_name: "Impacto", defense_dice_count: 2 })
                  .eq("id", playerA.id),
                botB.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Caos", character_name: "Caos", defense_dice_count: 2 })
                  .eq("id", playerB.id),
                botC.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Ryan", character_name: "Ryan", defense_dice_count: 1 })
                  .eq("id", playerC.id),
                botA.client
                  .from("player_private_state")
                  .upsert({
                    player_id: playerA.id,
                    user_id: botA.userId,
                    actor_id: "Impact",
                    selections: { attacks: ["Attack.Impact1"] },
                    notes: { secret: "segredoA" }
                  })
              ])

              // Sigilo real do cofre privado: Bot B NÃO consegue ler player_private_state do Bot A
              const spyVault = await botB.client.from("player_private_state").select("*").eq("player_id", playerA.id).maybeSingle()
              assertEqual(spyVault.data, null, "RLS do cofre falhou: Bot B conseguiu ler cartas privadas do Bot A")

              // 5. Inicia partida
              const startMatchRes = await botA.client.rpc("start_match", { p_room_id: roomId })
              assert(!startMatchRes.error && startMatchRes.data?.success, `start_match falhou: ${startMatchRes.error?.message}`)

              const attackPayload = { ID: "Attack.Impact1", Name: "Furacão nas Mãos", Dices: "3", LoadTime: "1", Damage: "4" }
              const defenseWeaponB = { ID: "Weapon.Caos1", Name: "Luvas Anti luz", Dices: "4", LoadTime: "1", Damage: "1" }
              const defenseWeaponC = { ID: "Attack.Ryan1", Name: "Soco Impulsionador", Dices: "4", LoadTime: "1", Damage: "2" }

              // --------------------------------------------------------------
              // CENÁRIO A: MULTI-ALVO ATAQUE ÚNICO (visibilidade entre defensores + resultados unificados)
              // --------------------------------------------------------------
              const singleMultiRes = await botA.client.rpc("start_combat", {
                p_room_id: roomId,
                p_attacker_id: playerA.id,
                p_defender_ids: [playerB.id, playerC.id],
                p_attack_data: attackPayload,
                p_allow_counter_attack: false,
                p_allow_opportunity_attacks: false
              })
              assert(
                !singleMultiRes.error && singleMultiRes.data?.success,
                `Multi Ataque Único falhou: ${singleMultiRes.data?.error || singleMultiRes.error?.message}`
              )
              const singleGroupId = singleMultiRes.data.combat_group_id
              assert(Boolean(singleGroupId), "Multi-alvo deveria gerar combat_group_id")

              const { data: singleRows } = await botA.client
                .from("combat_notifications")
                .select("*")
                .eq("combat_group_id", singleGroupId)
                .order("id", { ascending: true })
              assertEqual(singleRows.length, 2, "Devem existir 2 combates no grupo")
              assert(
                singleRows.every((r) => r.combat_phase === "rolling"),
                "Ataque único deve iniciar direto em rolling"
              )

              const rowB1 = singleRows.find((r) => r.defender_id === playerB.id)
              const rowC1 = singleRows.find((r) => r.defender_id === playerC.id)

              const atkShare1 = await botA.client.rpc("update_combat_group_shared_roll", {
                p_combat_group_id: singleGroupId,
                p_roll: [6, 5, 2],
                p_total: 13,
                p_allow_adjust: false
              })
              assert(atkShare1.data?.success === true, "Ataque compartilhado no Ataque Único falhou")

              const [defRollB1, defRollC1] = await Promise.all([
                botB.client.rpc("update_combat_roll", {
                  p_combat_id: rowB1.id,
                  p_round_index: 0,
                  p_is_attacker: false,
                  p_roll: [5, 4],
                  p_total: 9,
                  p_allow_adjust: false
                }),
                botC.client.rpc("update_combat_roll", {
                  p_combat_id: rowC1.id,
                  p_round_index: 0,
                  p_is_attacker: false,
                  p_roll: [3],
                  p_total: 3,
                  p_allow_adjust: false
                })
              ])
              assert(defRollB1.data?.success && defRollC1.data?.success, "Rolagens de defesa multi-alvo falharam")

              // Bot B consegue ver a rolagem de defesa do Bot C e do Bot A
              const { data: bSeesGroup } = await botB.client
                .from("combat_notifications")
                .select("defender_id, round_data")
                .eq("combat_group_id", singleGroupId)
              const cSeenByB = bSeesGroup.find((r) => r.defender_id === playerC.id)
              assertEqual(cSeenByB?.round_data?.[0]?.defender?.roll?.[0], 3, "Bot B deve enxergar os dados de defesa do Bot C")

              // Todos avançam juntos para resultados e encerram
              const showRes1 = await botB.client.rpc("update_combat_group_phase", { p_combat_group_id: singleGroupId, p_action: "show_results" })
              assert(showRes1.data?.success === true, "show_results falhou")
              const { data: singleResults } = await botC.client
                .from("combat_notifications")
                .select("combat_phase")
                .eq("combat_group_id", singleGroupId)
              assert(
                singleResults.every((r) => r.combat_phase === "results"),
                "Todos os combates deveriam entrar juntos em results"
              )

              const cancel1 = await botA.client.rpc("update_combat_group_phase", { p_combat_group_id: singleGroupId, p_action: "cancel_all" })
              assert(cancel1.data?.success === true, "cancel_all falhou no Ataque Único")

              // --------------------------------------------------------------
              // CENÁRIO B: MULTI-ALVO COMPLETO + TESTE DE RACE CONDITION + ANTI-CHEAT
              // --------------------------------------------------------------
              const fullMultiRes = await botA.client.rpc("start_combat", {
                p_room_id: roomId,
                p_attacker_id: playerA.id,
                p_defender_ids: [playerB.id, playerC.id],
                p_attack_data: attackPayload,
                p_allow_counter_attack: true,
                p_allow_opportunity_attacks: false
              })
              assert(fullMultiRes.data?.success === true, "Multi-Alvo completo falhou ao iniciar")
              const fullGroupId = fullMultiRes.data.combat_group_id

              const { data: fullRows } = await botA.client.from("combat_notifications").select("*").eq("combat_group_id", fullGroupId)
              const rowB2 = fullRows.find((r) => r.defender_id === playerB.id)
              const rowC2 = fullRows.find((r) => r.defender_id === playerC.id)

              // B confirma arma primeiro
              const planB = buildRoundData(attackPayload.LoadTime, defenseWeaponB.LoadTime)
              const confB = await botB.client.rpc("confirm_defense_weapon", {
                p_combat_id: rowB2.id,
                p_defender_weapon: defenseWeaponB,
                p_round_data: planB.roundData,
                p_total_rounds: planB.totalRounds
              })
              assert(confB.data?.success === true, "Bot B confirm_defense_weapon falhou")

              // Race condition: Bot A rola ataque compartilhado ANTES do Bot C confirmar arma
              const atkShare2 = await botA.client.rpc("update_combat_group_shared_roll", {
                p_combat_group_id: fullGroupId,
                p_roll: [6, 6, 4],
                p_total: 16,
                p_allow_adjust: false
              })
              assert(atkShare2.data?.success === true, "Ataque compartilhado durante weapon_selection falhou")

              // Agora Bot C confirma arma com attacker.rolled = false no payload — RPC DEVE preservar [6, 6, 4]
              const planC = buildRoundData(attackPayload.LoadTime, defenseWeaponC.LoadTime)
              const confC = await botC.client.rpc("confirm_defense_weapon", {
                p_combat_id: rowC2.id,
                p_defender_weapon: defenseWeaponC,
                p_round_data: planC.roundData,
                p_total_rounds: planC.totalRounds
              })
              assert(confC.data?.success === true, "Bot C confirm_defense_weapon falhou")

              const { data: cAfterConfirm } = await botC.client.from("combat_notifications").select("round_data").eq("id", rowC2.id).single()
              assertEqual(
                cAfterConfirm?.round_data?.[0]?.attacker?.rolled,
                true,
                "Race condition falhou: confirm_defense_weapon apagou o ataque compartilhado do atacante"
              )
              assertEqual(cAfterConfirm?.round_data?.[0]?.attacker?.total, 16, "Total do ataque compartilhado preservado")

              // B e C rolam defesa na R1 e avançam juntos para R2 (contra-ataque)
              await Promise.all([
                botB.client.rpc("update_combat_roll", {
                  p_combat_id: rowB2.id,
                  p_round_index: 0,
                  p_is_attacker: false,
                  p_roll: [4, 2],
                  p_total: 6,
                  p_allow_adjust: false
                }),
                botC.client.rpc("update_combat_roll", {
                  p_combat_id: rowC2.id,
                  p_round_index: 0,
                  p_is_attacker: false,
                  p_roll: [5],
                  p_total: 5,
                  p_allow_adjust: false
                })
              ])

              const advR1 = await botA.client.rpc("update_combat_group_phase", { p_combat_group_id: fullGroupId, p_action: "advance_round_1" })
              assert(advR1.data?.success === true, "advance_round_1 falhou")

              // Anti-cheat na R2 (contra-ataque de B contra A): A NÃO pode rolar os dados de B (p_is_attacker: false)
              const cheatAttempt = await botA.client.rpc("update_combat_roll", {
                p_combat_id: rowB2.id,
                p_round_index: 1,
                p_is_attacker: false,
                p_roll: [1, 1],
                p_total: 2,
                p_allow_adjust: false
              })
              assert(cheatAttempt.data?.success === false, "Anti-cheat falhou: Bot A conseguiu rolar pelo Bot B")

              // B rola contra-ataque, A rola defesa e ajusta dado (allow_adjust: true)
              const counterRoll = await botB.client.rpc("update_combat_roll", {
                p_combat_id: rowB2.id,
                p_round_index: 1,
                p_is_attacker: false,
                p_roll: [5, 4, 2, 1],
                p_total: 12,
                p_allow_adjust: false
              })
              const defCounter = await botA.client.rpc("update_combat_roll", {
                p_combat_id: rowB2.id,
                p_round_index: 1,
                p_is_attacker: true,
                p_roll: [6, 3],
                p_total: 9,
                p_allow_adjust: false
              })
              const adjustDef = await botA.client.rpc("update_combat_roll", {
                p_combat_id: rowB2.id,
                p_round_index: 1,
                p_is_attacker: true,
                p_roll: [6, 4],
                p_total: 10,
                p_allow_adjust: true
              })
              assert(counterRoll.data?.success && defCounter.data?.success && adjustDef.data?.success, "Fluxo de contra-ataque/ajuste falhou")

              await botA.client.rpc("update_combat_group_phase", { p_combat_group_id: fullGroupId, p_action: "cancel_all" })

              // --------------------------------------------------------------
              // CENÁRIO C: 1v1 + ATAQUE DE OPORTUNIDADE PELO ESPECTADOR (BOT C)
              // --------------------------------------------------------------
              const duelRes = await botA.client.rpc("start_combat", {
                p_room_id: roomId,
                p_attacker_id: playerA.id,
                p_defender_ids: [playerB.id],
                p_attack_data: attackPayload,
                p_allow_counter_attack: true,
                p_allow_opportunity_attacks: true
              })
              assert(duelRes.data?.success === true, "Início de combate 1v1 falhou")
              const duelId = duelRes.data.combat_ids[0]

              await botB.client.rpc("confirm_defense_weapon", {
                p_combat_id: duelId,
                p_defender_weapon: defenseWeaponB,
                p_round_data: planB.roundData,
                p_total_rounds: planB.totalRounds
              })

              const opp1 = await botC.client.rpc("add_opportunity_attack", {
                p_combat_id: duelId,
                p_player_id: playerC.id,
                p_player_name: botC.displayName,
                p_weapon: defenseWeaponC,
                p_target: "attacker"
              })
              assert(opp1.data?.success === true, `Ataque de oportunidade do espectador falhou: ${opp1.data?.error}`)

              const oppDuplicate = await botC.client.rpc("add_opportunity_attack", {
                p_combat_id: duelId,
                p_player_id: playerC.id,
                p_player_name: botC.displayName,
                p_weapon: defenseWeaponC,
                p_target: "attacker"
              })
              assert(oppDuplicate.data?.success === false, "Espectador não deveria conseguir dar 2º ataque de oportunidade")

              // Bot C rola o ataque de oportunidade (índice 3) e Bot A rola a defesa
              const oppRollC = await botC.client.rpc("update_combat_roll", {
                p_combat_id: duelId,
                p_round_index: 3,
                p_is_attacker: true,
                p_roll: [6, 2],
                p_total: 8,
                p_allow_adjust: false
              })
              const oppDefA = await botA.client.rpc("update_combat_roll", {
                p_combat_id: duelId,
                p_round_index: 3,
                p_is_attacker: false,
                p_roll: [5, 5],
                p_total: 10,
                p_allow_adjust: false
              })
              assert(oppRollC.data?.success && oppDefA.data?.success, "Rolagem da rodada de oportunidade falhou")

              await botA.client.from("combat_notifications").update({ status: "cancelled" }).eq("id", duelId)

              return "OK (RLS não-admin → Cofre → Multi Único → Multi Completo/Race/Anti-Cheat → Oportunidade) + bots limpos"
            } finally {
              if (roomId) {
                await safeRun(() => supabase.rpc('admin_delete_room', { p_room_id: roomId }));
              }
              await destroyBlackBoxBots(bots, adminToken);
            }
          }
        },
        {
          id: "blackbox-e2e-match-disconnect-victory",
          name: "Caixa Preta 3 Jogadores: Eliminação → Desconexão → Master Eliminate → Vitória → Stats/Rivalidades → Rematch",
          run: async () => {
            let bots = []
            let adminToken = null
            let roomId = null
            let createdMatchId = null

            try {
              const created = await createBlackBoxBots(["BotAlpha", "BotBeta", "BotGamma"])
              bots = created.bots
              adminToken = created.adminToken
              const [botA, botB, botC] = bots

              // 1. Cria sala, entra os 3 e inicia partida
              const createRes = await botA.client.rpc("create_room_with_host", {
                p_room_name: "E2E Partida Completa",
                p_master_name: botA.displayName
              })
              assert(!createRes.error && createRes.data?.success, `create_room falhou: ${createRes.error?.message}`)
              roomId = createRes.data.room.id
              const playerA = createRes.data.player

              const [joinB, joinC] = await Promise.all([
                botB.client.rpc("join_room", { p_room_id: roomId, p_player_name: botB.displayName }),
                botC.client.rpc("join_room", { p_room_id: roomId, p_player_name: botC.displayName })
              ])
              const playerB = joinB.data.player
              const playerC = joinC.data.player

              await Promise.all([
                botA.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Impact", character_name: "Impacto", defense_dice_count: 2 })
                  .eq("id", playerA.id),
                botB.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Caos", character_name: "Caos", defense_dice_count: 2 })
                  .eq("id", playerB.id),
                botC.client
                  .from("players")
                  .update({ status: "ready", actor_id: "Ryan", character_name: "Ryan", defense_dice_count: 1 })
                  .eq("id", playerC.id)
              ])

              const startRes = await botA.client.rpc("start_match", { p_room_id: roomId })
              assert(!startRes.error && startRes.data?.success, `start_match falhou: ${startRes.error?.message}`)

              // 2. Bot C se declara eliminado por Bot A (#1)
              const elimC = await botC.client.rpc("declare_elimination", {
                p_player_id: playerC.id,
                p_killer_player_id: playerA.id
              })
              assert(!elimC.error && elimC.data?.elimination_order === 1, "Bot C deveria ser o 1º eliminado")

              // 3. Bot B simula "Sair da Sala" no meio da partida (fica offline, mas ainda vivo na partida)
              const offB = await botB.client.from("players").update({ is_connected: false }).eq("id", playerB.id)
              assert(!offB.error, `Falha ao desconectar Bot B: ${offB.error?.message}`)

              // 4. Bot A tenta encerrar com 2 vivos → deve bloquear
              const earlyWin = await botA.client.rpc("end_match", { p_room_id: roomId })
              assert(Boolean(earlyWin.error), "end_match deveria bloquear enquanto Bot B offline ainda está vivo")

              // 5. Bot C (não-anfitrião) tenta master_eliminate_player → deve bloquear
              const unauthMasterElim = await botC.client.rpc("master_eliminate_player", {
                p_room_id: roomId,
                p_player_id: playerB.id,
                p_killer_player_id: playerA.id
              })
              assert(Boolean(unauthMasterElim.error), "Jogador comum não deveria conseguir usar master_eliminate_player")

              // 6. Bot A (anfitrião) elimina Bot B offline (#2, killer: Bot A)
              const masterElimB = await botA.client.rpc("master_eliminate_player", {
                p_room_id: roomId,
                p_player_id: playerB.id,
                p_killer_player_id: playerA.id
              })
              assert(!masterElimB.error && masterElimB.data?.elimination_order === 2, `master_eliminate_player falhou: ${masterElimB.error?.message}`)

              // 7. Bot A declara vitória (end_match)
              const winRes = await botA.client.rpc("end_match", { p_room_id: roomId })
              assert(!winRes.error && winRes.data?.success && winRes.data?.match_id, `end_match falhou: ${winRes.error?.message}`)
              createdMatchId = winRes.data.match_id

              // 8. Valida estatísticas, score composto e rivalidades calculadas automaticamente pelo banco
              const [statsA, statsC] = await Promise.all([
                botA.client.rpc("get_player_public_stats", { p_user_id: botA.userId }),
                botC.client.rpc("get_player_public_stats", { p_user_id: botC.userId })
              ])

              assert(statsA.data?.success === true, "Leitura de stats do vencedor falhou")
              assertEqual(statsA.data.summary.total_matches, 1, "Total de partidas de Bot A")
              assertEqual(statsA.data.summary.total_wins, 1, "Total de vitórias de Bot A")
              assertEqual(statsA.data.summary.total_eliminations, 2, "Total de abates de Bot A")
              assertEqual(statsA.data.summary.total_survival_points, 2, "Pontos de sobrevivência de Bot A")
              assert(Number(statsA.data.summary.composite_score) > 0, "Score composto do vencedor deve ser > 0")
              assert(Boolean(statsA.data.rivalries?.favorite_victim), "Vítima favorita de Bot A deveria estar preenchida")
              assertEqual(statsC.data?.rivalries?.nemesis?.user_id, botA.userId, "Carrasco de Bot C deveria ser Bot A")

              // 9. Valida estado pós-partida (Rematch): match_status NULL e desconectado removido
              const { data: roomAfter } = await botA.client.from("rooms").select("match_status").eq("id", roomId).single()
              const { data: playersAfter } = await botA.client.from("players").select("id, in_match, is_alive").eq("room_id", roomId)
              assertEqual(roomAfter?.match_status, null, "Sala deveria voltar a match_status = null após vitória")
              assertEqual(playersAfter.length, 2, "Jogador offline (Bot B) deveria ter sido removido ao encerrar a partida")
              assert(
                playersAfter.every((p) => p.in_match === false && p.is_alive === true),
                "Jogadores prontos para Rematch"
              )

              return "OK (Eliminação → Offline → Master Eliminate → Vitória → Stats/Rivalidades → Rematch) + tudo limpo"
            } finally {
              if (createdMatchId) {
                await safeRun(() => supabase.rpc('admin_delete_match', { p_match_id: createdMatchId }));
              }
              if (roomId) {
                await safeRun(() => supabase.rpc('admin_delete_room', { p_room_id: roomId }));
              }
              await destroyBlackBoxBots(bots, adminToken);
              authService.clearLeaderboardCache();
              statsService.clearCache();
            }
          }
        }
      ]
    }
  ]
}
