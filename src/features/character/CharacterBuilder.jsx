import React, { useState, useEffect, useMemo, useRef } from "react"
import CharacteristicCard from "./CharacteristicCard"
import SelectionSection from "./SelectionSection"
import { Utils } from "../../utils/cardFormatter"
import { sanitizeHtml } from "../../utils/sanitize"

const EMPTY_ARRAY = []

const SHORT_LABEL_KEYS = {
  attack: { key: "Characteristic.Attack.Short", fallback: "Ataques" },
  weapon: { key: "Characteristic.Weapon.Short", fallback: "Armas" },
  passive: { key: "Characteristic.Passive.Short", fallback: "Passivas" },
  device: { key: "Characteristic.Device.Short", fallback: "Dispositivos" },
  power: { key: "Characteristic.Power.Short", fallback: "Poderes" },
  special: { key: "Characteristic.SpecialAbility.Short", fallback: "Especiais" },
  passiveSpecial: { key: "Characteristic.PassiveSpecialAbility.Short", fallback: "Pass. Esp." }
}

const PLURAL_TO_SINGULAR = {
  attacks: "attack",
  weapons: "weapon",
  passives: "passive",
  devices: "device",
  powers: "power",
  specials: "special",
  passiveSpecials: "passiveSpecial"
}

function normalizeBuilderSelections(raw) {
  if (!raw || typeof raw !== "object") return {}
  const normalized = {}
  Object.entries(raw).forEach(([key, val]) => {
    if (!Array.isArray(val)) return
    const targetKey = PLURAL_TO_SINGULAR[key] || key
    if (SHORT_LABEL_KEYS[targetKey]) {
      normalized[targetKey] = val
    }
  })
  return normalized
}

