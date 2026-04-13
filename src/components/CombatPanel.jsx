import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import DiceResultAdjuster from './DiceResultAdjuster';
import './CombatNotifications.css';

/**
 * PAINEL LATERAL DE COMBATE COMPLETO
 * 
 * Sidebar recolhível que:
 * 1. Permite iniciar combates
 * 2. Exibe combate ativo (weapon_selection, rolling, results)
 * 3. Não bloqueia a tela - jogador pode usar ficha normalmente
 */

const CombatPanel = ({ 
  currentPlayer,
  currentPlayerData,
  players = [],
  roomId,
  gameData,
  localization = {},
  isOpen: isOpenProp,
  onToggle,
  matchStatus
}) => {
  // Usar estado local apenas se não for controlado externamente
  const [isOpenLocal, setIsOpenLocal] = useState(false);
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenLocal;
  
  const toggleSidebar = () => {
    if (onToggle) {
      onToggle();
    } else {
      setIsOpenLocal(!isOpenLocal);
    }
  };
  
  const [selectedAttack, setSelectedAttack] = useState(null);
  const [selectedDefenders, setSelectedDefenders] = useState([]);
  const [allowCounterAttack, setAllowCounterAttack] = useState(true);
  const [allowOpportunityAttacks, setAllowOpportunityAttacks] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Estados para ataque customizado
  const [customAttack, setCustomAttack] = useState({
    Name: localization?.['UI.Combat.CustomAttack'] || 'Ataque Personalizado',
    Dices: '1',
    LoadTime: '3',
    Damage: '0',
    Effects: '',
    category: localization?.['UI.Combat.CustomCategory'] || 'Customizado'
  });

  // ===== ESTADOS DO COMBATE ATIVO =====
  const [combat, setCombat] = useState(null);
  const [combatGroup, setCombatGroup] = useState([]); // Array de todos os combates de um grupo multi-defensor
  const [activeCombatId, setActiveCombatId] = useState(null); // ID do combate individual selecionado (para contra-ataque)
  const [rolling, setRolling] = useState(false);
  const [diceAnimation, setDiceAnimation] = useState([]);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  
  // Estados para alterações temporárias durante o combate
  const [showWeaponChange, setShowWeaponChange] = useState(false);
  const [showDefenderSwap, setShowDefenderSwap] = useState(false);
  const [tempDefenseDices, setTempDefenseDices] = useState(null);
  const [tempWeapon, setTempWeapon] = useState(null);
  const [combatMode, setCombatMode] = useState('mode1'); // Modo atual do personagem no combate
  
  // Estados para ataque de oportunidade (espectadores)
  const [showOpportunityAttack, setShowOpportunityAttack] = useState(false);
  const [opportunityWeapon, setOpportunityWeapon] = useState(null);
  const [opportunityTarget, setOpportunityTarget] = useState(null); // 'attacker' ou 'defender'

  // Refs para evitar stale closure na subscription
  const currentPlayerRef = useRef(currentPlayer);
  currentPlayerRef.current = currentPlayer;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  // Timestamp do último update via Realtime (para saber se polling é necessário)
  const lastRealtimeRef = useRef(0);

  // Buscar ataques/armas disponíveis do jogador atual (memoizado)
  const getAvailableAttacks = useMemo(() => {
    const attacks = [];
    const selections = currentPlayerData?.character?.selections;
    const actor = currentPlayerData?.character?.actor;
    const hasModes = actor?.mode1 && actor?.mode2;

    if (!selections) return attacks;

    // Função auxiliar para processar ataque/arma com modos
    const processItem = (item, category, type) => {
      if (!item || (!item.Name && !item.ID)) return null;

      // Preservar objeto modes original
      const originalModes = item.modes;
      
      // Se item tem requisito de modo e não estamos nesse modo, ignorar
      if (item.requiredMode && item.requiredMode !== combatMode) {
        return null;
      }

      // Determinar dados efetivos baseado no modo
      let effectiveData = item;
      if (hasModes && originalModes) {
        const modeData = originalModes[combatMode];
        if (!modeData) return null; // Item não disponível neste modo
        
        // Combinar dados base com dados do modo (modo sobrescreve base)
        effectiveData = { ...item, ...modeData };
      }

      const itemId = effectiveData.ID || effectiveData.Name;
      const itemName = effectiveData.Name || localization?.[itemId] || itemId || (type === 'attack' ? (localization?.['UI.Combat.AttackFallback'] || 'Ataque') : (localization?.['UI.Combat.WeaponFallback'] || 'Arma'));
      
      // Normalizar dados para garantir que são strings/números
      const normalized = {
        ID: String(effectiveData.ID || effectiveData.Name || ''),
        Name: String(itemName),
        Description: typeof effectiveData.Description === 'object' ? JSON.stringify(effectiveData.Description) : String(effectiveData.Description || ''),
        Dices: typeof effectiveData.Dices === 'object' ? JSON.stringify(effectiveData.Dices) : String(effectiveData.Dices || '?'),
        LoadTime: typeof effectiveData.LoadTime === 'object' ? '0' : String(effectiveData.LoadTime || '0'),
        Damage: typeof effectiveData.Damage === 'object' ? '0' : String(effectiveData.Damage || '0'),
        Effects: typeof effectiveData.Effects === 'object' ? JSON.stringify(effectiveData.Effects) : String(effectiveData.Effects || ''),
        type: type,
        category: category,
        modes: originalModes // Preservar modos originais para uso posterior
      };
      
      // Copiar outros campos primitivos do effectiveData
      Object.keys(effectiveData).forEach(key => {
        if (key !== 'modes' && (typeof effectiveData[key] !== 'object' || effectiveData[key] === null)) {
          normalized[key] = effectiveData[key];
        }
      });
      
      return normalized;
    };

    // Buscar em attacks
    if (selections.attacks && Array.isArray(selections.attacks)) {
      selections.attacks.forEach(attack => {
        const processed = processItem(attack, localization?.['UI.Combat.AttackCategory'] || 'Ataques', 'attack');
        if (processed) attacks.push(processed);
      });
    }

    // Buscar em weapons
    if (selections.weapons && Array.isArray(selections.weapons)) {
      selections.weapons.forEach(weapon => {
        const processed = processItem(weapon, localization?.['UI.Combat.WeaponCategory'] || 'Armas', 'weapon');
        if (processed) attacks.push(processed);
      });
    }

    // Buscar em copycatAssignments (Copiador) - itens copiados de outros jogadores
    const copycatData = selections.copycatAssignments || currentPlayerData?.selections?.copycatAssignments;
    if (copycatData) {
      // Processar ataques copiados
      if (copycatData.attacks) {
        Object.values(copycatData.attacks).forEach(item => {
          if (item) {
            const processed = processItem(item, localization?.['UI.Combat.CopiedAttacks'] || 'Copiado - Ataques', 'attack');
            if (processed) attacks.push(processed);
          }
        });
      }
      // Processar armas copiadas
      if (copycatData.weapons) {
        Object.values(copycatData.weapons).forEach(item => {
          if (item) {
            const processed = processItem(item, localization?.['UI.Combat.CopiedWeapons'] || 'Copiado - Armas', 'weapon');
            if (processed) attacks.push(processed);
          }
        });
      }
    }

    return attacks;
  }, [currentPlayerData, combatMode, localization]);
  // ========== CARREGAR COMBATE ATIVO ==========
  const loadCombat = useCallback(async () => {
    if (!currentPlayer?.id || !roomId) return;

    try {
      // Buscar qualquer combate ativo na sala (participante ou espectador)
      const { data, error } = await supabase
        .from('combat_notifications')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erro ao carregar combate:', error);
        return;
      }

      if (data && data.length > 0) {
        // Verificar se há um grupo multi-defensor
        const firstCombat = data[0];
        const groupId = firstCombat.combat_group_id;

        if (groupId) {
          // Multi-defensor: carregar todos do grupo
          const groupCombats = data.filter(c => c.combat_group_id === groupId);
          setCombatGroup(groupCombats);

          // Se atacante: combat = primeiro do grupo (para compatibilidade)
          // Se defensor: combat = registro onde sou defensor
          const myDefenderCombat = groupCombats.find(c => c.defender_id === currentPlayer.id);
          const myAttackerCombat = groupCombats.find(c => c.attacker_id === currentPlayer.id);
          setCombat(myDefenderCombat || myAttackerCombat || groupCombats[0]);
        } else {
          // Combate 1v1 normal
          setCombatGroup([firstCombat]);
          setCombat(firstCombat);
        }
      } else {
        setCombat(null);
        setCombatGroup([]);
      }
    } catch (err) {
      console.error('Erro ao buscar combate:', err);
    }
  }, [currentPlayer?.id, roomId]);

  // ========== SUBSCRIPTION REALTIME ==========
  useEffect(() => {
    if (!roomId || !currentPlayer?.id) return;
    
    console.log('🔔 Iniciando subscription de combate para sala:', roomId);
    
    let subscriptionHealthy = false;
    
    // Carregar combate existente primeiro
    loadCombat();

    // Subscrever para atualizações em tempo real com configuração melhorada
    const channel = supabase
      .channel(`combat_room_${roomId}_${Date.now()}`, {
        config: {
          broadcast: { self: true },
          presence: { key: currentPlayer.id }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'combat_notifications',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('🔔 Atualização de combate recebida:', payload.eventType);
          lastRealtimeRef.current = Date.now();
          
          const combatData = payload.new || payload.old;
          const playerId = currentPlayerRef.current?.id;
          
          if (combatData) {
            const isParticipant = combatData.attacker_id === playerId || 
                                  combatData.defender_id === playerId;
            
            if (isParticipant) {
              // Se é um novo combate e este jogador é o defensor, abrir sidebar
              if (
                payload.eventType === 'INSERT' &&
                combatData.defender_id === playerId &&
                combatData.status === 'pending'
              ) {
                try {
                  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuFzvLZiToIFl631+mhTxENUKfk77RgGgU7k9n0yHorBSh+zPLaizsIGGS57OihUBELTKXh8bllHAU2jdTx0H0vBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+');
                  audio.volume = 0.5;
                  audio.play().catch(e => console.log('Não foi possível tocar som:', e));
                } catch (e) {
                  console.log('Áudio não disponível');
                }
                
                if (!isOpenRef.current && onToggleRef.current) {
                  onToggleRef.current();
                } else if (!isOpenRef.current) {
                  setIsOpenLocal(true);
                }
              }
            }
            
            if (payload.eventType === 'DELETE' || combatData.status === 'cancelled' || combatData.status === 'completed') {
              // Se faz parte de um grupo, recarregar o grupo inteiro
              if (combatData.combat_group_id) {
                loadCombat();
              } else {
                setCombat(null);
                setCombatGroup([]);
              }
            } else {
              // Atualizar estado: se faz parte de um grupo, atualizar o grupo
              if (combatData.combat_group_id) {
                setCombatGroup(prev => {
                  const idx = prev.findIndex(c => c.id === combatData.id);
                  if (idx >= 0) {
                    const updated = [...prev];
                    // MERGE: preservar dados existentes, sobrescrever apenas campos recebidos
                    updated[idx] = { ...prev[idx], ...combatData };
                    return updated;
                  } else if (payload.eventType === 'INSERT') {
                    return [...prev, combatData];
                  }
                  return prev;
                });
                // Atualizar combat se este registro é o ativo
                setCombat(prev => {
                  if (!prev || prev.id === combatData.id) return { ...(prev || {}), ...combatData };
                  // Se sou defensor deste registro, trocar para ele
                  if (combatData.defender_id === playerId) return { ...(prev || {}), ...combatData };
                  return prev;
                });
              } else {
                setCombat(prev => prev ? { ...prev, ...combatData } : combatData);
                setCombatGroup(prev => {
                  if (prev.length > 0 && prev[0].id === combatData.id) {
                    return [{ ...prev[0], ...combatData }];
                  }
                  return [combatData];
                });
              }
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Status da subscription de combate:', status, err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscription de combate ativa para sala:', roomId);
          subscriptionHealthy = true;
          // Recarregar ao reconectar para recuperar updates perdidos
          loadCombat();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          subscriptionHealthy = false;
          console.error('❌ Erro na subscription de combate:', status);
          // Tentar recarregar combate manualmente
          setTimeout(loadCombat, 1000);
        }
      });

    // Polling inteligente: só roda quando subscription está com problema
    // ou não recebemos update via Realtime há mais de 15 segundos
    const pollInterval = setInterval(() => {
      const timeSinceLastRealtime = Date.now() - lastRealtimeRef.current;
      if (!subscriptionHealthy || timeSinceLastRealtime > 15000) {
        loadCombat();
      }
    }, 5000);

    return () => {
      console.log('🔕 Removendo subscription de combate');
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentPlayer?.id, loadCombat]);

  // ========== INICIALIZAR VALORES TEMPORÁRIOS QUANDO COMBATE INICIAR ==========
  useEffect(() => {
    // Apenas inicializar quando combate muda de status para in_progress
    // e tempDefenseDices ainda é null
    if (combat && combat.status === 'in_progress' && tempDefenseDices === null) {
      // Usar valor do banco se disponível, senão usar valor do personagem
      const isAttacker = combat.attacker_id === currentPlayer?.id;
      const isDefender = combat.defender_id === currentPlayer?.id;
      
      let initialValue = null;
      if (isAttacker && combat.attacker_defense_dices !== null && combat.attacker_defense_dices !== undefined) {
        initialValue = combat.attacker_defense_dices;
      } else if (isDefender && combat.defender_defense_dices !== null && combat.defender_defense_dices !== undefined) {
        initialValue = combat.defender_defense_dices;
      }
      
      if (initialValue === null) {
        initialValue = currentPlayerData?.character?.actor?.NumberOfDefenseDices || 0;
      }
      
      setTempDefenseDices(initialValue);
    } else if (!combat || combat.status === 'completed' || combat.status === 'cancelled') {
      // Reset quando não há combate ativo ou combate terminou
      setTempDefenseDices(null);
      setTempWeapon(null);
    }
    // NÃO incluir tempDefenseDices nas dependências para evitar loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat?.id, combat?.status, currentPlayer?.id, currentPlayerData]);

  // ========== ATUALIZAR QUANDO MODO MUDAR ==========
  useEffect(() => {
    // Se o modo mudar e há uma arma temporária selecionada, verificar se ainda é válida
    if (tempWeapon && tempWeapon.modes && !tempWeapon.modes[combatMode]) {
      setTempWeapon(null); // Arma não disponível no novo modo
    }
    
    // Atualizar dados de defesa se o modo tiver valores específicos
    const actor = currentPlayerData?.character?.actor;
    if (actor?.modes && actor.modes[combatMode]?.NumberOfDefenseDices !== undefined) {
      setTempDefenseDices(actor.modes[combatMode].NumberOfDefenseDices);
    }
  }, [combatMode, currentPlayerData, tempWeapon]);

  // ========== BUSCAR ARMAS DO JOGADOR PARA DEFESA ==========
  const getPlayerWeapons = useCallback(() => {
    const weapons = [];
    const selections = currentPlayerData?.character?.selections;

    if (!selections) return weapons;

    // Buscar em attacks
    if (selections.attacks && Array.isArray(selections.attacks)) {
      selections.attacks.forEach(attack => {
        if (attack && (attack.Name || attack.ID)) {
          const attackId = attack.ID || attack.Name;
          const attackName = attack.Name || localization?.[attackId] || attackId || (localization?.['UI.Combat.AttackFallback'] || 'Ataque');
          
          const normalizedAttack = {
            ID: String(attack.ID || attack.Name || ''),
            Name: String(attackName),
            Dices: typeof attack.Dices === 'object' ? JSON.stringify(attack.Dices) : String(attack.Dices || '?'),
            LoadTime: typeof attack.LoadTime === 'object' ? '0' : String(attack.LoadTime || '0'),
            Damage: typeof attack.Damage === 'object' ? '0' : String(attack.Damage || '0'),
            Effects: typeof attack.Effects === 'object' ? JSON.stringify(attack.Effects) : String(attack.Effects || ''),
            type: 'attack'
          };
          
          // Copiar apenas campos primitivos
          Object.keys(attack).forEach(key => {
            if (typeof attack[key] !== 'object' || attack[key] === null) {
              normalizedAttack[key] = attack[key];
            }
          });
          
          weapons.push(normalizedAttack);
        }
      });
    }

    // Buscar em weapons
    if (selections.weapons && Array.isArray(selections.weapons)) {
      selections.weapons.forEach(weapon => {
        if (weapon && (weapon.Name || weapon.ID)) {
          const weaponId = weapon.ID || weapon.Name;
          const weaponName = weapon.Name || localization?.[weaponId] || weaponId || (localization?.['UI.Combat.WeaponFallback'] || 'Arma');
          
          const normalizedWeapon = {
            ID: String(weapon.ID || weapon.Name || ''),
            Name: String(weaponName),
            Dices: typeof weapon.Dices === 'object' ? JSON.stringify(weapon.Dices) : String(weapon.Dices || '?'),
            LoadTime: typeof weapon.LoadTime === 'object' ? '0' : String(weapon.LoadTime || '0'),
            Damage: typeof weapon.Damage === 'object' ? '0' : String(weapon.Damage || '0'),
            Effects: typeof weapon.Effects === 'object' ? JSON.stringify(weapon.Effects) : String(weapon.Effects || ''),
            type: 'weapon'
          };
          
          // Copiar apenas campos primitivos
          Object.keys(weapon).forEach(key => {
            if (typeof weapon[key] !== 'object' || weapon[key] === null) {
              normalizedWeapon[key] = weapon[key];
            }
          });
          
          weapons.push(normalizedWeapon);
        }
      });
    }

    // Buscar em copycatAssignments (Copiador) - itens copiados de outros jogadores
    const copycatData = selections.copycatAssignments || currentPlayerData?.selections?.copycatAssignments;
    if (copycatData) {
      const pushCopycatItems = (items, type) => {
        if (!items) return;
        Object.values(items).forEach(item => {
          if (item && (item.Name || item.ID)) {
            const itemId = item.ID || item.Name;
            const itemName = item.Name || localization?.[itemId] || itemId || type;
            const normalized = {
              ID: String(item.ID || item.Name || ''),
              Name: String(itemName),
              Dices: typeof item.Dices === 'object' ? JSON.stringify(item.Dices) : String(item.Dices || '?'),
              LoadTime: typeof item.LoadTime === 'object' ? '0' : String(item.LoadTime || '0'),
              Damage: typeof item.Damage === 'object' ? '0' : String(item.Damage || '0'),
              Effects: typeof item.Effects === 'object' ? JSON.stringify(item.Effects) : String(item.Effects || ''),
              type: type === (localization?.['UI.Combat.AttackFallback'] || 'Ataque') ? 'attack' : 'weapon'
            };
            Object.keys(item).forEach(key => {
              if (typeof item[key] !== 'object' || item[key] === null) {
                normalized[key] = item[key];
              }
            });
            weapons.push(normalized);
          }
        });
      };
      pushCopycatItems(copycatData.attacks, localization?.['UI.Combat.AttackFallback'] || 'Ataque');
      pushCopycatItems(copycatData.weapons, localization?.['UI.Combat.WeaponFallback'] || 'Arma');
    }

    return weapons;
  }, [currentPlayerData, localization]);

  // ========== CALCULAR RODADAS ==========
  const calculateRounds = (attackerLoadTime, defenderLoadTime) => {
    const timeDiff = attackerLoadTime - defenderLoadTime;
    
    const rounds = [];
    
    // LÓGICA BASEADA NA TABELA FORNECIDA:
    // Load 5 vs 5 (diff=0): [A, D, A] = 3 rodadas
    // Load 3 vs 5 (diff=-2): [A, A, A, D, A] = 5 rodadas
    // Load 5 vs 3 (diff=+2): [A, D, D, D, A] = 5 rodadas
    // Load 2 vs 6 (diff=-4): [A, A, A, A, A, D, A] = 7 rodadas
    
    // Padrão:
    // - Primeira rodada: SEMPRE atacante
    // - Rodadas extras baseadas em timeDiff
    // - Penúltima: SEMPRE defensor
    // - Última: SEMPRE atacante
    
    // Primeira rodada: Atacante
    rounds.push({
      round: 1,
      who_acts: 'attacker',
      action_type: 'attack'
    });
    
    if (timeDiff < 0) {
      // Atacante mais rápido: atacante ataca |timeDiff| vezes
      for (let i = 0; i < Math.abs(timeDiff); i++) {
        rounds.push({
          round: rounds.length + 1,
          who_acts: 'attacker',
          action_type: 'attack'
        });
      }
    } else if (timeDiff > 0) {
      // Defensor mais rápido: defensor ataca |timeDiff| vezes
      for (let i = 0; i < timeDiff; i++) {
        rounds.push({
          round: rounds.length + 1,
          who_acts: 'defender',
          action_type: 'counter'
        });
      }
    }
    
    // Penúltima rodada: Defensor ataca
    rounds.push({
      round: rounds.length + 1,
      who_acts: 'defender',
      action_type: 'counter'
    });
    
    // Última rodada: Atacante ataca
    rounds.push({
      round: rounds.length + 1,
      who_acts: 'attacker',
      action_type: 'attack'
    });

    return { totalRounds: rounds.length, rounds };
  };

  // ========== DEFENSOR ESCOLHE ARMA OU NÃO RETALIAR ==========
  const selectWeaponForDefense = async (skipRetaliation = false) => {
    console.log('selectWeaponForDefense called', { skipRetaliation, selectedWeapon, combat: combat?.id });
    
    if (!combat) {
      console.log('No combat found');
      return;
    }

    try {
      let totalRounds, rounds;
      
      if (skipRetaliation) {
        // Defensor escolheu NÃO retaliar - apenas primeira e última rodada (só defesa)
        totalRounds = 2;
        rounds = [
          {
            round: 1,
            who_acts: 'attacker',
            action_type: 'attack'
          },
          {
            round: 2,
            who_acts: 'attacker',
            action_type: 'attack'
          }
        ];
      } else {
        // Defensor escolheu uma arma
        if (!selectedWeapon) {
          console.log('No weapon selected');
          alert(localization?.['UI.Combat.SelectWeaponFirst'] || 'Selecione uma arma primeiro!');
          return;
        }
        
        console.log('Calculating rounds with:', {
          attackerLoadTime: combat.attack_data.LoadTime,
          defenderLoadTime: selectedWeapon.LoadTime
        });
        
        const attackerLoadTime = parseInt(combat.attack_data.LoadTime) || 0;
        const defenderLoadTime = parseInt(selectedWeapon.LoadTime) || 0;

        const result = calculateRounds(attackerLoadTime, defenderLoadTime);
        totalRounds = result.totalRounds;
        rounds = result.rounds;
        
        console.log('Rounds calculated:', { totalRounds, rounds });
      }

      // Preparar round_data inicial
      const roundData = rounds.map(r => ({
        ...r,
        attacker: { rolled: false, roll: [], total: 0 },
        defender: { rolled: false, roll: [], total: 0 },
        completed: false
      }));

      // Se o atacante já rolou (multi-defensor), pré-preencher round 1
      if (combat.attacker_shared_roll && combat.attacker_shared_roll.rolled && roundData.length > 0 && roundData[0].action_type === 'attack') {
        roundData[0].attacker = { ...combat.attacker_shared_roll };
      }

      const { error } = await supabase
        .from('combat_notifications')
        .update({
          defender_weapon: skipRetaliation ? null : selectedWeapon,
          total_rounds: totalRounds,
          current_round: 1,
          combat_phase: 'rolling',
          round_data: roundData,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', combat.id);

      if (error) {
        console.error('Erro ao selecionar arma:', error);
        alert(localization?.['UI.Combat.ConfirmError'] || 'Erro ao confirmar escolha. Tente novamente.');
      } else {
        console.log('Weapon selection successful!');
      }
    } catch (err) {
      console.error('Erro ao processar seleção:', err);
      alert((localization?.['UI.Combat.UnexpectedError'] || 'Erro inesperado: ') + err.message);
    }
  };

  // ========== ROLAR DADOS COM ANIMAÇÃO ==========
  const rollDice = async () => {
    if (!combat || rolling) return;

    const isAttacker = currentPlayer.id === combat.attacker_id;
    const currentRound = combat.current_round;
    const roundData = [...(combat.round_data || [])];
    
    if (currentRound < 1 || currentRound > roundData.length) {
      console.error('Rodada inválida');
      return;
    }

    const roundIndex = currentRound - 1;
    const roundInfo = roundData[roundIndex];
    const actionType = roundInfo.action_type;

    // Verificar se é rodada de oportunidade
    const isOpportunityRound = actionType === 'opportunity';
    
    if (isOpportunityRound) {
      // Lógica para rodada de oportunidade
      const isOpportunityAttacker = currentPlayer.id === roundInfo.opportunity_attacker_id;
      const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
      const isTargetPlayer = targetIsAttacker ? 
        (currentPlayer.id === combat.attacker_id) : 
        (currentPlayer.id === combat.defender_id);
      
      // Verificar se já rolou
      if (isOpportunityAttacker && roundInfo.attacker.rolled) return;
      if (isTargetPlayer && roundInfo.defender.rolled) return;
      
      // Determinar dados
      let diceCount = 0;
      if (isOpportunityAttacker) {
        // Atacante de oportunidade usa sua arma
        diceCount = parseInt(roundInfo.opportunity_weapon?.Dices) || 0;
      } else if (isTargetPlayer) {
        // Alvo usa dados de defesa
        diceCount = getCurrentDefenseDices();
      } else {
        // Espectador não pode rolar
        return;
      }
      
      if (diceCount === 0) {
        alert(localization?.['UI.Combat.InvalidDiceCount'] || 'Erro: número de dados inválido');
        return;
      }

      setRolling(true);

      // Animação de dados
      for (let frame = 0; frame < 6; frame++) {
        const tempDice = [];
        for (let i = 0; i < diceCount; i++) {
          tempDice.push(1 + Math.floor(Math.random() * 6));
        }
        setDiceAnimation(tempDice);
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      // Resultado final
      const finalDice = [];
      for (let i = 0; i < diceCount; i++) {
        finalDice.push(1 + Math.floor(Math.random() * 6));
      }
      setDiceAnimation(finalDice);

      const total = finalDice.reduce((sum, val) => sum + val, 0);

      setRolling(false);

      // Salvar via RPC atômico (evita race condition com ataques de oportunidade)
      const { data: rollResult, error } = await supabase.rpc('update_combat_roll', {
        p_combat_id: combat.id,
        p_round_index: roundIndex,
        p_is_attacker: isOpportunityAttacker,
        p_roll: finalDice,
        p_total: total
      });

      if (error) {
        console.error('Erro ao salvar dados:', error);
      } else if (rollResult && !rollResult.success) {
        console.error('Erro ao salvar dados:', rollResult.error);
      }
      
      return;
    }

    // Lógica normal (não é oportunidade)
    const isAttackerActing = actionType === 'attack';
    const isCurrentPlayerActing = isAttackerActing ? isAttacker : !isAttacker;

    // Verificar se já rolou (não permitir rolar duas vezes)
    if (isAttacker && roundInfo.attacker.rolled) {
      return; // Já rolou, botão estará desabilitado
    }
    if (!isAttacker && roundInfo.defender.rolled) {
      return; // Já rolou, botão estará desabilitado
    }

    // Verificar se pode rolar (ordem sequencial já validada no botão)
    if (!isCurrentPlayerActing) {
      // Se não é quem ataca, verificar se o atacante já rolou
      if (isAttackerActing && !roundInfo.attacker.rolled) {
        return; // Botão já estará desabilitado
      }
      if (!isAttackerActing && !roundInfo.defender.rolled) {
        return; // Botão já estará desabilitado
      }
    }

    // Determinar quantos dados rolar baseado no tipo de ação
    let diceCount = 0;
    
    if (actionType === 'attack') {
      // Atacante usa dados da arma, Defensor usa dados de defesa
      if (isAttacker) {
        // Usar arma do banco de dados (já atualizada quando trocada)
        diceCount = parseInt(combat.attack_data.Dices) || 0;
      } else {
        // Defensor usa dados de defesa (temporário ou original)
        diceCount = getCurrentDefenseDices();
      }
    } else if (actionType === 'counter') {
      // Defensor contra-ataca com arma, Atacante defende com dados de defesa
      if (!isAttacker) {
        // Usar arma do banco de dados (já atualizada quando trocada)
        diceCount = parseInt(combat.defender_weapon?.Dices) || 0;
      } else {
        // Atacante usa dados de defesa (temporário ou original)
        diceCount = getCurrentDefenseDices();
      }
    }

    if (diceCount === 0) {
      alert(localization?.['UI.Combat.InvalidDiceCount'] || 'Erro: número de dados inválido');
      return;
    }

    setRolling(true);

    // ========== ANIMAÇÃO: 6 frames de 60ms cada (mais rápido) ==========
    for (let frame = 0; frame < 6; frame++) {
      const tempDice = [];
      for (let i = 0; i < diceCount; i++) {
        tempDice.push(1 + Math.floor(Math.random() * 6));
      }
      setDiceAnimation(tempDice);
      await new Promise(resolve => setTimeout(resolve, 60));
    }

    // Resultado final
    const finalDice = [];
    for (let i = 0; i < diceCount; i++) {
      finalDice.push(1 + Math.floor(Math.random() * 6));
    }
    setDiceAnimation(finalDice);

    const total = finalDice.reduce((sum, val) => sum + val, 0);

    // Atualizar round_data
    if (isAttacker) {
      roundInfo.attacker = {
        rolled: true,
        roll: finalDice,
        total: total
      };
    } else {
      roundInfo.defender = {
        rolled: true,
        roll: finalDice,
        total: total
      };
    }

    // Verificar se rodada está completa
    if (roundInfo.attacker.rolled && roundInfo.defender.rolled) {
      roundInfo.completed = true;
    }

    setRolling(false);

    // Salvar o estado atual (não avança automaticamente)
    const isGroupedCombat = combat.combat_group_id != null;
    const isFirstAttackRound = isAttacker && roundInfo.action_type === 'attack' && currentRound === 1;

    if (isGroupedCombat && isFirstAttackRound) {
      // Multi-defensor: compartilhar rolagem do atacante com TODOS os registros do grupo
      const sharedRoll = { rolled: true, roll: finalDice, total: total };

      // Atualizar todos os registros do grupo com attacker_shared_roll
      const { error: groupError } = await supabase
        .from('combat_notifications')
        .update({
          attacker_shared_roll: sharedRoll,
          updated_at: new Date().toISOString()
        })
        .eq('combat_group_id', combat.combat_group_id);

      if (groupError) {
        console.error('Erro ao compartilhar rolagem do atacante:', groupError);
      }

      // Também atualizar round_data dos registros que já estão em fase rolling
      for (const groupCombat of combatGroup) {
        if (groupCombat.combat_phase === 'rolling' && groupCombat.round_data?.length > 0) {
          const gRoundData = groupCombat.round_data.map(r => ({ ...r, attacker: { ...r.attacker }, defender: { ...r.defender } }));
          if (gRoundData[0].action_type === 'attack') {
            gRoundData[0].attacker = sharedRoll;
            if (gRoundData[0].defender.rolled) {
              gRoundData[0].completed = true;
            }
            await supabase
              .from('combat_notifications')
              .update({ round_data: gRoundData, updated_at: new Date().toISOString() })
              .eq('id', groupCombat.id);
          }
        }
      }
    } else {
      // Combate normal 1v1 ou rodadas de contra-ataque: salvar via RPC atômico
      const { data: rollResult, error } = await supabase.rpc('update_combat_roll', {
        p_combat_id: combat.id,
        p_round_index: roundIndex,
        p_is_attacker: isAttacker,
        p_roll: finalDice,
        p_total: total
      });

      if (error) {
        console.error('Erro ao salvar dados:', error);
      } else if (rollResult && !rollResult.success) {
        console.error('Erro ao salvar dados:', rollResult.error);
      }
    }
  };

  // ========== AJUSTAR RESULTADO DOS DADOS ==========
  const adjustDiceResult = async (newDiceArray, isAttackerAdjusting) => {
    if (!combat || !newDiceArray) return;

    const currentRound = combat.current_round;
    const roundData = [...(combat.round_data || [])];
    const roundIndex = currentRound - 1;
    const roundInfo = roundData[roundIndex];

    if (!roundInfo) return;

    const newTotal = newDiceArray.reduce((sum, val) => sum + val, 0);

    // Atualizar o array de dados e o total
    if (isAttackerAdjusting) {
      roundInfo.attacker.roll = newDiceArray;
      roundInfo.attacker.total = newTotal;
    } else {
      roundInfo.defender.roll = newDiceArray;
      roundInfo.defender.total = newTotal;
    }

    // Salvar no Supabase
    const { error } = await supabase
      .from('combat_notifications')
      .update({
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);

    if (error) {
      console.error('Erro ao ajustar dados:', error);
    }
  };

  // ========== AVANÇAR RODADA MANUALMENTE ==========
  const advanceRound = async () => {
    if (!combat) return;

    const currentRound = combat.current_round;
    const roundData = combat.round_data || [];
    const roundInfo = roundData[currentRound - 1];

    // Verificar se ambos já rolaram
    if (!roundInfo || !roundInfo.completed) {
      alert(localization?.['UI.Combat.BothMustRoll'] || 'Ambos os jogadores devem rolar antes de avançar!');
      return;
    }

    try {
      // Verificar se é a última rodada
      if (currentRound >= combat.total_rounds) {
        // Ir para fase de resultados
        const { error } = await supabase
          .from('combat_notifications')
          .update({
            combat_phase: 'results',
            updated_at: new Date().toISOString()
          })
          .eq('id', combat.id);

        if (error) {
          console.error('Erro ao finalizar combate:', error);
        }
      } else {
        // Avançar para próxima rodada
        const { error } = await supabase
          .from('combat_notifications')
          .update({
            current_round: currentRound + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', combat.id);

        if (error) {
          console.error('Erro ao avançar rodada:', error);
        }
      }
    } catch (err) {
      console.error('Erro ao processar avanço de rodada:', err);
    }
  };

  // ========== ENCERRAR COMBATE ==========
  const endCombat = async () => {
    if (!combat) return;

    try {
      // Se faz parte de um grupo, cancelar TODOS os registros do grupo
      if (combat.combat_group_id) {
        const { error } = await supabase
          .from('combat_notifications')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('combat_group_id', combat.combat_group_id);

        if (error) {
          console.error('Erro ao encerrar grupo de combate:', error);
        } else {
          setCombat(null);
          setCombatGroup([]);
        }
      } else {
        const { error } = await supabase
          .from('combat_notifications')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', combat.id);

        if (error) {
          console.error('Erro ao encerrar combate:', error);
        } else {
          setCombat(null);
          setCombatGroup([]);
        }
      }
    } catch (err) {
      console.error('Erro ao encerrar combate:', err);
    }
  };

  // Encerrar combate individual (para multi-defensor, encerrar apenas um registro)
  const endSingleCombat = async (combatId) => {
    try {
      const { error } = await supabase
        .from('combat_notifications')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', combatId);

      if (error) {
        console.error('Erro ao encerrar combate individual:', error);
      }
    } catch (err) {
      console.error('Erro ao encerrar combate individual:', err);
    }
  };

  // Filtrar jogadores disponíveis (excluir o próprio jogador, eliminados, e apenas com personagem criado)
  const getAvailableTargets = useMemo(() => {
    return players.filter(player => 
      player.id !== currentPlayer?.id && 
      player.character?.selections &&
      player.status !== 'offline' &&
      player.is_alive !== false
    );
  }, [players, currentPlayer?.id]);

  // Jogadores disponíveis para trocar o defensor (exclui defensores já no grupo e eliminados)
  const getSwapTargets = useMemo(() => {
    const groupDefenderIds = combatGroup.map(gc => gc.defender_id);
    return players.filter(p =>
      p.id !== currentPlayer?.id &&
      p.id !== combat?.defender_id &&
      !groupDefenderIds.includes(p.id) &&
      p.character?.selections &&
      p.status !== 'offline' &&
      p.is_alive !== false
    );
  }, [players, currentPlayer?.id, combat?.defender_id, combatGroup]);

  // Trocar defensor in-place (mantém attacker_shared_roll, reseta estado do defensor)
  const swapDefender = async (newDefenderId) => {
    if (!combat) return;
    const newDefender = players.find(p => p.id === newDefenderId);
    if (!newDefender) return;

    try {
      const { error } = await supabase
        .from('combat_notifications')
        .update({
          defender_id: newDefenderId,
          defender_name: newDefender.name,
          defender_weapon: null,
          defender_defense_dices: null,
          combat_phase: 'weapon_selection',
          current_round: 0,
          total_rounds: 0,
          round_data: [],
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', combat.id);

      if (error) {
        console.error('Erro ao trocar defensor:', error);
        alert(localization?.['UI.Combat.SwapDefenderError'] || 'Erro ao trocar defensor. Tente novamente.');
      } else {
        setShowDefenderSwap(false);
      }
    } catch (err) {
      console.error('Erro ao trocar defensor:', err);
      alert((localization?.['UI.Combat.UnexpectedError'] || 'Erro inesperado: ') + err.message);
    }
  };

  // Toggle seleção de defensor
  const toggleDefenderSelection = (defenderId) => {
    setSelectedDefenders(prev => {
      if (prev.includes(defenderId)) {
        return prev.filter(id => id !== defenderId);
      } else {
        return [...prev, defenderId];
      }
    });
  };

  // Iniciar combate
  const handleStartCombat = async () => {
    if (matchStatus !== 'in_progress') {
      alert(localization?.['UI.Combat.StartMatchFirst'] || '⚠️ Inicie uma partida antes de iniciar combates!');
      return;
    }

    if (!selectedAttack) {
      alert(localization?.['UI.Combat.SelectAttackRequired'] || 'Selecione um ataque ou arma!');
      return;
    }

    if (selectedDefenders.length === 0) {
      alert(localization?.['UI.Combat.SelectDefender'] || 'Selecione pelo menos um defensor!');
      return;
    }

    if (!currentPlayer?.id) {
      alert(localization?.['UI.Combat.PlayerNotIdentified'] || 'Erro: jogador não identificado!');
      return;
    }

    // Verificar se já existe combate ativo na sala
    try {
      const { data: existingCombats, error: checkError } = await supabase
        .from('combat_notifications')
        .select('id')
        .eq('room_id', roomId)
        .in('status', ['pending', 'in_progress'])
        .limit(1);

      if (checkError) {
        console.error('Erro ao verificar combates:', checkError);
      }

      if (existingCombats && existingCombats.length > 0) {
        alert(localization?.['UI.Combat.CombatAlreadyActive'] || '⚠️ Já existe um combate ativo na sala! Aguarde o término do combate atual.');
        return;
      }
    } catch (err) {
      console.error('Erro ao verificar combates ativos:', err);
    }

    setLoading(true);

    try {
      // Gerar combat_group_id se houver múltiplos defensores
      const groupId = selectedDefenders.length > 1 ? crypto.randomUUID() : null;

      // Criar notificação para cada defensor selecionado
      const notifications = selectedDefenders.map(defenderId => {
        const defender = players.find(p => p.id === defenderId);
        return {
          room_id: roomId,
          attacker_id: currentPlayer.id,
          defender_id: defenderId,
          attacker_name: currentPlayer.name,
          defender_name: defender?.name || (localization?.['UI.Combat.Unknown'] || 'Desconhecido'),
          attack_data: selectedAttack,
          allow_counter_attack: allowCounterAttack,
          allow_opportunity_attacks: allowOpportunityAttacks,
          opportunity_attacks_used: [],
          status: 'pending',
          combat_phase: 'weapon_selection',
          current_round: 0,
          total_rounds: 0,
          round_data: [],
          combat_group_id: groupId,
          attacker_shared_roll: null
        };
      });

      const { error } = await supabase
        .from('combat_notifications')
        .insert(notifications);

      if (error) {
        console.error('Erro ao criar combate:', error);
        alert(localization?.['UI.Combat.StartCombatError'] || 'Erro ao iniciar combate. Verifique o console.');
      } else {
        // Sucesso! Limpar seleções
        setSelectedAttack(null);
        setSelectedDefenders([]);
        alert(`${localization?.['UI.Combat.CombatStarted'] || 'Combate iniciado contra'} ${selectedDefenders.length} ${selectedDefenders.length === 1 ? (localization?.['UI.Common.PlayerSingular'] || 'jogador') : (localization?.['UI.Common.PlayerPlural'] || 'jogadores')}!`);
        
        // Fechar sidebar após iniciar
        if (isOpen) {
          toggleSidebar();
        }
      }
    } catch (err) {
      console.error('Erro ao iniciar combate:', err);
      alert(localization?.['UI.Combat.StartCombatUnexpectedError'] || 'Erro inesperado ao iniciar combate.');
    } finally {
      setLoading(false);
    }
  };

  // ========== FUNÇÕES DE ALTERAÇÃO DURANTE COMBATE ==========
  
  // Obter arma/ataque com modo aplicado
  const getWeaponWithMode = useCallback((weapon) => {
    if (!weapon) return null;
    if (!weapon.modes) return weapon;
    return weapon.modes[combatMode] || weapon.modes.mode1 || weapon;
  }, [combatMode]);
  
  // Obter dados de defesa atuais do jogador (prioriza valor local, depois banco, depois original)
  const getCurrentDefenseDices = useCallback(() => {
    // Primeiro, verificar se há um valor temporário local (alterado pelo usuário)
    // Isso garante feedback imediato antes do banco atualizar
    if (tempDefenseDices !== null) {
      return tempDefenseDices;
    }
    
    const isAttacker = combat?.attacker_id === currentPlayer?.id;
    const isDefender = combat?.defender_id === currentPlayer?.id;
    
    // Se há um combate ativo, usar os dados do banco de dados
    if (combat && combat.status === 'in_progress') {
      if (isAttacker && combat.attacker_defense_dices !== null && combat.attacker_defense_dices !== undefined) {
        return combat.attacker_defense_dices;
      }
      if (isDefender && combat.defender_defense_dices !== null && combat.defender_defense_dices !== undefined) {
        return combat.defender_defense_dices;
      }
    }
    
    // Considerar modo do personagem para dados de defesa
    const actor = currentPlayerData?.character?.actor;
    if (actor?.modes && actor.modes[combatMode]?.NumberOfDefenseDices !== undefined) {
      return actor.modes[combatMode].NumberOfDefenseDices;
    }
    
    return actor?.NumberOfDefenseDices || 0;
  }, [tempDefenseDices, combat, currentPlayer?.id, currentPlayerData, combatMode]);

  // Ajustar dados de defesa e sincronizar com banco de dados
  const adjustDefenseDices = (delta) => {
    const current = getCurrentDefenseDices();
    const newValue = Math.max(0, Math.min(8, current + delta)); // Limite entre 0 e 8
    handleDefenseDicesChange(newValue);
  };

  // Ref para debounce do slider de dados de defesa
  const defenseDiceDebounceRef = useRef(null);

  // Atualizar dados de defesa localmente E no banco de dados (com debounce)
  const handleDefenseDicesChange = (newValue) => {
    // Atualizar estado local PRIMEIRO para feedback imediato
    setTempDefenseDices(newValue);
    
    // Debounce: atrasa a atualização no banco para evitar chamadas a cada pixel do slider
    if (defenseDiceDebounceRef.current) {
      clearTimeout(defenseDiceDebounceRef.current);
    }
    defenseDiceDebounceRef.current = setTimeout(() => {
      syncDefenseDicesToDatabase(newValue);
    }, 300);
  };

  // Sincronizar dados de defesa com o banco de dados (em background)
  const syncDefenseDicesToDatabase = async (newValue) => {
    if (combat && combat.id) {
      try {
        const isAttacker = combat.attacker_id === currentPlayer?.id;
        const isDefender = combat.defender_id === currentPlayer?.id;
        
        let updateData = {
          updated_at: new Date().toISOString()
        };
        
        if (isAttacker) {
          updateData.attacker_defense_dices = newValue;
          console.log('🛡️ Atualizando dados de defesa do atacante:', newValue);
        } else if (isDefender) {
          updateData.defender_defense_dices = newValue;
          console.log('🛡️ Atualizando dados de defesa do defensor:', newValue);
        }
        
        const { error } = await supabase
          .from('combat_notifications')
          .update(updateData)
          .eq('id', combat.id);
        
        if (error) {
          console.error('Erro ao atualizar dados de defesa:', error);
        } else {
          console.log('✅ Dados de defesa atualizados com sucesso');
        }
      } catch (err) {
        console.error('Erro ao sincronizar dados de defesa:', err);
      }
    }
  };

  // ========== GERENCIAMENTO DE RODADAS ==========
  
  // Adicionar rodada ao final (com controle de quem ataca)
  const addRound = async (whoAttacks) => {
    if (!combat) return;

    const roundData = [...(combat.round_data || [])];
    const newRoundNumber = roundData.length + 1;
    
    // whoAttacks pode ser 'attacker' ou 'defender' (controlado pelo usuário)
    const newWhoActs = whoAttacks;
    const newActionType = whoAttacks === 'attacker' ? 'attack' : 'counter';

    // Criar nova rodada
    const newRound = {
      round: newRoundNumber,
      who_acts: newWhoActs,
      action_type: newActionType,
      attacker: { rolled: false, roll: [], total: 0 },
      defender: { rolled: false, roll: [], total: 0 },
      completed: false
    };

    roundData.push(newRound);

    // Atualizar no Supabase
    const { error } = await supabase
      .from('combat_notifications')
      .update({
        total_rounds: roundData.length,
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);

    if (error) {
      console.error('Erro ao adicionar rodada:', error);
      alert(localization?.['UI.Combat.AddRoundError'] || 'Erro ao adicionar rodada. Tente novamente.');
    }
  };

  // Remover última rodada
  const removeRound = async () => {
    if (!combat || combat.round_data.length <= 1) return;

    const roundData = [...(combat.round_data || [])];
    const currentRound = combat.current_round;
    
    // Não permitir remover se estamos na última rodada ou após ela
    if (currentRound >= roundData.length) {
      alert(localization?.['UI.Combat.CannotRemoveRound'] || 'Não é possível remover a rodada atual ou rodadas já completadas.');
      return;
    }

    // Remover última rodada
    roundData.pop();

    // Atualizar no Supabase
    const { error } = await supabase
      .from('combat_notifications')
      .update({
        total_rounds: roundData.length,
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);

    if (error) {
      console.error('Erro ao remover rodada:', error);
      alert(localization?.['UI.Combat.RemoveRoundError'] || 'Erro ao remover rodada. Tente novamente.');
    }
  };

  // Mover rodada para a esquerda (trocar com a rodada anterior)
  const moveRoundLeft = useCallback(async (roundIndex) => {
    if (!combat || roundIndex <= 0) return;
    
    const roundData = [...(combat.round_data || [])];
    const currentRoundNum = combat.current_round;
    
    // Não permitir mover rodadas já completadas ou a rodada atual
    if (roundIndex < currentRoundNum || roundIndex - 1 < currentRoundNum - 1) {
      return;
    }
    
    // Trocar posições
    const temp = roundData[roundIndex];
    roundData[roundIndex] = roundData[roundIndex - 1];
    roundData[roundIndex - 1] = temp;
    
    // Atualizar números das rodadas
    roundData.forEach((r, idx) => {
      r.round = idx + 1;
    });
    
    // Atualizar no Supabase
    await supabase
      .from('combat_notifications')
      .update({
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);
  }, [combat]);

  // Mover rodada para a direita (trocar com a rodada seguinte)
  const moveRoundRight = useCallback(async (roundIndex) => {
    if (!combat) return;
    
    const roundData = [...(combat.round_data || [])];
    const currentRoundNum = combat.current_round;
    
    // Verificar se pode mover (não é a última rodada)
    if (roundIndex >= roundData.length - 1) return;
    
    // Não permitir mover rodadas já completadas ou a rodada atual
    if (roundIndex < currentRoundNum - 1) {
      return;
    }
    
    // Trocar posições
    const temp = roundData[roundIndex];
    roundData[roundIndex] = roundData[roundIndex + 1];
    roundData[roundIndex + 1] = temp;
    
    // Atualizar números das rodadas
    roundData.forEach((r, idx) => {
      r.round = idx + 1;
    });
    
    // Atualizar no Supabase
    await supabase
      .from('combat_notifications')
      .update({
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);
  }, [combat]);

  // Abrir modal de seleção de arma
  const openWeaponChange = () => {
    setShowWeaponChange(true);
  };

  // Confirmar troca de arma - atualiza localmente E no banco de dados
  const confirmWeaponChange = async (weapon) => {
    setTempWeapon(weapon);
    setShowWeaponChange(false);
    
    // Atualizar no banco de dados para sincronizar com outros jogadores
    if (combat && combat.id) {
      try {
        const isAttacker = combat.attacker_id === currentPlayer?.id;
        const isDefender = combat.defender_id === currentPlayer?.id;
        
        let updateData = {
          updated_at: new Date().toISOString()
        };
        
        if (isAttacker) {
          // Atacante trocou de arma - atualizar attack_data
          updateData.attack_data = weapon;
          console.log('🔄 Atualizando arma do atacante no banco de dados:', weapon.Name);
        } else if (isDefender) {
          // Defensor trocou de arma - atualizar defender_weapon
          updateData.defender_weapon = weapon;
          console.log('🔄 Atualizando arma do defensor no banco de dados:', weapon.Name);
        }
        
        const { error } = await supabase
          .from('combat_notifications')
          .update(updateData)
          .eq('id', combat.id);
        
        if (error) {
          console.error('Erro ao atualizar arma no banco de dados:', error);
        } else {
          console.log('✅ Arma atualizada com sucesso no banco de dados');
        }
      } catch (err) {
        console.error('Erro ao sincronizar troca de arma:', err);
      }
    }
  };

  const availableAttacks = getAvailableAttacks;
  const availableTargets = getAvailableTargets;
  const swapTargets = getSwapTargets;

  // Helper de UI para seção de trocar defensor (reutilizado em 5 locais)
  const renderSwapDefenderSection = ({ btnClass = 'btn-outline-warning', wrapperClass = '', listClass = 'mb-2' } = {}) => (
    <>
      <button
        className={`btn btn-sm ${btnClass} w-100 ${wrapperClass ? '' : 'mb-2'}`}
        onClick={() => setShowDefenderSwap(!showDefenderSwap)}
      >
        🔄 {localization?.['UI.Combat.SwapDefender'] || 'Trocar Defensor'}
      </button>
      {showDefenderSwap && (
        <div className={listClass} style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {swapTargets.length === 0 ? (
            <small className="text-muted d-block text-center">{localization?.['UI.Combat.NoPlayersAvailable'] || 'Nenhum jogador disponível'}</small>
          ) : swapTargets.map(p => (
            <button
              key={p.id}
              className="btn btn-sm btn-outline-light w-100 mb-1 text-start"
              onClick={() => swapDefender(p.id)}
            >
              🛡️ {p.name}
              <small className="text-muted ms-2">{p.character?.actor?.Name || ''}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );

  // Verificar se há combate ativo (destaque durante todo o combate)
  const hasActiveCombat = combat && 
    (combat.status === 'pending' || combat.status === 'in_progress');

  return (
    <>
      {/* Botão de toggle fixo na lateral direita */}
      <button
        onClick={toggleSidebar}
        className="btn btn-danger position-fixed d-flex align-items-center justify-content-center sidebar-toggle-btn border border-light combat-toggle-btn"
        style={{
          right: isOpen ? '340px' : '0px',
          top: 'calc(50% - 60px)',
          transform: 'translateY(-50%)',
          zIndex: 1055,
          width: '40px',
          height: '80px',
          borderRadius: '8px 0 0 8px',
          transition: 'all 0.3s ease-in-out',
          fontSize: '20px',
          fontWeight: 'bold',
          boxShadow: hasActiveCombat 
            ? '0 0 25px rgba(255, 193, 7, 0.9), 0 0 50px rgba(255, 193, 7, 0.6), 0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
          animation: hasActiveCombat ? 'pulseCombatAlert 1s ease-in-out infinite' : 'none',
          border: hasActiveCombat ? '3px solid #ffc107' : '1px solid white'
        }}
        data-sidebar-open={isOpen ? 'true' : 'false'}
        title={isOpen ? (localization?.['UI.Combat.ClosePanel'] || 'Fechar painel de combate') : (localization?.['UI.Combat.OpenPanel'] || 'Abrir painel de combate')}
      >
        <span style={{ 
          fontSize: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%'
        }}>
          {isOpen ? '▶' : '⚔️'}
        </span>
      </button>

      {/* Overlay escuro quando a sidebar está aberta */}
      {isOpen && (
        <div
          className="position-fixed"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1050
          }}
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className="position-fixed bg-dark border-start border-danger combat-sidebar"
        style={{
          top: 0,
          right: isOpen ? '0' : '-340px',
          width: '340px',
          height: '100vh',
          transition: 'right 0.3s ease-in-out',
          zIndex: 1052,
          boxShadow: isOpen ? '-4px 0 12px rgba(220, 53, 69, 0.5)' : 'none',
          overflowY: 'auto'
        }}
      >
        {/* Header da sidebar */}
        <div className="bg-danger text-white p-3 border-bottom border-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="mb-1 fw-bold">{localization?.['UI.Combat.PanelTitle'] || '⚔️ Painel de Combate'}</h6>
              <small>{combat ? (localization?.['UI.Combat.InProgress'] || 'Combate em andamento') : (localization?.['UI.Combat.StartNew'] || 'Iniciar novo combate')}</small>
            </div>
            <button
              onClick={toggleSidebar}
              className="btn btn-outline-light btn-sm"
              style={{ width: '32px', height: '32px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corpo da sidebar */}
        <div className="p-3">
          {/* ========== COMBATE ATIVO ========== */}
          {combat ? (
            <>
              {/* FASE 1: SELEÇÃO DE ARMA */}
              {combat.combat_phase === 'weapon_selection' && (() => {
                const isAttacker = currentPlayer.id === combat.attacker_id;
                const isDefender = currentPlayer.id === combat.defender_id;

                // Sem revidar - iniciar automaticamente com APENAS 1 RODADA
                if (!combat.allow_counter_attack) {
                  if (combat.status === 'pending') {
                    const autoStart = async () => {
                      // Ataque único: apenas 1 rodada
                      const totalRounds = 1;
                      const rounds = [{
                        round: 1,
                        who_acts: 'attacker',
                        action_type: 'attack'
                      }];
                      
                      const roundData = rounds.map(r => ({
                        ...r,
                        attacker: { rolled: false, roll: [], total: 0 },
                        defender: { rolled: false, roll: [], total: 0 },
                        completed: false
                      }));

                      await supabase
                        .from('combat_notifications')
                        .update({
                          defender_weapon: null,
                          total_rounds: totalRounds,
                          current_round: 1,
                          combat_phase: 'rolling',
                          round_data: roundData,
                          status: 'in_progress',
                          updated_at: new Date().toISOString()
                        })
                        .eq('id', combat.id);
                    };
                    autoStart();
                  }
                  return <div className="text-white">{localization?.['UI.Combat.Initiating'] || 'Iniciando combate...'}</div>;
                }

                // Defensor deve escolher arma
                if (isDefender) {
                  const weapons = getPlayerWeapons();

                  return (
                    <>
                      <div className="alert alert-warning">
                        <h6>{localization?.['UI.Combat.CombatStartedTitle'] || '⚔️ Combate Iniciado!'}</h6>
                        <p className="mb-0"><strong>{combat.attacker_name}</strong> {localization?.['UI.Combat.AttackingYouWith'] || 'está atacando você com'} <strong>{combat.attack_data.Name}</strong>!</p>
                      </div>

                      <div className="mb-3">
                        <h6 className="text-white mb-2">{localization?.['UI.Combat.ChooseWeapon'] || '✓ Escolha sua arma para revidar:'}</h6>
                        
                        {weapons.length === 0 && (
                          <div className="alert alert-info">
                            <small>{localization?.['UI.Combat.NoWeaponsAvailable'] || 'Você não possui armas disponíveis.'}</small>
                          </div>
                        )}
                        
                        <div className="d-flex flex-column gap-2">
                          {weapons.map((weapon, idx) => {
                            const isSelected = selectedWeapon?.Name === weapon.Name;
                            return (
                              <div
                                key={idx}
                                className={`card border ${
                                  isSelected ? 'border-success bg-success bg-opacity-25' : 'border-secondary'
                                } cursor-pointer`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedWeapon({ ...weapon })}
                              >
                                <div className="card-body p-2">
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <div style={{ flex: 1 }}>
                                      <h6 className="text-white mb-1 small">{weapon.Name}</h6>
                                      <div className="d-flex gap-2 flex-wrap">
                                        <small className="text-muted">🎲 {weapon.Dices}</small>
                                        <small className="text-muted">⏱️ {weapon.LoadTime}</small>
                                        <small className="text-muted">💥 {weapon.Damage || '0'}</small>
                                      </div>
                                      {weapon.Description && (
                                        <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>
                                          {weapon.Description}
                                        </small>
                                      )}
                                      {weapon.Effects && (
                                        <small className="text-warning d-block mt-1" style={{ fontSize: '10px' }}>
                                          ✨ {weapon.Effects}
                                        </small>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <span className="text-success ms-2">✓</span>
                                    )}
                                  </div>

                                  {/* Quando selecionado mostramos controles editáveis (dados/tempo/dano) */}
                                  {isSelected ? (
                                    <div className="mt-2">
                                      <div className="row g-2 mb-2">
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={selectedWeapon.Dices}
                                            onChange={(e) => setSelectedWeapon({ ...selectedWeapon, Dices: e.target.value })}
                                            min="1"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={selectedWeapon.LoadTime}
                                            onChange={(e) => setSelectedWeapon({ ...selectedWeapon, LoadTime: e.target.value })}
                                            min="0"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={selectedWeapon.Damage}
                                            onChange={(e) => setSelectedWeapon({ ...selectedWeapon, Damage: e.target.value })}
                                            min="0"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          
                          {/* Card de Ataque Customizado */}
                          {(() => {
                            const isCustom = selectedWeapon?.Name === customAttack.Name;
                            return (
                              <div
                                className={`card border ${isCustom ? 'border-warning bg-warning bg-opacity-25' : 'border-warning'} cursor-pointer`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedWeapon({ ...customAttack })}
                              >
                                <div className="card-body p-2">
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <h6 className="text-warning mb-0 small">{localization?.['UI.Combat.CustomAttackCard'] || '⚙️ Ataque Personalizado'}</h6>
                                    {isCustom && <span className="text-warning">✓</span>}
                                  </div>
                                  {!isCustom ? (
                                    <div>
                                      <div className="d-flex gap-2 flex-wrap">
                                        <small className="text-muted">🎲 {customAttack.Dices || '1'}</small>
                                        <small className="text-muted">⏱️ {customAttack.LoadTime || '?'}</small>
                                        <small className="text-muted">💥 {customAttack.Damage || '0'}</small>
                                        <span className="badge bg-secondary">{customAttack.category}</span>
                                      </div>
                                      <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>{customAttack.Effects}</small>
                                    </div>
                                  ) : (
                                    <div className="mt-2">
                                      <div className="mb-2">
                                        <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.WeaponName'] || 'Nome:'}</label>
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          value={customAttack.Name}
                                          onChange={(e) => {
                                            const updated = { ...customAttack, Name: e.target.value };
                                            setCustomAttack(updated);
                                            if (selectedWeapon?.Name === customAttack.Name) setSelectedWeapon(updated);
                                          }}
                                          placeholder={localization?.['UI.Combat.AttackNamePlaceholder'] || 'Nome do ataque'}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                      <div className="row g-2 mb-2">
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={customAttack.Dices}
                                            onChange={(e) => {
                                              const updated = { ...customAttack, Dices: e.target.value };
                                              setCustomAttack(updated);
                                              if (selectedWeapon?.Name === customAttack.Name) setSelectedWeapon(updated);
                                            }}
                                            min="1"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={customAttack.LoadTime}
                                            onChange={(e) => {
                                              const updated = { ...customAttack, LoadTime: e.target.value };
                                              setCustomAttack(updated);
                                              if (selectedWeapon?.Name === customAttack.Name) setSelectedWeapon(updated);
                                            }}
                                            min="0"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                          <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={customAttack.Damage}
                                            onChange={(e) => {
                                              const updated = { ...customAttack, Damage: e.target.value };
                                              setCustomAttack(updated);
                                              if (selectedWeapon?.Name === customAttack.Name) setSelectedWeapon(updated);
                                            }}
                                            min="0"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                      </div>
                                      </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <button
                        className="btn btn-success w-100 mb-2"
                        onClick={() => selectWeaponForDefense(false)}
                        disabled={!selectedWeapon}
                      >
                        {localization?.['UI.Combat.ConfirmWeapon'] || 'Confirmar Arma'}
                      </button>

                      <button
                        className="btn btn-warning w-100 mb-2"
                        onClick={() => selectWeaponForDefense(true)}
                      >
                        {localization?.['UI.Combat.NoRetaliation'] || '❌ Não Retaliar'}
                      </button>

                      {/* Trocar Defensor */}
                      {renderSwapDefenderSection()}

                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
                      </button>
                    </>
                  );
                } else if (isAttacker) {
                  // Atacante aguarda defensor(es) escolher
                  const isMultiDefender = combatGroup.length > 1;
                  
                  if (isMultiDefender) {
                    return (
                      <>
                        <div className="alert alert-info">
                          <h6>{localization?.['UI.Combat.MultiTarget'] || '⚔️ Combate Multi-Alvo'}</h6>
                          <p className="mb-1"><strong>{combat.attack_data.Name}</strong> vs {combatGroup.length} defensores</p>
                        </div>

                        {/* Status de cada defensor */}
                        <div className="d-flex flex-column gap-2 mb-3">
                          {combatGroup.map(gc => {
                            const statusLabel = gc.status === 'cancelled' ? `❌ ${localization?.['UI.Combat.StatusCancelled'] || 'Cancelado'}` 
                              : gc.combat_phase === 'weapon_selection' ? `⏳ ${localization?.['UI.Combat.StatusChoosing'] || 'Escolhendo arma...'}`
                              : gc.combat_phase === 'rolling' ? (gc.round_data?.[0]?.defender?.rolled ? `✅ ${localization?.['UI.Combat.StatusDefended'] || 'Defendeu'}` : `🎲 ${localization?.['UI.Combat.StatusWaitingDefense'] || 'Aguardando defesa'}`)
                              : gc.combat_phase === 'results' ? `📊 ${localization?.['UI.Combat.StatusFinished'] || 'Finalizado'}`
                              : '⏳';
                            const bgClass = gc.status === 'cancelled' ? 'bg-secondary' 
                              : gc.combat_phase === 'rolling' && gc.round_data?.[0]?.defender?.rolled ? 'bg-success bg-opacity-25'
                              : 'bg-dark';
                            
                            return (
                              <div key={gc.id} className={`card border-secondary ${bgClass}`}>
                                <div className="card-body p-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <span className="text-white small fw-bold">🛡️ {gc.defender_name}</span>
                                    <span className="text-muted small">{statusLabel}</span>
                                  </div>
                                  {gc.combat_phase === 'rolling' && gc.round_data?.[0]?.defender?.rolled && (
                                    <div className="mt-1">
                                      <small className="text-info">
                                        {localization?.['UI.Combat.DefenseLabel'] || 'Defesa:'} {gc.round_data[0].defender.roll.map(d => `🎲${d}`).join(' ')} = {gc.round_data[0].defender.total}
                                      </small>
                                    </div>
                                  )}
                                  {gc.defender_weapon && (
                                    <small className="text-warning d-block">{localization?.['UI.Combat.WeaponLabel'] || 'Arma:'} {gc.defender_weapon.Name}</small>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Info: atacante pode rolar a qualquer momento */}
                        {!combat.attacker_shared_roll?.rolled && (
                          <div className="alert alert-warning py-2">
                            <small>{localization?.['UI.Combat.RollAllHint'] || 'Você pode rolar seu ataque a qualquer momento. A rolagem será aplicada a todos os defensores.'}</small>
                          </div>
                        )}

                        {combat.attacker_shared_roll?.rolled && (
                          <div className="alert alert-success py-2">
                            <small>✅ {localization?.['UI.Combat.AttackRolled'] || 'Ataque rolado:'} {combat.attacker_shared_roll.roll.map(d => `🎲${d}`).join(' ')} = {combat.attacker_shared_roll.total}</small>
                          </div>
                        )}

                        <button className="btn btn-danger w-100" onClick={endCombat}>
                          {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
                        </button>

                        {/* Trocar Defensor (por defensor) — multi-alvo weapon_selection */}
                        {renderSwapDefenderSection({ listClass: 'mt-2' })}
                      </>
                    );
                  }

                  // 1v1: Atacante aguarda defensor escolher
                  return (
                    <>
                      <div className="alert alert-info">
                        <h6>{localization?.['UI.Combat.WaitingDefender'] || '⚔️ Aguardando Defensor...'}</h6>
                        <p className="mb-0">{(localization?.['UI.Combat.WaitingWeaponChoice'] || 'Aguardando {name} escolher sua arma...').replace('{name}', '')}<strong>{combat.defender_name}</strong></p>
                        <div className="text-center mt-2">⏳</div>
                      </div>

                      {/* Trocar Defensor */}
                      {renderSwapDefenderSection()}

                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
                      </button>
                    </>
                  );
                }

                // Espectador: não é atacante nem defensor
                return (
                  <div className="alert alert-secondary">
                    <h6>{localization?.['UI.Combat.InProgressSpectator'] || '⚔️ Combate em Andamento'}</h6>
                    <p className="mb-1"><strong>{combat.attacker_name}</strong> {localization?.['UI.Combat.AttackedWith'] || 'atacou'} <strong>{combat.defender_name}</strong> {localization?.['UI.Combat.With'] || 'com'} <strong>{combat.attack_data?.Name || (localization?.['UI.Combat.RoundType.Attack'] || 'ataque').toLowerCase()}</strong>!</p>
                    <p className="mb-0 text-muted"><small>{(localization?.['UI.Combat.WaitingWeaponRetaliate'] || 'Aguardando {name} escolher uma arma para revidar...').replace('{name}', '')}<strong>{combat.defender_name}</strong></small></p>
                    <div className="text-center mt-2">👀 ⏳</div>
                  </div>
                );
              })()}

              {/* FASE 2: ROLAGEM DE DADOS */}
              {combat.combat_phase === 'rolling' && (() => {
                const isAttacker = currentPlayer.id === combat.attacker_id;
                const isDefender = currentPlayer.id === combat.defender_id;
                const isSpectator = !isAttacker && !isDefender;
                
                const currentRound = combat.current_round;
                const totalRounds = combat.total_rounds;
                const roundData = combat.round_data || [];
                const roundIndex = currentRound - 1;
                const roundInfo = roundData[roundIndex] || {};

                const attackerRolled = roundInfo.attacker?.rolled || false;
                const defenderRolled = roundInfo.defender?.rolled || false;

                // Verificar quem está atacando nesta rodada
                const isAttackerActing = roundInfo.action_type === 'attack';
                
                // Quem está atacando deve rolar primeiro
                const attackingPlayerRolled = isAttackerActing ? attackerRolled : defenderRolled;
                
                // Determinar se o jogador atual é o atacante ou defensor
                const isCurrentPlayerAttacking = isAttackerActing ? isAttacker : !isAttacker;
                const hasCurrentPlayerRolled = isAttacker ? attackerRolled : defenderRolled;
                
                // Mensagem para quando estiver esperando o atacante rolar
                const waitingForAttacker = !hasCurrentPlayerRolled && !isCurrentPlayerAttacking && !attackingPlayerRolled;

                // Verificar se é rodada de oportunidade
                const isOpportunityRound = roundInfo.action_type === 'opportunity';
                
                // Verificar se o jogador atual é o atacante de oportunidade na rodada atual
                const isOpportunityAttacker = isOpportunityRound && currentPlayer.id === roundInfo.opportunity_attacker_id;
                
                // Determinar se o jogador pode alterar equipamento (participantes + atacante de oportunidade)
                const canChangeEquipment = !isSpectator || isOpportunityAttacker;
                
                // Definir leftPlayer e rightPlayer baseado no tipo de rodada
                let leftPlayer, rightPlayer;
                
                if (isOpportunityRound) {
                  // Rodada de ataque de oportunidade
                  leftPlayer = {
                    name: roundInfo.opportunity_attacker_name || (localization?.['UI.Combat.Spectator'] || 'Espectador'),
                    weapon: roundInfo.opportunity_weapon?.Name || (localization?.['UI.Combat.WeaponFallback'] || 'Arma'),
                    rolled: roundInfo.attacker?.rolled || false,
                    data: roundInfo.attacker,
                    icon: '⚡',
                    className: 'opportunity'
                  };
                  
                  // Defensor é o alvo escolhido
                  const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
                  rightPlayer = {
                    name: targetIsAttacker ? combat.attacker_name : combat.defender_name,
                    weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                    rolled: roundInfo.defender?.rolled || false,
                    data: roundInfo.defender,
                    icon: '🛡️',
                    className: 'defender'
                  };
                } else if (isAttackerActing) {
                  // Rodada normal de ataque
                  // Usar arma do banco (attack_data já é atualizada quando atacante troca de arma)
                  const attackerWeaponName = combat.attack_data.Name;
                  
                  leftPlayer = {
                    name: combat.attacker_name,
                    weapon: attackerWeaponName,
                    rolled: attackerRolled,
                    data: roundInfo.attacker,
                    icon: '⚔️',
                    className: 'attacker'
                  };
                  rightPlayer = {
                    name: combat.defender_name,
                    weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                    rolled: defenderRolled,
                    data: roundInfo.defender,
                    icon: '🛡️',
                    className: 'defender'
                  };
                } else {
                  // Rodada de contra-ataque
                  // Usar arma do banco (defender_weapon já é atualizada quando defensor troca de arma)
                  const defenderWeaponName = combat.defender_weapon?.Name || (localization?.['UI.Combat.WeaponFallback'] || 'Arma');
                  
                  leftPlayer = {
                    name: combat.defender_name,
                    weapon: defenderWeaponName,
                    rolled: defenderRolled,
                    data: roundInfo.defender,
                    icon: '⚔️',
                    className: 'attacker'
                  };
                  rightPlayer = {
                    name: combat.attacker_name,
                    weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                    rolled: attackerRolled,
                    data: roundInfo.attacker,
                    icon: '🛡️',
                    className: 'defender'
                  };
                }

                // ===== MULTI-DEFENDER ATTACKER VIEW (rolling phase) =====
                if (isAttacker && combatGroup.length > 1) {
                  const sharedRoll = combat.attacker_shared_roll;
                  const attackerHasRolled = sharedRoll?.rolled || roundInfo.attacker?.rolled || false;
                  const allDefendersInRolling = combatGroup.filter(gc => gc.combat_phase === 'rolling' && gc.status !== 'cancelled');
                  const allDefendersRolled = allDefendersInRolling.length > 0 && allDefendersInRolling.every(gc => gc.round_data?.[0]?.defender?.rolled);

                  // If we're in round 1 (shared attack) or no active counter-attack selected
                  if (currentRound === 1 && roundInfo.action_type === 'attack') {
                    return (
                      <>
                        <div className="alert alert-info mb-2">
                          <h6 className="mb-1">{localization?.['UI.Combat.MultiTargetRound1'] || '⚔️ Combate Multi-Alvo — Rodada 1'}</h6>
                          <p className="mb-0"><strong>{combat.attack_data.Name}</strong></p>
                        </div>

                        {/* Attacker roll section */}
                        <div className="combatant-card attacker-card mb-2">
                          <div className="combatant-header">
                            <span className="combatant-icon">⚔️</span>
                            <h6 className="combatant-name">{combat.attacker_name}</h6>
                          </div>
                          <div className="combatant-weapon">{combat.attack_data.Name}</div>
                          <div className="weapon-stats-compact">
                            {(() => {
                              const weaponWithMode = getWeaponWithMode(combat.attack_data) || combat.attack_data;
                              return (
                                <>
                                  <span className="stat-compact" title={localization?.['UI.Combat.DiceTitle'] || 'Dados de Ataque'}>🎲 {weaponWithMode?.Dices || '?'}</span>
                                  <span className="stat-compact" title={localization?.['UI.Combat.LoadTimeTitle'] || 'Tempo de Recarga'}>⚡ {weaponWithMode?.LoadTime || '?'}</span>
                                  <span className="stat-compact" title={localization?.['UI.Combat.DamageTitle'] || 'Dano'}>💥 {weaponWithMode?.Damage || '0'}</span>
                                </>
                              );
                            })()}
                          </div>

                          {/* Rolling animation */}
                          {rolling && (
                            <div className="dice-animation-inline">
                              <div className="dice-rolling-inline">
                                {diceAnimation.map((die, i) => (
                                  <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {attackerHasRolled ? (
                            <div className="combatant-result">
                              <DiceResultAdjuster
                                diceArray={sharedRoll?.roll || roundInfo.attacker?.roll || []}
                                onAdjust={(newDice) => adjustDiceResult(newDice, true)}
                                playerRole="left"
                                localization={localization}
                              />
                            </div>
                          ) : !rolling && (
                            <button className="btn-combat-roll-inline" onClick={rollDice}>
                              <span className="btn-icon">🎲</span>
                              <span className="btn-text">{localization?.['UI.Combat.RollAttackAll'] || 'Rolar Ataque (Todos)'}</span>
                            </button>
                          )}
                        </div>

                        {/* Defender status cards */}
                        <div className="d-flex flex-column gap-2 mb-2">
                          {combatGroup.map(gc => {
                            if (gc.status === 'cancelled') return null;
                            const gRound = gc.round_data?.[0];
                            const defRolled = gRound?.defender?.rolled;
                            const defRoll = gRound?.defender?.roll;
                            const defTotal = gRound?.defender?.total;
                            const inRolling = gc.combat_phase === 'rolling';
                            const inWeaponSel = gc.combat_phase === 'weapon_selection';

                            return (
                              <div key={gc.id} className={`card border-secondary ${defRolled ? 'bg-success bg-opacity-25' : 'bg-dark'}`}>
                                <div className="card-body p-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <span className="text-white small fw-bold">🛡️ {gc.defender_name}</span>
                                    <span className="text-muted small">
                                      {inWeaponSel ? `⏳ ${localization?.['UI.Combat.StatusChoosing'] || 'Escolhendo arma...'}` : defRolled ? `✅ ${localization?.['UI.Combat.StatusDefended'] || 'Defendeu'}` : inRolling ? `🎲 ${localization?.['UI.Combat.StatusWaitingDefense'] || 'Aguardando defesa'}` : gc.combat_phase}
                                    </span>
                                  </div>
                                  {defRolled && defRoll && (
                                    <div className="mt-1">
                                      <small className="text-info">
                                        {localization?.['UI.Combat.DefenseLabel'] || 'Defesa:'} {defRoll.map(d => `🎲${d}`).join(' ')} = {defTotal}
                                      </small>
                                    </div>
                                  )}
                                  {gc.defender_weapon && (
                                    <small className="text-warning d-block">{localization?.['UI.Combat.WeaponLabel'] || 'Arma:'} {gc.defender_weapon.Name}</small>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Advance: only when attacker + all rolling defenders have rolled */}
                        {attackerHasRolled && allDefendersRolled && !rolling && (
                          <div className="d-flex flex-column gap-2 mb-2">
                            {allDefendersInRolling.map(gc => {
                              const gRound = gc.round_data?.[0];
                              const bothRolled = gRound?.attacker?.rolled && gRound?.defender?.rolled;
                              if (!bothRolled) return null;
                              const hasMoreRounds = gc.current_round < gc.total_rounds;
                              return (
                                <button 
                                  key={gc.id}
                                  className="btn btn-sm btn-outline-success"
                                  onClick={async () => {
                                    // Advance this specific defender's combat
                                    if (gc.current_round >= gc.total_rounds) {
                                      await supabase.from('combat_notifications').update({ combat_phase: 'results', updated_at: new Date().toISOString() }).eq('id', gc.id);
                                    } else {
                                      await supabase.from('combat_notifications').update({ current_round: gc.current_round + 1, updated_at: new Date().toISOString() }).eq('id', gc.id);
                                    }
                                  }}
                                >
                                  {hasMoreRounds ? `➡️ ${localization?.['UI.Combat.CounterAttackPrefix'] || '➡️ Contra-Ataque:'} ${gc.defender_name}` : `✅ ${localization?.['UI.Combat.ViewResultPrefix'] || '✅ Ver Resultado:'} ${gc.defender_name}`}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Equipment change */}
                        <div className="weapon-info-panel mb-2">
                          <details className="weapon-details">
                            <summary className="weapon-summary">
                              <span className="weapon-icon">🔄</span>
                              <span className="weapon-label">{localization?.['UI.Combat.ChangeEquipment'] || 'Alterar Equipamento'}</span>
                              <span className="toggle-icon">▼</span>
                            </summary>
                            <div className="weapon-details-content">
                              <div className="weapon-change-section">
                                <button className="btn btn-sm btn-outline-warning w-100 mb-2" onClick={openWeaponChange} title={localization?.['UI.Combat.ChangeWeaponTooltip'] || 'Trocar arma'}>
                                  {localization?.['UI.Combat.ChangeWeapon'] || '⚔️ Trocar Arma'} {tempWeapon && (localization?.['UI.Combat.Changed'] || '(Alterada)')}
                                </button>
                                <div className="defense-adjustment">
                                  <div className="d-flex justify-content-between align-items-center mb-2">
                                    <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>{localization?.['UI.Combat.DefenseDice'] || '🛡️ Dados de Defesa'}</label>
                                    <span className="badge bg-primary" style={{ fontSize: '16px', padding: '6px 12px' }}>{getCurrentDefenseDices()}</span>
                                  </div>
                                  <input type="range" className="form-range defense-slider" min="0" max="8" value={getCurrentDefenseDices()} onChange={(e) => handleDefenseDicesChange(parseInt(e.target.value))} style={{ width: '100%' }} />
                                </div>

                                {/* Trocar Defensor */}
                                <div className="defender-swap-section mt-3">
                                  {renderSwapDefenderSection({ btnClass: 'btn-outline-danger', listClass: 'swap-targets-list' })}
                                </div>
                              </div>
                            </div>
                          </details>
                        </div>

                        <button className="btn btn-danger w-100" onClick={endCombat}>
                          🚫 {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
                        </button>
                      </>
                    );
                  }

                  // Round 2+ (counter-attack rounds) — show per-defender navigation
                  // The attacker needs to handle each defender's counter-attack individually
                  // Find defenders that are in counter-attack rounds (round 2+)
                  const activeCounterAttacks = combatGroup.filter(gc => 
                    gc.status !== 'cancelled' && gc.combat_phase === 'rolling' && gc.current_round > 1
                  );
                  const finishedDefenders = combatGroup.filter(gc => 
                    gc.status !== 'cancelled' && (gc.combat_phase === 'results' || (gc.combat_phase === 'rolling' && gc.total_rounds === 1 && gc.round_data?.[0]?.completed))
                  );
                  const stillInRound1 = combatGroup.filter(gc =>
                    gc.status !== 'cancelled' && gc.combat_phase === 'rolling' && gc.current_round === 1 && !gc.round_data?.[0]?.completed
                  );

                  // Select the active counter-attack combat to show
                  const selectedCounterCombat = activeCombatId 
                    ? combatGroup.find(gc => gc.id === activeCombatId) 
                    : activeCounterAttacks[0];

                  return (
                    <>
                      <div className="alert alert-info mb-2">
                        <h6 className="mb-1">{localization?.['UI.Combat.CounterAttacks'] || '⚔️ Contra-Ataques'}</h6>
                        <p className="mb-0 small">{localization?.['UI.Combat.ManageCounterAttacks'] || 'Gerencie cada contra-ataque individualmente'}</p>
                      </div>

                      {/* Defender navigation tabs */}
                      <div className="d-flex flex-wrap gap-1 mb-2">
                        {combatGroup.filter(gc => gc.status !== 'cancelled').map(gc => {
                          const isSelected = selectedCounterCombat?.id === gc.id;
                          const isFinished = gc.combat_phase === 'results';
                          const inCounterRound = gc.combat_phase === 'rolling' && gc.current_round > 1;
                          const waitingRound1 = gc.combat_phase === 'rolling' && gc.current_round === 1;
                          const btnClass = isFinished ? 'btn-secondary' : isSelected ? 'btn-primary' : inCounterRound ? 'btn-outline-warning' : waitingRound1 ? 'btn-outline-info' : 'btn-outline-secondary';
                          return (
                            <button
                              key={gc.id}
                              className={`btn btn-sm ${btnClass}`}
                              onClick={() => {
                                setActiveCombatId(gc.id);
                                setCombat(gc);
                              }}
                              disabled={isFinished}
                            >
                              {gc.defender_name} {isFinished ? '📊' : inCounterRound ? `R${gc.current_round}` : waitingRound1 ? '⏳' : ''}
                            </button>
                          );
                        })}
                      </div>

                      {/* Show selected combat's 1v1 counter-attack view */}
                      {selectedCounterCombat && selectedCounterCombat.current_round > 1 && (() => {
                        const sc = selectedCounterCombat;
                        const scRound = sc.round_data?.[sc.current_round - 1] || {};
                        const scIsCounterAttack = scRound.action_type === 'counter';
                        const scAttackerRolled = scRound.attacker?.rolled || false;
                        const scDefenderRolled = scRound.defender?.rolled || false;
                        
                        const scLeftPlayer = scIsCounterAttack ? {
                          name: sc.defender_name, weapon: sc.defender_weapon?.Name || (localization?.['UI.Combat.WeaponFallback'] || 'Arma'),
                          rolled: scDefenderRolled, data: scRound.defender, icon: '⚔️', className: 'attacker'
                        } : {
                          name: sc.attacker_name, weapon: sc.attack_data?.Name || combat.attack_data.Name,
                          rolled: scAttackerRolled, data: scRound.attacker, icon: '⚔️', className: 'attacker'
                        };
                        const scRightPlayer = scIsCounterAttack ? {
                          name: sc.attacker_name, weapon: 'Defesa',
                          rolled: scAttackerRolled, data: scRound.attacker, icon: '🛡️', className: 'defender'
                        } : {
                          name: sc.defender_name, weapon: 'Defesa',
                          rolled: scDefenderRolled, data: scRound.defender, icon: '🛡️', className: 'defender'
                        };

                        return (
                          <>
                            <div className="combat-round-header mb-2">
                              <div className="round-info">
                                <span className="round-label">vs {sc.defender_name} — {localization?.['UI.Combat.Round'] || 'Rodada'} {sc.current_round}/{sc.total_rounds}</span>
                              </div>
                            </div>

                            <div className="combatants-container mb-2">
                              <div className="combatant-card attacker-card">
                                <div className="combatant-header">
                                  <span className="combatant-icon">{scLeftPlayer.icon}</span>
                                  <h6 className="combatant-name">{scLeftPlayer.name}</h6>
                                </div>
                                <div className="combatant-weapon">{scLeftPlayer.weapon}</div>
                                {rolling && scIsCounterAttack && !isAttacker && (
                                  <div className="dice-animation-inline"><div className="dice-rolling-inline">
                                    {diceAnimation.map((die, i) => <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>)}
                                  </div></div>
                                )}
                                {scLeftPlayer.rolled && scLeftPlayer.data ? (
                                  <div className="combatant-result">
                                    <div className="dice-result-inline">
                                      {scLeftPlayer.data.roll.map((die, i) => <span key={i} className="die-number">{die}</span>)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="combatant-waiting"><span className="waiting-spinner">⏳</span><span>{localization?.['UI.Combat.Waiting'] || 'Aguardando...'}</span></div>
                                )}
                              </div>

                              <div className="vs-divider"><span className="vs-text">VS</span></div>

                              <div className="combatant-card defender-card">
                                <div className="combatant-header">
                                  <span className="combatant-icon">{scRightPlayer.icon}</span>
                                  <h6 className="combatant-name">{scRightPlayer.name}</h6>
                                </div>
                                <div className="combatant-weapon">{scRightPlayer.weapon}</div>
                                {rolling && !scIsCounterAttack && (
                                  <div className="dice-animation-inline"><div className="dice-rolling-inline">
                                    {diceAnimation.map((die, i) => <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>)}
                                  </div></div>
                                )}
                                {scRightPlayer.rolled && scRightPlayer.data ? (
                                  <div className="combatant-result">
                                    <div className="dice-result-inline">
                                      {scRightPlayer.data.roll.map((die, i) => <span key={i} className="die-number">{die}</span>)}
                                    </div>
                                  </div>
                                ) : !rolling && scIsCounterAttack && (
                                  <button className="btn-combat-roll-inline" onClick={rollDice}>
                                    <span className="btn-icon">🎲</span><span className="btn-text">{localization?.['UI.Combat.RollDefense'] || 'Rolar Defesa'}</span>
                                  </button>
                                )}
                                {!scRightPlayer.rolled && !rolling && !scIsCounterAttack && (
                                  <div className="combatant-waiting"><span className="waiting-spinner">⏳</span><span>{localization?.['UI.Combat.Waiting'] || 'Aguardando...'}</span></div>
                                )}
                              </div>
                            </div>

                            {scAttackerRolled && scDefenderRolled && !rolling && (
                              <button className="btn-combat-advance mb-2" onClick={async () => {
                                if (sc.current_round >= sc.total_rounds) {
                                  await supabase.from('combat_notifications').update({ combat_phase: 'results', updated_at: new Date().toISOString() }).eq('id', sc.id);
                                } else {
                                  await supabase.from('combat_notifications').update({ current_round: sc.current_round + 1, updated_at: new Date().toISOString() }).eq('id', sc.id);
                                }
                              }}>
                                <span className="btn-icon">{sc.current_round >= sc.total_rounds ? '✅' : '➡️'}</span>
                                <span className="btn-text">{sc.current_round >= sc.total_rounds ? (localization?.['UI.Combat.ViewResults'] || 'Ver Resultados') : (localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada')}</span>
                              </button>
                            )}
                          </>
                        );
                      })()}

                      {/* Summary of other defenders */}
                      {stillInRound1.length > 0 && (
                        <div className="alert alert-secondary py-1 px-2 mb-2">
                          <small>⏳ {localization?.['UI.Combat.WaitingRound1'] || 'Aguardando defesa de rodada 1:'} {stillInRound1.map(gc => gc.defender_name).join(', ')}</small>
                        </div>
                      )}
                      {finishedDefenders.length > 0 && (
                        <div className="alert alert-success py-1 px-2 mb-2">
                          <small>📊 {localization?.['UI.Combat.Finished'] || 'Finalizados:'} {finishedDefenders.map(gc => gc.defender_name).join(', ')}</small>
                        </div>
                      )}

                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        🚫 {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
                      </button>
                    </>
                  );
                }

                return (
                  <>
                    {/* Aviso e Ação de Espectador */}
                    {isSpectator && (
                      <>
                        <div className="alert alert-warning mb-2">
                          <small>
                            <strong>{localization?.['UI.Combat.SpectatorMode'] || '👁️ Modo Espectador'}</strong><br/>
                            {localization?.['UI.Combat.SpectatorWatching'] || 'Você está assistindo este combate.'}
                          </small>
                        </div>
                        
                        {/* Botão de Ataque de Oportunidade */}
                        {combat.allow_opportunity_attacks && 
                         !combat.opportunity_attacks_used?.includes(currentPlayer.id) && 
                         availableAttacks.length > 0 && (
                          <button 
                            className="btn btn-warning w-100 mb-2"
                            onClick={() => setShowOpportunityAttack(true)}
                          >
                            {localization?.['UI.Combat.OpportunityAttack'] || '⚡ Dar Ataque de Oportunidade'}
                          </button>
                        )}
                        
                        {combat.opportunity_attacks_used?.includes(currentPlayer.id) && (
                          <div className="alert alert-secondary mb-2 py-1 px-2">
                            <small style={{ fontSize: '10px' }}>
                              {localization?.['UI.Combat.OpportunityUsed'] || '✅ Você já usou seu ataque de oportunidade'}
                            </small>
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Header da rodada com indicador visual INTERATIVO */}
                    <div className="combat-round-header mb-2">
                      <div className="round-info">
                        <span className="round-label">{localization?.['UI.Combat.Round'] || 'Rodada'} {currentRound}/{totalRounds}</span>
                      </div>
                      <div className="round-indicators">
                        {combat.round_data.map((r, idx) => {
                          // Determinar classe de cor baseada no tipo de ação
                          let colorClass = 'round-dot-attack';
                          let actionLabel = localization?.['UI.Combat.RoundType.Attack'] || 'Ataque';
                          
                          if (r.action_type === 'opportunity') {
                            colorClass = 'round-dot-opportunity';
                            actionLabel = localization?.['UI.Combat.RoundType.Opportunity'] || 'Oportunidade';
                          } else if (r.action_type === 'counter') {
                            colorClass = 'round-dot-counter';
                            actionLabel = localization?.['UI.Combat.RoundType.Counter'] || 'Contra';
                          }
                          
                          const isCompleted = r.completed;
                          const isCurrent = idx + 1 === currentRound;
                          const canMove = !isCompleted && !isCurrent && idx >= currentRound;
                          const canMoveLeft = canMove && idx > 0 && idx > currentRound - 1 && !combat.round_data[idx - 1]?.completed;
                          const canMoveRight = canMove && idx < combat.round_data.length - 1;
                          
                          return (
                            <div key={idx} className="round-dot-container">
                              {canMoveLeft && (
                                <button
                                  className="round-dot-move-btn move-left"
                                  onClick={() => moveRoundLeft(idx)}
                                >◀</button>
                              )}
                              
                              <div
                                className={`round-dot ${colorClass} ${isCurrent ? 'round-dot-active' : ''} ${isCompleted ? 'round-dot-completed' : ''}`}
                                title={`${idx + 1}: ${actionLabel}`}
                              >
                                <span className="round-dot-number">{idx + 1}</span>
                              </div>
                              
                              {canMoveRight && (
                                <button
                                  className="round-dot-move-btn move-right"
                                  onClick={() => moveRoundRight(idx)}
                                >▶</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ========== OPÇÕES DE ALTERAÇÃO (COMPACTO) ========== */}
                    {canChangeEquipment && (
                      <div className="weapon-info-panel mb-2">
                        <details className="weapon-details">
                          <summary className="weapon-summary">
                            <span className="weapon-icon">🔄</span>
                            <span className="weapon-label">
                              {localization?.['UI.Combat.ChangeEquipment'] || 'Alterar Equipamento'}
                              {(() => {
                                const actor = currentPlayerData?.character?.actor;
                                const hasModes = actor?.mode1 && actor?.mode2;
                                if (hasModes) {
                                  const modeName = localization?.[actor[combatMode]] || actor[combatMode] || combatMode;
                                  return <span className="weapon-mode-indicator">{modeName}</span>;
                                }
                                return null;
                              })()}
                            </span>
                            <span className="toggle-icon">▼</span>
                        </summary>
                        
                        <div className="weapon-details-content">
                          {/* Opções de Mudança Durante Combate */}
                          <div className="weapon-change-section">
                            {/* Alternância de Modo (se personagem tiver modos) */}
                            {(() => {
                              const actor = currentPlayerData?.character?.actor;
                              const hasModes = actor?.mode1 && actor?.mode2;
                              
                              if (hasModes) {
                                const mode1Name = localization?.[actor.mode1] || actor.mode1 || 'Modo 1';
                                const mode2Name = localization?.[actor.mode2] || actor.mode2 || 'Modo 2';
                                
                                return (
                                  <div className="mode-switch-section">
                                    <div className="mode-switch-title">
                                      {localization?.['UI.Combat.CombatMode'] || '🔀 Modo de Combate'}
                                    </div>
                                    <div className="btn-group" role="group">
                                      <button
                                        type="button"
                                        className={`btn ${combatMode === 'mode1' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setCombatMode('mode1')}
                                      >
                                        {mode1Name}
                                      </button>
                                      <button
                                        type="button"
                                        className={`btn ${combatMode === 'mode2' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setCombatMode('mode2')}
                                      >
                                        {mode2Name}
                                      </button>
                                    </div>
                                    <div className="mode-info-text">
                                      {localization?.['UI.Combat.CombatModeHint'] || '✨ Alterna estatísticas e habilidades'}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            
                            {/* Trocar Arma */}
                            <button 
                              className="btn btn-sm btn-outline-warning w-100 mb-2"
                              onClick={openWeaponChange}
                              title={localization?.['UI.Combat.ChangeWeaponTooltip'] || 'Trocar arma (permanece até fim do combate)'}
                            >
                              {localization?.['UI.Combat.ChangeWeapon'] || '⚔️ Trocar Arma'} {tempWeapon && (localization?.['UI.Combat.Changed'] || '(Alterada)')}
                            </button>

                            {/* Ajustar Dados de Defesa */}
                            <div className="defense-adjustment">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                                  {localization?.['UI.Combat.DefenseDice'] || '🛡️ Dados de Defesa'}
                                </label>
                                <span className="badge bg-primary" style={{ fontSize: '16px', padding: '6px 12px' }}>
                                  {getCurrentDefenseDices()}
                                </span>
                              </div>
                              
                              {/* Slider Visual */}
                              <input
                                type="range"
                                className="form-range defense-slider"
                                min="0"
                                max="8"
                                value={getCurrentDefenseDices()}
                                onChange={(e) => handleDefenseDicesChange(parseInt(e.target.value))}
                                style={{ width: '100%' }}
                              />
                              
                              {/* Marcações de referência */}
                              <div className="d-flex justify-content-between text-muted" style={{ fontSize: '10px', marginTop: '4px' }}>
                                <span>0</span>
                                <span>2</span>
                                <span>4</span>
                                <span>6</span>
                                <span>8</span>
                              </div>
                              
                              <div className="d-flex gap-2 mt-2">
                                <button 
                                  className="btn btn-sm btn-outline-secondary flex-fill"
                                  onClick={() => handleDefenseDicesChange(currentPlayerData?.character?.actor?.NumberOfDefenseDices || 0)}
                                >
                                  {localization?.['UI.Combat.ResetDefense'] || '↺ Resetar'}
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-primary flex-fill"
                                  onClick={() => adjustDefenseDices(-2)}
                                >
                                  −2
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-primary flex-fill"
                                  onClick={() => adjustDefenseDices(+2)}
                                >
                                  +2
                                </button>
                              </div>
                              
                              <small className="text-muted d-block mt-2 text-center">
                                {tempDefenseDices !== null && tempDefenseDices !== (currentPlayerData?.character?.actor?.NumberOfDefenseDices || 0) ? 
                                  (localization?.['UI.Combat.DefenseChanged'] || '✅ Valor alterado temporariamente') : 
                                  (localization?.['UI.Combat.DefenseSliderHint'] || '💡 Arraste o slider para ajustar')}
                              </small>
                            </div>
                            
                            {/* Gerenciamento de Rodadas */}
                            <div className="round-management mt-3">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                                  {localization?.['UI.Combat.ManageRounds'] || '⚔️ Gerenciar Rodadas'}
                                </label>
                                <span className="badge bg-warning text-dark" style={{ fontSize: '14px', padding: '4px 10px' }}>
                                  {totalRounds} {localization?.['UI.Combat.RoundsCount'] || 'rodadas'}
                                </span>
                              </div>
                              
                              {/* Botões para adicionar rodadas específicas */}
                              <div className="d-flex gap-2 mb-2">
                                <button 
                                  className="btn btn-sm btn-outline-primary flex-fill"
                                  onClick={() => addRound('attacker')}
                                  title={localization?.['UI.Combat.AddAttackRoundTooltip'] || 'Adicionar rodada de ATAQUE (atacante age)'}
                                >
                                  {localization?.['UI.Combat.AddAttackRound'] || '⚔️ + Ataque'}
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-info flex-fill"
                                  onClick={() => addRound('defender')}
                                  title={localization?.['UI.Combat.AddCounterRoundTooltip'] || 'Adicionar rodada de CONTRA-ATAQUE (defensor age)'}
                                >
                                  {localization?.['UI.Combat.AddCounterRound'] || '🛡️ + Contra'}
                                </button>
                              </div>
                              
                              {/* Botão para remover */}
                              <button 
                                className="btn btn-sm btn-outline-danger w-100"
                                onClick={() => removeRound()}
                                disabled={totalRounds <= 1}
                                title={localization?.['UI.Combat.RemoveLastRoundTooltip'] || 'Remover última rodada'}
                              >
                                {localization?.['UI.Combat.RemoveLastRound'] || '− Remover Última Rodada'}
                              </button>
                              
                              <small className="text-muted d-block mt-2 text-center" style={{ fontSize: '10px' }}>
                                {localization?.['UI.Combat.ReorderHint'] || '💡 Arraste os indicadores de rodada acima para reordenar'}
                              </small>
                            </div>

                            {/* Trocar Defensor (atacante ou defensor) */}
                            {(isAttacker || isDefender) && (
                              <div className="defender-swap-section mt-3">
                                {renderSwapDefenderSection({ btnClass: 'btn-outline-danger', listClass: 'swap-targets-list' })}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>
                    )}

                    {/* Combatentes com Informações de Armas */}
                    <div className="combatants-container mb-2">
                      {/* Atacante/Ação Principal */}
                      <div className="combatant-card attacker-card">
                        <div className="combatant-header">
                          <span className="combatant-icon">{leftPlayer.icon}</span>
                          <h6 className="combatant-name">{leftPlayer.name}</h6>
                        </div>
                        <div className="combatant-weapon">{leftPlayer.weapon}</div>
                        
                        {/* Estatísticas da Arma do Atacante (leftPlayer sempre é quem ataca nesta rodada) */}
                        <div className="weapon-stats-compact">
                          {(() => {
                            // leftPlayer sempre é quem está atacando nesta rodada
                            // Usar arma do banco de dados (já atualizada quando trocada)
                            let weapon;
                            
                            if (isOpportunityRound) {
                              // Rodada de oportunidade: usar arma do atacante de oportunidade
                              weapon = roundInfo.opportunity_weapon;
                            } else if (isAttackerActing) {
                              // Rodada de ataque normal: atacante usa attack_data
                              weapon = combat.attack_data;
                            } else {
                              // Rodada de contra-ataque: defensor usa defender_weapon
                              weapon = combat.defender_weapon;
                            }
                            
                            // Aplicar modo se disponível
                            const weaponWithMode = weapon ? (getWeaponWithMode(weapon) || weapon) : null;
                            
                            return (
                              <>
                                <span className="stat-compact" title={localization?.['UI.Combat.DiceTitle'] || 'Dados de Ataque'}>
                                  🎲 {weaponWithMode?.Dices || '?'}
                                </span>
                                <span className="stat-compact" title={localization?.['UI.Combat.LoadTimeTitle'] || 'Tempo de Recarga'}>
                                  ⚡ {weaponWithMode?.LoadTime || '?'}
                                </span>
                                <span className="stat-compact" title={localization?.['UI.Combat.DamageTitle'] || 'Dano'}>
                                  💥 {weaponWithMode?.Damage || '0'}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                        
                        {/* Animação de dados inline para este jogador */}
                        {rolling && (
                          isOpportunityRound ? 
                            (currentPlayer.id === roundInfo.opportunity_attacker_id) :
                            ((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker))
                        ) && (
                          <div className="dice-animation-inline">
                            <div className="dice-rolling-inline">
                              {diceAnimation.map((die, i) => (
                                <span key={`${die}-${i}`} className="die-animated-inline">
                                  {die}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {leftPlayer.rolled && leftPlayer.data ? (
                          <div className="combatant-result">
                            {/* Verificar se o jogador atual pode ajustar esses dados */}
                            {(
                              isOpportunityRound ?
                                (currentPlayer.id === roundInfo.opportunity_attacker_id) :
                                (((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) && !isSpectator)
                            ) ? (
                              <DiceResultAdjuster 
                                diceArray={leftPlayer.data.roll}
                                onAdjust={(newDice) => adjustDiceResult(newDice, isAttackerActing)}
                                playerRole="left"
                                localization={localization}
                              />
                            ) : (
                              <div className="dice-result-inline">
                                {leftPlayer.data.roll.map((die, i) => (
                                  <span key={i} className="die-number">{die}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : !rolling && (
                          <>
                            {/* Botão de rolar para o jogador da esquerda */}
                            {(
                              isOpportunityRound ?
                                (currentPlayer.id === roundInfo.opportunity_attacker_id) :
                                (((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) && !isSpectator)
                            ) && (
                              <button 
                                className="btn-combat-roll-inline"
                                onClick={rollDice}
                                disabled={isOpportunityRound ? false : waitingForAttacker}
                              >
                                <span className="btn-icon">🎲</span>
                                <span className="btn-text">{localization?.['UI.Combat.Roll'] || 'Rolar'}</span>
                              </button>
                            )}
                            {(
                              isOpportunityRound ?
                                (currentPlayer.id !== roundInfo.opportunity_attacker_id) :
                                ((!((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) || isSpectator))
                            ) && (
                              <div className="combatant-waiting">
                                <span className="waiting-spinner">⏳</span>
                                <span>{isSpectator ? (localization?.['UI.Combat.Spectator'] || 'Espectador') : (localization?.['UI.Combat.Waiting'] || 'Aguardando...')}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* VS Divider */}
                      <div className="vs-divider">
                        <span className="vs-text">VS</span>
                      </div>

                      {/* Defensor/Reação */}
                      <div className="combatant-card defender-card">
                        <div className="combatant-header">
                          <span className="combatant-icon">{rightPlayer.icon}</span>
                          <h6 className="combatant-name">{rightPlayer.name}</h6>
                        </div>
                        <div className="combatant-weapon">{rightPlayer.weapon}</div>
                        
                        {/* Estatísticas de Defesa do rightPlayer (sempre está defendendo) */}
                        <div className="weapon-stats-compact weapon-stats-enemy">
                          {(() => {
                            // rightPlayer sempre defende
                            // Buscar dados de defesa de quem está defendendo nesta rodada
                            let defenseDices = '?';
                            
                            if (isOpportunityRound) {
                              // Rodada de ataque de oportunidade: alvo está defendendo
                              const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
                              const targetId = targetIsAttacker ? combat.attacker_id : combat.defender_id;
                              
                              if (targetId === currentPlayer?.id) {
                                // É o próprio jogador - usar valor local
                                defenseDices = getCurrentDefenseDices();
                              } else if (targetIsAttacker) {
                                // Alvo é o atacante original
                                if (combat.attacker_defense_dices !== null && combat.attacker_defense_dices !== undefined) {
                                  defenseDices = combat.attacker_defense_dices;
                                } else {
                                  const attackerPlayer = players.find(p => p.id === combat.attacker_id);
                                  defenseDices = attackerPlayer?.character?.actor?.NumberOfDefenseDices || '?';
                                }
                              } else {
                                // Alvo é o defensor original
                                if (combat.defender_defense_dices !== null && combat.defender_defense_dices !== undefined) {
                                  defenseDices = combat.defender_defense_dices;
                                } else {
                                  const defenderPlayer = players.find(p => p.id === combat.defender_id);
                                  defenseDices = defenderPlayer?.character?.actor?.NumberOfDefenseDices || '?';
                                }
                              }
                            } else if (isAttackerActing) {
                              // Rodada de ataque normal: defensor (defender_id) está defendendo
                              // Usar dados do banco ou do jogador atual se for o próprio
                              if (combat.defender_id === currentPlayer?.id) {
                                // É o próprio jogador - usar valor local
                                defenseDices = getCurrentDefenseDices();
                              } else if (combat.defender_defense_dices !== null && combat.defender_defense_dices !== undefined) {
                                // Usar valor do banco de dados
                                defenseDices = combat.defender_defense_dices;
                              } else {
                                // Fallback: buscar dados do defensor na lista de players
                                const defenderPlayer = players.find(p => p.id === combat.defender_id);
                                defenseDices = defenderPlayer?.character?.actor?.NumberOfDefenseDices || '?';
                              }
                            } else {
                              // Rodada de contra-ataque: atacante (attacker_id) está defendendo
                              // Usar dados do banco ou do jogador atual se for o próprio
                              if (combat.attacker_id === currentPlayer?.id) {
                                // É o próprio jogador - usar valor local
                                defenseDices = getCurrentDefenseDices();
                              } else if (combat.attacker_defense_dices !== null && combat.attacker_defense_dices !== undefined) {
                                // Usar valor do banco de dados
                                defenseDices = combat.attacker_defense_dices;
                              } else {
                                // Fallback: buscar dados do atacante na lista de players
                                const attackerPlayer = players.find(p => p.id === combat.attacker_id);
                                defenseDices = attackerPlayer?.character?.actor?.NumberOfDefenseDices || '?';
                              }
                            }
                            
                            return (
                              <span className="stat-compact" title={localization?.['UI.Combat.DefenseDiceTitle'] || 'Dados de Defesa'}>
                                🛡️ {defenseDices}
                              </span>
                            );
                          })()}
                        </div>
                        
                        {/* Animação de dados inline para este jogador */}
                        {rolling && (
                          isOpportunityRound ?
                            (
                              (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                              (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)
                            ) :
                            ((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker))
                        ) && (
                          <div className="dice-animation-inline">
                            <div className="dice-rolling-inline">
                              {diceAnimation.map((die, i) => (
                                <span key={`${die}-${i}`} className="die-animated-inline">
                                  {die}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {rightPlayer.rolled && rightPlayer.data ? (
                          <div className="combatant-result">
                            {/* Verificar se o jogador atual pode ajustar esses dados */}
                            {(
                              isOpportunityRound ?
                                (
                                  (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                                  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)
                                ) :
                                ((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker)) && !isSpectator
                            ) ? (
                              <DiceResultAdjuster 
                                diceArray={rightPlayer.data.roll}
                                onAdjust={(newDice) => adjustDiceResult(newDice, !isAttackerActing)}
                                playerRole="right"
                                localization={localization}
                              />
                            ) : (
                              <div className="dice-result-inline">
                                {rightPlayer.data.roll.map((die, i) => (
                                  <span key={i} className="die-number">{die}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : !rolling && (
                          <>
                            {/* Botão de rolar para o jogador da direita */}
                            {(
                              isOpportunityRound ?
                                (
                                  ((roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                                  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)) &&
                                  roundInfo.attacker?.rolled  // Atacante de oportunidade deve rolar primeiro
                                ) :
                                (((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker)) && !waitingForAttacker && !isSpectator)
                            ) && (
                              <button 
                                className="btn-combat-roll-inline"
                                onClick={rollDice}
                              >
                                <span className="btn-icon">🎲</span>
                                <span className="btn-text">{localization?.['UI.Combat.Roll'] || 'Rolar'}</span>
                              </button>
                            )}
                            {(
                              isOpportunityRound ?
                                !(
                                  ((roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                                  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)) &&
                                  roundInfo.attacker?.rolled
                                ) :
                                ((waitingForAttacker && ((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker))) || (!((isAttackerActing && !isAttacker) || (!isAttackerActing && isAttacker))) || isSpectator)
                            ) && (
                              <div className="combatant-waiting">
                                <span className="waiting-spinner">⏳</span>
                                <span>{isSpectator ? (localization?.['UI.Combat.Spectator'] || 'Espectador') : (isOpportunityRound && !roundInfo.attacker?.rolled ? (localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...') : (waitingForAttacker ? (localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...') : (localization?.['UI.Combat.Waiting'] || 'Aguardando...')))}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Botão para avançar rodada */}
                    {attackerRolled && defenderRolled && !rolling && !isSpectator && (
                      <button className="btn-combat-advance mb-2" onClick={advanceRound}>
                        <span className="btn-icon">{currentRound >= totalRounds ? '✅' : '➡️'}</span>
                        <span className="btn-text">
                          {currentRound >= totalRounds ? (localization?.['UI.Combat.ViewResults'] || 'Ver Resultados') : (localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada')}
                        </span>
                      </button>
                    )}

                    {!isSpectator && (
                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        <span className="me-2">🚫</span>
                        {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
                      </button>
                    )}
                  </>
                );
              })()}

              {/* FASE 3: RESULTADOS */}
              {combat.combat_phase === 'results' && (() => {
                const roundData = combat.round_data || [];
                const isAttacker = currentPlayer.id === combat.attacker_id;
                const isMultiGroup = combatGroup.length > 1;

                // Multi-defender group results for attacker
                if (isMultiGroup && isAttacker) {
                  return (
                    <>
                      <div className="combat-results-header mb-3">
                        <div className="results-title">
                          <span className="results-icon">📊</span>
                          <h5 className="mb-0">{localization?.['UI.Combat.ResultsMultiTarget'] || 'Resultados — Multi-Alvo'}</h5>
                        </div>
                      </div>

                      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {combatGroup.filter(gc => gc.status !== 'cancelled').map(gc => {
                          const gcRounds = gc.round_data || [];
                          return (
                            <div key={gc.id} className="card bg-dark border-secondary mb-2">
                              <div className="card-header py-1 px-2">
                                <strong className="text-white small">{combat.attacker_name} ⚔️ vs 🛡️ {gc.defender_name}</strong>
                                <span className={`badge ms-2 ${gc.combat_phase === 'results' ? 'bg-success' : 'bg-warning text-dark'}`}>
                                  {gc.combat_phase === 'results' ? (localization?.['UI.Combat.StatusFinished'] || 'Finalizado') : gc.combat_phase}
                                </span>
                              </div>
                              <div className="card-body p-2">
                                {gcRounds.map((round, idx) => {
                                  const atkRoll = round.attacker?.roll || [];
                                  const defRoll = round.defender?.roll || [];
                                  const label = round.action_type === 'counter' ? (localization?.['UI.Combat.RoundType.Counter'] || 'Contra') : round.action_type === 'opportunity' ? (localization?.['UI.Combat.RoundType.Opportunity'] || 'Oportunidade') : (localization?.['UI.Combat.RoundType.Attack'] || 'Ataque');
                                  return (
                                    <div key={idx} className="mb-1 small text-white">
                                      <span className="text-muted">R{round.round} ({label}):</span>
                                      {' '}⚔️ [{atkRoll.join(',')}]={round.attacker?.total || 0}
                                      {' '}🛡️ [{defRoll.join(',')}]={round.defender?.total || 0}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button className="btn btn-danger w-100 mt-3" onClick={endCombat}>
                        <span className="me-2">✅</span>
                        Encerrar Todos os Combates
                      </button>
                    </>
                  );
                }

                // eslint-disable-next-line no-unused-vars
                const _endSingleCombat = endSingleCombat; // available for future per-defender cancel

                return (
                  <>
                    {/* Header de Resultados */}
                    <div className="combat-results-header mb-3">
                      <div className="results-title">
                        <span className="results-icon">📊</span>
                        <h5 className="mb-0">{localization?.['UI.Combat.ResultsTitle'] || 'Resultado do Combate'}</h5>
                      </div>
                      <div className="results-fighters">
                        <span className="fighter-name attacker-name">{combat.attacker_name}</span>
                        <span className="vs-small">VS</span>
                        <span className="fighter-name defender-name">{combat.defender_name}</span>
                      </div>
                    </div>

                    {/* Histórico de Rodadas */}
                    <div className="combat-results-rounds" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {roundData.map((round, idx) => {
                        // Determinar tipo de rodada
                        const isCounterAttack = round.action_type === 'counter';
                        const isOpportunityRound = round.action_type === 'opportunity';
                        
                        // Extrair dados de ataque e defesa (podem ser objetos ou arrays)
                        const attackerRollData = Array.isArray(round.attacker_roll) 
                          ? round.attacker_roll 
                          : (round.attacker?.roll || []);
                        
                        const defenderRollData = Array.isArray(round.defender_roll)
                          ? round.defender_roll
                          : (round.defender?.roll || []);
                        
                        // Nomes e ícones baseados no tipo de rodada
                        let displayAttackerName, displayDefenderName, attackerIcon, defenderIcon, roundLabel;
                        
                        if (isOpportunityRound) {
                          // Rodada de oportunidade: usar opportunity_attacker_name
                          displayAttackerName = round.opportunity_attacker_name || (localization?.['UI.Combat.Spectator'] || 'Espectador');
                          attackerIcon = '⚡';
                          roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.OpportunityAttack'] || 'Ataque de Oportunidade'}`;
                          
                          // Defensor é o alvo escolhido (attacker ou defender original)
                          if (round.opportunity_target === 'attacker') {
                            displayDefenderName = combat.attacker_name;
                          } else {
                            displayDefenderName = combat.defender_name;
                          }
                          defenderIcon = '🛡️';
                        } else if (isCounterAttack) {
                          // Contra-ataque: defender ataca, attacker defende
                          displayAttackerName = combat.defender_name;
                          displayDefenderName = combat.attacker_name;
                          attackerIcon = '⚔️';
                          defenderIcon = '🛡️';
                          roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.CounterAttack'] || 'Contra-Ataque'}`;
                        } else {
                          // Ataque normal
                          displayAttackerName = combat.attacker_name;
                          displayDefenderName = combat.defender_name;
                          attackerIcon = '⚔️';
                          defenderIcon = '🛡️';
                          roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.Attack'] || 'Ataque'}`;
                        }
                        
                        return (
                          <div key={idx} className="round-result-card">
                            <div className="round-result-header">
                              <span className="round-badge">{roundLabel}</span>
                            </div>
                            
                            <div className="round-result-body">
                              {/* Atacante */}
                              <div className="result-player attacker-result">
                                <div className="result-player-name">
                                  <span className="player-icon">{attackerIcon}</span>
                                  <span>{displayAttackerName}</span>
                                </div>
                                <div className="dice-result-final">
                                  {attackerRollData.map((die, i) => (
                                    <span key={i} className="die-number-final">{die}</span>
                                  ))}
                                </div>
                              </div>

                              {/* Defensor */}
                              <div className="result-player defender-result">
                                <div className="result-player-name">
                                  <span className="player-icon">{defenderIcon}</span>
                                  <span>{displayDefenderName}</span>
                                </div>
                                <div className="dice-result-final">
                                  {defenderRollData.map((die, i) => (
                                    <span key={i} className="die-number-final">{die}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button className="btn btn-danger w-100 mt-3" onClick={endCombat}>
                      <span className="me-2">✅</span>
                      {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
                    </button>
                  </>
                );
              })()}
            </>
          ) : (
            /* ========== INICIAR NOVO COMBATE ========== */
            <>
              {/* Verificar se há partida ativa */}
              {matchStatus !== 'in_progress' ? (
                <div className="alert alert-info">
                  <p className="mb-0">
                    {localization?.['UI.Combat.StartMatchRequired'] || '🏁 Inicie uma partida antes de iniciar combates!'}
                  </p>
                </div>
              ) : !currentPlayerData?.character?.selections ? (
                <div className="alert alert-warning">
                  <p className="mb-0">
                    {localization?.['UI.Combat.CreateCharacterRequired'] || '⚠️ Você precisa criar um personagem antes de iniciar combates!'}
                  </p>
                </div>
              ) : (
            <>
              {/* Alternância de Modo ANTES de iniciar combate */}
              {(() => {
                const actor = currentPlayerData?.character?.actor;
                const hasModes = actor?.mode1 && actor?.mode2;
                
                if (hasModes) {
                  const mode1Name = localization?.[actor.mode1] || actor.mode1 || 'Modo 1';
                  const mode2Name = localization?.[actor.mode2] || actor.mode2 || 'Modo 2';
                  
                  return (
                    <div className="mode-switch-section mb-3">
                      <div className="mode-switch-title">
                        {localization?.['UI.Combat.CombatMode'] || '🔀 Modo de Combate'}
                      </div>
                      <div className="btn-group" role="group">
                        <button
                          type="button"
                          className={`btn ${combatMode === 'mode1' ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => setCombatMode('mode1')}
                        >
                          {mode1Name}
                        </button>
                        <button
                          type="button"
                          className={`btn ${combatMode === 'mode2' ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => setCombatMode('mode2')}
                        >
                          {mode2Name}
                        </button>
                      </div>
                      <div className="mode-info-text">
                        {localization?.['UI.Combat.ModeDefinesHint'] || '✨ Define ataques/armas e estatísticas disponíveis'}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Seção: Selecionar Ataque */}
              <div className="mb-4">
                <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
                  {localization?.['UI.Combat.SelectAttackSection'] || '1️⃣ Selecione seu Ataque/Arma'}
                </h6>

                {/* Lista de ataques/armas disponíveis + Ataque Personalizado como opção */}
                <div className="d-flex flex-column gap-2">
                  {availableAttacks.length === 0 && (
                    <div className="alert alert-info mb-2">
                      <small>{localization?.['UI.Combat.NoAttacksAvailable'] || 'Você não possui ataques ou armas disponíveis.'}</small>
                    </div>
                  )}

                  {availableAttacks.map((attack, idx) => {
                    const isSelected = selectedAttack?.Name === attack.Name;
                    const actor = currentPlayerData?.character?.actor;
                    const hasModes = actor?.mode1 && actor?.mode2;
                    return (
                      <div
                        key={idx}
                        className={`card border ${
                          isSelected ? 'border-success bg-success bg-opacity-25' : 'border-secondary'
                        } cursor-pointer`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedAttack({ ...attack })}
                      >
                        <div className="card-body p-2">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div style={{ flex: 1 }}>
                              <h6 className="text-white mb-1 small">
                                {attack.Name}
                                {hasModes && attack.modes && (
                                  <span className="weapon-mode-indicator ms-1" style={{ fontSize: '9px', padding: '1px 6px' }}>{localization?.[actor[combatMode]] || actor[combatMode] || combatMode}</span>
                                )}
                              </h6>
                              <div className="d-flex gap-2 flex-wrap">
                                <small className="text-muted">🎲 {attack.Dices || '1'}</small>
                                <small className="text-muted">⏱️ {attack.LoadTime || '?'}</small>
                                <small className="text-muted">💥 {attack.Damage || '0'}</small>
                                {attack.Distance && <small className="text-muted">📏 {attack.Distance}</small>}
                                <span className="badge bg-secondary">{attack.category}</span>
                              </div>
                              {attack.Description && (
                                <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>
                                  {attack.Description}
                                </small>
                              )}
                              {attack.Effects && (
                                <small className="text-warning d-block mt-1" style={{ fontSize: '10px' }}>
                                  ✨ {attack.Effects}
                                </small>
                              )}
                            </div>
                            {isSelected && <span className="text-success ms-2">✓</span>}
                          </div>

                          {/* Quando selecionado mostramos controles editáveis; caso contrário apenas o resumo */}
                          {isSelected ? (
                            <div className="mt-2">
                              <div className="row g-2 mb-2">
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={selectedAttack.Dices}
                                    onChange={(e) => setSelectedAttack({ ...selectedAttack, Dices: e.target.value })}
                                    min="1"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={selectedAttack.LoadTime}
                                    onChange={(e) => setSelectedAttack({ ...selectedAttack, LoadTime: e.target.value })}
                                    min="0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={selectedAttack.Damage}
                                    onChange={(e) => setSelectedAttack({ ...selectedAttack, Damage: e.target.value })}
                                    min="0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {/* Card de Ataque Personalizado - mostra resumo quando não selecionado, inputs quando selecionado */}
                  {(() => {
                    const isCustomSelected = selectedAttack?.Name === customAttack.Name;
                    return (
                      <div
                        className={`card border ${isCustomSelected ? 'border-warning bg-warning bg-opacity-25' : 'border-warning'} cursor-pointer`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedAttack({ ...customAttack })}
                      >
                        <div className="card-body p-2">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="text-warning mb-0 small">{localization?.['UI.Combat.CustomAttackCard'] || '⚙️ Ataque Personalizado'}</h6>
                            {isCustomSelected && <span className="text-warning">✓</span>}
                          </div>

                          {!isCustomSelected ? (
                            <div>
                              <div className="d-flex gap-2 flex-wrap">
                                <small className="text-muted">🎲 {customAttack.Dices || '1'}</small>
                                <small className="text-muted">⏱️ {customAttack.LoadTime || '?'}</small>
                                <small className="text-muted">💥 {customAttack.Damage || '0'}</small>
                                <span className="badge bg-secondary">{customAttack.category}</span>
                              </div>
                              <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>{customAttack.Effects}</small>
                            </div>
                          ) : (
                            <div className="mt-2">
                              <div className="mb-2">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.WeaponName'] || 'Nome:'}</label>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={customAttack.Name}
                                  onChange={(e) => setCustomAttack({ ...customAttack, Name: e.target.value })}
                                  placeholder={localization?.['UI.Combat.AttackNamePlaceholder'] || 'Nome do ataque'}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="row g-2 mb-2">
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={customAttack.Dices}
                                    onChange={(e) => setCustomAttack({ ...customAttack, Dices: e.target.value })}
                                    min="1"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={customAttack.LoadTime}
                                    onChange={(e) => setCustomAttack({ ...customAttack, LoadTime: e.target.value })}
                                    min="0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={customAttack.Damage}
                                    onChange={(e) => setCustomAttack({ ...customAttack, Damage: e.target.value })}
                                    min="0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Seção: Selecionar Alvos */}
              <div className="mb-4">
                <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
                  {localization?.['UI.Combat.SelectTargetSection'] || '2️⃣ Selecione o(s) Alvo(s)'}
                </h6>
                
                {availableTargets.length === 0 ? (
                  <div className="alert alert-info">
                    <small>{localization?.['UI.Combat.NoTargetsAvailable'] || 'Nenhum jogador disponível para combate no momento.'}</small>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {availableTargets.map((player) => (
                      <div
                        key={player.id}
                        className={`card border ${
                          selectedDefenders.includes(player.id)
                            ? 'border-primary bg-primary bg-opacity-25'
                            : 'border-secondary'
                        } cursor-pointer`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleDefenderSelection(player.id)}
                      >
                        <div className="card-body p-2">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <h6 className="text-white mb-0 small">
                                {player.name}
                              </h6>
                              <small className="text-muted" style={{ fontSize: '11px' }}>
                                {typeof player.character?.actor === 'object' 
                                  ? (player.character?.actor?.Name || (localization?.['UI.Combat.CharacterFallback'] || 'Personagem'))
                                  : (player.character?.actor || (localization?.['UI.Combat.CharacterFallback'] || 'Personagem'))}
                              </small>
                            </div>
                            {selectedDefenders.includes(player.id) && (
                              <span className="text-primary">✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção: Opções */}
              <div className="mb-4">
                <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
                  {localization?.['UI.Combat.OptionsSection'] || '3️⃣ Opções de Combate'}
                </h6>
                
                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="singleAttack"
                    checked={!allowCounterAttack}
                    onChange={(e) => setAllowCounterAttack(!e.target.checked)}
                  />
                  <label className="form-check-label text-white" htmlFor="singleAttack">
                    <small>{localization?.['UI.Combat.SingleAttack'] || 'Ataque único (não pode revidar)'}</small>
                  </label>
                </div>
                
                {!allowCounterAttack && (
                  <div className="alert alert-warning mt-2 py-1 px-2 mb-2">
                    <small style={{ fontSize: '10px' }}>
                      {localization?.['UI.Combat.SingleAttackHint'] || '⚡ Apenas 1 rodada de ataque sem possibilidade de defesa'}
                    </small>
                  </div>
                )}
                
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="opportunityAttacks"
                    checked={allowOpportunityAttacks}
                    onChange={(e) => setAllowOpportunityAttacks(e.target.checked)}
                  />
                  <label className="form-check-label text-white" htmlFor="opportunityAttacks">
                    <small>{localization?.['UI.Combat.AllowOpportunity'] || 'Permitir ataques de oportunidade'}</small>
                  </label>
                </div>
                
                {allowOpportunityAttacks && (
                  <div className="alert alert-info mt-2 py-1 px-2">
                    <small style={{ fontSize: '10px' }}>
                      {localization?.['UI.Combat.AllowOpportunityHint'] || '👁️ Espectadores podem dar 1 ataque de oportunidade'}
                    </small>
                  </div>
                )}
              </div>

              {/* Botão Iniciar Combate */}
              <button
                className="btn btn-danger w-100 fw-bold"
                onClick={handleStartCombat}
                disabled={
                  loading ||
                  !selectedAttack ||
                  selectedDefenders.length === 0
                }
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    {localization?.['UI.Combat.Starting'] || 'Iniciando...'}
                  </>
                ) : (
                  <>
                    {localization?.['UI.Combat.StartCombat'] || '⚔️ Iniciar Combate'}
                    {selectedDefenders.length > 0 && ` (${selectedDefenders.length})`}
                  </>
                )}
              </button>

              {/* Resumo da seleção */}
              {selectedAttack && selectedDefenders.length > 0 && (
                <div className="alert alert-dark mt-3 py-2 px-2">
                  <small className="text-white" style={{ fontSize: '11px' }}>
                    <strong>{localization?.['UI.Combat.Summary'] || 'Resumo:'}</strong><br/>
                    {localization?.['UI.Combat.SummaryAttack'] || '🎯 Ataque:'} {selectedAttack.Name}<br/>
                    {localization?.['UI.Combat.SummaryTargets'] || '👥 Alvos:'} {selectedDefenders.length}<br/>
                    {localization?.['UI.Combat.SummaryType'] || '⚡ Tipo:'} {allowCounterAttack ? (localization?.['UI.Combat.FullCombat'] || 'Combate Completo') : (localization?.['UI.Combat.SingleAttackType'] || 'Ataque Único')}
                  </small>
                </div>
              )}
            </>
          )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Seleção de Arma Durante Combate */}
      {showWeaponChange && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
            onClick={() => setShowWeaponChange(false)}
          />
          <div
            className="position-fixed top-50 start-50 translate-middle bg-dark border border-warning rounded p-3"
            style={{ 
              zIndex: 2001, 
              maxWidth: '400px', 
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="text-warning mb-0">
                <span className="me-2">⚔️</span>
                {localization?.['UI.Combat.WeaponChangeTitle'] || '⚔️ Trocar Arma'}
              </h5>
              <button
                className="btn-close btn-close-white"
                onClick={() => setShowWeaponChange(false)}
              />
            </div>

            <div className="alert alert-info py-2 px-2 mb-3">
              <small>
                {localization?.['UI.Combat.WeaponChangeHint'] || '💡 A alteração permanece até o fim do combate'}
              </small>
            </div>

            {/* Lista de Armas Disponíveis */}
            <div className="d-flex flex-column gap-2">
              {availableAttacks.map((attack, idx) => {
                const isSelected = tempWeapon?.Name === attack.Name;
                return (
                  <div
                    key={idx}
                    className={`card border ${isSelected ? 'border-warning bg-warning bg-opacity-25' : 'border-secondary'} cursor-pointer`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setTempWeapon({ ...attack })}
                  >
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div style={{ flex: 1 }}>
                          <h6 className="text-white mb-1 small">{attack.Name}</h6>
                          <div className="d-flex gap-2 flex-wrap">
                            <small className="text-muted">⚡ {attack.LoadTime}</small>
                            <small className="text-muted">💥 {attack.Damage}</small>
                            {attack.Distance && <small className="text-muted">📏 {attack.Distance}</small>}
                          </div>
                          {attack.Effects && (
                            <small className="text-info d-block mt-1">✨ {attack.Effects}</small>
                          )}
                        </div>
                        {isSelected && <span className="text-warning ms-2">✓</span>}
                      </div>

                      {/* Quando selecionada mostramos controles editáveis */}
                      {isSelected ? (
                        <div className="mt-2">
                          <div className="row g-2 mb-2">
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={tempWeapon.Dices}
                                onChange={(e) => setTempWeapon({ ...tempWeapon, Dices: e.target.value })}
                                min="1"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={tempWeapon.LoadTime}
                                onChange={(e) => setTempWeapon({ ...tempWeapon, LoadTime: e.target.value })}
                                min="0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={tempWeapon.Damage}
                                onChange={(e) => setTempWeapon({ ...tempWeapon, Damage: e.target.value })}
                                min="0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {/* Ataque Customizado */}
              {(() => {
                const isCustom = tempWeapon?.Name === customAttack.Name;
                return (
                  <div
                    className={`card border ${isCustom ? 'border-warning bg-warning bg-opacity-25' : 'border-warning'} cursor-pointer`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setTempWeapon({ ...customAttack })}
                  >
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="text-warning mb-0 small">{localization?.['UI.Combat.CustomAttackCard'] || '⚙️ Ataque Personalizado'}</h6>
                        {isCustom && <span className="text-warning">✓</span>}
                      </div>
                      {!isCustom ? (
                        <div>
                          <div className="d-flex gap-2 flex-wrap">
                            <small className="text-muted">🎲 {customAttack.Dices || '1'}</small>
                            <small className="text-muted">⏱️ {customAttack.LoadTime || '?'}</small>
                            <small className="text-muted">💥 {customAttack.Damage || '0'}</small>
                            <span className="badge bg-secondary">{customAttack.category}</span>
                          </div>
                          <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>{customAttack.Effects}</small>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="mb-2">
                            <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.WeaponName'] || 'Nome:'}</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={customAttack.Name}
                              onChange={(e) => {
                                const updated = { ...customAttack, Name: e.target.value };
                                setCustomAttack(updated);
                                if (tempWeapon?.Name === customAttack.Name) setTempWeapon(updated);
                              }}
                              placeholder={localization?.['UI.Combat.AttackNamePlaceholder'] || 'Nome do ataque'}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="row g-2 mb-2">
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={customAttack.Dices}
                                onChange={(e) => {
                                  const updated = { ...customAttack, Dices: e.target.value };
                                  setCustomAttack(updated);
                                  if (tempWeapon?.Name === customAttack.Name) setTempWeapon(updated);
                                }}
                                min="1"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={customAttack.LoadTime}
                                onChange={(e) => {
                                  const updated = { ...customAttack, LoadTime: e.target.value };
                                  setCustomAttack(updated);
                                  if (tempWeapon?.Name === customAttack.Name) setTempWeapon(updated);
                                }}
                                min="0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                value={customAttack.Damage}
                                onChange={(e) => {
                                  const updated = { ...customAttack, Damage: e.target.value };
                                  setCustomAttack(updated);
                                  if (tempWeapon?.Name === customAttack.Name) setTempWeapon(updated);
                                }}
                                min="0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Confirm / Cancel actions for weapon change modal */}
              <div className="d-flex gap-2 mt-3">
                <button className="btn btn-secondary flex-fill" onClick={() => { setTempWeapon(null); setShowWeaponChange(false); }}>
                  {localization?.['UI.Combat.Cancel'] || 'Cancelar'}
                </button>
                <button className="btn btn-warning flex-fill" onClick={() => { if (tempWeapon) confirmWeaponChange(tempWeapon); }} disabled={!tempWeapon}>
                  {localization?.['UI.Combat.ConfirmChange'] || 'Confirmar troca'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Modal de Ataque de Oportunidade */}
      {showOpportunityAttack && combat && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000 }}
            onClick={() => {
              setShowOpportunityAttack(false);
              setOpportunityWeapon(null);
              setOpportunityTarget(null);
            }}
          />
          <div
            className="position-fixed top-50 start-50 translate-middle bg-dark border border-warning rounded p-3"
            style={{ 
              zIndex: 2001, 
              maxWidth: '400px', 
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="text-warning mb-0">
                <span className="me-2">⚡</span>
                {localization?.['UI.Combat.OpportunityTitle'] || '⚡ Ataque de Oportunidade'}
              </h5>
              <button
                className="btn-close btn-close-white"
                onClick={() => {
                  setShowOpportunityAttack(false);
                  setOpportunityWeapon(null);
                  setOpportunityTarget(null);
                }}
              />
            </div>

            <div className="alert alert-info py-2 px-2 mb-3">
              <small>
                {localization?.['UI.Combat.OpportunityHint'] || '💡 Escolha uma arma e um alvo (atacante ou defensor)'}
              </small>
            </div>

            {/* Escolha do Alvo */}
            <div className="mb-3">
              <label className="text-white mb-2 small"><strong>{localization?.['UI.Combat.ChooseTarget'] || '1️⃣ Escolha o Alvo:'}</strong></label>
              <div className="d-flex gap-2">
                <button
                  className={`btn btn-sm flex-fill ${opportunityTarget === 'attacker' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setOpportunityTarget('attacker')}
                >
                  ⚔️ {combat.attacker_name}
                </button>
                <button
                  className={`btn btn-sm flex-fill ${opportunityTarget === 'defender' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setOpportunityTarget('defender')}
                >
                  🛡️ {combat.defender_name}
                </button>
              </div>
            </div>

            {/* Escolha da Arma */}
            <div className="mb-3">
              <label className="text-white mb-2 small"><strong>{localization?.['UI.Combat.ChooseWeaponLabel'] || '2️⃣ Escolha sua Arma:'}</strong></label>
              <div className="d-flex flex-column gap-2">
                {availableAttacks.map((attack, idx) => {
                  const isSelected = opportunityWeapon?.Name === attack.Name;
                  return (
                    <div
                      key={idx}
                      className={`card border ${isSelected ? 'border-warning bg-warning bg-opacity-25' : 'border-secondary'} cursor-pointer`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpportunityWeapon({ ...attack })}
                    >
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div style={{ flex: 1 }}>
                            <h6 className="text-white mb-1 small">{attack.Name}</h6>
                            <div className="d-flex gap-2 flex-wrap">
                              <small className="text-muted">⚡ {attack.LoadTime}</small>
                              <small className="text-muted">💥 {attack.Damage}</small>
                            </div>
                          </div>
                          {isSelected && <span className="text-warning ms-2">✓</span>}
                        </div>

                        {isSelected ? (
                          <div className="mt-2">
                            <div className="row g-2 mb-2">
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={opportunityWeapon.Dices}
                                  onChange={(e) => setOpportunityWeapon({ ...opportunityWeapon, Dices: e.target.value })}
                                  min="1"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={opportunityWeapon.LoadTime}
                                  onChange={(e) => setOpportunityWeapon({ ...opportunityWeapon, LoadTime: e.target.value })}
                                  min="0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={opportunityWeapon.Damage}
                                  onChange={(e) => setOpportunityWeapon({ ...opportunityWeapon, Damage: e.target.value })}
                                  min="0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                
                {(() => {
                  const isCustom = opportunityWeapon?.Name === customAttack.Name;
                  return (
                    <div
                      className={`card border ${isCustom ? 'border-warning bg-warning bg-opacity-25' : 'border-warning'} cursor-pointer`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpportunityWeapon({ ...customAttack })}
                    >
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h6 className="text-warning mb-0 small">{localization?.['UI.Combat.CustomAttackCard'] || '⚙️ Ataque Personalizado'}</h6>
                          {isCustom && <span className="text-warning">✓</span>}
                        </div>
                        {!isCustom ? (
                          <div>
                            <div className="d-flex gap-2 flex-wrap">
                              <small className="text-muted">🎲 {customAttack.Dices || '1'}</small>
                              <small className="text-muted">⏱️ {customAttack.LoadTime || '?'}</small>
                              <small className="text-muted">💥 {customAttack.Damage || '0'}</small>
                              <span className="badge bg-secondary">{customAttack.category}</span>
                            </div>
                            <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>{customAttack.Effects}</small>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <div className="mb-2">
                              <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.WeaponName'] || 'Nome:'}</label>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={customAttack.Name}
                                onChange={(e) => {
                                  const updated = { ...customAttack, Name: e.target.value };
                                  setCustomAttack(updated);
                                  if (opportunityWeapon?.Name === customAttack.Name) setOpportunityWeapon(updated);
                                }}
                                placeholder={localization?.['UI.Combat.AttackNamePlaceholder'] || 'Nome do ataque'}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="row g-2 mb-2">
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={customAttack.Dices}
                                  onChange={(e) => {
                                    const updated = { ...customAttack, Dices: e.target.value };
                                    setCustomAttack(updated);
                                    if (opportunityWeapon?.Name === customAttack.Name) setOpportunityWeapon(updated);
                                  }}
                                  min="1"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={customAttack.LoadTime}
                                  onChange={(e) => {
                                    const updated = { ...customAttack, LoadTime: e.target.value };
                                    setCustomAttack(updated);
                                    if (opportunityWeapon?.Name === customAttack.Name) setOpportunityWeapon(updated);
                                  }}
                                  min="0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>{localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}</label>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={customAttack.Damage}
                                  onChange={(e) => {
                                    const updated = { ...customAttack, Damage: e.target.value };
                                    setCustomAttack(updated);
                                    if (opportunityWeapon?.Name === customAttack.Name) setOpportunityWeapon(updated);
                                  }}
                                  min="0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Botão Confirmar */}
            <button
              className="btn btn-warning w-100"
              disabled={!opportunityWeapon || !opportunityTarget}
              onClick={async () => {
                if (!opportunityWeapon || !opportunityTarget) return;
                
                // Adicionar rodada de ataque de oportunidade via RPC atômico
                const { data: oaResult, error } = await supabase.rpc('add_opportunity_attack', {
                  p_combat_id: combat.id,
                  p_player_id: currentPlayer.id,
                  p_player_name: currentPlayer.name,
                  p_weapon: opportunityWeapon,
                  p_target: opportunityTarget
                });
                
                if (error) {
                  console.error('Erro ao adicionar ataque de oportunidade:', error);
                  alert(localization?.['UI.Combat.OpportunityError'] || 'Erro ao adicionar ataque. Tente novamente.');
                } else if (oaResult && !oaResult.success) {
                  alert(`❌ ${oaResult.error}`);
                  setShowOpportunityAttack(false);
                } else {
                  setShowOpportunityAttack(false);
                  setOpportunityWeapon(null);
                  setOpportunityTarget(null);
                  alert(localization?.['UI.Combat.OpportunityAdded'] || '✅ Ataque de oportunidade adicionado!');
                }
              }}
            >
              {localization?.['UI.Combat.ConfirmOpportunity'] || '⚡ Confirmar Ataque de Oportunidade'}
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default CombatPanel;
