import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../config/supabaseClient';
import { CombatService } from '../services/combatService';
import {
  parseDefenseDices,
  parseAttackDices,
  rollSixSidedDice,
  calculateCombatRounds,
  extractPlayerWeapons,
  applyModeToWeapon
} from '../utils/combatHelpers';

/**
 * ============================================================================
 * HOOK DE SINCRONIZAÇÃO E AÇÕES DE COMBATE (useCombatSync.js)
 * ============================================================================
 * Gerencia o estado local, os canais Realtime e delega todas as operações de
 * banco para o CombatService.
 * ============================================================================
 */
export const useCombatSync = ({
  roomId,
  currentPlayer,
  currentPlayerData,
  players = [],
  matchStatus,
  combatMode,
  isOpen,
  onOpenPanel,
  localization = {},
  showToast
}) => {
  const [combat, setCombat] = useState(null);
  const [combatGroup, setCombatGroup] = useState([]);
  const [activeCombatId, setActiveCombatId] = useState(null);

  const [selectedAttack, setSelectedAttack] = useState(null);
  const [selectedDefenders, setSelectedDefenders] = useState([]);
  const [allowCounterAttack, setAllowCounterAttack] = useState(true);
  const [allowOpportunityAttacks, setAllowOpportunityAttacks] = useState(true);
  const [loading, setLoading] = useState(false);

  const [customAttack, setCustomAttack] = useState({
    Name: localization?.['UI.Combat.CustomAttack'] || 'Ataque Personalizado',
    Dices: '1',
    LoadTime: '3',
    Damage: '0',
    Effects: '',
    category: localization?.['UI.Combat.CustomCategory'] || 'Customizado'
  });

  const [rolling, setRolling] = useState(false);
  const [diceAnimation, setDiceAnimation] = useState([]);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [tempDefenseDices, setTempDefenseDices] = useState(null);
  const [tempWeapon, setTempWeapon] = useState(null);

  const currentPlayerRef = useRef(currentPlayer);
  currentPlayerRef.current = currentPlayer;
  const activeCombatIdRef = useRef(activeCombatId);
  activeCombatIdRef.current = activeCombatId;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onOpenPanelRef = useRef(onOpenPanel);
  onOpenPanelRef.current = onOpenPanel;

  const bcastChannelRef = useRef(null);
  const combatLoadSeqRef = useRef(0);
  const lastCombatHashRef = useRef('');
  const defenseDiceDebounceRef = useRef(null);

  useEffect(() => {
    return () => {
      if (defenseDiceDebounceRef.current) {
        clearTimeout(defenseDiceDebounceRef.current);
      }
    };
  }, []);

  const broadcastCombatPing = useCallback((payload = { action: 'refresh' }) => {
    if (!bcastChannelRef.current) return;
    bcastChannelRef.current.send({
      type: 'broadcast',
      event: 'combat_sync',
      payload: {
        senderId: currentPlayerRef.current?.id,
        ts: Date.now(),
        ...payload
      }
    });
  }, []);

  const availableAttacks = useMemo(
    () => extractPlayerWeapons(currentPlayerData, combatMode, localization),
    [currentPlayerData, combatMode, localization]
  );

  const availableTargets = useMemo(
    () =>
      players.filter(
        (p) =>
          p.id !== currentPlayer?.id &&
          p.character?.selections &&
          p.status !== 'offline' &&
          p.is_alive !== false
      ),
    [players, currentPlayer?.id]
  );

  const swapTargets = useMemo(() => {
    const groupDefenderIds = combatGroup.map((gc) => gc.defender_id);
    return players.filter(
      (p) =>
        p.id !== currentPlayer?.id &&
        p.id !== combat?.defender_id &&
        !groupDefenderIds.includes(p.id) &&
        p.character?.selections &&
        p.status !== 'offline' &&
        p.is_alive !== false
    );
  }, [players, currentPlayer?.id, combat?.defender_id, combatGroup]);

  const loadCombat = useCallback(async () => {
    const playerId = currentPlayerRef.current?.id;
    if (!playerId || !roomId) return;

    const reqSeq = ++combatLoadSeqRef.current;

    try {
      const { success, data } = await CombatService.getActiveCombats(roomId);
      if (!success || reqSeq !== combatLoadSeqRef.current) return;

      const nextHash = JSON.stringify(data || []);
      if (nextHash === lastCombatHashRef.current) return;
      lastCombatHashRef.current = nextHash;

      if (data.length > 0) {
        const firstCombat = data[0];
        const groupId = firstCombat.combat_group_id;

        if (groupId) {
          const groupCombats = data.filter((c) => c.combat_group_id === groupId);
          setCombatGroup(groupCombats);
          const myDef = groupCombats.find((c) => c.defender_id === playerId);
          const selectedActive = activeCombatIdRef.current
            ? groupCombats.find((c) => c.id === activeCombatIdRef.current)
            : null;
          const myAtk = groupCombats.find((c) => c.attacker_id === playerId);
          setCombat(myDef || selectedActive || myAtk || groupCombats[0]);
        } else {
          setCombatGroup([firstCombat]);
          setCombat(firstCombat);
        }
      } else {
        setCombat(null);
        setCombatGroup([]);
        setActiveCombatId(null);
      }
    } catch (err) {
      console.error('Erro ao buscar combate:', err);
    }
  }, [roomId]);

  // Canais Realtime (Broadcast + Postgres Changes) + Polling 3s
  useEffect(() => {
    if (!roomId || !currentPlayer?.id) return;

    let isMounted = true;
    let bcastChannel = null;
    let pgChannel = null;
    let reconnectTimer = null;

    loadCombat();

    const setupChannels = () => {
      if (!isMounted) return;
      if (bcastChannel) supabase.removeChannel(bcastChannel);
      if (pgChannel) supabase.removeChannel(pgChannel);

      bcastChannel = supabase
        .channel(`kod_combat_bcast_${roomId}`, { config: { broadcast: { self: false } } }) .on('broadcast', { event: 'combat_sync' }, ({ payload }) => { if (!isMounted) return; const playerId = currentPlayerRef.current?.id;  if (payload?.action === 'ended') { combatLoadSeqRef.current++; lastCombatHashRef.current = '[]'; setCombat(null); setCombatGroup([]); setActiveCombatId(null); return; }  if ( payload?.action === 'started' && Array.isArray(payload.defenderIds) && payload.defenderIds.includes(playerId) && !isOpenRef.current ) { onOpenPanelRef.current?.(); }  loadCombat(); }) .subscribe();  bcastChannelRef.current = bcastChannel;  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; pgChannel = supabase .channel(`kod_combat_pg_${roomId}_${uniqueSuffix}`) .on( 'postgres_changes', { event: '*', schema: 'public', table: 'combat_notifications', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (!isMounted) return;
            const combatData = payload.new || payload.old;
            const playerId = currentPlayerRef.current?.id;

            if (
              payload.eventType === 'INSERT' &&
              combatData?.defender_id === playerId &&
              combatData?.status === 'pending' &&
              !isOpenRef.current
            ) {
              onOpenPanelRef.current?.();
            }

            loadCombat();
          }
        )
        .subscribe((status) => {
          if (!isMounted) return;
          if (status === 'SUBSCRIBED') {
            loadCombat();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (isMounted) setupChannels();
            }, 2500);
          }
        });
    };

    const initTimer = setTimeout(setupChannels, 80);
    const pollInterval = setInterval(() => {
      if (isMounted && document.visibilityState === 'visible') {
        loadCombat();
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      clearTimeout(reconnectTimer);
      clearInterval(pollInterval);
      bcastChannelRef.current = null;
      if (bcastChannel) supabase.removeChannel(bcastChannel);
      if (pgChannel) supabase.removeChannel(pgChannel);
    };
  }, [roomId, currentPlayer?.id, loadCombat]);

  useEffect(() => {
    setSelectedWeapon(null);
  }, [combat?.id]);

  // Atualiza a arma já selecionada caso o jogador troque entre Modo 1 e Modo 2
  useEffect(() => {
    setSelectedAttack((prev) => (prev?.modes ? applyModeToWeapon(prev, combatMode) : prev));
    setSelectedWeapon((prev) => (prev?.modes ? applyModeToWeapon(prev, combatMode) : prev));
    setTempWeapon((prev) => (prev?.modes ? applyModeToWeapon(prev, combatMode) : prev));
  }, [combatMode]);

  // Inicializa dados de defesa temporários quando o combate entra em andamento
  useEffect(() => {
    if (combat && combat.status === 'in_progress' && tempDefenseDices === null) {
      const isAttacker = combat.attacker_id === currentPlayer?.id;
      const isDefender = combat.defender_id === currentPlayer?.id;

      let initialValue = null;
      if (isAttacker && combat.attacker_defense_dices != null) {
        initialValue = combat.attacker_defense_dices;
      } else if (isDefender && combat.defender_defense_dices != null) {
        initialValue = combat.defender_defense_dices;
      }

      if (initialValue === null) {
        initialValue = parseDefenseDices(currentPlayerData?.character?.actor?.NumberOfDefenseDices, 0);
      }
      setTempDefenseDices(parseDefenseDices(initialValue, 0));
    } else if (!combat || combat.status === 'completed' || combat.status === 'cancelled') {
      setTempDefenseDices(null);
      setTempWeapon(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat?.id, combat?.status, currentPlayer?.id, currentPlayerData]);

  const getCurrentDefenseDices = useCallback(() => {
    if (tempDefenseDices !== null) return parseDefenseDices(tempDefenseDices, 0);

    const isAttacker = combat?.attacker_id === currentPlayer?.id;
    const isDefender = combat?.defender_id === currentPlayer?.id;

    if (combat && combat.status === 'in_progress') {
      if (isAttacker && combat.attacker_defense_dices != null) {
        return parseDefenseDices(combat.attacker_defense_dices, 0);
      }
      if (isDefender && combat.defender_defense_dices != null) {
        return parseDefenseDices(combat.defender_defense_dices, 0);
      }
    }

    const actor = currentPlayerData?.character?.actor;
    if (actor?.modes && actor.modes[combatMode]?.NumberOfDefenseDices !== undefined) {
      return parseDefenseDices(actor.modes[combatMode].NumberOfDefenseDices, 0);
    }
    return parseDefenseDices(actor?.NumberOfDefenseDices, 0);
  }, [tempDefenseDices, combat, currentPlayer?.id, currentPlayerData, combatMode]);

  const handleDefenseDicesChange = useCallback(
    (newValue) => {
      const safeVal = Math.max(0, Math.min(8, parseDefenseDices(newValue, 0)));
      setTempDefenseDices(safeVal);

      if (defenseDiceDebounceRef.current) clearTimeout(defenseDiceDebounceRef.current);
      const targetCombatId = combat?.id;
      const isAttacker = combat?.attacker_id === currentPlayer?.id;
      const isDefender = combat?.defender_id === currentPlayer?.id;

      defenseDiceDebounceRef.current = setTimeout(async () => {
        if (!targetCombatId) return;
        const fields = {};
        if (isAttacker) fields.attacker_defense_dices = safeVal;
        else if (isDefender) fields.defender_defense_dices = safeVal;

        await CombatService.updateCombat(targetCombatId, fields);
        await loadCombat();
        broadcastCombatPing({ action: 'refresh' });
      }, 200);
    },
    [combat?.id, combat?.attacker_id, combat?.defender_id, currentPlayer?.id, loadCombat, broadcastCombatPing]
  );

  // ==================== AÇÕES DO COMBATE ====================

  const handleToggleDefender = useCallback((defenderId) => {
    setSelectedDefenders((prev) =>
      prev.includes(defenderId) ? prev.filter((x) => x !== defenderId) : [...prev, defenderId]
    );
  }, []);

  const handleStartCombat = useCallback(async () => {
    if (matchStatus !== 'in_progress' || !selectedAttack || selectedDefenders.length === 0 || !currentPlayer?.id) return;

    setLoading(true);
    try {
      const defIds = [...selectedDefenders];
      const res = await CombatService.startCombat({
        roomId,
        attackerId: currentPlayer.id,
        defenderIds: defIds,
        attackData: selectedAttack,
        allowCounterAttack,
        allowOpportunityAttacks
      });

      if (!res.success) {
        const toastType = res.error.toLowerCase().includes('já existe') ? 'warning' : 'error';
        showToast(res.error, toastType);
      } else {
        setSelectedAttack(null);
        setSelectedDefenders([]);
        await loadCombat();
        broadcastCombatPing({ action: 'started', defenderIds: defIds });
      }
    } finally {
      setLoading(false);
    }
  }, [
    matchStatus,
    selectedAttack,
    selectedDefenders,
    currentPlayer?.id,
    roomId,
    allowCounterAttack,
    allowOpportunityAttacks,
    showToast,
    loadCombat,
    broadcastCombatPing
  ]);

  const handleAutoStartSingleAttack = useCallback(async () => {
    if (!combat?.id) return;
    await CombatService.updateCombat(combat.id, {
      defender_weapon: null,
      total_rounds: 1,
      current_round: 1,
      combat_phase: 'rolling',
      round_data: [
        {
          round: 1,
          who_acts: 'attacker',
          action_type: 'attack',
          attacker: { rolled: false, roll: [], total: 0 },
          defender: { rolled: false, roll: [], total: 0 },
          completed: false
        }
      ],
      status: 'in_progress'
    });
    await loadCombat();
    broadcastCombatPing({ action: 'refresh' });
  }, [combat?.id, loadCombat, broadcastCombatPing]);

  const handleConfirmDefenseWeapon = useCallback(
    async (skipRetaliation = false) => {
      if (!combat) return;
      let totalRounds;
      let rounds;

      if (skipRetaliation) {
        totalRounds = 2;
        rounds = [
          { round: 1, who_acts: 'attacker', action_type: 'attack' },
          { round: 2, who_acts: 'attacker', action_type: 'attack' }
        ];
      } else {
        if (!selectedWeapon) return;
        const result = calculateCombatRounds(combat.attack_data?.LoadTime, selectedWeapon.LoadTime);
        totalRounds = result.totalRounds;
        rounds = result.rounds;
      }

      const roundData = rounds.map((r) => ({
        ...r,
        attacker: { rolled: false, roll: [], total: 0 },
        defender: { rolled: false, roll: [], total: 0 },
        completed: false
      }));

      if (combat.attacker_shared_roll?.rolled && roundData.length > 0 && roundData[0].action_type === 'attack') {
        roundData[0].attacker = { ...combat.attacker_shared_roll };
      }

      await CombatService.updateCombat(combat.id, {
        defender_weapon: skipRetaliation ? null : selectedWeapon,
        total_rounds: totalRounds,
        current_round: 1,
        combat_phase: 'rolling',
        round_data: roundData,
        status: 'in_progress'
      });

      setSelectedWeapon(null);
      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, selectedWeapon, loadCombat, broadcastCombatPing]
  );

  const handleRollDice = useCallback(
    async (targetCombat = null) => {
      const activeCombat = targetCombat && targetCombat.id ? targetCombat : combat;
      if (!activeCombat || rolling) return;

      const isAttacker = currentPlayer.id === activeCombat.attacker_id;
      const roundIndex = activeCombat.current_round - 1;
      const roundInfo = activeCombat.round_data?.[roundIndex];
      if (!roundInfo) return;

      const isOpportunityRound = roundInfo.action_type === 'opportunity';
      let diceCount = 0;
      let isAttackerSide = isAttacker;

      if (isOpportunityRound) {
        const isOppAttacker = currentPlayer.id === roundInfo.opportunity_attacker_id;
        isAttackerSide = isOppAttacker;
        diceCount = isOppAttacker
          ? parseAttackDices(roundInfo.opportunity_weapon?.Dices, 0)
          : getCurrentDefenseDices();
      } else if (roundInfo.action_type === 'attack') {
        diceCount = isAttacker
          ? parseAttackDices(activeCombat.attack_data?.Dices, 0)
          : getCurrentDefenseDices();
      } else {
        diceCount = !isAttacker
          ? parseAttackDices(activeCombat.defender_weapon?.Dices, 0)
          : getCurrentDefenseDices();
      }

      let finalDice = [0];
      let total = 0;

      if (diceCount > 0) {
        setRolling(true);
        for (let frame = 0; frame < 6; frame++) {
          setDiceAnimation(rollSixSidedDice(diceCount));
          await new Promise((r) => setTimeout(r, 60));
        }
        finalDice = rollSixSidedDice(diceCount);
        setDiceAnimation(finalDice);
        total = finalDice.reduce((sum, val) => sum + val, 0);
        setRolling(false);
      }

      if (
        activeCombat.combat_group_id &&
        isAttacker &&
        !isOpportunityRound &&
        roundInfo.action_type === 'attack' &&
        activeCombat.current_round === 1
      ) {
        const sharedRoll = { rolled: true, roll: finalDice, total };
        await CombatService.updateCombatGroup(activeCombat.combat_group_id, {
          attacker_shared_roll: sharedRoll
        });

        await Promise.all(
          combatGroup
            .filter(
              (gc) =>
                gc.combat_phase === 'rolling' &&
                gc.round_data?.length > 0 &&
                gc.round_data[0].action_type === 'attack'
            )
            .map((gc) => {
              const gRounds = gc.round_data.map((r) => ({
                ...r,
                attacker: { ...r.attacker },
                defender: { ...r.defender }
              }));
              gRounds[0].attacker = sharedRoll;
              if (gRounds[0].defender.rolled) gRounds[0].completed = true;
              return CombatService.updateCombat(gc.id, { round_data: gRounds });
            })
        );
      } else {
        const rollRes = await CombatService.updateCombatRoll({
          combatId: activeCombat.id,
          roundIndex,
          isAttacker: isAttackerSide,
          roll: finalDice,
          total
        });

        if (!rollRes.success) {
          showToast(rollRes.error, 'error');
          return;
        }
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, rolling, currentPlayer?.id, combatGroup, getCurrentDefenseDices, showToast, loadCombat, broadcastCombatPing]
  );

  const handleAdjustDiceResult = useCallback(
    async (newDiceArray, isAttackerAdjusting, targetCombat = null) => {
      const activeCombat = targetCombat && targetCombat.id ? targetCombat : combat;
      if (!activeCombat || !newDiceArray) return;

      const roundData = (activeCombat.round_data || []).map((r) => ({
        ...r,
        attacker: { ...r.attacker, roll: [...(r.attacker?.roll || [])] },
        defender: { ...r.defender, roll: [...(r.defender?.roll || [])] }
      }));
      const roundIndex = activeCombat.current_round - 1;
      const roundInfo = roundData[roundIndex];
      if (!roundInfo) return;

      const newTotal = newDiceArray.reduce((sum, val) => sum + val, 0);
      if (isAttackerAdjusting) {
        roundInfo.attacker.roll = newDiceArray;
        roundInfo.attacker.total = newTotal;
      } else {
        roundInfo.defender.roll = newDiceArray;
        roundInfo.defender.total = newTotal;
      }

      const isSharedAttackRound =
        activeCombat.combat_group_id &&
        isAttackerAdjusting &&
        activeCombat.current_round === 1 &&
        roundInfo.action_type === 'attack';

      if (isSharedAttackRound) {
        const updatedSharedRoll = { rolled: true, roll: newDiceArray, total: newTotal };
        await CombatService.updateCombatGroup(activeCombat.combat_group_id, {
          attacker_shared_roll: updatedSharedRoll
        });

        await Promise.all(
          combatGroup
            .filter((gc) => gc.round_data?.length > 0 && gc.round_data[0].action_type === 'attack')
            .map((gc) => {
              const gRounds = gc.round_data.map((r) => ({
                ...r,
                attacker: { ...r.attacker },
                defender: { ...r.defender }
              }));
              gRounds[0].attacker = updatedSharedRoll;
              return CombatService.updateCombat(gc.id, { round_data: gRounds });
            })
        );
      } else {
        const res = await CombatService.updateCombat(activeCombat.id, { round_data: roundData });
        if (!res.success) {
          showToast('Não foi possível salvar o ajuste do dado.', 'error');
          return;
        }
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, combatGroup, showToast, loadCombat, broadcastCombatPing]
  );

  const handleAdvanceRound = useCallback(async () => {
    if (!combat) return;
    const fields =
      combat.current_round >= combat.total_rounds
        ? { combat_phase: 'results' }
        : { current_round: combat.current_round + 1 };

    await CombatService.updateCombat(combat.id, fields);
    await loadCombat();
    broadcastCombatPing({ action: 'refresh' });
  }, [combat, loadCombat, broadcastCombatPing]);

  const handleAdvanceGroupCombat = useCallback(
    async (groupCombat) => {
      if (!groupCombat) return;
      const isFinishing = groupCombat.current_round >= groupCombat.total_rounds;
      const fields = isFinishing
        ? { combat_phase: 'results' }
        : { current_round: groupCombat.current_round + 1 };

      await CombatService.updateCombat(groupCombat.id, fields);

      if (isFinishing) {
        const nextRemaining = combatGroup.find(
          (gc) => gc.id !== groupCombat.id && gc.status !== 'cancelled' && gc.combat_phase === 'rolling'
        );
        const nextId = nextRemaining ? nextRemaining.id : groupCombat.id;
        activeCombatIdRef.current = nextId;
        setActiveCombatId(nextId);
      } else {
        activeCombatIdRef.current = groupCombat.id;
        setActiveCombatId(groupCombat.id);
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combatGroup, loadCombat, broadcastCombatPing]
  );

  const handleAddRound = useCallback(
    async (whoAttacks) => {
      if (!combat) return;
      const roundData = [...(combat.round_data || [])];
      roundData.push({
        round: roundData.length + 1,
        who_acts: whoAttacks,
        action_type: whoAttacks === 'attacker' ? 'attack' : 'counter',
        attacker: { rolled: false, roll: [], total: 0 },
        defender: { rolled: false, roll: [], total: 0 },
        completed: false
      });

      await CombatService.updateCombat(combat.id, {
        total_rounds: roundData.length,
        round_data: roundData
      });
      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, loadCombat, broadcastCombatPing]
  );

  const handleRemoveRound = useCallback(async () => {
    if (!combat || combat.round_data.length <= 1) return;
    if (combat.current_round >= combat.round_data.length) {
      showToast(localization?.['UI.Combat.CannotRemoveRound'] || 'Não é possível remover a rodada atual.', 'warning');
      return;
    }
    const roundData = combat.round_data.slice(0, -1);
    await CombatService.updateCombat(combat.id, {
      total_rounds: roundData.length,
      round_data: roundData
    });
    await loadCombat();
    broadcastCombatPing({ action: 'refresh' });
  }, [combat, localization, showToast, loadCombat, broadcastCombatPing]);

  const handleMoveRound = useCallback(
    async (fromIdx, toIdx) => {
      if (!combat) return;
      const roundData = (combat.round_data || []).map((r) => ({ ...r }));
      if (toIdx < 0 || toIdx >= roundData.length) return;
      const temp = roundData[fromIdx];
      roundData[fromIdx] = roundData[toIdx];
      roundData[toIdx] = temp;
      roundData.forEach((r, idx) => {
        r.round = idx + 1;
      });

      await CombatService.updateCombat(combat.id, { round_data: roundData });
      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, loadCombat, broadcastCombatPing]
  );

  const handleSwapDefender = useCallback(
    async (newDefenderId) => {
      if (!combat) return;
      const newDefender = players.find((p) => p.id === newDefenderId);
      if (!newDefender) return;

      await CombatService.updateCombat(combat.id, {
        defender_id: newDefenderId,
        defender_name: newDefender.name,
        defender_weapon: null,
        defender_defense_dices: null,
        combat_phase: 'weapon_selection',
        current_round: 0,
        total_rounds: 0,
        round_data: [],
        status: 'pending'
      });
      await loadCombat();
      broadcastCombatPing({ action: 'started', defenderIds: [newDefenderId] });
    },
    [combat, players, loadCombat, broadcastCombatPing]
  );

  const handleConfirmWeaponChange = useCallback(
    async (weapon) => {
      setTempWeapon(weapon);
      if (!combat?.id) return;

      const roundIndex = combat.current_round - 1;
      const roundInfo = combat.round_data?.[roundIndex];
      const isOppAttacker =
        roundInfo?.action_type === 'opportunity' &&
        roundInfo?.opportunity_attacker_id === currentPlayer?.id;

      if (isOppAttacker) {
        const updatedRounds = (combat.round_data || []).map((r, idx) =>
          idx === roundIndex ? { ...r, opportunity_weapon: weapon } : r
        );
        await CombatService.updateCombat(combat.id, { round_data: updatedRounds });
      } else {
        const isAttacker = combat.attacker_id === currentPlayer?.id;
        await CombatService.updateCombat(
          combat.id,
          isAttacker ? { attack_data: weapon } : { defender_weapon: weapon }
        );
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, currentPlayer?.id, loadCombat, broadcastCombatPing]
  );

  // Grava os novos status da arma no banco quando o jogador alterna Modo 1 / Modo 2
  const handleSyncCombatMode = useCallback(
    async (newMode) => {
      if (!combat?.id || !currentPlayer?.id) return;

      const roundIndex = combat.current_round - 1;
      const roundInfo = combat.round_data?.[roundIndex];
      const isOppAttacker =
        roundInfo?.action_type === 'opportunity' &&
        roundInfo?.opportunity_attacker_id === currentPlayer.id;

      if (isOppAttacker && roundInfo?.opportunity_weapon?.modes?.[newMode]) {
        const updatedWeapon = applyModeToWeapon(roundInfo.opportunity_weapon, newMode);
        const updatedRounds = (combat.round_data || []).map((r, idx) =>
          idx === roundIndex ? { ...r, opportunity_weapon: updatedWeapon } : r
        );
        await CombatService.updateCombat(combat.id, { round_data: updatedRounds });
      } else if (combat.attacker_id === currentPlayer.id && combat.attack_data?.modes?.[newMode]) {
        const updatedAttack = applyModeToWeapon(combat.attack_data, newMode);
        if (combat.combat_group_id) {
          await CombatService.updateCombatGroup(combat.combat_group_id, { attack_data: updatedAttack });
        } else {
          await CombatService.updateCombat(combat.id, { attack_data: updatedAttack });
        }
      } else if (combat.defender_id === currentPlayer.id && combat.defender_weapon?.modes?.[newMode]) {
        const updatedDefenseWeapon = applyModeToWeapon(combat.defender_weapon, newMode);
        await CombatService.updateCombat(combat.id, { defender_weapon: updatedDefenseWeapon });
      } else {
        return;
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
    },
    [combat, currentPlayer?.id, loadCombat, broadcastCombatPing]
  );

  const handleConfirmOpportunityAttack = useCallback(
    async (opportunityWeapon, opportunityTarget) => {
      if (!combat || !opportunityWeapon || !opportunityTarget) return false;
      const res = await CombatService.addOpportunityAttack({
        combatId: combat.id,
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        weapon: opportunityWeapon,
        target: opportunityTarget
      });

      if (!res.success) {
        showToast(res.error, 'error');
        return false;
      }

      await loadCombat();
      broadcastCombatPing({ action: 'refresh' });
      return true;
    },
    [combat, currentPlayer?.id, currentPlayer?.name, showToast, loadCombat, broadcastCombatPing]
  );

  const handleEndCombat = useCallback(async () => {
    if (!combat) return;
    const targetGroupId = combat.combat_group_id;
    const targetCombatId = combat.id;

    combatLoadSeqRef.current++;
    lastCombatHashRef.current = '[]';
    setCombat(null);
    setCombatGroup([]);
    setActiveCombatId(null);
    broadcastCombatPing({ action: 'ended' });

    await CombatService.cancelCombat({
      combatId: targetCombatId,
      combatGroupId: targetGroupId
    });
  }, [combat, broadcastCombatPing]);

  const handleSelectGroupCombat = useCallback((gc) => {
    activeCombatIdRef.current = gc.id;
    setActiveCombatId(gc.id);
    setCombat(gc);
  }, []);

  return {
    combat,
    combatGroup,
    activeCombatId,
    availableAttacks,
    availableTargets,
    swapTargets,
    selectedAttack,
    setSelectedAttack,
    selectedDefenders,
    handleToggleDefender,
    allowCounterAttack,
    setAllowCounterAttack,
    allowOpportunityAttacks,
    setAllowOpportunityAttacks,
    loading,
    customAttack,
    setCustomAttack,
    rolling,
    diceAnimation,
    selectedWeapon,
    setSelectedWeapon,
    tempWeapon,
    setTempWeapon,
    currentDefenseDices: getCurrentDefenseDices(),
    handleDefenseDicesChange,
    handleStartCombat,
    handleAutoStartSingleAttack,
    handleConfirmDefenseWeapon,
    handleRollDice,
    handleAdjustDiceResult,
    handleAdvanceRound,
    handleAdvanceGroupCombat,
    handleAddRound,
    handleRemoveRound,
    handleMoveRound,
    handleSwapDefender,
    handleConfirmWeaponChange,
    handleSyncCombatMode,
    handleConfirmOpportunityAttack,
    handleEndCombat,
    handleSelectGroupCombat
  };
};