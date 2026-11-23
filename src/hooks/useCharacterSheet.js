import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RoomService } from '../services/roomService';
import { Utils } from '../utils/cardFormatter';
import { getCharacterAdditionalCounters } from '../utils/AdditionalCountersConfig';
import { useVlastPowerConversion } from '../features/character/VlastPowerConverter';

/**
 * ============================================================================
 * HOOK DA FICHA DO PERSONAGEM (useCharacterSheet.js)
 * ============================================================================
 * Centraliza todos os estados, contadores, regras de desbloqueio por abate,
 * mecânicas especiais (Copiador e Nyanja Vlast) e persistência via RoomService.
 * ============================================================================
 */
export const useCharacterSheet = ({
  actor,
  selections,
  gameData,
  localization = {},
  onReset,
  onPlayerPatch,
  currentPlayer,
  players = [],
  currentModeProp,
  onChangeMode
}) => {
  const isSoloMode = !currentPlayer?.id;

  const [localMode, setLocalMode] = useState('mode1');
  const currentMode = currentModeProp !== undefined ? currentModeProp : localMode;

  const handleModeChange = useCallback(
    (mode) => {
      if (onChangeMode) onChangeMode(mode);
      else setLocalMode(mode);
    },
    [onChangeMode]
  );

  const [counters, setCounters] = useState({
    vida: 20,
    vida_max: 20,
    esquiva: 0,
    esquiva_max: 0,
    oport: 0,
    oport_max: 0,
    item: 0,
    item_max: 0
  });

  const [soloKills, setSoloKills] = useState(0);
  const [usedItems, setUsedItems] = useState(new Set());
  const [unlockedItems, setUnlockedItems] = useState(new Set());
  const [additionalCounters, setAdditionalCounters] = useState({});
  const [exposedCards, setExposedCards] = useState(new Set());
  const [copycatAssignments, setCopycatAssignments] = useState({});

  const countersRef = useRef(counters);
  const usedItemsRef = useRef(usedItems);
  const unlockedItemsRef = useRef(unlockedItems);
  const exposedCardsRef = useRef(exposedCards);
  const currentPlayerIdRef = useRef(currentPlayer?.id);
  currentPlayerIdRef.current = currentPlayer?.id;

  const lastProcessedActorIdRef = useRef(null);
  const initializedKeyRef = useRef(null);
  const pendingCountersRef = useRef(null);
  const pendingAdditionalRef = useRef(null);
  const broadcastCountersTimerRef = useRef(null);
  const broadcastAdditionalTimerRef = useRef(null);

  const updatePlayerFields = useCallback((playerId, fields, options = {}) => {
    if (!playerId) return Promise.resolve({ success: false });
    return RoomService.updatePlayerFields(playerId, fields, options);
  }, []);

  // Mecânica modular da Naja/Nyanja Vlast (Poderes -> Passivas)
  const vlast = useVlastPowerConversion({
    actor,
    localization,
    selections,
    currentPlayer,
    usedItemsRef,
    setUsedItems,
    onPlayerPatch,
    updatePlayerFields
  });

  // Garante envio imediato de pendências ao sair da ficha
  useEffect(() => {
    return () => {
      const pid = currentPlayerIdRef.current;
      if (broadcastCountersTimerRef.current) clearTimeout(broadcastCountersTimerRef.current);
      if (broadcastAdditionalTimerRef.current) clearTimeout(broadcastAdditionalTimerRef.current);
      if (pid) RoomService.flushPlayerUpdates(pid);
    };
  }, []);

  const killCount = useMemo(() => {
    if (isSoloMode) return soloKills;
    return players.filter((p) => p.killed_by_player_id === currentPlayer.id).length;
  }, [isSoloMode, soloKills, players, currentPlayer?.id]);

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
  );

  const calculatedCharacteristics = useMemo(() => {
    if (!actor || !selections) return {};
    return {
      attacks: Array.isArray(selections.attacks) ? selections.attacks.length : 0,
      weapons: Array.isArray(selections.weapons) ? selections.weapons.length : 0,
      passives: Array.isArray(selections.passives) ? selections.passives.length : 0,
      devices: Array.isArray(selections.devices) ? selections.devices.length : 0,
      powers: Array.isArray(selections.powers) ? selections.powers.length : 0,
      specials: Array.isArray(selections.specials) ? selections.specials.length : 0,
      passiveSpecials: Array.isArray(selections.passiveSpecials) ? selections.passiveSpecials.length : 0
    };
  }, [actor, selections]);

  // Sincroniza arrays vindos do banco quando mudam externamente
  const usedItemsKey = JSON.stringify(currentPlayer?.used_items || []);
  const unlockedItemsKey = JSON.stringify(currentPlayer?.unlocked_items || []);
  const exposedCardsKey = JSON.stringify(currentPlayer?.exposed_cards || []);

  useEffect(() => {
    if (Array.isArray(currentPlayer?.used_items)) {
      const next = new Set(currentPlayer.used_items);
      usedItemsRef.current = next;
      setUsedItems(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedItemsKey]);

  useEffect(() => {
    if (Array.isArray(currentPlayer?.unlocked_items)) {
      const next = new Set(currentPlayer.unlocked_items);
      unlockedItemsRef.current = next;
      setUnlockedItems(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedItemsKey]);

  useEffect(() => {
    if (Array.isArray(currentPlayer?.exposed_cards)) {
      const next = new Set(currentPlayer.exposed_cards);
      exposedCardsRef.current = next;
      setExposedCards(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposedCardsKey]);

  useEffect(() => {
    if (currentPlayer?.selections?.copycatAssignments) {
      setCopycatAssignments(currentPlayer.selections.copycatAssignments);
    }
  }, [currentPlayer?.id, currentPlayer?.selections?.copycatAssignments]);

  // Reseta contadores ao trocar de personagem
  useEffect(() => {
    if (!actor?.ID) return;
    if (lastProcessedActorIdRef.current === actor.ID) return;
    if (lastProcessedActorIdRef.current === null) {
      lastProcessedActorIdRef.current = actor.ID;
      return;
    }

    const resetForNewActor = async () => {
      try {
        countersRef.current = initialCounters;
        setCounters(initialCounters);
        setSoloKills(0);
        exposedCardsRef.current = new Set();
        setExposedCards(new Set());
        usedItemsRef.current = new Set();
        setUsedItems(new Set());
        unlockedItemsRef.current = new Set();
        setUnlockedItems(new Set());
        setCopycatAssignments({});
        vlast.resetConvertedPowers();

        const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID;
        const resetAdditional = getCharacterAdditionalCounters(characterName, {
          actor,
          selections,
          gameData,
          localization
        });
        setAdditionalCounters(resetAdditional);

        const resetFields = {
          counters: initialCounters,
          exposed_cards: [],
          used_items: [],
          unlocked_items: [],
          additional_counters: resetAdditional
        };

        if (onPlayerPatch) onPlayerPatch(resetFields);
        if (currentPlayer?.id) await updatePlayerFields(currentPlayer.id, resetFields);

        lastProcessedActorIdRef.current = actor.ID;
      } catch (err) {
        console.error('Erro ao resetar estado ao trocar de personagem:', err);
      }
    };

    resetForNewActor();
  }, [
    actor,
    currentPlayer?.id,
    initialCounters,
    localization,
    selections,
    gameData,
    onPlayerPatch,
    updatePlayerFields,
    vlast.resetConvertedPowers
  ]);

  // Inicializa ou restaura contadores 1 vez por combinação (actor + player)
  useEffect(() => {
    if (!actor || !selections) return;
    const initKey = `${actor.ID}_${currentPlayer?.id || 'solo'}`;
    if (initializedKeyRef.current === initKey) return;
    initializedKeyRef.current = initKey;

    const characterName = localization[`Character.Name.${actor.ID}`] || actor.ID;
    const defaultAdditionalCounters = getCharacterAdditionalCounters(characterName, {
      actor,
      selections,
      gameData,
      localization
    });

    if (currentPlayer?.id) {
      let resolvedCounters = initialCounters;
      if (currentPlayer.counters) {
        const saved = currentPlayer.counters;
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
        };
      }

      countersRef.current = resolvedCounters;
      setCounters(resolvedCounters);

      const savedAdditional = currentPlayer.additional_counters || {};
      const expectedKeys = Object.keys(defaultAdditionalCounters);
      const hasAllKeys = expectedKeys.length > 0 && expectedKeys.every((k) => k in savedAdditional);
      const resolvedAdditional = hasAllKeys
        ? savedAdditional
        : {
            ...defaultAdditionalCounters,
            ...(savedAdditional._notes ? { _notes: savedAdditional._notes } : {})
          };
      setAdditionalCounters(resolvedAdditional);

      const mergedSelections = {
        ...selections,
        ...(currentPlayer.selections?.copycatAssignments
          ? { copycatAssignments: currentPlayer.selections.copycatAssignments }
          : {}),
        ...(Array.isArray(currentPlayer.selections?.convertedPowers)
          ? { convertedPowers: currentPlayer.selections.convertedPowers }
          : {})
      };

      const initPayload = {
        counters: resolvedCounters,
        characteristics: calculatedCharacteristics,
        selections: mergedSelections,
        additional_counters: resolvedAdditional
      };

      if (onPlayerPatch) onPlayerPatch(initPayload);
      updatePlayerFields(currentPlayer.id, initPayload);
    } else {
      countersRef.current = initialCounters;
      setCounters(initialCounters);
      setSoloKills(0);
      setAdditionalCounters(defaultAdditionalCounters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor?.ID, currentPlayer?.id, initialCounters]);

  // Desbloqueia Habilidades Especiais a cada novo abate
  const handleDeathUnlock = useCallback(
    async (newKillCount, previousKills) => {
      if (!selections?.specials && !selections?.passiveSpecials) return;

      const nextUnlocked = new Set(unlockedItemsRef.current);
      for (let i = previousKills; i < newKillCount; i++) {
        const availableSpecials = (selections.specials || []).filter((item) => !nextUnlocked.has(item.ID));
        const availablePassiveSpecials = (selections.passiveSpecials || []).filter(
          (item) => !nextUnlocked.has(item.ID)
        );

        if (availableSpecials.length > 0) nextUnlocked.add(availableSpecials[0].ID);
        if (availablePassiveSpecials.length > 0) nextUnlocked.add(availablePassiveSpecials[0].ID);
      }

      const arr = Array.from(nextUnlocked);
      unlockedItemsRef.current = nextUnlocked;
      setUnlockedItems(nextUnlocked);

      if (onPlayerPatch) onPlayerPatch({ unlocked_items: arr });
      if (currentPlayerIdRef.current) {
        await updatePlayerFields(currentPlayerIdRef.current, { unlocked_items: arr });
      }
    },
    [selections?.specials, selections?.passiveSpecials, onPlayerPatch, updatePlayerFields]
  );

  const prevKillCountRef = useRef(killCount);
  useEffect(() => {
    if (killCount > prevKillCountRef.current) {
      handleDeathUnlock(killCount, prevKillCountRef.current);
    }
    if (killCount < 2 && currentMode === 'mode2' && !Utils.modeSystem.hasModes(actor)) {
      handleModeChange('mode1');
    }
    prevKillCountRef.current = killCount;
  }, [killCount, currentMode, actor, handleDeathUnlock, handleModeChange]);

  // Configuração do personagem Copiador
  const isCopycat = useMemo(
    () => String(actor?.ID ?? '').toLowerCase() === 'copiador',
    [actor?.ID]
  );

  const copycatSlots = useMemo(() => {
    if (!isCopycat) return {};
    return {
      attacks: Number(actor.NumberOfUnlimitedAttacks) || 0,
      weapons: Number(actor.NumberOfWeapons) || 0,
      passives: Number(actor.NumberOfPassives) || 0,
      devices: Number(actor.NumberOfDevices) || 0,
      powers: Number(actor.NumberOfPowers) || 0,
      specials: Number(actor.NumberOfSpecialAbilities) || 0,
      passiveSpecials: Number(actor.NumberOfPassiveSpecialAbilities) || 0
    };
  }, [isCopycat, actor]);

  const handleAssignCopy = useCallback(
    (slotKey, categoryKey, item) => {
      setCopycatAssignments((prev) => {
        const nextCategory = { ...(prev[categoryKey] || {}) };
        if (item) nextCategory[slotKey] = item;
        else delete nextCategory[slotKey];

        const updated = { ...prev, [categoryKey]: nextCategory };
        const nextSelections = { ...selections, copycatAssignments: updated };

        if (onPlayerPatch) onPlayerPatch({ selections: nextSelections });
        if (currentPlayerIdRef.current) {
          updatePlayerFields(currentPlayerIdRef.current, { selections: nextSelections });
        }
        return updated;
      });
    },
    [selections, onPlayerPatch, updatePlayerFields]
  );

  const handleCounterChange = useCallback(
    (id, value) => {
      const prev = countersRef.current;
      const nextCounters = {
        ...prev,
        [id]: value,
        vida_max: prev.vida_max || initialCounters.vida_max || 20,
        esquiva_max: prev.esquiva_max || initialCounters.esquiva_max || 0,
        oport_max: prev.oport_max || initialCounters.oport_max || 0,
        item_max: prev.item_max || initialCounters.item_max || 0
      };

      countersRef.current = nextCounters;
      setCounters(nextCounters);
      pendingCountersRef.current = nextCounters;

      if (onPlayerPatch) {
        if (broadcastCountersTimerRef.current) clearTimeout(broadcastCountersTimerRef.current);
        broadcastCountersTimerRef.current = setTimeout(() => {
          broadcastCountersTimerRef.current = null;
          if (pendingCountersRef.current) {
            onPlayerPatch({ counters: pendingCountersRef.current });
          }
        }, 120);
      }

      const pid = currentPlayerIdRef.current;
      if (pid) {
        updatePlayerFields(
          pid,
          { counters: nextCounters },
          { debounced: true, debounceKey: `counters_${pid}`, delayMs: 450 }
        );
      }
    },
    [initialCounters, onPlayerPatch, updatePlayerFields]
  );

  const handleSoloKillsChange = useCallback((value) => {
    setSoloKills(Math.max(0, Number(value) || 0));
  }, []);

  const handleAdditionalCounterChange = useCallback(
    (newAdditionalCounters) => {
      setAdditionalCounters(newAdditionalCounters);
      pendingAdditionalRef.current = newAdditionalCounters;

      if (onPlayerPatch) {
        if (broadcastAdditionalTimerRef.current) clearTimeout(broadcastAdditionalTimerRef.current);
        broadcastAdditionalTimerRef.current = setTimeout(() => {
          broadcastAdditionalTimerRef.current = null;
          if (pendingAdditionalRef.current) {
            onPlayerPatch({ additional_counters: pendingAdditionalRef.current });
          }
        }, 120);
      }

      const pid = currentPlayerIdRef.current;
      if (pid) {
        updatePlayerFields(
          pid,
          { additional_counters: newAdditionalCounters },
          { debounced: true, debounceKey: `additional_${pid}`, delayMs: 450 }
        );
      }
    },
    [onPlayerPatch, updatePlayerFields]
  );

  const handleUseItem = useCallback(
    async (itemId) => {
      const nextUsed = new Set(usedItemsRef.current);
      nextUsed.add(itemId);
      const arr = Array.from(nextUsed);

      usedItemsRef.current = nextUsed;
      setUsedItems(nextUsed);
      if (onPlayerPatch) onPlayerPatch({ used_items: arr });
      if (currentPlayerIdRef.current) {
        await updatePlayerFields(currentPlayerIdRef.current, { used_items: arr });
      }
    },
    [onPlayerPatch, updatePlayerFields]
  );

  const handleUnlockItem = useCallback(
    async (itemId) => {
      const nextUnlocked = new Set(unlockedItemsRef.current);
      nextUnlocked.add(itemId);
      const arr = Array.from(nextUnlocked);

      unlockedItemsRef.current = nextUnlocked;
      setUnlockedItems(nextUnlocked);
      if (onPlayerPatch) onPlayerPatch({ unlocked_items: arr });
      if (currentPlayerIdRef.current) {
        await updatePlayerFields(currentPlayerIdRef.current, { unlocked_items: arr });
      }
    },
    [onPlayerPatch, updatePlayerFields]
  );

  const handleRecoverItems = useCallback(
    async (type) => {
      const copiedItems = Object.values(copycatAssignments[type] || {}).filter(Boolean);
      const itemsToRecover = [...(selections[type] || []), ...copiedItems];
      const nextUsed = new Set(usedItemsRef.current);
      itemsToRecover.forEach((item) => {
        if (item?.ID) nextUsed.delete(item.ID);
      });
      const arr = Array.from(nextUsed);

      usedItemsRef.current = nextUsed;
      setUsedItems(nextUsed);
      if (onPlayerPatch) onPlayerPatch({ used_items: arr });
      if (currentPlayerIdRef.current) {
        await updatePlayerFields(currentPlayerIdRef.current, { used_items: arr });
      }
    },
    [selections, copycatAssignments, onPlayerPatch, updatePlayerFields]
  );

  const handleLockItems = useCallback(
    async (type) => {
      const copiedItems = Object.values(copycatAssignments[type] || {}).filter(Boolean);
      const itemsToLock = [...(selections[type] || []), ...copiedItems];
      const nextUnlocked = new Set(unlockedItemsRef.current);
      itemsToLock.forEach((item) => {
        if (item?.ID) nextUnlocked.delete(item.ID);
      });
      const arr = Array.from(nextUnlocked);

      unlockedItemsRef.current = nextUnlocked;
      setUnlockedItems(nextUnlocked);
      if (onPlayerPatch) onPlayerPatch({ unlocked_items: arr });
      if (currentPlayerIdRef.current) {
        await updatePlayerFields(currentPlayerIdRef.current, { unlocked_items: arr });
      }
    },
    [selections, copycatAssignments, onPlayerPatch, updatePlayerFields]
  );

  const handleToggleCardExposure = useCallback(
    async (itemId) => {
      const nextExposed = new Set(exposedCardsRef.current);
      if (nextExposed.has(itemId)) nextExposed.delete(itemId);
      else nextExposed.add(itemId);
      const arr = Array.from(nextExposed);

      exposedCardsRef.current = nextExposed;
      setExposedCards(nextExposed);
      if (onPlayerPatch) onPlayerPatch({ exposed_cards: arr });

      const pid = currentPlayerIdRef.current;
      if (pid) {
        await updatePlayerFields(pid, { exposed_cards: arr });
        if (nextExposed.has(itemId)) {
          await RoomService.recordExposedCardHistory(pid, actor?.ID, itemId);
        }
      }
    },
    [actor?.ID, onPlayerPatch, updatePlayerFields]
  );

  const handleReset = useCallback(async () => {
    if (broadcastCountersTimerRef.current) clearTimeout(broadcastCountersTimerRef.current);
    if (broadcastAdditionalTimerRef.current) clearTimeout(broadcastAdditionalTimerRef.current);
    pendingCountersRef.current = null;
    pendingAdditionalRef.current = null;
    initializedKeyRef.current = null;

    exposedCardsRef.current = new Set();
    setExposedCards(new Set());
    setSoloKills(0);
    prevKillCountRef.current = 0;
    setCopycatAssignments({});
    vlast.resetConvertedPowers();

    if (onReset) onReset();
  }, [onReset, vlast.resetConvertedPowers]);

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
    handleReset
  };
};