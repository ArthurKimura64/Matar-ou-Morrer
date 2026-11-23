import DiceResultAdjuster from '../../components/DiceResultAdjuster';
import SwapDefenderControl from './SwapDefenderControl';
import { parseDefenseDices } from '../../utils/combatHelpers';

/**
 * ============================================================================
 * FASE 2 DO COMBATE: ROLAGEM DE DADOS E GERENCIAMENTO (CombatRollingView.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * - Mostra os indicadores de rodada no topo (permitindo reordenar rodadas futuras).
 * - Permite alterar equipamento, modo, dados de defesa (slider) e adicionar rodadas.
 * - Exibe os cards de Atacante VS Defensor com animação de dados e ajuste fino.
 * - Suporta Combate Multi-Alvo (Rodada 1 compartilhada + abas de contra-ataque).
 * ============================================================================
 */
const CombatRollingView = ({
  combat,
  combatGroup = [],
  activeCombatId,
  onSelectGroupCombat,
  currentPlayer,
  currentPlayerData,
  players = [],
  combatMode,
  onChangeCombatMode,
  tempWeapon,
  onOpenWeaponChange,
  currentDefenseDices,
  onDefenseDicesChange,
  onAdjustDefenseDices,
  rolling,
  diceAnimation,
  onRollDice,
  onAdjustDiceResult,
  onAdvanceRound,
  onAdvanceGroupCombat,
  onAddRound,
  onRemoveRound,
  onMoveRoundLeft,
  onMoveRoundRight,
  swapTargets = [],
  onSwapDefender,
  availableAttacks = [],
  onOpenOpportunityModal,
  onEndCombat,
  localization = {}
}) => {
  const isAttacker = currentPlayer?.id === combat?.attacker_id;
  const isDefender = currentPlayer?.id === combat?.defender_id;
  const isSpectator = !isAttacker && !isDefender;

  const currentRound = combat.current_round;
  const totalRounds = combat.total_rounds;
  const roundData = combat.round_data || [];
  const roundIndex = currentRound - 1;
  const roundInfo = roundData[roundIndex] || {};

  const attackerRolled = roundInfo.attacker?.rolled || false;
  const defenderRolled = roundInfo.defender?.rolled || false;
  const isAttackerActing = roundInfo.action_type === 'attack';
  const isOpportunityRound = roundInfo.action_type === 'opportunity';
  const isOpportunityAttacker = isOpportunityRound && currentPlayer?.id === roundInfo.opportunity_attacker_id;

  const attackingPlayerRolled = isAttackerActing ? attackerRolled : defenderRolled;
  const isCurrentPlayerAttacking = isAttackerActing ? isAttacker : !isAttacker;
  const hasCurrentPlayerRolled = isAttacker ? attackerRolled : defenderRolled;
  const waitingForAttacker = !hasCurrentPlayerRolled && !isCurrentPlayerAttacking && !attackingPlayerRolled;

  const canChangeEquipment = !isSpectator || isOpportunityAttacker;
  const actor = currentPlayerData?.character?.actor;
  const defaultActorDefense = parseDefenseDices(actor?.NumberOfDefenseDices, 0);

  // ==========================================================================
  // VISÃO MULTI-ALVO PARA O ATACANTE
  // ==========================================================================
  if (isAttacker && combatGroup.length > 1) {
    const sharedRoll = combat.attacker_shared_roll;
    const attackerHasRolled = sharedRoll?.rolled || roundInfo.attacker?.rolled || false;
    const allDefendersInRolling = combatGroup.filter((gc) => gc.combat_phase === 'rolling' && gc.status !== 'cancelled');
    const allDefendersRolled = allDefendersInRolling.length > 0 && allDefendersInRolling.every((gc) => gc.round_data?.[0]?.defender?.rolled);

    // Rodada 1 compartilhada (Atacante rola uma vez para todos os defensores)
    if (currentRound === 1 && roundInfo.action_type === 'attack') {
      const weaponWithMode = combat.attack_data;

      return (
        <>
          <div className="alert alert-info mb-2">
            <h6 className="mb-1">{localization?.['UI.Combat.MultiTargetRound1'] || '⚔️ Combate Multi-Alvo — Rodada 1'}</h6>
            <p className="mb-0"><strong>{combat.attack_data?.Name}</strong></p>
          </div>

          <div className="combatant-card attacker-card mb-2">
            <div className="combatant-header">
              <span className="combatant-icon">⚔️</span>
              <h6 className="combatant-name">{combat.attacker_name}</h6>
            </div>
            <div className="combatant-weapon">{combat.attack_data?.Name}</div>
            <div className="weapon-stats-compact">
              <span className="stat-compact">🎲 {weaponWithMode?.Dices ?? '?'}</span>
              <span className="stat-compact">⚡ {weaponWithMode?.LoadTime ?? '?'}</span>
              <span className="stat-compact">💥 {weaponWithMode?.Damage ?? '0'}</span>
            </div>

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
                  onAdjust={(newDice) => onAdjustDiceResult(newDice, true)}
                  playerRole="left"
                  localization={localization}
                />
              </div>
            ) : !rolling && (
              <button type="button" className="btn-combat-roll-inline" onClick={onRollDice}>
                <span className="combat-btn-icon">🎲</span>
                <span className="combat-btn-text">{localization?.['UI.Combat.RollAttackAll'] || 'Rolar Ataque (Todos)'}</span>
              </button>
            )}
          </div>

          {/* Cartões de status de cada defensor */}
          <div className="d-flex flex-column gap-2 mb-2">
            {combatGroup.map((gc) => {
              if (gc.status === 'cancelled') return null;
              const gRound = gc.round_data?.[0];
              const defRolled = gRound?.defender?.rolled;
              const defRoll = gRound?.defender?.roll;
              const defTotal = gRound?.defender?.total;
              const inWeaponSel = gc.combat_phase === 'weapon_selection';

              return (
                <div key={gc.id} className={`card border-secondary ${defRolled ? 'bg-success bg-opacity-25' : 'bg-dark'}`}>
                  <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-white small fw-bold">🛡️ {gc.defender_name}</span>
                      <span className="text-muted small">
                        {inWeaponSel
                          ? `⏳ ${localization?.['UI.Combat.StatusChoosing'] || 'Escolhendo arma...'}`
                          : defRolled
                          ? `✅ ${localization?.['UI.Combat.StatusDefended'] || 'Defendeu'}`
                          : `🎲 ${localization?.['UI.Combat.StatusWaitingDefense'] || 'Aguardando defesa'}`}
                      </span>
                    </div>
                    {defRolled && defRoll && (
                      <small className="text-info d-block mt-1">
                        {localization?.['UI.Combat.DefenseLabel'] || 'Defesa:'} {defRoll.map((d) => `🎲${d}`).join(' ')} = {defTotal}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {attackerHasRolled && allDefendersRolled && !rolling && (
            <div className="d-flex flex-column gap-2 mb-2">
              {allDefendersInRolling.map((gc) => {
                const hasMoreRounds = gc.current_round < gc.total_rounds;
                return (
                  <button
                    key={gc.id}
                    type="button"
                    className="btn btn-sm btn-outline-success"
                    onClick={() => onAdvanceGroupCombat(gc)}
                  >
                    {hasMoreRounds
                      ? `${localization?.['UI.Combat.CounterAttackPrefix'] || '➡️ Contra-Ataque:'} ${gc.defender_name}`
                      : `${localization?.['UI.Combat.ViewResultPrefix'] || '✅ Ver Resultado:'} ${gc.defender_name}`}
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
            🚫 {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
          </button>
        </>
      );
    }

    // Rodadas 2+ em Multi-Alvo: Abas individuais por defensor
    const activeCounterAttacks = combatGroup.filter((gc) => gc.status !== 'cancelled' && gc.combat_phase === 'rolling' && gc.current_round > 1);
    const selectedCounterCombat = (activeCombatId && combatGroup.find((gc) => gc.id === activeCombatId)) || activeCounterAttacks[0];

    return (
      <>
        <div className="alert alert-info mb-2">
          <h6 className="mb-1">{localization?.['UI.Combat.CounterAttacks'] || '⚔️ Contra-Ataques'}</h6>
          <p className="mb-0 small">{localization?.['UI.Combat.ManageCounterAttacks'] || 'Gerencie cada contra-ataque individualmente'}</p>
        </div>

        <div className="d-flex flex-wrap gap-1 mb-2">
          {combatGroup.filter((gc) => gc.status !== 'cancelled').map((gc) => {
            const isSelected = selectedCounterCombat?.id === gc.id;
            const isFinished = gc.combat_phase === 'results';
            const inCounterRound = gc.combat_phase === 'rolling' && gc.current_round > 1;
            const btnClass = isFinished ? 'btn-secondary' : isSelected ? 'btn-primary' : inCounterRound ? 'btn-outline-warning' : 'btn-outline-info';

            return (
              <button
                key={gc.id}
                type="button"
                className={`btn btn-sm ${btnClass}`}
                onClick={() => onSelectGroupCombat(gc)}
                disabled={isFinished}
              >
                {gc.defender_name} {isFinished ? '📊' : inCounterRound ? `R${gc.current_round}` : '⏳'}
              </button>
            );
          })}
        </div>

        {selectedCounterCombat && selectedCounterCombat.current_round > 1 && (() => {
          const sc = selectedCounterCombat;
          const scRound = sc.round_data?.[sc.current_round - 1] || {};
          const scIsCounter = scRound.action_type === 'counter';
          const scIsOpportunity = scRound.action_type === 'opportunity';
          const scAtkRolled = scRound.attacker?.rolled || false;
          const scDefRolled = scRound.defender?.rolled || false;

          const leftP = scIsOpportunity
            ? {
                name: scRound.opportunity_attacker_name || (localization?.['UI.Combat.Spectator'] || 'Espectador'),
                weapon: scRound.opportunity_weapon?.Name || 'Arma',
                rolled: scAtkRolled,
                data: scRound.attacker,
                icon: '⚡'
              }
            : scIsCounter
            ? {
                name: sc.defender_name,
                weapon: sc.defender_weapon?.Name || 'Arma',
                rolled: scDefRolled,
                data: scRound.defender,
                icon: '⚔️'
              }
            : {
                name: sc.attacker_name,
                weapon: sc.attack_data?.Name || 'Ataque',
                rolled: scAtkRolled,
                data: scRound.attacker,
                icon: '⚔️'
              };

          const rightP = scIsOpportunity
            ? {
                name: scRound.opportunity_target === 'attacker' ? sc.attacker_name : sc.defender_name,
                weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                rolled: scDefRolled,
                data: scRound.defender,
                icon: '🛡️'
              }
            : scIsCounter
            ? {
                name: sc.attacker_name,
                weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                rolled: scAtkRolled,
                data: scRound.attacker,
                icon: '🛡️'
              }
            : {
                name: sc.defender_name,
                weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
                rolled: scDefRolled,
                data: scRound.defender,
                icon: '🛡️'
              };

          // Neste bloco o usuário logado é sempre o Atacante do grupo
          const attackerActsOnLeft = !scIsCounter && !scIsOpportunity;
          const attackerDefendsOnRight =
            scIsCounter || (scIsOpportunity && scRound.opportunity_target === 'attacker');

          return (
            <>
              <header className="combat-round-header mb-2">
                <div className="round-info">
                  <span className="round-label">
                    vs {sc.defender_name} — {localization?.['UI.Combat.Round'] || 'Rodada'} {sc.current_round}/{sc.total_rounds}
                  </span>
                </div>
              </header>

              <section className="combatants-container mb-2" aria-label="Combatentes da rodada">
                {/* Lado Esquerdo (Quem ataca nesta rodada) */}
                <article className="combatant-card attacker-card">
                  <div className="combatant-header">
                    <span className="combatant-icon">{leftP.icon}</span>
                    <h6 className="combatant-name">{leftP.name}</h6>
                  </div>
                  <div className="combatant-weapon">{leftP.weapon}</div>

                  {rolling && attackerActsOnLeft && (
                    <div className="dice-animation-inline">
                      <div className="dice-rolling-inline">
                        {diceAnimation.map((die, i) => (
                          <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {leftP.rolled && leftP.data ? (
                    attackerActsOnLeft ? (
                      <div className="combatant-result">
                        <DiceResultAdjuster
                          diceArray={leftP.data.roll}
                          onAdjust={(newDice) => onAdjustDiceResult(newDice, true, sc)}
                          playerRole="left"
                          localization={localization}
                        />
                      </div>
                    ) : (
                      <div className="dice-result-inline">
                        {leftP.data.roll.map((die, i) => <span key={i} className="die-number">{die}</span>)}
                      </div>
                    )
                  ) : !rolling && attackerActsOnLeft ? (
                    <button type="button" className="btn-combat-roll-inline" onClick={() => onRollDice(sc)}>
                      <span className="combat-btn-icon">🎲</span>
                      <span className="combat-btn-text">{localization?.['UI.Combat.Roll'] || 'Rolar'}</span>
                    </button>
                  ) : (
                    <div className="combatant-waiting">
                      <span className="waiting-spinner">⏳</span>
                      <span>{localization?.['UI.Combat.Waiting'] || 'Aguardando...'}</span>
                    </div>
                  )}
                </article>

                <div className="vs-divider"><span className="vs-text">VS</span></div>

                {/* Lado Direito (Quem defende nesta rodada) */}
                <article className="combatant-card defender-card">
                  <div className="combatant-header">
                    <span className="combatant-icon">{rightP.icon}</span>
                    <h6 className="combatant-name">{rightP.name}</h6>
                  </div>
                  <div className="combatant-weapon">{rightP.weapon}</div>

                  {rolling && attackerDefendsOnRight && (
                    <div className="dice-animation-inline">
                      <div className="dice-rolling-inline">
                        {diceAnimation.map((die, i) => (
                          <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {rightP.rolled && rightP.data ? (
                    attackerDefendsOnRight ? (
                      <div className="combatant-result">
                        <DiceResultAdjuster
                          diceArray={rightP.data.roll}
                          onAdjust={(newDice) => onAdjustDiceResult(newDice, !scIsOpportunity, sc)}
                          playerRole="right"
                          localization={localization}
                        />
                      </div>
                    ) : (
                      <div className="dice-result-inline">
                        {rightP.data.roll.map((die, i) => <span key={i} className="die-number">{die}</span>)}
                      </div>
                    )
                  ) : !rolling && attackerDefendsOnRight && leftP.rolled ? (
                    <button type="button" className="btn-combat-roll-inline" onClick={() => onRollDice(sc)}>
                      <span className="combat-btn-icon">🎲</span>
                      <span className="combat-btn-text">{localization?.['UI.Combat.RollDefense'] || 'Rolar Defesa'}</span>
                    </button>
                  ) : (
                    <div className="combatant-waiting">
                      <span className="waiting-spinner">⏳</span>
                      <span>
                        {attackerDefendsOnRight && !leftP.rolled
                          ? (localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...')
                          : (localization?.['UI.Combat.Waiting'] || 'Aguardando...')}
                      </span>
                    </div>
                  )}
                </article>
              </section>

              {scAtkRolled && scDefRolled && !rolling && (
                <button type="button" className="btn-combat-advance mb-2" onClick={() => onAdvanceGroupCombat(sc)}>
                  <span className="combat-btn-icon">{sc.current_round >= sc.total_rounds ? '✅' : '➡️'}</span>
                  <span className="combat-btn-text">
                    {sc.current_round >= sc.total_rounds
                      ? (localization?.['UI.Combat.ViewResults'] || 'Ver Resultados')
                      : (localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada')}
                  </span>
                </button>
              )}
            </>
          );
        })()}

        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          🚫 {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
        </button>
      </>
    );
  }

  // ==========================================================================
  // VISÃO PADRÃO 1v1 (OU DEFENSOR / ESPECTADOR)
  // ==========================================================================
  let leftPlayer, rightPlayer;

  if (isOpportunityRound) {
    leftPlayer = {
      name: roundInfo.opportunity_attacker_name || (localization?.['UI.Combat.Spectator'] || 'Espectador'),
      weapon: roundInfo.opportunity_weapon?.Name || 'Arma',
      rolled: roundInfo.attacker?.rolled || false,
      data: roundInfo.attacker,
      icon: '⚡'
    };
    const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
    rightPlayer = {
      name: targetIsAttacker ? combat.attacker_name : combat.defender_name,
      weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
      rolled: roundInfo.defender?.rolled || false,
      data: roundInfo.defender,
      icon: '🛡️'
    };
  } else if (isAttackerActing) {
    leftPlayer = {
      name: combat.attacker_name,
      weapon: combat.attack_data?.Name,
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: '⚔️'
    };
    rightPlayer = {
      name: combat.defender_name,
      weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: '🛡️'
    };
  } else {
    leftPlayer = {
      name: combat.defender_name,
      weapon: combat.defender_weapon?.Name || 'Arma',
      rolled: defenderRolled,
      data: roundInfo.defender,
      icon: '⚔️'
    };
    rightPlayer = {
      name: combat.attacker_name,
      weapon: localization?.['UI.Combat.Defense'] || 'Defesa',
      rolled: attackerRolled,
      data: roundInfo.attacker,
      icon: '🛡️'
    };
  }

  // Determina a arma ativa na rodada atual para exibir Dados/Tempo/Dano
  const activeOffensiveWeapon = isOpportunityRound
    ? roundInfo.opportunity_weapon
    : isAttackerActing
    ? combat.attack_data
    : combat.defender_weapon;
  const weaponWithMode = activeOffensiveWeapon;

  // Determina os dados de defesa de quem está se defendendo nesta rodada
  const getDefenderDiceDisplay = () => {
    let defenderId = combat.defender_id;
    let dbDefenseField = combat.defender_defense_dices;

    if (isOpportunityRound) {
      const targetIsAttacker = roundInfo.opportunity_target === 'attacker';
      defenderId = targetIsAttacker ? combat.attacker_id : combat.defender_id;
      dbDefenseField = targetIsAttacker ? combat.attacker_defense_dices : combat.defender_defense_dices;
    } else if (!isAttackerActing) {
      defenderId = combat.attacker_id;
      dbDefenseField = combat.attacker_defense_dices;
    }

    if (defenderId === currentPlayer?.id) return currentDefenseDices;
    if (dbDefenseField !== null && dbDefenseField !== undefined) return dbDefenseField;

    const targetPlayer = players.find((p) => p.id === defenderId);
    return parseDefenseDices(targetPlayer?.character?.actor?.NumberOfDefenseDices, 0);
  };

  return (
    <>
      {/* Painel do Espectador e Botão de Ataque de Oportunidade */}
      {isSpectator && (
        <>
          <div className="alert alert-warning mb-2">
            <small>
              <strong>{localization?.['UI.Combat.SpectatorMode'] || '👁️ Modo Espectador'}</strong><br />
              {localization?.['UI.Combat.SpectatorWatching'] || 'Você está assistindo este combate.'}
            </small>
          </div>

          {combat.allow_opportunity_attacks &&
            !combat.opportunity_attacks_used?.includes(currentPlayer?.id) &&
            availableAttacks.length > 0 && (
              <button
                type="button"
                className="btn btn-warning w-100 mb-2"
                onClick={onOpenOpportunityModal}
              >
                {localization?.['UI.Combat.OpportunityAttack'] || '⚡ Dar Ataque de Oportunidade'}
              </button>
            )}

          {combat.opportunity_attacks_used?.includes(currentPlayer?.id) && (
            <div className="alert alert-secondary mb-2 py-1 px-2">
              <small style={{ fontSize: '10px' }}>
                {localization?.['UI.Combat.OpportunityUsed'] || '✅ Você já usou seu ataque de oportunidade'}
              </small>
            </div>
          )}
        </>
      )}

      {/* Indicadores de Rodada no Topo */}
      <div className="combat-round-header mb-2">
        <div className="round-info">
          <span className="round-label">
            {localization?.['UI.Combat.Round'] || 'Rodada'} {currentRound}/{totalRounds}
          </span>
        </div>
        <div className="round-indicators">
          {roundData.map((r, idx) => {
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
            const canMoveLeft = canMove && idx > currentRound && !roundData[idx - 1]?.completed;
            const canMoveRight = canMove && idx < roundData.length - 1;

            return (
              <div key={idx} className="round-dot-container">
                {canMoveLeft && (
                  <button type="button" className="round-dot-move-btn move-left" onClick={() => onMoveRoundLeft(idx)}>
                    ◀
                  </button>
                )}
                <div
                  className={`round-dot ${colorClass} ${isCurrent ? 'round-dot-active' : ''} ${isCompleted ? 'round-dot-completed' : ''}`}
                  title={`${idx + 1}: ${actionLabel}`}
                >
                  <span className="round-dot-number">{idx + 1}</span>
                </div>
                {canMoveRight && (
                  <button type="button" className="round-dot-move-btn move-right" onClick={() => onMoveRoundRight(idx)}>
                    ▶
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gaveta de Ajustes de Equipamento, Defesa e Rodadas */}
      {canChangeEquipment && (
        <div className="weapon-info-panel mb-2">
          <details className="weapon-details">
            <summary className="weapon-summary">
              <span className="weapon-icon">🔄</span>
              <span className="weapon-label">
                {localization?.['UI.Combat.ChangeEquipment'] || 'Alterar Equipamento'}
                {actor?.mode1 && actor?.mode2 && (
                  <span className="weapon-mode-indicator">
                    {localization?.[actor[combatMode]] || actor[combatMode] || combatMode}
                  </span>
                )}
              </span>
              <span className="toggle-icon">▼</span>
            </summary>

            <div className="weapon-details-content">
              <div className="weapon-change-section">
                {/* Alternância de Modo */}
                {actor?.mode1 && actor?.mode2 && (
                  <div className="mode-switch-section">
                    <div className="mode-switch-title">
                      {localization?.['UI.Combat.CombatMode'] || '🔀 Modo de Combate'}
                    </div>
                    <div className="btn-group" role="group">
                      <button
                        type="button"
                        className={`btn ${combatMode === 'mode1' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => onChangeCombatMode('mode1')}
                      >
                        {localization?.[actor.mode1] || actor.mode1 || 'Modo 1'}
                      </button>
                      <button
                        type="button"
                        className={`btn ${combatMode === 'mode2' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => onChangeCombatMode('mode2')}
                      >
                        {localization?.[actor.mode2] || actor.mode2 || 'Modo 2'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Trocar Arma */}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning w-100 mb-2"
                  onClick={onOpenWeaponChange}
                >
                  {localization?.['UI.Combat.ChangeWeapon'] || '⚔️ Trocar Arma'}{' '}
                  {tempWeapon && (localization?.['UI.Combat.Changed'] || '(Alterada)')}
                </button>

                {/* Slider de Dados de Defesa */}
                <div className="defense-adjustment">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                      {localization?.['UI.Combat.DefenseDice'] || '🛡️ Dados de Defesa'}
                    </label>
                    <span className="badge bg-primary" style={{ fontSize: '16px', padding: '6px 12px' }}>
                      {currentDefenseDices}
                    </span>
                  </div>

                  <input
                    type="range"
                    className="form-range defense-slider"
                    min="0"
                    max="8"
                    value={currentDefenseDices}
                    onChange={(e) => onDefenseDicesChange(parseInt(e.target.value, 10))}
                    style={{ width: '100%' }}
                  />

                  <div className="d-flex justify-content-between text-muted" style={{ fontSize: '10px', marginTop: '4px' }}>
                    <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span>
                  </div>

                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary flex-fill"
                      onClick={() => onDefenseDicesChange(defaultActorDefense)}
                    >
                      {localization?.['UI.Combat.ResetDefense'] || '↺ Resetar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary flex-fill"
                      onClick={() => onAdjustDefenseDices(-2)}
                    >
                      −2
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary flex-fill"
                      onClick={() => onAdjustDefenseDices(2)}
                    >
                      +2
                    </button>
                  </div>
                </div>

                {/* Gerenciamento de Rodadas (+ Ataque / + Contra / - Remover) */}
                <div className="round-management mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label text-white mb-0" style={{ fontSize: '13px' }}>
                      {localization?.['UI.Combat.ManageRounds'] || '⚔️ Gerenciar Rodadas'}
                    </label>
                    <span className="badge bg-warning text-dark" style={{ fontSize: '14px', padding: '4px 10px' }}>
                      {totalRounds} {localization?.['UI.Combat.RoundsCount'] || 'rodadas'}
                    </span>
                  </div>

                  <div className="d-flex gap-2 mb-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary flex-fill"
                      onClick={() => onAddRound('attacker')}
                    >
                      {localization?.['UI.Combat.AddAttackRound'] || '⚔️ + Ataque'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-info flex-fill"
                      onClick={() => onAddRound('defender')}
                    >
                      {localization?.['UI.Combat.AddCounterRound'] || '🛡️ + Contra'}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger w-100"
                    onClick={onRemoveRound}
                    disabled={totalRounds <= 1}
                  >
                    {localization?.['UI.Combat.RemoveLastRound'] || '− Remover Última Rodada'}
                  </button>
                </div>

                {/* Trocar Defensor */}
                {(isAttacker || isDefender) && (
                  <div className="mt-3">
                    <SwapDefenderControl
                      swapTargets={swapTargets}
                      onSwapDefender={onSwapDefender}
                      localization={localization}
                      btnClass="btn-outline-danger"
                    />
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Cards de Combatentes: Quem Ataca (Topo) VS Quem Defende (Baixo) */}
      <div className="combatants-container mb-2">
        {/* Card de Quem Ataca na Rodada */}
        <div className="combatant-card attacker-card">
          <div className="combatant-header">
            <span className="combatant-icon">{leftPlayer.icon}</span>
            <h6 className="combatant-name">{leftPlayer.name}</h6>
          </div>
          <div className="combatant-weapon">{leftPlayer.weapon}</div>

          <div className="weapon-stats-compact">
              <span className="stat-compact">🎲 {weaponWithMode?.Dices ?? '?'}</span>
              <span className="stat-compact">⚡ {weaponWithMode?.LoadTime ?? '?'}</span>
              <span className="stat-compact">💥 {weaponWithMode?.Damage ?? '0'}</span>
            </div>

          {rolling && (
            isOpportunityRound
              ? currentPlayer?.id === roundInfo.opportunity_attacker_id
              : ((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker))
          ) && (
            <div className="dice-animation-inline">
              <div className="dice-rolling-inline">
                {diceAnimation.map((die, i) => (
                  <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>
                ))}
              </div>
            </div>
          )}

          {leftPlayer.rolled && leftPlayer.data ? (
            <div className="combatant-result">
              {(isOpportunityRound
                ? currentPlayer?.id === roundInfo.opportunity_attacker_id
                : (((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) && !isSpectator)
              ) ? (
                <DiceResultAdjuster
                  diceArray={leftPlayer.data.roll}
                  onAdjust={(newDice) => onAdjustDiceResult(newDice, isOpportunityRound ? true : isAttackerActing)}
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
              {(isOpportunityRound
                ? currentPlayer?.id === roundInfo.opportunity_attacker_id
                : (((isAttackerActing && isAttacker) || (!isAttackerActing && !isAttacker)) && !isSpectator)
              ) ? (
                <button
                  type="button"
                  className="btn-combat-roll-inline"
                  onClick={onRollDice}
                  disabled={isOpportunityRound ? false : waitingForAttacker}
                >
                  <span className="combat-btn-icon">🎲</span>
                  <span className="combat-btn-text">{localization?.['UI.Combat.Roll'] || 'Rolar'}</span>
                </button>
              ) : (
                <div className="combatant-waiting">
                  <span className="waiting-spinner">⏳</span>
                  <span>{isSpectator ? (localization?.['UI.Combat.Spectator'] || 'Espectador') : (localization?.['UI.Combat.Waiting'] || 'Aguardando...')}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="vs-divider"><span className="vs-text">VS</span></div>

        {/* Card de Quem Defende na Rodada */}
        <div className="combatant-card defender-card">
          <div className="combatant-header">
            <span className="combatant-icon">{rightPlayer.icon}</span>
            <h6 className="combatant-name">{rightPlayer.name}</h6>
          </div>
          <div className="combatant-weapon">{rightPlayer.weapon}</div>

          <div className="weapon-stats-compact weapon-stats-enemy">
            <span className="stat-compact" title={localization?.['UI.Combat.DefenseDiceTitle'] || 'Dados de Defesa'}>
              🛡️ {getDefenderDiceDisplay()}
            </span>
          </div>

          {rolling && (
            isOpportunityRound
              ? ((roundInfo.opportunity_target === 'attacker' && isAttacker) || (roundInfo.opportunity_target === 'defender' && isDefender))
              : ((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker))
          ) && (
            <div className="dice-animation-inline">
              <div className="dice-rolling-inline">
                {diceAnimation.map((die, i) => (
                  <span key={`${die}-${i}`} className="die-animated-inline">{die}</span>
                ))}
              </div>
            </div>
          )}

          {rightPlayer.rolled && rightPlayer.data ? (
            <div className="combatant-result">
              {(isOpportunityRound
                ? ((roundInfo.opportunity_target === 'attacker' && isAttacker) || (roundInfo.opportunity_target === 'defender' && isDefender))
                : (((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker)) && !isSpectator)
              ) ? (
                <DiceResultAdjuster
                  diceArray={rightPlayer.data.roll}
                  onAdjust={(newDice) => onAdjustDiceResult(newDice, isOpportunityRound ? false : !isAttackerActing)}
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
              {(isOpportunityRound
                ? (((roundInfo.opportunity_target === 'attacker' && isAttacker) || (roundInfo.opportunity_target === 'defender' && isDefender)) && roundInfo.attacker?.rolled)
                : (((!isAttackerActing && isAttacker) || (isAttackerActing && !isAttacker)) && !waitingForAttacker && !isSpectator)
              ) ? (
                <button type="button" className="btn-combat-roll-inline" onClick={onRollDice}>
                  <span className="combat-btn-icon">🎲</span>
                  <span className="combat-btn-text">{localization?.['UI.Combat.Roll'] || 'Rolar'}</span>
                </button>
              ) : (
                <div className="combatant-waiting">
                  <span className="waiting-spinner">⏳</span>
                  <span>
                    {isSpectator
                      ? (localization?.['UI.Combat.Spectator'] || 'Espectador')
                      : waitingForAttacker || (isOpportunityRound && !roundInfo.attacker?.rolled)
                      ? (localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...')
                      : (localization?.['UI.Combat.Waiting'] || 'Aguardando...')}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Botão de Avançar Rodada */}
      {attackerRolled && defenderRolled && !rolling && !isSpectator && (
        <button type="button" className="btn-combat-advance mb-2" onClick={onAdvanceRound}>
          <span className="combat-btn-icon">{currentRound >= totalRounds ? '✅' : '➡️'}</span>
          <span className="combat-btn-text">
            {currentRound >= totalRounds
              ? (localization?.['UI.Combat.ViewResults'] || 'Ver Resultados')
              : (localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada')}
          </span>
        </button>
      )}

      {!isSpectator && (
        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          <span className="me-2">🚫</span>
          {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
        </button>
      )}
    </>
  );
};

export default CombatRollingView;