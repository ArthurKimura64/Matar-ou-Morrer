import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
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
  onToggle
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
    Name: 'Ataque Personalizado',
    Dices: '1',
    LoadTime: '3',
    Damage: '0',
    Effects: '',
    category: 'Customizado'
  });

  // ===== ESTADOS DO COMBATE ATIVO =====
  const [combat, setCombat] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [diceAnimation, setDiceAnimation] = useState([]);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  
  // Estados para alterações temporárias durante o combate
  const [showWeaponChange, setShowWeaponChange] = useState(false);
  const [tempDefenseDices, setTempDefenseDices] = useState(null);
  const [tempWeapon, setTempWeapon] = useState(null);
  const [combatMode, setCombatMode] = useState('mode1'); // Modo atual do personagem no combate
  
  // Estados para ataque de oportunidade (espectadores)
  const [showOpportunityAttack, setShowOpportunityAttack] = useState(false);
  const [opportunityWeapon, setOpportunityWeapon] = useState(null);
  const [opportunityTarget, setOpportunityTarget] = useState(null); // 'attacker' ou 'defender'

  // ===== FUNÇÃO HELPER PARA AJUSTAR DADOS DE ARMAS =====
  const adjustWeaponDices = (weapon, delta) => {
    if (!weapon) return weapon;
    
    const currentDices = parseInt(weapon.Dices) || 1;
    const newDices = Math.max(1, Math.min(12, currentDices + delta));
    
    console.log('adjustWeaponDices:', { weapon: weapon.Name, currentDices, delta, newDices });
    
    return {
      ...weapon,
      Dices: newDices.toString()
    };
  };

  // ===== COMPONENTE DE AJUSTE DE RESULTADO DE DADOS (DISCRETO) =====
  const DiceResultAdjuster = ({ diceArray, onAdjust, playerRole }) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const adjustDie = (index, delta) => {
      const newDice = [...diceArray];
      const currentValue = newDice[index];
      const newValue = Math.max(1, Math.min(6, currentValue + delta));
      
      if (newValue !== currentValue) {
        newDice[index] = newValue;
        onAdjust(newDice);
      }
    };

    const adjustAllDice = (delta) => {
      const newDice = diceArray.map(die => {
        const newValue = die + delta;
        return Math.max(1, Math.min(6, newValue));
      });
      onAdjust(newDice);
    };

    const removeDie = (index) => {
      if (diceArray.length <= 1) return;
      const newDice = diceArray.filter((_, i) => i !== index);
      onAdjust(newDice);
    };

    const canIncreaseAll = diceArray.some(die => die < 6);
    const canDecreaseAll = diceArray.some(die => die > 1);

    return (
      <div className="dice-result-inline">
        <button
          type="button"
          className="dice-all-btn dice-all-down"
          onClick={(e) => {
            e.stopPropagation();
            adjustAllDice(-1);
          }}
          disabled={!canDecreaseAll}
          title="Diminuir todos os dados"
        >
          −
        </button>
        {diceArray.map((die, i) => (
          <div 
            key={i}
            className="die-adjustable-wrapper"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {hoveredIndex === i && (
              <div className="die-adjust-controls">
                <button
                  type="button"
                  className="die-adjust-btn die-adjust-up"
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustDie(i, 1);
                  }}
                  disabled={die >= 6}
                  title="Aumentar"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="die-adjust-btn die-adjust-down"
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustDie(i, -1);
                  }}
                  disabled={die <= 1}
                  title="Diminuir"
                >
                  ▼
                </button>
                {diceArray.length > 1 && (
                  <button
                    type="button"
                    className="die-adjust-btn die-adjust-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDie(i);
                    }}
                    title="Remover dado"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            <span className="die-number">{die}</span>
          </div>
        ))}
        <button
          type="button"
          className="dice-all-btn dice-all-up"
          onClick={(e) => {
            e.stopPropagation();
            adjustAllDice(1);
          }}
          disabled={!canIncreaseAll}
          title="Aumentar todos os dados"
        >
          +
        </button>
      </div>
    );
  };

  // Buscar ataques/armas disponíveis do jogador atual
  const getAvailableAttacks = () => {
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
      const itemName = effectiveData.Name || localization?.[itemId] || itemId || (type === 'attack' ? 'Ataque' : 'Arma');
      
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
        const processed = processItem(attack, 'Ataques', 'attack');
        if (processed) attacks.push(processed);
      });
    }

    // Buscar em weapons
    if (selections.weapons && Array.isArray(selections.weapons)) {
      selections.weapons.forEach(weapon => {
        const processed = processItem(weapon, 'Armas', 'weapon');
        if (processed) attacks.push(processed);
      });
    }

    return attacks;
  };

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
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Erro ao carregar combate:', error);
        return;
      }

      if (data && data.length > 0) {
        setCombat(data[0]);
      } else {
        setCombat(null);
      }
    } catch (err) {
      console.error('Erro ao buscar combate:', err);
    }
  }, [currentPlayer?.id, roomId]);

  // ========== SUBSCRIPTION REALTIME ==========
  useEffect(() => {
    if (!roomId || !currentPlayer?.id) return;
    
    console.log('🔔 Iniciando subscription de combate para sala:', roomId);
    
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
          
          const combatData = payload.new || payload.old;
          console.log('💾 Dados do combate:', combatData);
          console.log('👤 ID do jogador atual:', currentPlayer?.id);
          
          if (combatData) {
            const isParticipant = combatData.attacker_id === currentPlayer.id || 
                                  combatData.defender_id === currentPlayer.id;
            
            if (isParticipant) {
              console.log('✅ Você está participando deste combate!');
              
              // Se é um novo combate e este jogador é o defensor, abrir sidebar
              if (
                payload.eventType === 'INSERT' &&
                combatData.defender_id === currentPlayer.id &&
                combatData.status === 'pending'
              ) {
                console.log('🚨 VOCÊ FOI DESAFIADO PARA COMBATE!');
                
                // Tocar som de alerta (se disponível)
                try {
                  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuFzvLZiToIFl631+mhTxENUKfk77RgGgU7k9n0yHorBSh+zPLaizsIGGS57OihUBELTKXh8bllHAU2jdTx0H0vBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+zPDVhjkIFmG3596fUA8NUKfj7rFfGgU7k9n0yHorBSh+');
                  audio.volume = 0.5;
                  audio.play().catch(e => console.log('Não foi possível tocar som:', e));
                } catch (e) {
                  console.log('Áudio não disponível');
                }
                
                // Abrir sidebar automaticamente
                if (!isOpen && onToggle) {
                  onToggle();
                } else if (!isOpen) {
                  setIsOpenLocal(true);
                }
              }
            } else {
              console.log('👁️ Você é espectador deste combate.');
            }
            
            if (payload.eventType === 'DELETE' || combatData.status === 'cancelled' || combatData.status === 'completed') {
              console.log('❌ Combate cancelado/completado, removendo...');
              setCombat(null);
            } else {
              console.log('🎮 Atualizando estado do combate...');
              setCombat(combatData);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Status da subscription de combate:', status, err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscription de combate ativa para sala:', roomId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ Erro na subscription de combate:', status);
          // Tentar recarregar combate manualmente
          setTimeout(loadCombat, 1000);
        }
      });

    // Polling backup a cada 5 segundos para garantir sincronização
    const pollInterval = setInterval(() => {
      loadCombat();
    }, 5000);

    return () => {
      console.log('🔕 Removendo subscription de combate');
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentPlayer?.id, loadCombat, isOpen, onToggle]);

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
          const attackName = attack.Name || localization?.[attackId] || attackId || 'Ataque';
          
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
          const weaponName = weapon.Name || localization?.[weaponId] || weaponId || 'Arma';
          
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
          alert('Selecione uma arma primeiro!');
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

      console.log('Updating combat with:', {
        defender_weapon: skipRetaliation ? null : selectedWeapon,
        total_rounds: totalRounds,
        roundData
      });

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
        alert('Erro ao confirmar escolha. Tente novamente.');
      } else {
        console.log('Weapon selection successful!');
      }
    } catch (err) {
      console.error('Erro ao processar seleção:', err);
      alert('Erro inesperado: ' + err.message);
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
        alert('Erro: número de dados inválido');
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

      // Atualizar round_data
      if (isOpportunityAttacker) {
        roundInfo.attacker = { rolled: true, roll: finalDice, total: total };
      } else if (isTargetPlayer) {
        roundInfo.defender = { rolled: true, roll: finalDice, total: total };
      }

      // Verificar se rodada está completa
      if (roundInfo.attacker.rolled && roundInfo.defender.rolled) {
        roundInfo.completed = true;
      }

      setRolling(false);

      // Salvar
      const { error } = await supabase
        .from('combat_notifications')
        .update({
          round_data: roundData,
          updated_at: new Date().toISOString()
        })
        .eq('id', combat.id);

      if (error) {
        console.error('Erro ao salvar dados:', error);
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
      alert('Erro: número de dados inválido');
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
    const { error } = await supabase
      .from('combat_notifications')
      .update({
        round_data: roundData,
        updated_at: new Date().toISOString()
      })
      .eq('id', combat.id);

    if (error) {
      console.error('Erro ao salvar dados:', error);
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
      alert('Ambos os jogadores devem rolar antes de avançar!');
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
      }
    } catch (err) {
      console.error('Erro ao encerrar combate:', err);
    }
  };

  // Filtrar jogadores disponíveis (excluir o próprio jogador e apenas com personagem criado)
  const getAvailableTargets = () => {
    return players.filter(player => 
      player.id !== currentPlayer?.id && 
      player.character?.selections &&
      player.status !== 'offline'
    );
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
    if (!selectedAttack) {
      alert('Selecione um ataque ou arma!');
      return;
    }

    if (selectedDefenders.length === 0) {
      alert('Selecione pelo menos um defensor!');
      return;
    }

    if (!currentPlayer?.id) {
      alert('Erro: jogador não identificado!');
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
        alert('⚠️ Já existe um combate ativo na sala! Aguarde o término do combate atual.');
        return;
      }
    } catch (err) {
      console.error('Erro ao verificar combates ativos:', err);
    }

    setLoading(true);

    try {
      // Criar notificação para cada defensor selecionado
      const notifications = selectedDefenders.map(defenderId => {
        const defender = players.find(p => p.id === defenderId);
        return {
          room_id: roomId,
          attacker_id: currentPlayer.id,
          defender_id: defenderId,
          attacker_name: currentPlayer.name,
          defender_name: defender?.name || 'Desconhecido',
          attack_data: selectedAttack,
          allow_counter_attack: allowCounterAttack,
          allow_opportunity_attacks: allowOpportunityAttacks,
          opportunity_attacks_used: [], // Array de IDs de jogadores que já usaram
          status: 'pending',
          combat_phase: 'weapon_selection',
          current_round: 0,
          total_rounds: 0,
          round_data: []
        };
      });

      const { error } = await supabase
        .from('combat_notifications')
        .insert(notifications);

      if (error) {
        console.error('Erro ao criar combate:', error);
        alert('Erro ao iniciar combate. Verifique o console.');
      } else {
        // Sucesso! Limpar seleções
        setSelectedAttack(null);
        setSelectedDefenders([]);
        alert(`Combate iniciado contra ${selectedDefenders.length} jogador(es)!`);
        
        // Fechar sidebar após iniciar
        if (isOpen) {
          toggleSidebar();
        }
      }
    } catch (err) {
      console.error('Erro ao iniciar combate:', err);
      alert('Erro inesperado ao iniciar combate.');
    } finally {
      setLoading(false);
    }
  };

  // ========== FUNÇÕES DE ALTERAÇÃO DURANTE COMBATE ==========
  
  // Obter arma/ataque com modo aplicado
  const getWeaponWithMode = (weapon) => {
    if (!weapon) return null;
    if (!weapon.modes) return weapon;
    return weapon.modes[combatMode] || weapon.modes.mode1 || weapon;
  };
  
  // Obter dados de defesa atuais do jogador (prioriza valor local, depois banco, depois original)
  const getCurrentDefenseDices = () => {
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
  };

  // Obter dados de defesa de um jogador específico (para exibição)
  const getPlayerDefenseDices = (playerId) => {
    if (!combat) return 0;
    
    const isPlayerAttacker = playerId === combat.attacker_id;
    const isPlayerDefender = playerId === combat.defender_id;
    
    // Usar dados do banco se disponíveis
    if (isPlayerAttacker && combat.attacker_defense_dices !== null && combat.attacker_defense_dices !== undefined) {
      return combat.attacker_defense_dices;
    }
    if (isPlayerDefender && combat.defender_defense_dices !== null && combat.defender_defense_dices !== undefined) {
      return combat.defender_defense_dices;
    }
    
    // Fallback: buscar dados do jogador na lista de players
    const player = players.find(p => p.id === playerId);
    return player?.character?.actor?.NumberOfDefenseDices || 0;
  };

  // Ajustar dados de defesa e sincronizar com banco de dados
  const adjustDefenseDices = (delta) => {
    const current = getCurrentDefenseDices();
    const newValue = Math.max(0, Math.min(8, current + delta)); // Limite entre 0 e 8
    handleDefenseDicesChange(newValue);
  };

  // Atualizar dados de defesa localmente E no banco de dados
  const handleDefenseDicesChange = (newValue) => {
    // Atualizar estado local PRIMEIRO para feedback imediato
    setTempDefenseDices(newValue);
    
    // Depois atualizar no banco de dados (async, em background)
    syncDefenseDicesToDatabase(newValue);
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
      alert('Erro ao adicionar rodada. Tente novamente.');
    }
  };

  // Remover última rodada
  const removeRound = async () => {
    if (!combat || combat.round_data.length <= 1) return;

    const roundData = [...(combat.round_data || [])];
    const currentRound = combat.current_round;
    
    // Não permitir remover se estamos na última rodada ou após ela
    if (currentRound >= roundData.length) {
      alert('Não é possível remover a rodada atual ou rodadas já completadas.');
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
      alert('Erro ao remover rodada. Tente novamente.');
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

  const availableAttacks = getAvailableAttacks();
  const availableTargets = getAvailableTargets();

  // Verificar se há combate ativo (destaque durante todo o combate)
  const hasActiveCombat = combat && 
    (combat.status === 'pending' || combat.status === 'in_progress');

  return (
    <>
      {/* Botão de toggle fixo na lateral direita */}
      <button
        onClick={toggleSidebar}
        className="btn btn-danger position-fixed d-flex align-items-center justify-content-center sidebar-toggle-btn border border-light"
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
        title={isOpen ? 'Fechar painel de combate' : 'Abrir painel de combate'}
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
        className="position-fixed bg-dark border-start border-danger"
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
              <h6 className="mb-1 fw-bold">⚔️ Painel de Combate</h6>
              <small>{combat ? 'Combate em andamento' : 'Iniciar novo combate'}</small>
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
                  return <div className="text-white">Iniciando combate...</div>;
                }

                // Defensor deve escolher arma
                if (isDefender) {
                  const weapons = getPlayerWeapons();

                  return (
                    <>
                      <div className="alert alert-warning">
                        <h6>⚔️ Combate Iniciado!</h6>
                        <p className="mb-0"><strong>{combat.attacker_name}</strong> está atacando você com <strong>{combat.attack_data.Name}</strong>!</p>
                      </div>

                      <div className="mb-3">
                        <h6 className="text-white mb-2">✓ Escolha sua arma para revidar:</h6>
                        
                        {weapons.length === 0 && (
                          <div className="alert alert-info">
                            <small>Você não possui armas disponíveis.</small>
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
                                          <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                          <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                          <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                                    <h6 className="text-warning mb-0 small">⚙️ Ataque Personalizado</h6>
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
                                        <label className="text-white" style={{ fontSize: '11px' }}>Nome:</label>
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          value={customAttack.Name}
                                          onChange={(e) => {
                                            const updated = { ...customAttack, Name: e.target.value };
                                            setCustomAttack(updated);
                                            if (selectedWeapon?.Name === customAttack.Name) setSelectedWeapon(updated);
                                          }}
                                          placeholder="Nome do ataque"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                      <div className="row g-2 mb-2">
                                        <div className="col-4">
                                          <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                          <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                          <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                        Confirmar Arma
                      </button>

                      <button
                        className="btn btn-warning w-100 mb-2"
                        onClick={() => selectWeaponForDefense(true)}
                      >
                        ❌ Não Retaliar
                      </button>

                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        Encerrar Combate
                      </button>
                    </>
                  );
                } else if (isAttacker) {
                  // Atacante aguarda defensor escolher
                  return (
                    <>
                      <div className="alert alert-info">
                        <h6>⚔️ Aguardando Defensor...</h6>
                        <p className="mb-0">Aguardando <strong>{combat.defender_name}</strong> escolher sua arma...</p>
                        <div className="text-center mt-2">⏳</div>
                      </div>

                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        Encerrar Combate
                      </button>
                    </>
                  );
                }
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
                    name: roundInfo.opportunity_attacker_name || 'Espectador',
                    weapon: roundInfo.opportunity_weapon?.Name || 'Arma',
                    rolled: roundInfo.attacker?.rolled || false,
                    data: roundInfo.attacker,
                    icon: '⚡',
                    className: 'opportunity'
                  };
                  
                  // Defensor é o alvo escolhido
                  const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
                  rightPlayer = {
                    name: targetIsAttacker ? combat.attacker_name : combat.defender_name,
                    weapon: 'Defesa',
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
                    weapon: 'Defesa',
                    rolled: defenderRolled,
                    data: roundInfo.defender,
                    icon: '🛡️',
                    className: 'defender'
                  };
                } else {
                  // Rodada de contra-ataque
                  // Usar arma do banco (defender_weapon já é atualizada quando defensor troca de arma)
                  const defenderWeaponName = combat.defender_weapon?.Name || 'Arma';
                  
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
                    weapon: 'Defesa',
                    rolled: attackerRolled,
                    data: roundInfo.attacker,
                    icon: '🛡️',
                    className: 'defender'
                  };
                }

                return (
                  <>
                    {/* Aviso e Ação de Espectador */}
                    {isSpectator && (
                      <>
                        <div className="alert alert-warning mb-2">
                          <small>
                            <strong>👁️ Modo Espectador</strong><br/>
                            Você está assistindo este combate.
                          </small>
                        </div>
                        
                        {/* Botão de Ataque de Oportunidade */}
                        {combat.allow_opportunity_attacks && 
                         !combat.opportunity_attacks_used?.includes(currentPlayer.id) && (
                          <button 
                            className="btn btn-warning w-100 mb-2"
                            onClick={() => setShowOpportunityAttack(true)}
                          >
                            ⚡ Dar Ataque de Oportunidade
                          </button>
                        )}
                        
                        {combat.opportunity_attacks_used?.includes(currentPlayer.id) && (
                          <div className="alert alert-secondary mb-2 py-1 px-2">
                            <small style={{ fontSize: '10px' }}>
                              ✅ Você já usou seu ataque de oportunidade
                            </small>
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Header da rodada com indicador visual INTERATIVO */}
                    <div className="combat-round-header mb-2">
                      <div className="round-info">
                        <span className="round-label">Rodada {currentRound}/{totalRounds}</span>
                      </div>
                      <div className="round-indicators">
                        {combat.round_data.map((r, idx) => {
                          // Determinar classe de cor baseada no tipo de ação
                          let colorClass = 'round-dot-attack';
                          let actionLabel = 'Ataque';
                          
                          if (r.action_type === 'opportunity') {
                            colorClass = 'round-dot-opportunity';
                            actionLabel = 'Oportunidade';
                          } else if (r.action_type === 'counter') {
                            colorClass = 'round-dot-counter';
                            actionLabel = 'Contra';
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
                              Alterar Equipamento
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
                                      🔀 Modo de Combate
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
                                      ✨ Alterna estatísticas e habilidades
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
                              title="Trocar arma (permanece até fim do combate)"
                            >
                              ⚔️ Trocar Arma {tempWeapon && '(Alterada)'}
                            </button>

                            {/* Ajustar Dados de Defesa */}
                            <div className="defense-adjustment">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                                  🛡️ Dados de Defesa
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
                                  ↺ Resetar
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
                                  '✅ Valor alterado temporariamente' : 
                                  '💡 Arraste o slider para ajustar'}
                              </small>
                            </div>
                            
                            {/* Gerenciamento de Rodadas */}
                            <div className="round-management mt-3">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                                  ⚔️ Gerenciar Rodadas
                                </label>
                                <span className="badge bg-warning text-dark" style={{ fontSize: '14px', padding: '4px 10px' }}>
                                  {totalRounds} rodadas
                                </span>
                              </div>
                              
                              {/* Botões para adicionar rodadas específicas */}
                              <div className="d-flex gap-2 mb-2">
                                <button 
                                  className="btn btn-sm btn-outline-primary flex-fill"
                                  onClick={() => addRound('attacker')}
                                  title="Adicionar rodada de ATAQUE (atacante age)"
                                >
                                  ⚔️ + Ataque
                                </button>
                                <button 
                                  className="btn btn-sm btn-outline-info flex-fill"
                                  onClick={() => addRound('defender')}
                                  title="Adicionar rodada de CONTRA-ATAQUE (defensor age)"
                                >
                                  🛡️ + Contra
                                </button>
                              </div>
                              
                              {/* Botão para remover */}
                              <button 
                                className="btn btn-sm btn-outline-danger w-100"
                                onClick={() => removeRound()}
                                disabled={totalRounds <= 1}
                                title="Remover última rodada"
                              >
                                − Remover Última Rodada
                              </button>
                              
                              <small className="text-muted d-block mt-2 text-center" style={{ fontSize: '10px' }}>
                                💡 Arraste os indicadores de rodada acima para reordenar
                              </small>
                            </div>
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
                            
                            if (isAttackerActing) {
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
                                <span className="stat-compact" title="Dados de Ataque">
                                  🎲 {weaponWithMode?.Dices || '?'}
                                </span>
                                <span className="stat-compact" title="Tempo de Recarga">
                                  ⚡ {weaponWithMode?.LoadTime || '?'}
                                </span>
                                <span className="stat-compact" title="Dano">
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
                                <span className="btn-text">Rolar</span>
                              </button>
                            )}
                            {(
                              isOpportunityRound ?
                                (currentPlayer.id !== roundInfo.opportunity_attacker_id) :
                                ((!((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) || isSpectator))
                            ) && (
                              <div className="combatant-waiting">
                                <span className="waiting-spinner">⏳</span>
                                <span>{isSpectator ? 'Espectador' : 'Aguardando...'}</span>
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
                              <span className="stat-compact" title="Dados de Defesa">
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
                                  (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                                  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)
                                ) :
                                (((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker)) && !waitingForAttacker && !isSpectator)
                            ) && (
                              <button 
                                className="btn-combat-roll-inline"
                                onClick={rollDice}
                              >
                                <span className="btn-icon">🎲</span>
                                <span className="btn-text">Rolar</span>
                              </button>
                            )}
                            {(
                              isOpportunityRound ?
                                !(
                                  (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
                                  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)
                                ) :
                                ((waitingForAttacker && ((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker))) || (!((isAttackerActing && !isAttacker) || (!isAttackerActing && isAttacker))) || isSpectator)
                            ) && (
                              <div className="combatant-waiting">
                                <span className="waiting-spinner">⏳</span>
                                <span>{isSpectator ? 'Espectador' : (waitingForAttacker ? 'Aguarde atacante...' : 'Aguardando...')}</span>
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
                          {currentRound >= totalRounds ? 'Ver Resultados' : 'Avançar Rodada'}
                        </span>
                      </button>
                    )}

                    {!isSpectator && (
                      <button className="btn btn-danger w-100" onClick={endCombat}>
                        <span className="me-2">🚫</span>
                        Encerrar Combate
                      </button>
                    )}
                  </>
                );
              })()}

              {/* FASE 3: RESULTADOS */}
              {combat.combat_phase === 'results' && (() => {
                const roundData = combat.round_data || [];

                return (
                  <>
                    {/* Header de Resultados */}
                    <div className="combat-results-header mb-3">
                      <div className="results-title">
                        <span className="results-icon">📊</span>
                        <h5 className="mb-0">Resultado do Combate</h5>
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
                          displayAttackerName = round.opportunity_attacker_name || 'Espectador';
                          attackerIcon = '⚡';
                          roundLabel = `Rodada ${round.round} - Ataque de Oportunidade`;
                          
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
                          roundLabel = `Rodada ${round.round} - Contra-Ataque`;
                        } else {
                          // Ataque normal
                          displayAttackerName = combat.attacker_name;
                          displayDefenderName = combat.defender_name;
                          attackerIcon = '⚔️';
                          defenderIcon = '🛡️';
                          roundLabel = `Rodada ${round.round} - Ataque`;
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
                      Encerrar Combate
                    </button>
                  </>
                );
              })()}
            </>
          ) : (
            /* ========== INICIAR NOVO COMBATE ========== */
            <>
              {/* Verificar se jogador tem personagem */}
              {!currentPlayerData?.character?.selections ? (
                <div className="alert alert-warning">
                  <p className="mb-0">
                    ⚠️ Você precisa criar um personagem antes de iniciar combates!
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
                        🔀 Modo de Combate
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
                        ✨ Define ataques/armas e estatísticas disponíveis
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Seção: Selecionar Ataque */}
              <div className="mb-4">
                <h6 className="text-white mb-3 border-bottom border-secondary pb-2">
                  1️⃣ Selecione seu Ataque/Arma
                </h6>

                {/* Lista de ataques/armas disponíveis + Ataque Personalizado como opção */}
                <div className="d-flex flex-column gap-2">
                  {availableAttacks.length === 0 && (
                    <div className="alert alert-info mb-2">
                      <small>Você não possui ataques ou armas disponíveis.</small>
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
                                  <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                  <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                  <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                            <h6 className="text-warning mb-0 small">⚙️ Ataque Personalizado</h6>
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
                                <label className="text-white" style={{ fontSize: '11px' }}>Nome:</label>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={customAttack.Name}
                                  onChange={(e) => setCustomAttack({ ...customAttack, Name: e.target.value })}
                                  placeholder="Nome do ataque"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="row g-2 mb-2">
                                <div className="col-4">
                                  <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                  <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                  <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                  2️⃣ Selecione o(s) Alvo(s)
                </h6>
                
                {availableTargets.length === 0 ? (
                  <div className="alert alert-info">
                    <small>Nenhum jogador disponível para combate no momento.</small>
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
                                  ? (player.character?.actor?.Name || 'Personagem')
                                  : (player.character?.actor || 'Personagem')}
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
                  3️⃣ Opções de Combate
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
                    <small>Ataque único (não pode revidar)</small>
                  </label>
                </div>
                
                {!allowCounterAttack && (
                  <div className="alert alert-warning mt-2 py-1 px-2 mb-2">
                    <small style={{ fontSize: '10px' }}>
                      ⚡ Apenas 1 rodada de ataque sem possibilidade de defesa
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
                    <small>Permitir ataques de oportunidade</small>
                  </label>
                </div>
                
                {allowOpportunityAttacks && (
                  <div className="alert alert-info mt-2 py-1 px-2">
                    <small style={{ fontSize: '10px' }}>
                      👁️ Espectadores podem dar 1 ataque de oportunidade
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
                    Iniciando...
                  </>
                ) : (
                  <>
                    ⚔️ Iniciar Combate
                    {selectedDefenders.length > 0 && ` (${selectedDefenders.length})`}
                  </>
                )}
              </button>

              {/* Resumo da seleção */}
              {selectedAttack && selectedDefenders.length > 0 && (
                <div className="alert alert-dark mt-3 py-2 px-2">
                  <small className="text-white" style={{ fontSize: '11px' }}>
                    <strong>Resumo:</strong><br/>
                    🎯 Ataque: {selectedAttack.Name}<br/>
                    👥 Alvos: {selectedDefenders.length}<br/>
                    ⚡ Tipo: {allowCounterAttack ? 'Combate Completo' : 'Ataque Único'}
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
                Trocar Arma
              </h5>
              <button
                className="btn-close btn-close-white"
                onClick={() => setShowWeaponChange(false)}
              />
            </div>

            <div className="alert alert-info py-2 px-2 mb-3">
              <small>
                💡 A alteração permanece até o fim do combate
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
                              <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                              <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                              <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                        <h6 className="text-warning mb-0 small">⚙️ Ataque Personalizado</h6>
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
                            <label className="text-white" style={{ fontSize: '11px' }}>Nome:</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={customAttack.Name}
                              onChange={(e) => {
                                const updated = { ...customAttack, Name: e.target.value };
                                setCustomAttack(updated);
                                if (tempWeapon?.Name === customAttack.Name) setTempWeapon(updated);
                              }}
                              placeholder="Nome do ataque"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="row g-2 mb-2">
                            <div className="col-4">
                              <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                              <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                              <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                  Cancelar
                </button>
                <button className="btn btn-warning flex-fill" onClick={() => { if (tempWeapon) confirmWeaponChange(tempWeapon); }} disabled={!tempWeapon}>
                  Confirmar troca
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
                Ataque de Oportunidade
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
                💡 Escolha uma arma e um alvo (atacante ou defensor)
              </small>
            </div>

            {/* Escolha do Alvo */}
            <div className="mb-3">
              <label className="text-white mb-2 small"><strong>1️⃣ Escolha o Alvo:</strong></label>
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
              <label className="text-white mb-2 small"><strong>2️⃣ Escolha sua Arma:</strong></label>
              <div className="d-flex flex-column gap-2">
                {getAvailableAttacks().map((attack, idx) => {
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
                                <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                          <h6 className="text-warning mb-0 small">⚙️ Ataque Personalizado</h6>
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
                              <label className="text-white" style={{ fontSize: '11px' }}>Nome:</label>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={customAttack.Name}
                                onChange={(e) => {
                                  const updated = { ...customAttack, Name: e.target.value };
                                  setCustomAttack(updated);
                                  if (opportunityWeapon?.Name === customAttack.Name) setOpportunityWeapon(updated);
                                }}
                                placeholder="Nome do ataque"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="row g-2 mb-2">
                              <div className="col-4">
                                <label className="text-white" style={{ fontSize: '11px' }}>🎲 Dados:</label>
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
                                <label className="text-white" style={{ fontSize: '11px' }}>⏱️ Tempo:</label>
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
                                <label className="text-white" style={{ fontSize: '11px' }}>💥 Dano:</label>
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
                
                // Adicionar rodada de ataque de oportunidade
                const currentRoundData = [...(combat.round_data || [])];
                const newRound = {
                  round: currentRoundData.length + 1,
                  who_acts: 'opportunity',
                  action_type: 'opportunity',
                  opportunity_attacker_id: currentPlayer.id,
                  opportunity_attacker_name: currentPlayer.name,
                  opportunity_weapon: opportunityWeapon,
                  opportunity_target: opportunityTarget,
                  attacker: { rolled: false, roll: [], total: 0 },
                  defender: { rolled: false, roll: [], total: 0 },
                  completed: false
                };
                currentRoundData.push(newRound);
                
                // Atualizar combate
                const opportunityUsed = [...(combat.opportunity_attacks_used || []), currentPlayer.id];
                
                const { error } = await supabase
                  .from('combat_notifications')
                  .update({
                    round_data: currentRoundData,
                    total_rounds: currentRoundData.length,
                    opportunity_attacks_used: opportunityUsed,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', combat.id);
                
                if (error) {
                  console.error('Erro ao adicionar ataque de oportunidade:', error);
                  alert('Erro ao adicionar ataque. Tente novamente.');
                } else {
                  setShowOpportunityAttack(false);
                  setOpportunityWeapon(null);
                  setOpportunityTarget(null);
                  alert('✅ Ataque de oportunidade adicionado!');
                }
              }}
            >
              ⚡ Confirmar Ataque de Oportunidade
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default CombatPanel;
