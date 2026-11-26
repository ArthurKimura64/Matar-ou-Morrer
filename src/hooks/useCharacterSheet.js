import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { RoomService } from "../services/roomService"
import { Utils } from "../utils/cardFormatter"
import { getCharacterAdditionalCounters } from "../utils/AdditionalCountersConfig"
import { useVlastPowerConversion } from "../features/character/VlastPowerConverter"
import {
  serializeSelections,
  hydrateSelections,
  buildPublicCharacteristicsSummary,
  stripNotesFromAdditionalCounters
} from "../utils/playerStateCodec"

const SOLO_SHEET_STORAGE_KEY = "killOrDie_soloSheetState"

export const useCharacterSheet = ({
  actor,
  selections,
  gameData,
  localization = {},
  onReset,
  onPlayerPatch,
  onPrivateStatePatch,
  currentPlayer,
  players = [],
  currentModeProp,
  onChangeMode,
  matchStatus = null,
  matchStartedAt = null,
  isInMatch = false
}) => {
  const isSoloMode = !currentPlayer?.id && (!Array.isArray(players) || players.length === 0)

  const [localMode, setLocalMode] = useState("mode1")
  const currentMode = currentModeProp !== undefined ? currentModeProp : localMode

  const handleModeChange = useCallback(
    (mode) => {
      if (onChangeMode) onChangeMode(mode)
      else setLocalMode(mode)
    },
    [onChangeMode]
  )

  const [counters, setCounters] = useState({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: 0,
    oport: 0,
    oport_max: 0,
    item: 0,
    item_max: 0
  })

  const [soloKills, setSoloKills] = useState(0)
  const [usedItems, setUsedItems] = useState(new Set())
  const [unlockedItems, setUnlockedItems] = useState(new Set())
  const [additionalCounters, setAdditionalCounters] = useState({})
  const [exposedCards, setExposedCards] = useState(new Set())
  const [copycatAssignments, setCopycatAssignments] = useState({})

  const countersRef = useRef(counters)
  const usedItemsRef = useRef(usedItems)
  const unlockedItemsRef = useRef(unlockedItems)
  const exposedCardsRef = useRef(exposedCards)
  const copycatRef = useRef(copycatAssignments)
  copycatRef.current = copycatAssignments

  const processingIdsRef = useRef(new Set())
  const currentPlayerIdRef = useRef(currentPlayer?.id)
  const currentUserIdRef = useRef(currentPlayer?.user_id)
  currentPlayerIdRef.current = currentPlayer?.id
  currentUserIdRef.current = currentPlayer?.user_id

  const lastProcessedActorIdRef = useRef(null)
  const initializedKeyRef = useRef(null)

  const updatePublicFields = useCallback((playerId, fields, options = {}) => {
    if (!playerId) return Promise.resolve({ success: false })
    return RoomService.updatePlayerFields(playerId, fields, options)
  }, [])

  const savePrivateFields = useCallback((playerId, fields, options = {}) => {
    if (!playerId) return Promise.resolve({ success: false })
    return RoomService.savePrivateState(playerId, fields, {
      userId: currentUserIdRef.current,
      ...options
    })
  }, [])

  // Recalcula e publica apenas os números resumidos (sem revelar cartas)
  const syncPublicCharacteristics = useCallback(
    async ({
      nextUsed = usedItemsRef.current,
      nextUnlocked = unlockedItemsRef.current,
      nextCopycat = copycatRef.current,
      nextConverted = null
    } = {}) => {
      if (!actor) return
      const summary = buildPublicCharacteristicsSummary({
        actor,
        selections,
        usedItems: nextUsed,
        unlockedItems: nextUnlocked,
        copycatAssignments: nextCopycat,
        convertedPowers: nextConverted ?? selections?.convertedPowers
      })

      if (onPlayerPatch) onPlayerPatch({ characteristics: summary })
      if (currentPlayerIdRef.current) {
        await updatePublicFields(currentPlayerIdRef.current, { characteristics: summary })
      }
    },
    [actor, selections, onPlayerPatch, updatePublicFields]
  )

  // Intercepta gravações da Nyanja Vlast para salvar no cofre privado e publicar só o resumo
  const handleVlastPrivatePatch = useCallback(
    (payload) => {
      if (!payload) return
      onPrivateStatePatch?.(payload)
    },
    [onPrivateStatePatch]
  )

  const handleVlastPersist = useCallback(
    async (playerId, payload) => {
      const privatePayload = {}
      if (payload.selections) {
        privatePayload.selections = serializeSelections(payload.selections)
      }
      if (payload.used_items) {
        privatePayload.used_items = payload.used_items
      }

      await savePrivateFields(playerId, privatePayload)
      await syncPublicCharacteristics({
        nextUsed: payload.used_items || usedItemsRef.current,
        nextConverted: payload.selections?.convertedPowers || []
      })
    },
    [savePrivateFields, syncPublicCharacteristics]
  )

  const vlast = useVlastPowerConversion({
    actor,
    localization,
    selections,
    currentPlayer,
    usedItemsRef,
    setUsedItems,
    onPlayerPatch: handleVlastPrivatePatch,
    updatePlayerFields: handleVlastPersist
  })

  useEffect(() => {
    return () => {
      const pid = currentPlayerIdRef.current
      if (pid) RoomService.flushPlayerUpdates(pid)
    }
  }, [])

  // Persiste o estado da ficha no Modo Solo para sobreviver ao F5
  useEffect(() => {
    if (!isSoloMode || !actor?.ID) return
    if (initializedKeyRef.current !== `${actor.ID}_solo`) return

    try {
      const compactCopy = serializeSelections({ copycatAssignments }).copycatAssignments || {}
      localStorage.setItem(
        SOLO_SHEET_STORAGE_KEY,
        JSON.stringify({
          actorId: actor.ID,
          counters,
          soloKills,
          usedItems: Array.from(usedItems),
          unlockedItems: Array.from(unlockedItems),
          exposedCards: Array.from(exposedCards),
          additionalCounters,
          copycatAssignments: compactCopy,
          convertedPowers: Array.from(vlast.convertedPowers || [])
        })
      )
    } catch (err) {
      console.warn("Erro ao salvar ficha solo:", err)
    }
  }, [
    isSoloMode,
    actor?.ID,
    counters,
    soloKills,
    usedItems,
    unlockedItems,
    exposedCards,
    additionalCounters,
    copycatAssignments,
    vlast.convertedPowers
  ])

  const killCount = useMemo(() => {
    if (isSoloMode) return soloKills
    if (!currentPlayer?.id) return 0
    return players.filter((p) => p.killed_by_player_id === currentPlayer.id).length
  }, [isSoloMode, soloKills, players, currentPlayer?.id])

  const initialCounters = useMemo(
    () => ({
      vida: 20,
      vida_max: 20,
      esquiva: 0,
      esquiva_max: actor?.DodgePoints || 0,
      oport: 0,
      oport_max: actor?.OportunityAttacks || 0,
      item: 0,
      item_max: actor?.ExplorationItens || 0
    }),
    [actor]
  )

  const usedItemsKey = JSON.stringify(currentPlayer?.used_items || [])
  const unlockedItemsKey = JSON.stringify(currentPlayer?.unlocked_items || [])
  const exposedCardsKey = JSON.stringify(currentPlayer?.exposed_cards || [])

  useEffect(() => {
    if (Array.isArray(currentPlayer?.used_items)) {
      const next = new Set(currentPlayer.used_items)
      usedItemsRef.current = next
      setUsedItems(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedItemsKey])

  useEffect(() => {
    if (Array.isArray(currentPlayer?.unlocked_items)) {
      const next = new Set(currentPlayer.unlocked_items)
      unlockedItemsRef.current = next
      setUnlockedItems(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedItemsKey])

  useEffect(() => {
    if (Array.isArray(currentPlayer?.exposed_cards)) {
      const next = new Set(currentPlayer.exposed_cards)
      exposedCardsRef.current = next
      setExposedCards(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposedCardsKey])

  const privateNotesKey = JSON.stringify(currentPlayer?._privateNotes || {})

  useEffect(() => {
    const incomingNotes = currentPlayer?._privateNotes
    if (!incomingNotes || Object.keys(incomingNotes).length === 0) return

    setAdditionalCounters((prev) => {
      const prevNotesKey = JSON.stringify(prev?._notes || {})
      if (prevNotesKey === privateNotesKey) return prev
      return {
        ...prev,
        _notes: { ...(prev?._notes || {}), ...incomingNotes }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateNotesKey])

  useEffect(() => {
    if (currentPlayer?.selections?.copycatAssignments) {
      setCopycatAssignments(currentPlayer.selections.copycatAssignments)
    }
  }, [currentPlayer?.id, currentPlayer?.selections?.copycatAssignments])

  // Reseta contadores ao trocar de personagem
  useEffect(() => {
    if (!actor?.ID) return
    if (lastProcessedActorIdRef.current === actor.ID) return
    if (lastProcessedActorIdRef.current === null) {
      lastProcessedActorIdRef.current = actor.ID
      return
    }

    const resetForNewActor = async () => {
      try {
        countersRef.current = initialCounters
        setCounters(initialCounters)
        setSoloKills(0)
        exposedCardsRef.current = new Set()
        setExposedCards(new Set())
        usedItemsRef.current = new Set()
        setUsedItems(new Set())
        unlockedItemsRef.current = new Set()
        setUnlockedItems(new Set())
        setCopycatAssignments({})
        vlast.resetConvertedPowers()

        const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID
        const resetAdditional = getCharacterAdditionalCounters(characterName, {
          actor,
          selections,
          gameData,
          localization
        })
        setAdditionalCounters(resetAdditional)

        const publicSummary = buildPublicCharacteristicsSummary({ actor, selections })
        const publicReset = {
          counters: initialCounters,
          characteristics: publicSummary,
          exposed_cards: [],
          additional_counters: stripNotesFromAdditionalCounters(resetAdditional)
        }

        if (onPlayerPatch) onPlayerPatch(publicReset)
        onPrivateStatePatch?.({ used_items: [], unlocked_items: [], notes: {} })

        if (currentPlayer?.id) {
          await Promise.all([
            updatePublicFields(currentPlayer.id, publicReset),
            savePrivateFields(currentPlayer.id, { used_items: [], unlocked_items: [], notes: {} })
          ])
        }

        lastProcessedActorIdRef.current = actor.ID
      } catch (err) {
        console.error("Erro ao resetar estado ao trocar de personagem:", err)
      }
    }

    resetForNewActor()
  }, [
    actor,
    currentPlayer?.id,
    initialCounters,
    localization,
    selections,
    gameData,
    onPlayerPatch,
    onPrivateStatePatch,
    updatePublicFields,
    savePrivateFields,
    vlast.resetConvertedPowers
  ])

  // Inicializa ou restaura contadores 1 vez por combinação (actor + player)
  useEffect(() => {
    if (!actor || !selections) return
    const initKey = `${actor.ID}_${currentPlayer?.id || "solo"}`
    if (initializedKeyRef.current === initKey) return
    initializedKeyRef.current = initKey

    const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID
    const defaultAdditionalCounters = getCharacterAdditionalCounters(characterName, {
      actor,
      selections,
      gameData,
      localization
    })

    if (currentPlayer?.id) {
      let resolvedCounters = initialCounters
      if (currentPlayer.counters) {
        const saved = currentPlayer.counters
        resolvedCounters = {
          ...saved,
          vida: saved.vida ?? initialCounters.vida,
          vida_max: initialCounters.vida_max || 20,
          esquiva: saved.esquiva ?? initialCounters.esquiva,
          esquiva_max: initialCounters.esquiva_max || 0,
          oport: saved.oport ?? initialCounters.oport,
          oport_max: initialCounters.oport_max || 0,
          item: saved.item ?? initialCounters.item,
          item_max: initialCounters.item_max || 0
        }
      }

      countersRef.current = resolvedCounters
      setCounters(resolvedCounters)

      const savedAdditional = currentPlayer.additional_counters || {}
      const expectedKeys = Object.keys(defaultAdditionalCounters)
      const hasAllKeys = expectedKeys.length > 0 && expectedKeys.every((k) => k in savedAdditional)
      const savedNotes = currentPlayer._privateNotes || savedAdditional._notes
      const resolvedAdditional = {
        ...(hasAllKeys ? stripNotesFromAdditionalCounters(savedAdditional) : defaultAdditionalCounters),
        ...(savedNotes ? { _notes: savedNotes } : {})
      }
      setAdditionalCounters(resolvedAdditional)

      const publicSummary = buildPublicCharacteristicsSummary({
        actor,
        selections,
        usedItems: currentPlayer.used_items || [],
        unlockedItems: currentPlayer.unlocked_items || [],
        copycatAssignments: currentPlayer.selections?.copycatAssignments,
        convertedPowers: currentPlayer.selections?.convertedPowers
      })

      const hasSavedCounters = Boolean(currentPlayer.counters && Object.keys(currentPlayer.counters).length > 0)

      const publicInitPayload = {
        ...(!hasSavedCounters ? { counters: resolvedCounters } : {}),
        characteristics: publicSummary,
        additional_counters: stripNotesFromAdditionalCounters(resolvedAdditional)
      }

      if (onPlayerPatch) onPlayerPatch(publicInitPayload)
      updatePublicFields(currentPlayer.id, publicInitPayload)
    } else {
      let restored = false
      try {
        const raw = localStorage.getItem(SOLO_SHEET_STORAGE_KEY)
        const saved = raw ? JSON.parse(raw) : null

        if (saved && saved.actorId === actor.ID) {
          const restoredCounters = {
            ...initialCounters,
            ...(saved.counters || {}),
            vida_max: initialCounters.vida_max || 20,
            esquiva_max: initialCounters.esquiva_max || 0,
            oport_max: initialCounters.oport_max || 0,
            item_max: initialCounters.item_max || 0
          }
          countersRef.current = restoredCounters
          setCounters(restoredCounters)
          setSoloKills(Number(saved.soloKills) || 0)

          const nextUsed = new Set(Array.isArray(saved.usedItems) ? saved.usedItems : [])
          usedItemsRef.current = nextUsed
          setUsedItems(nextUsed)

          const nextUnlocked = new Set(Array.isArray(saved.unlockedItems) ? saved.unlockedItems : [])
          unlockedItemsRef.current = nextUnlocked
          setUnlockedItems(nextUnlocked)

          const nextExposed = new Set(Array.isArray(saved.exposedCards) ? saved.exposedCards : [])
          exposedCardsRef.current = nextExposed
          setExposedCards(nextExposed)

          setAdditionalCounters(
            saved.additionalCounters && Object.keys(saved.additionalCounters).length > 0 ? saved.additionalCounters : defaultAdditionalCounters
          )

          if (saved.copycatAssignments) {
            const hydrated = hydrateSelections({ copycatAssignments: saved.copycatAssignments }, gameData)
            setCopycatAssignments(hydrated.copycatAssignments || {})
          }

          if (Array.isArray(saved.convertedPowers)) {
            vlast.restoreConvertedPowers(saved.convertedPowers)
          }

          restored = true
        }
      } catch (err) {
        console.warn("Não foi possível restaurar estado da ficha solo:", err)
      }

      if (!restored) {
        countersRef.current = initialCounters
        setCounters(initialCounters)
        setSoloKills(0)
        setAdditionalCounters(defaultAdditionalCounters)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor?.ID, currentPlayer?.id, initialCounters])

  // Desbloqueia Habilidades Especiais a cada novo abate
  const handleDeathUnlock = useCallback(
    async (newKillCount, previousKills) => {
      if (!selections?.specials && !selections?.passiveSpecials) return

      const nextUnlocked = new Set(unlockedItemsRef.current)
      for (let i = previousKills; i < newKillCount; i++) {
        const availableSpecials = (selections.specials || []).filter((item) => !nextUnlocked.has(item.ID))
        const availablePassiveSpecials = (selections.passiveSpecials || []).filter((item) => !nextUnlocked.has(item.ID))

        if (availableSpecials.length > 0) nextUnlocked.add(availableSpecials[0].ID)
        if (availablePassiveSpecials.length > 0) nextUnlocked.add(availablePassiveSpecials[0].ID)
      }

      const arr = Array.from(nextUnlocked)
      unlockedItemsRef.current = nextUnlocked
      setUnlockedItems(nextUnlocked)

      onPrivateStatePatch?.({ unlocked_items: arr })
      if (currentPlayerIdRef.current) {
        await savePrivateFields(currentPlayerIdRef.current, { unlocked_items: arr })
      }
      await syncPublicCharacteristics({ nextUnlocked })
    },
    [selections?.specials, selections?.passiveSpecials, onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const hasSyncedInitialKillsRef = useRef(isSoloMode)
  const prevKillCountRef = useRef(killCount)

  useEffect(() => {
    hasSyncedInitialKillsRef.current = isSoloMode
    prevKillCountRef.current = isSoloMode ? soloKills : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor?.ID, currentPlayer?.id, isSoloMode])

  useEffect(() => {
    // No multiplayer, define a linha de base na 1ª carga de players sem desbloquear grátis no F5
    if (!isSoloMode && !hasSyncedInitialKillsRef.current) {
      if (players.length > 0) {
        hasSyncedInitialKillsRef.current = true
        prevKillCountRef.current = killCount
      }
      return
    }

    if (killCount > prevKillCountRef.current) {
      handleDeathUnlock(killCount, prevKillCountRef.current)
    }
    if (killCount < 2 && currentMode === "mode2" && !Utils.modeSystem.hasModes(actor)) {
      handleModeChange("mode1")
    }
    prevKillCountRef.current = killCount
  }, [killCount, players.length, isSoloMode, currentMode, actor, handleDeathUnlock, handleModeChange])

  const isCopycat = useMemo(() => String(actor?.ID ?? "").toLowerCase() === "copiador", [actor?.ID])

  const copycatSlots = useMemo(() => {
    if (!isCopycat) return {}
    return {
      attacks: Number(actor.NumberOfUnlimitedAttacks) || 0,
      weapons: Number(actor.NumberOfWeapons) || 0,
      passives: Number(actor.NumberOfPassives) || 0,
      devices: Number(actor.NumberOfDevices) || 0,
      powers: Number(actor.NumberOfPowers) || 0,
      specials: Number(actor.NumberOfSpecialAbilities) || 0,
      passiveSpecials: Number(actor.NumberOfPassiveSpecialAbilities) || 0
    }
  }, [isCopycat, actor])

  const handleAssignCopy = useCallback(
    (slotKey, categoryKey, item) => {
      setCopycatAssignments((prev) => {
        const nextCategory = { ...(prev[categoryKey] || {}) }
        if (item) nextCategory[slotKey] = item
        else delete nextCategory[slotKey]

        const updated = { ...prev, [categoryKey]: nextCategory }
        const nextSelections = { ...selections, copycatAssignments: updated }

        onPrivateStatePatch?.({ selections: nextSelections })
        if (currentPlayerIdRef.current) {
          savePrivateFields(currentPlayerIdRef.current, {
            selections: serializeSelections(nextSelections)
          })
        }
        syncPublicCharacteristics({ nextCopycat: updated })
        return updated
      })
    },
    [selections, onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const handleCounterChange = useCallback(
    (id, value) => {
      const prev = countersRef.current
      const nextCounters = {
        ...prev,
        [id]: value,
        vida_max: prev.vida_max || initialCounters.vida_max || 20,
        esquiva_max: prev.esquiva_max || initialCounters.esquiva_max || 0,
        oport_max: prev.oport_max || initialCounters.oport_max || 0,
        item_max: prev.item_max || initialCounters.item_max || 0
      }

      countersRef.current = nextCounters
      setCounters(nextCounters)

      // Atualiza a lista de jogadores na hora (sem esperar parar de clicar)
      if (onPlayerPatch) {
        onPlayerPatch({ counters: nextCounters })
      }

      const pid = currentPlayerIdRef.current
      if (pid) {
        updatePublicFields(pid, { counters: nextCounters }, { debounced: true, debounceKey: `counters_${pid}`, delayMs: 250 })
      }
    },
    [initialCounters, onPlayerPatch, updatePublicFields]
  )

  // Separa contadores numéricos (públicos) de anotações _notes (privadas)
  const handleAdditionalCounterChange = useCallback(
    (newAdditionalCounters) => {
      setAdditionalCounters(newAdditionalCounters)

      const publicCounters = stripNotesFromAdditionalCounters(newAdditionalCounters)
      const privateNotes = newAdditionalCounters?._notes || null

      // Atualiza a lista de jogadores na hora
      if (onPlayerPatch) {
        onPlayerPatch({ additional_counters: publicCounters })
      }

      const pid = currentPlayerIdRef.current
      if (pid) {
        updatePublicFields(pid, { additional_counters: publicCounters }, { debounced: true, debounceKey: `additional_${pid}`, delayMs: 250 })

        if (privateNotes) {
          onPrivateStatePatch?.({ notes: privateNotes })
          savePrivateFields(pid, { notes: privateNotes }, { debounced: true, debounceKey: `private_notes_${pid}`, delayMs: 350 })
        }
      }
    },
    [onPlayerPatch, onPrivateStatePatch, updatePublicFields, savePrivateFields]
  )

  const handleSoloKillsChange = useCallback((value) => {
    setSoloKills(Math.max(0, Number(value) || 0))
  }, [])

  const handleUseItem = useCallback(
    async (itemId) => {
      const lockKey = `use_${itemId}`
      if (processingIdsRef.current.has(lockKey)) return
      processingIdsRef.current.add(lockKey)

      try {
        const nextUsed = new Set(usedItemsRef.current)
        if (nextUsed.has(itemId)) {
          nextUsed.delete(itemId)
        } else {
          nextUsed.add(itemId)
        }
        const arr = Array.from(nextUsed)

        usedItemsRef.current = nextUsed
        setUsedItems(nextUsed)
        onPrivateStatePatch?.({ used_items: arr })

        if (currentPlayerIdRef.current) {
          await savePrivateFields(currentPlayerIdRef.current, { used_items: arr })
        }
        await syncPublicCharacteristics({ nextUsed })
      } finally {
        processingIdsRef.current.delete(lockKey)
      }
    },
    [onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const handleUnlockItem = useCallback(
    async (itemId) => {
      const lockKey = `unlock_${itemId}`
      if (unlockedItemsRef.current.has(itemId) || processingIdsRef.current.has(lockKey)) return
      processingIdsRef.current.add(lockKey)

      try {
        const nextUnlocked = new Set(unlockedItemsRef.current)
        nextUnlocked.add(itemId)
        const arr = Array.from(nextUnlocked)

        unlockedItemsRef.current = nextUnlocked
        setUnlockedItems(nextUnlocked)
        onPrivateStatePatch?.({ unlocked_items: arr })

        if (currentPlayerIdRef.current) {
          await savePrivateFields(currentPlayerIdRef.current, { unlocked_items: arr })
        }
        await syncPublicCharacteristics({ nextUnlocked })
      } finally {
        processingIdsRef.current.delete(lockKey)
      }
    },
    [onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const handleRecoverItems = useCallback(
    async (type) => {
      const copiedItems = Object.values(copycatAssignments[type] || {}).filter(Boolean)
      const itemsToRecover = [...(selections[type] || []), ...copiedItems]
      const nextUsed = new Set(usedItemsRef.current)
      itemsToRecover.forEach((item) => {
        if (item?.ID) nextUsed.delete(item.ID)
      })
      const arr = Array.from(nextUsed)

      usedItemsRef.current = nextUsed
      setUsedItems(nextUsed)
      onPrivateStatePatch?.({ used_items: arr })

      if (currentPlayerIdRef.current) {
        await savePrivateFields(currentPlayerIdRef.current, { used_items: arr })
      }
      await syncPublicCharacteristics({ nextUsed })
    },
    [selections, copycatAssignments, onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const handleLockItems = useCallback(
    async (type) => {
      const copiedItems = Object.values(copycatAssignments[type] || {}).filter(Boolean)
      const itemsToLock = [...(selections[type] || []), ...copiedItems]
      const nextUnlocked = new Set(unlockedItemsRef.current)
      itemsToLock.forEach((item) => {
        if (item?.ID) nextUnlocked.delete(item.ID)
      })
      const arr = Array.from(nextUnlocked)

      unlockedItemsRef.current = nextUnlocked
      setUnlockedItems(nextUnlocked)
      onPrivateStatePatch?.({ unlocked_items: arr })

      if (currentPlayerIdRef.current) {
        await savePrivateFields(currentPlayerIdRef.current, { unlocked_items: arr })
      }
      await syncPublicCharacteristics({ nextUnlocked })
    },
    [selections, copycatAssignments, onPrivateStatePatch, savePrivateFields, syncPublicCharacteristics]
  )

  const handleToggleCardExposure = useCallback(
    async (itemId) => {
      const nextExposed = new Set(exposedCardsRef.current)
      if (nextExposed.has(itemId)) nextExposed.delete(itemId)
      else nextExposed.add(itemId)
      const arr = Array.from(nextExposed)

      exposedCardsRef.current = nextExposed
      setExposedCards(nextExposed)
      if (onPlayerPatch) onPlayerPatch({ exposed_cards: arr })

      const pid = currentPlayerIdRef.current
      if (pid) {
        await updatePublicFields(pid, { exposed_cards: arr })
      }
    },
    [onPlayerPatch, updatePublicFields]
  )

  // Reset suave: restaura Vida/Pulos/Contadores/Consumíveis/Especiais mantendo o mesmo personagem e build
  const handleSoftReset = useCallback(async () => {
    if (!actor) return

    const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID
    const resetAdditional = getCharacterAdditionalCounters(characterName, {
      actor,
      selections,
      gameData,
      localization
    })

    countersRef.current = initialCounters
    setCounters(initialCounters)
    setSoloKills(0)
    prevKillCountRef.current = 0
    usedItemsRef.current = new Set()
    setUsedItems(new Set())
    unlockedItemsRef.current = new Set()
    setUnlockedItems(new Set())
    exposedCardsRef.current = new Set()
    setExposedCards(new Set())
    setAdditionalCounters(resetAdditional)
    vlast.resetConvertedPowers()

    if (Utils.modeSystem.hasModes(actor) || currentMode !== "mode1") {
      handleModeChange("mode1")
    }

    if (isSoloMode) {
      localStorage.removeItem(SOLO_SHEET_STORAGE_KEY)
      return
    }

    const nextSelections = selections?.convertedPowers?.length
      ? { ...selections, convertedPowers: [] }
      : selections

    const publicSummary = buildPublicCharacteristicsSummary({
      actor,
      selections: nextSelections,
      usedItems: [],
      unlockedItems: [],
      copycatAssignments: copycatRef.current,
      convertedPowers: []
    })

    const publicReset = {
      counters: initialCounters,
      characteristics: publicSummary,
      exposed_cards: [],
      additional_counters: stripNotesFromAdditionalCounters(resetAdditional)
    }

    const privateReset = {
      used_items: [],
      unlocked_items: [],
      notes: {},
      ...(selections?.convertedPowers?.length ? { selections: serializeSelections(nextSelections) } : {})
    }

    if (onPlayerPatch) onPlayerPatch(publicReset)
    onPrivateStatePatch?.({
      used_items: [],
      unlocked_items: [],
      notes: {},
      ...(selections?.convertedPowers?.length ? { selections: nextSelections } : {})
    })

    if (currentPlayerIdRef.current) {
      await Promise.all([
        updatePublicFields(currentPlayerIdRef.current, publicReset),
        savePrivateFields(currentPlayerIdRef.current, privateReset)
      ])
    }
  }, [
    actor,
    localization,
    selections,
    gameData,
    initialCounters,
    currentMode,
    handleModeChange,
    isSoloMode,
    onPlayerPatch,
    onPrivateStatePatch,
    updatePublicFields,
    savePrivateFields,
    vlast.resetConvertedPowers
  ])

  // Dispara reset suave automático quando uma NOVA partida inicia (ignora F5 no meio de partida ativa)
  const prevMatchStatusRef = useRef(matchStatus)
  const lastAutoResetMatchRef = useRef(null)

  useEffect(() => {
    const prev = prevMatchStatusRef.current
    prevMatchStatusRef.current = matchStatus

    if (isSoloMode || !currentPlayer?.id) return
    if (prev !== "in_progress" && matchStatus === "in_progress" && isInMatch && matchStartedAt) {
      const storageKey = `kod_last_reset_${currentPlayer.id}`
      const alreadyReset =
        lastAutoResetMatchRef.current === matchStartedAt ||
        sessionStorage.getItem(storageKey) === matchStartedAt

      if (!alreadyReset) {
        lastAutoResetMatchRef.current = matchStartedAt
        sessionStorage.setItem(storageKey, matchStartedAt)
        handleSoftReset()
      }
    }
  }, [matchStatus, matchStartedAt, isInMatch, isSoloMode, currentPlayer?.id, handleSoftReset])

  const handleReset = useCallback(async () => {
    initializedKeyRef.current = null

    exposedCardsRef.current = new Set()
    setExposedCards(new Set())
    setSoloKills(0)
    prevKillCountRef.current = 0
    setCopycatAssignments({})
    vlast.resetConvertedPowers()

    if (isSoloMode) {
      localStorage.removeItem(SOLO_SHEET_STORAGE_KEY)
    }

    if (onReset) onReset()
  }, [onReset, vlast.resetConvertedPowers])

  return {
    isSoloMode,
    currentMode,
    handleModeChange,
    counters,
    killCount,
    usedItems,
    unlockedItems,
    additionalCounters,
    exposedCards,
    copycatAssignments,
    isCopycat,
    copycatSlots,
    vlast,
    handleCounterChange,
    handleSoloKillsChange,
    handleAdditionalCounterChange,
    handleUseItem,
    handleUnlockItem,
    handleRecoverItems,
    handleLockItems,
    handleToggleCardExposure,
    handleAssignCopy,
    handleReset,
    handleSoftReset
  }
}
