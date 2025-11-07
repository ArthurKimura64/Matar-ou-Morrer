import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import './CombatNotifications.css';

/**
 * SISTEMA DE COMBATE COMPLETO - VERSÃO NOVA
 * 
 * Fluxo:
 * 1. weapon_selection: Defensor escolhe arma (se permitido)
 * 2. rolling: Rolagem de dados em rodadas
 * 3. results: Exibição final de todas as rodadas
 */

const CombatNotifications = ({ currentPlayer, currentPlayerData, roomId, gameData, localization, players }) => {
  const [combat, setCombat] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [diceAnimation, setDiceAnimation] = useState([]);
  const [selectedWeapon, setSelectedWeapon] = useState(null);

  // ========== CARREGAR COMBATE ATIVO ==========
  const loadCombat = useCallback(async () => {
    if (!currentPlayer?.id || !roomId) return;

    try {
      // Buscar combate ativo onde o jogador está envolvido
      const { data, error } = await supabase
        .from('combat_notifications')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['pending', 'in_progress'])
        .or(`attacker_id.eq.${currentPlayer.id},defender_id.eq.${currentPlayer.id}`)
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
    loadCombat();

    // Subscrever para atualizações em tempo real
    const channel = supabase
      .channel(`combat_room_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'combat_notifications',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          // Verificar se este combate envolve o jogador atual
          const combatData = payload.new || payload.old;

          if (
            combatData &&
            (combatData.attacker_id === currentPlayer.id || combatData.defender_id === currentPlayer.id)
          ) {
            if (payload.eventType === 'DELETE' || combatData.status === 'cancelled' || combatData.status === 'completed') {
              setCombat(null);
            } else {
              setCombat(combatData);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentPlayer?.id, loadCombat]);

  // ========== BUSCAR ARMAS DO JOGADOR ==========
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
    if (!combat) return;

    try {
      let totalRounds, rounds;
      
      if (skipRetaliation) {
        // Defensor escolheu NÃO retaliar - apenas 1 rodada de ataque
        totalRounds = 1;
        rounds = [{
          round: 1,
          who_acts: 'attacker',
          action_type: 'attack'
        }];
      } else {
        // Defensor escolheu uma arma
        if (!selectedWeapon) {
          alert('Selecione uma arma primeiro!');
          return;
        }
        
        const attackerLoadTime = parseInt(combat.attack_data.LoadTime) || 0;
        const defenderLoadTime = parseInt(selectedWeapon.LoadTime) || 0;

        const result = calculateRounds(attackerLoadTime, defenderLoadTime);
        totalRounds = result.totalRounds;
        rounds = result.rounds;
      }

      // Preparar round_data inicial
      const roundData = rounds.map(r => ({
        ...r,
        attacker: { rolled: false, roll: [], total: 0 },
        defender: { rolled: false, roll: [], total: 0 },
        completed: false
      }));

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
      }
    } catch (err) {
      console.error('Erro ao processar seleção:', err);
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

    // Determinar quem está atacando e quem está defendendo NESTA RODADA
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
        diceCount = parseInt(combat.attack_data.Dices) || 0;
      } else {
        // Defensor usa NumberOfDefenseDices
        const defenderData = players.find(p => p.id === combat.defender_id);
        diceCount = parseInt(defenderData?.actorData?.NumberOfDefenseDices) || 2;
      }
    } else if (actionType === 'counter') {
      // Defensor contra-ataca com arma, Atacante defende com dados de defesa
      if (!isAttacker) {
        diceCount = parseInt(combat.defender_weapon?.Dices) || 0;
      } else {
        // Atacante usa NumberOfDefenseDices
        const attackerData = players.find(p => p.id === combat.attacker_id);
        diceCount = parseInt(attackerData?.actorData?.NumberOfDefenseDices) || 2;
      }
    }

    if (diceCount === 0) {
      alert('Erro: número de dados inválido');
      return;
    }

    setRolling(true);

    // ========== ANIMAÇÃO: 10 frames de 100ms cada ==========
    for (let frame = 0; frame < 10; frame++) {
      const tempDice = [];
      for (let i = 0; i < diceCount; i++) {
        tempDice.push(1 + Math.floor(Math.random() * 6));
      }
      setDiceAnimation(tempDice);
      await new Promise(resolve => setTimeout(resolve, 100));
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

    // Sempre apenas salvar o estado atual (não avança automaticamente)
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

    setRolling(false);
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

  // ========== RENDERIZAÇÃO ==========
  if (!combat) return null;

  const isAttacker = currentPlayer.id === combat.attacker_id;
  const isDefender = currentPlayer.id === combat.defender_id;

  // ========== FASE 1: SELEÇÃO DE ARMA ==========
  if (combat.combat_phase === 'weapon_selection') {
    if (!combat.allow_counter_attack) {
      // Sem revidar - iniciar automaticamente
      if (combat.status === 'pending') {
        const autoStart = async () => {
          const { totalRounds, rounds } = calculateRounds(combat.attack_data.LoadTime || 0, 0);
          const roundData = rounds.map(r => ({
            ...r,
            attacker: { rolled: false, roll: [], total: 0 },
            defender: { rolled: false, roll: [], total: 0 },
            completed: false
          }));

          await supabase
            .from('combat_notifications')
            .update({
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
      return null;
    }

    // Defensor deve escolher arma
    if (isDefender) {
      const weapons = getPlayerWeapons();

      return (
        <div className="combat-overlay">
          <div className="combat-modal">
            <div className="combat-header">
              <h2>⚔️ Combate Iniciado!</h2>
              <button className="btn-close-combat" onClick={endCombat}>✖</button>
            </div>

            <div className="combat-body">
              <div className="combat-info">
                <p><strong className="attacker-name">{combat.attacker_name}</strong> está atacando você com <strong>{combat.attack_data.Name}</strong>!</p>
                <p className="counter-allowed">✓ Você pode revidar! Escolha sua arma:</p>
              </div>

              <div className="weapon-selection">
                {weapons.length === 0 && (
                  <p className="no-weapons">Você não possui armas disponíveis.</p>
                )}
                {weapons.map((weapon, idx) => (
                  <div
                    key={idx}
                    className={`weapon-card ${selectedWeapon?.Name === weapon.Name ? 'selected' : ''}`}
                    onClick={() => setSelectedWeapon(weapon)}
                  >
                    <h4>{weapon.Name}</h4>
                    <p>🎲 Dados: {weapon.Dices}</p>
                    <p>⏱️ Tempo: {weapon.LoadTime}</p>
                    {weapon.Effects && <p className="weapon-effects">{weapon.Effects}</p>}
                  </div>
                ))}
              </div>

              <button
                className="btn-confirm-weapon"
                onClick={() => selectWeaponForDefense(false)}
                disabled={!selectedWeapon}
              >
                Confirmar Arma
              </button>

              <button
                className="btn-skip-retaliation"
                onClick={() => selectWeaponForDefense(true)}
              >
                ❌ Não Retaliar
              </button>
            </div>

            <div className="combat-footer">
              <button className="btn-end-combat" onClick={endCombat}>
                Encerrar Combate
              </button>
            </div>
          </div>
        </div>
      );
    } else if (isAttacker) {
      // Atacante aguarda defensor escolher
      return (
        <div className="combat-overlay">
          <div className="combat-modal">
            <div className="combat-header">
              <h2>⚔️ Aguardando Defensor...</h2>
              <button className="btn-close-combat" onClick={endCombat}>✖</button>
            </div>

            <div className="combat-body">
              <div className="combat-info">
                <p>Aguardando <strong className="defender-name">{combat.defender_name}</strong> escolher sua arma...</p>
                <div className="loading-spinner">⏳</div>
              </div>
            </div>

            <div className="combat-footer">
              <button className="btn-end-combat" onClick={endCombat}>
                Encerrar Combate
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // ========== FASE 2: ROLAGEM DE DADOS ==========
  if (combat.combat_phase === 'rolling') {
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

    // Se é contra-ataque, inverter a exibição visual
    const leftPlayer = isAttackerActing ? {
      name: combat.attacker_name,
      weapon: combat.attack_data.Name,
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: '⚔️',
      className: 'attacker'
    } : {
      name: combat.defender_name,
      weapon: combat.defender_weapon?.Name || 'Arma',
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: '⚔️',
      className: 'attacker'
    };

    const rightPlayer = isAttackerActing ? {
      name: combat.defender_name,
      weapon: 'Defesa',
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: '🛡️',
      className: 'defender'
    } : {
      name: combat.attacker_name,
      weapon: 'Defesa',
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: '🛡️',
      className: 'defender'
    };

    return (
      <div className="combat-overlay">
        <div className="combat-modal">
          <div className="combat-header">
            <h2>🎲 Rodada {currentRound} de {totalRounds}</h2>
            <button className="btn-close-combat" onClick={endCombat}>✖</button>
          </div>

          <div className="combat-body">
            <div className="combat-info">
              <div className="combatants">
                <div className={`combatant ${leftPlayer.className}`}>
                  <h3 className={`${leftPlayer.className}-name`}>{leftPlayer.icon} {leftPlayer.name}</h3>
                  <p>{leftPlayer.weapon}</p>
                  {leftPlayer.rolled && leftPlayer.data && (
                    <div className="dice-result">
                      {leftPlayer.data.roll.map((die, i) => (
                        <span key={i} className="die">🎲 {die}</span>
                      ))}
                      <p className="total">Total: {leftPlayer.data.total}</p>
                    </div>
                  )}
                  {!leftPlayer.rolled && <p className="waiting">Aguardando rolagem...</p>}
                </div>

                <div className="vs">VS</div>

                <div className={`combatant ${rightPlayer.className}`}>
                  <h3 className={`${rightPlayer.className}-name`}>{rightPlayer.icon} {rightPlayer.name}</h3>
                  <p>{rightPlayer.weapon}</p>
                  {rightPlayer.rolled && rightPlayer.data && (
                    <div className="dice-result">
                      {rightPlayer.data.roll.map((die, i) => (
                        <span key={i} className="die">🎲 {die}</span>
                      ))}
                      <p className="total">Total: {rightPlayer.data.total}</p>
                    </div>
                  )}
                  {!rightPlayer.rolled && <p className="waiting">Aguardando rolagem...</p>}
                </div>
              </div>
            </div>

            {rolling && (
              <div className="dice-animation">
                <h3>Rolando dados...</h3>
                <div className="dice-rolling">
                  {diceAnimation.map((die, i) => (
                    <span key={i} className="die-animated">🎲 {die}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Botão de rolar dados - sempre visível mas desabilitado quando necessário */}
            {!rolling && !hasCurrentPlayerRolled && (
              <>
                <button 
                  className="btn-roll-dice" 
                  onClick={rollDice}
                  disabled={waitingForAttacker}
                >
                  🎲 Rolar Dados
                </button>
                {waitingForAttacker && (
                  <p className="waiting-message">⏳ Aguarde o atacante rolar primeiro...</p>
                )}
              </>
            )}

            {/* Mensagem quando já rolou */}
            {!rolling && hasCurrentPlayerRolled && (
              <p className="already-rolled">✓ Você já rolou nesta rodada. Aguardando adversário...</p>
            )}

            {/* Botão para avançar rodada - só aparece quando ambos rolaram */}
            {attackerRolled && defenderRolled && !rolling && (
              <button className="btn-advance-round" onClick={advanceRound}>
                {currentRound >= totalRounds ? '✅ Ver Resultados' : '➡️ Avançar Rodada'}
              </button>
            )}
          </div>

          <div className="combat-footer">
            <button className="btn-end-combat" onClick={endCombat}>
              Encerrar Combate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== FASE 3: RESULTADOS ==========
  if (combat.combat_phase === 'results') {
    const roundData = combat.round_data || [];

    return (
      <div className="combat-overlay">
        <div className="combat-modal results-modal">
          <div className="combat-header">
            <h2>📊 Resultado do Combate</h2>
            <button className="btn-close-combat" onClick={endCombat}>✖</button>
          </div>

          <div className="combat-body">
            <div className="combat-info">
              <h3>
                <span className="attacker-name">{combat.attacker_name}</span> VS <span className="defender-name">{combat.defender_name}</span>
              </h3>
            </div>

            <div className="rounds-history">
              {roundData.map((round, idx) => (
                <div key={idx} className="round-result">
                  <h4>Rodada {round.round}</h4>
                  <div className="round-combatants">
                    <div className="round-combatant">
                      <p className="attacker-name">⚔️ {combat.attacker_name}</p>
                      <div className="dice-result">
                        {round.attacker.roll.map((die, i) => (
                          <span key={i} className="die">🎲 {die}</span>
                        ))}
                        <p className="total">Total: {round.attacker.total}</p>
                      </div>
                    </div>

                    <div className="round-combatant">
                      <p className="defender-name">🛡️ {combat.defender_name}</p>
                      <div className="dice-result">
                        {round.defender.roll.map((die, i) => (
                          <span key={i} className="die">🎲 {die}</span>
                        ))}
                        <p className="total">Total: {round.defender.total}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="combat-footer">
            <button className="btn-end-combat" onClick={endCombat}>
              Encerrar Combate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default CombatNotifications;
