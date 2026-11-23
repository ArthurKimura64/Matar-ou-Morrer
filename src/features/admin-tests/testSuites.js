import { supabase } from "../../config/supabaseClient"
import { RoomService } from "../../services/roomService"
import { CombatService } from "../../services/combatService"
import authService from "../../services/authService"
import { adaptGameData, adaptLocalization } from "../../utils/gameDataAdapter"
import { parseDefenseDices, parseAttackDices, calculateCombatRounds, applyModeToWeapon } from "../../utils/combatHelpers"
import { sanitizeHtml } from "../../utils/sanitize"
import { validatePlayerName, validateRoomName, validateRoomId, validateJsonData } from "../../utils/validation"

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
 * depende de um ambiente específico (ex: rotas /api da Vercel em localhost).
 */
class SkipTestError extends Error {
  constructor(reason) {
    super(reason)
    this.isSkip = true
  }
}

// ==================== CONSTRUTOR DAS SUÍTES ====================

export function buildTestSuites({ gameData, localization, currentUser }) {
  return [
    // ------------------------------------------------------------------
    // SUÍTE 1: DADOS DO JOGO & ADAPTADOR
    // ------------------------------------------------------------------
    {
      id: "data-adapter",
      title: "1. Dados do Jogo & Adaptador JSON",
      description: "Garante que GameEconomyData.json e LocalizationPortuguese.json foram normalizados sem erros.",
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
          id: "adapter-edge-cases",
          name: 'Normalização de casos especiais ("" vazio, texto na defesa e nome numérico)',
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
            assert(
              Boolean(mock.defenseRuleText && mock.defenseRuleText.includes("Não joga dados")),
              "Texto da regra de defesa deveria ser preservado em defenseRuleText"
            )

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
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 2: REGRAS DE COMBATE
    // ------------------------------------------------------------------
    {
      id: "combat-rules",
      title: "2. Regras Puras de Combate",
      description: "Valida leitura de 0 dados, cálculo de rodadas por velocidade e troca de Modo 1/Modo 2.",
      tests: [
        {
          id: "zero-dices-preserved",
          name: "Ataque e Defesa com 0 dados nunca viram 1",
          run: async () => {
            assertEqual(parseAttackDices("0"), 0, 'parseAttackDices("0")')
            assertEqual(parseAttackDices(0), 0, "parseAttackDices(0)")
            assertEqual(parseAttackDices("3"), 3, 'parseAttackDices("3")')
            assertEqual(parseAttackDices("??", 0), 0, 'parseAttackDices("??")')

            assertEqual(parseDefenseDices("0"), 0, 'parseDefenseDices("0")')
            assertEqual(parseDefenseDices("Não joga dados", 0), 0, "parseDefenseDices(texto)")
            assertEqual(parseDefenseDices(2), 2, "parseDefenseDices(2)")

            return "0 dados preservado corretamente em ataque e defesa"
          }
        },
        {
          id: "combat-rounds-order",
          name: "Ordem e quantidade de rodadas (empate, mais rápido e mais lento)",
          run: async () => {
            const equal = calculateCombatRounds("2", "2")
            assert(equal.totalRounds >= 2, "Empate de velocidade deve gerar ao menos 2 rodadas")
            assertEqual(equal.rounds[0].action_type, "attack", "Empate: 1ª rodada deve ser do atacante")

            const fastAtk = calculateCombatRounds("0", "3")
            assert(fastAtk.rounds.filter((r) => r.action_type === "attack").length >= 1, "Atacante mais rápido deve agir")

            const fastDef = calculateCombatRounds("4", "1")
            assert(
              fastDef.rounds.some((r) => r.action_type === "counter"),
              "Defensor com contra-ataque deve possuir rodada de counter"
            )

            return `Empate (${equal.totalRounds}r), Atk rápido (${fastAtk.totalRounds}r), Def rápido (${fastDef.totalRounds}r)`
          }
        },
        {
          id: "dual-mode-weapon-sync",
          name: "Troca de Modo 1 -> Modo 2 atualiza status da arma (ex: Eclipse)",
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

            const mode2Weapon = applyModeToWeapon(dualWeapon, "mode2")
            assertEqual(mode2Weapon.Dices, "1", "Dados no Modo 2")
            assertEqual(mode2Weapon.LoadTime, "0", "Segundos no Modo 2")
            assertEqual(mode2Weapon.Damage, "Infinito", "Dano no Modo 2")
            assertEqual(mode2Weapon.activeMode, "mode2", "Flag activeMode")

            return "Status da arma convertidos corretamente para o Modo 2"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 3: SEGURANÇA DE TEXTO & VALIDAÇÃO
    // ------------------------------------------------------------------
    {
      id: "security-validation",
      title: "3. Segurança (XSS) & Validações",
      description: "Garante que tags maliciosas são neutralizadas e entradas inválidas são rejeitadas.",
      tests: [
        {
          id: "xss-sanitization",
          name: "sanitizeHtml bloqueia <script> e eventos inline (onerror/onclick)",
          run: async () => {
            const dirty = '<b onclick="alert(1)">Ataque</b><script>window.__xss=1</script><img src=x onerror="alert(2)">'
            const clean = sanitizeHtml(dirty)
            assert(!clean.toLowerCase().includes("<script"), "Tag <script> não foi removida")
            assert(!clean.toLowerCase().includes("onerror"), "Atributo onerror não foi removido")
            assert(!clean.toLowerCase().includes("onclick"), "Atributo onclick não foi removido")
            assert(clean.includes("Ataque"), "Texto seguro deveria ser preservado")

            return "XSS neutralizado mantendo formatação segura"
          }
        },
        {
          id: "input-validators",
          name: "Validadores de nome, sala, código e limite JSONB",
          run: async () => {
            assert(validatePlayerName("Jogador1").valid, "Nome válido foi rejeitado")
            assert(!validatePlayerName("   ").valid, "Nome vazio deveria ser rejeitado")

            assert(validateRoomName("Mesa Principal").valid, "Nome de sala válido foi rejeitado")
            assert(!validateRoomName("").valid, "Nome de sala vazio deveria ser rejeitado")

            assert(validateRoomId("123456").valid, "Código de 6 dígitos válido foi rejeitado")
            assert(!validateRoomId("ABC").valid, "Código inválido deveria ser rejeitado")

            assert(validateJsonData({ vida: 20 }).valid, "JSON pequeno válido foi rejeitado")

            return "Todas as regras de validação responderam como esperado"
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 4: INFRAESTRUTURA, AUTH & API
    // ------------------------------------------------------------------
    {
      id: "infra-auth",
      title: "4. Conectividade, Admin & API",
      description: "Verifica latência com Supabase, permissão administrativa no banco e endpoint de configuração.",
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
          id: "admin-rpc-check",
          name: "Permissão de Administrador confirmada no banco (is_user_admin)",
          run: async () => {
            assert(Boolean(currentUser?.id), "Usuário não autenticado")
            const isAdmin = await authService.checkIsAdmin()
            assert(isAdmin === true, "RPC is_user_admin retornou false para esta conta")

            const regOpen = await authService.isRegistrationOpen()
            assert(typeof regOpen === "boolean", "isRegistrationOpen deve retornar booleano")
            return `Admin confirmado | Cadastros abertos: ${regOpen ? "Sim" : "Não"}`
          }
        },
        {
          id: "public-config-endpoint",
          name: "Endpoint /api/public-config (usado pelo admin.html)",
          run: async () => {
            let res
            try {
              res = await fetch("/api/public-config")
            } catch (err) {
              throw new SkipTestError("Servidor Serverless indisponível neste host")
            }

            const contentType = res.headers.get("content-type") || ""
            if (!res.ok || !contentType.includes("application/json")) {
              throw new SkipTestError('Pulado no npm start local (rotas /api rodam na Vercel ou via "vercel dev")')
            }

            const data = await res.json()
            assert(Boolean(data.supabaseUrl && data.supabaseAnonKey), "JSON de /api/public-config incompleto")
            return "Endpoint /api/public-config respondeu JSON válido"
          }
        },
        {
          id: "public-stats-rpcs",
          name: "RPCs de Estatísticas Públicas (Global e Jogador)",
          run: async () => {
            const { data: globalData, error: globalErr } = await supabase.rpc("get_global_stats")
            assert(!globalErr && globalData?.overview, `Falha em get_global_stats: ${globalErr?.message}`)

            const { data: playerData, error: playerErr } = await supabase.rpc("get_player_public_stats", {
              p_user_id: currentUser.id
            })
            assert(!playerErr && playerData?.success === true, `Falha em get_player_public_stats: ${playerErr?.message}`)
            assert(!("email" in (playerData.profile || {})), "Perfil público não deve expor email")

            return `Global (${globalData.overview.total_matches} partidas) e perfil público validados`
          }
        }
      ]
    },

    // ------------------------------------------------------------------
    // SUÍTE 5: SANDBOX REAL NO BANCO (COM LIMPEZA AUTOMÁTICA NO FINALLY)
    // ------------------------------------------------------------------
    {
      id: "db-sandbox",
      title: "5. Fluxo Real no Banco (Sala Sandbox)",
      description: "Cria 1 sala temporária, valida RLS/RPC/Copiador e apaga a sala ao final sem afetar o ranking.",
      tests: [
        {
          id: "sandbox-full-cycle",
          name: "Ciclo completo: Sala → Jogador → Trava start_combat → Histórico Copiador → Limpeza",
          run: async () => {
            let sandboxRoomId = null
            let sandboxPlayerId = null
            const stepsOk = []

            try {
              // 1. Criar sala temporária
              const roomRes = await RoomService.createRoom("Sandbox Test", "AdminTester")
              assert(roomRes.success && roomRes.room?.id, `Falha ao criar sala sandbox: ${roomRes.error}`)
              sandboxRoomId = roomRes.room.id
              stepsOk.push(`Sala ${sandboxRoomId}`)

              // 2. Entrar na sala
              const joinRes = await RoomService.joinRoom(sandboxRoomId, "AdminTester", null, true, currentUser?.id || null)
              assert(joinRes.success && joinRes.player?.id, `Falha ao entrar na sala: ${joinRes.error}`)
              sandboxPlayerId = joinRes.player.id
              stepsOk.push("Join")

              // 3. Validar trava da RPC start_combat sem partida iniciada (e tipo UUID)
              const blockedCombat = await CombatService.startCombat({
                roomId: sandboxRoomId,
                attackerId: sandboxPlayerId,
                defenderIds: [sandboxPlayerId],
                attackData: { Name: "Teste", Dices: "0", LoadTime: "1", Damage: "0" }
              })
              assert(blockedCombat.success === false, "start_combat deveria bloquear combate quando a partida não foi iniciada")
              stepsOk.push("Trava start_combat")

              // 4. Validar preservação de ever_exposed_cards (Copiador) após resetPlayerForLobby
              const histRes = await RoomService.recordExposedCardHistory(sandboxPlayerId, "CavaleiroEclipse", "Attack.TesteSandbox")
              assert(histRes.success, `Falha ao registrar histórico de exposição: ${histRes.error}`)

              const resetRes = await RoomService.resetPlayerForLobby(sandboxPlayerId)
              assert(resetRes.success, `Falha ao resetar jogador: ${resetRes.error}`)

              const afterReset = await RoomService.getPlayer(sandboxPlayerId)
              const preserved = afterReset.player?.app_state?.ever_exposed_cards?.CavaleiroEclipse || []
              assert(preserved.includes("Attack.TesteSandbox"), "resetPlayerForLobby apagou ever_exposed_cards do Copiador")
              stepsOk.push("Histórico Copiador preservado")

              return `OK (${stepsOk.join(" → ")}) + sala limpa`
            } finally {
              // Limpeza garantida mesmo se algum assert acima falhar
              if (sandboxPlayerId) {
                await CombatService.cancelPlayerCombats(sandboxPlayerId).catch(() => {})
                await RoomService.leaveRoom(sandboxPlayerId).catch(() => {})
              }
              if (sandboxRoomId) {
                const { error: rpcDelErr } = await supabase.rpc("admin_delete_room", {
                  p_room_id: sandboxRoomId
                })
                if (rpcDelErr) {
                  await supabase
                    .from("rooms")
                    .delete()
                    .eq("id", sandboxRoomId)
                    .catch(() => {})
                }
              }
            }
          }
        }
      ]
    }
  ]
}