const CharacterBuilder = ({
  actor,
  gameData,
  localization,
  onCharacterCreate,
  onBack,
  matchStatus,
  canConfirmCharacter = true,
  initialSelections = null,
  onDraftChange = null
}) => {
  const [selections, setSelections] = useState(() => normalizeBuilderSelections(initialSelections))
  const [isComplete, setIsComplete] = useState(false)
  const [savedBuildExists, setSavedBuildExists] = useState(false)
  const [buildFeedback, setBuildFeedback] = useState(null)

  const storageBuildKey = `kod_fav_build_${actor?.ID}`
  const prevActorIdRef = useRef(actor?.ID)
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    if (prevActorIdRef.current !== actor?.ID) {
      prevActorIdRef.current = actor?.ID
      setSelections({})
    }
    if (actor?.ID) {
      setSavedBuildExists(Boolean(localStorage.getItem(storageBuildKey)))
    }
  }, [actor?.ID, storageBuildKey])

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (typeof onDraftChange === "function") {
      onDraftChange(selections)
    }
  }, [selections, onDraftChange])

  const selectionConfigs = useMemo(() => {
    const numOrLen = (numField, arr) => {
      const parsed = Number(numField)
      if (!Number.isNaN(parsed) && parsed > 0) return parsed
      return (arr || []).length || 0
    }

    const configs = {
      attack: {
        data: actor.UnlimitedAttacksData,
        number: numOrLen(actor.NumberOfUnlimitedAttacks, actor.UnlimitedAttacksData),
        definitions: gameData.AttackDefinitions,
        color: "danger"
      },
      weapon: {
        data: actor.WeaponsData,
        number: numOrLen(actor.NumberOfWeapons, actor.WeaponsData),
        definitions: gameData.AttackDefinitions,
        color: "danger"
      },
      passive: {
        data: actor.PassivesData,
        number: numOrLen(actor.NumberOfPassives, actor.PassivesData),
        definitions: gameData.PassiveDefinitions,
        color: "success"
      },
      device: {
        data: actor.DevicesData,
        number: numOrLen(actor.NumberOfDevices, actor.DevicesData),
        definitions: gameData.ConsumableDefinitions,
        color: "info"
      },
      power: {
        data: actor.PowersData,
        number: numOrLen(actor.NumberOfPowers, actor.PowersData),
        definitions: gameData.ConsumableDefinitions,
        color: "primary"
      },
      special: {
        data: actor.SpecialAbilitiesData,
        number: numOrLen(actor.NumberOfSpecialAbilities, actor.SpecialAbilitiesData),
        definitions: gameData.ConsumableDefinitions,
        color: "warning"
      },
      passiveSpecial: {
        data: actor.PassiveSpecialAbilitiesData,
        number: numOrLen(actor.NumberOfPassiveSpecialAbilities, actor.PassiveSpecialAbilitiesData),
        definitions: gameData.PassiveDefinitions,
        color: "warning"
      }
    }

    Object.entries(configs).forEach(([type, config]) => {
      const shortMeta = SHORT_LABEL_KEYS[type]
      config.shortTitle = localization[shortMeta.key] || shortMeta.fallback
      config.title =
        localization[
          `Characteristic.${
            type === "attack" ? "Attack"
            : type === "weapon" ? "Weapon"
            : type === "passive" ? "Passive"
            : type === "device" ? "Device"
            : type === "power" ? "Power"
            : type === "special" ? "SpecialAbility"
            : "PassiveSpecialAbility"
          }.Title`
        ]

      if (["attack", "weapon"].includes(type)) {
        config.getName = (id) => localization[id] || id
        config.getDesc = (def) => {
          if (actor.mode1 && actor.mode2 && def.modes) {
            return Utils.createDualModeDescription(def, localization, actor)
          }
          return Utils.createAttackDescription(def, localization)
        }
      } else if (["device", "power", "special"].includes(type)) {
        config.getName = (id, def) => Utils.createTriggerName(id, def, localization)
        config.getDesc = (def) => {
          if (actor.mode1 && actor.mode2 && def.modeRestriction) {
            return Utils.createModeRestrictedDescription(def, localization, actor)
          }
          return localization[def.Description] || ""
        }
      } else {
        config.getName = (id) => localization[id] || Utils.formatFallback(id)
        config.getDesc = (def) => {
          if (actor.mode1 && actor.mode2 && def.modeRestriction && ["passive", "passiveSpecial"].includes(type)) {
            return Utils.createModeRestrictedDescription(def, localization, actor)
          }
          return localization[def.Description] || localization["Utils.NoDescription"] || "Sem descrição."
        }
      }
    })

    return configs
  }, [actor, gameData, localization])

  const handleSelectionChange = (type, selectedItems) => {
    setSelections((prev) => ({
      ...prev,
      [type]: selectedItems
    }))
  }

  const globalSelectedIds = useMemo(() => {
    const ids = new Set()
    Object.values(selections).forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((it) => {
          if (!it) return
          const id = typeof it === "string" ? it : it.ID || it.id || null
          if (id) ids.add(id)
        })
      }
    })
    return ids
  }, [selections])

  // Resumo de progresso por categoria obrigatória
  const progressSteps = useMemo(
    () =>
      Object.entries(selectionConfigs)
        .filter(([, config]) => config.number > 0 && Array.isArray(config.data) && config.data.length > 0)
        .map(([type, config]) => {
          const current = selections[type]?.length || 0
          return {
            type,
            label: config.shortTitle,
            color: config.color,
            current,
            required: config.number,
            done: current === config.number
          }
        }),
    [selectionConfigs, selections]
  )

  const missingSteps = useMemo(() => progressSteps.filter((s) => !s.done), [progressSteps])
  const confirmBlocked = !canConfirmCharacter

  useEffect(() => {
    setIsComplete(missingSteps.length === 0)
  }, [missingSteps])

  const scrollToSection = (type) => {
    const el = document.getElementById(`builder-section-${type}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleRandomizeBuild = () => {
    const usedIds = new Set()
    const randomSelections = {}

    Object.entries(selectionConfigs).forEach(([type, config]) => {
      if (!Array.isArray(config.data) || config.data.length === 0 || !config.number) {
        randomSelections[type] = []
        return
      }

      const defMap = new Map()
      ;(config.definitions || []).forEach((d) => {
        defMap.set(d.ID, d)
      })

      const availableIds = config.data.filter((id) => !usedIds.has(id))
      const shuffledIds = [...availableIds].sort(() => Math.random() - 0.5)
      const chosenIds = shuffledIds.slice(0, config.number)

      chosenIds.forEach((id) => {
        usedIds.add(id)
      })
      randomSelections[type] = chosenIds.map((id) => defMap.get(id) || { ID: id })
    })

    setSelections(randomSelections)
    setBuildFeedback("🎲 Build sorteada!")
    setTimeout(() => setBuildFeedback(null), 2500)
  }

  const handleSaveFavoriteBuild = () => {
    const idMap = {}
    Object.entries(selections).forEach(([type, items]) => {
      idMap[type] = (items || []).map((item) => (typeof item === "string" ? item : item.ID))
    })
    localStorage.setItem(storageBuildKey, JSON.stringify(idMap))
    setSavedBuildExists(true)
    setBuildFeedback("⭐ Build favorita salva!")
    setTimeout(() => setBuildFeedback(null), 2500)
  }

  const handleLoadFavoriteBuild = () => {
    try {
      const raw = localStorage.getItem(storageBuildKey)
      if (!raw) return
      const savedIdMap = JSON.parse(raw)
      const loadedSelections = {}
      const usedIds = new Set()

      Object.entries(selectionConfigs).forEach(([type, config]) => {
        if (!Array.isArray(config.data) || config.data.length === 0 || !config.number) {
          loadedSelections[type] = []
          return
        }

        const defMap = new Map()
        ;(config.definitions || []).forEach((d) => { defMap.set(d.ID, d) })

        const savedIds = Array.isArray(savedIdMap[type]) ? savedIdMap[type] : []
        const validIds = savedIds.filter((id) => config.data.includes(id) && !usedIds.has(id)).slice(0, config.number)

        validIds.forEach((id) => {usedIds.add(id)})
        loadedSelections[type] = validIds.map((id) => defMap.get(id) || { ID: id })
      })

      setSelections(loadedSelections)
      setBuildFeedback("📂 Build favorita carregada!")
      setTimeout(() => setBuildFeedback(null), 2500)
    } catch (e) {
      console.warn("Erro ao carregar build favorita:", e)
    }
  }

  const handleCreateCharacter = () => {
    const finalSelections = Object.fromEntries(
      Object.entries(selectionConfigs).map(([type]) => [
        type === "attack" ? "attacks"
        : type === "weapon" ? "weapons"
        : type === "passive" ? "passives"
        : type === "passiveSpecial" ? "passiveSpecials"
        : `${type}s`,
        selections[type] || []
      ])
    )
    onCharacterCreate(finalSelections)
  }

  return (
    <section aria-label="Montagem de personagem">
      <header className="row justify-content-center text-center">
        <div className="col-12">
          <button type="button" className="btn btn-secondary mb-3" onClick={onBack}>
            {localization["UI.Navigation.Back"] || "← Voltar"}
          </button>
        </div>
        <div className="col-12">
          <h1 className="text-white">{localization[`Character.Name.${actor.ID}`] || actor.ID}</h1>
        </div>
        <div className="col-12">
          <h3 className="text-light">{localization[`Character.Title.${actor.ID}`] || actor.ID}</h3>
        </div>
        {localization[`Character.Description.${actor.ID}`] && (
          <div
            className="col-10 mb-3 px-3 text-light"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(localization[`Character.Description.${actor.ID}`])
            }}
          />
        )}
      </header>

      <div className="row justify-content-center">
        <CharacteristicCard actor={actor} localization={localization} deathCount={0} showReivolk={true} />
      </div>

      {/* Barra Fixa de Progresso da Montagem (clicável para pular à categoria) */}
      {progressSteps.length > 0 && (
        <nav
          aria-label="Progresso da montagem"
          className="card bg-dark border-secondary my-3"
          style={{ position: "sticky", top: "8px", zIndex: 100 }}
        >
          <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex flex-wrap align-items-center gap-1">
              {progressSteps.map((step) => (
                <button
                  key={step.type}
                  type="button"
                  onClick={() => scrollToSection(step.type)}
                  className={`btn btn-sm py-0 px-2 ${step.done ? "btn-success" : `btn-outline-${step.color}`}`}
                  style={{ fontSize: "0.75rem" }}
                  title={`Ir para ${step.label}`}
                >
                  {step.done ? "✓" : "○"} {step.label} {step.current}/{step.required}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-success btn-sm fw-bold ms-auto"
              disabled={!isComplete || confirmBlocked}
              onClick={handleCreateCharacter}
            >
              {confirmBlocked ?
                "⏳ Partida ativa"
              : isComplete ?
                "✅ Confirmar Personagem"
              : `Faltam ${missingSteps.length}`}
            </button>
          </div>
        </nav>
      )}

      {/* Botões rápidos de Sorteio e Build Favorita */}
      <div className="d-flex justify-content-center align-items-center gap-2 flex-wrap my-3">
        <button type="button" className="btn btn-sm btn-outline-info" onClick={handleRandomizeBuild}>
          🎲 {localization["UI.CharacterBuilder.Randomize"] || "Preencher Aleatório"}
        </button>
        {savedBuildExists && (
          <button type="button" className="btn btn-sm btn-outline-warning" onClick={handleLoadFavoriteBuild}>
            📂 {localization["UI.CharacterBuilder.LoadBuild"] || "Carregar Build Favorita"}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleSaveFavoriteBuild} disabled={!isComplete}>
          ⭐ {localization["UI.CharacterBuilder.SaveBuild"] || "Salvar Build"}
        </button>
      </div>

      {buildFeedback && (
        <div className="text-center mb-2">
          <span className="badge bg-info text-dark px-3 py-2">{buildFeedback}</span>
        </div>
      )}

      {Object.entries(selectionConfigs).map(([type, config]) => (
        <div key={type} id={`builder-section-${type}`} style={{ scrollMarginTop: "96px" }}>
          <SelectionSection
            type={type}
            config={config}
            actor={actor}
            localization={localization}
            globalSelectedIds={globalSelectedIds}
            initialSelected={selections[type] || EMPTY_ARRAY}
            onSelectionChange={(selectedItems) => handleSelectionChange(type, selectedItems)}
          />
        </div>
      ))}

      <div className="row justify-content-center my-4 text-center">
        {!isComplete && missingSteps.length > 0 && (
          <div className="col-12 mb-2">
            <small className="text-warning">
              ⚠️ Falta completar: {missingSteps.map((s) => `${s.label} (${s.current}/${s.required})`).join(" • ")}
            </small>
          </div>
        )}
        <button
          type="button"
          className="btn btn-lg btn-success col-10 md:col-8"
          disabled={!isComplete || confirmBlocked}
          onClick={handleCreateCharacter}
          title={confirmBlocked ? localization["UI.CharacterBuilder.WaitForMatch"] || "Aguarde a partida terminar para confirmar o personagem" : ""}
        >
          {confirmBlocked ?
            localization["UI.CharacterBuilder.WaitingMatch"] || "⏳ Aguarde a partida terminar"
          : localization["UI.CharacterBuilder.CreateCharacter"] || "Criar Personagem"}
        </button>
      </div>
    </section>
  )
}

export default CharacterBuilder
