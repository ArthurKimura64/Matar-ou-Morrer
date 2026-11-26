import React from 'react';
import CombatantCard, { TurnStatusBanner } from './CombatantCard';
import { parseAttackDices, parseDefenseDices } from '../../utils/combatHelpers';

const isCombatFullyDone = (gc) => {
  if (!gc) return true;
  if (gc.combat_phase === 'results') return true;
  const lastRound = gc.round_data?.[gc.current_round - 1];
  return gc.current_round >= gc.total_rounds && Boolean(lastRound?.completed);
};

const MultiTargetRollingView = ({
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
  rollingCombatId,
  diceAnimation,
  onRollDice,
  onAdjustDiceResult,
  onAdvanceMultiRound1,
  onAdvanceSingleGroupDuel,
  onShowGroupResults,
  onEndCombat,
  localization = {}
}) => {
  const activeGroup = combatGroup.filter((gc) => gc.status !== 'cancelled');
  if (activeGroup.length === 0) return null;

  const primaryCombat = activeGroup[0];
  const isAttacker = Boolean(currentPlayer?.id && currentPlayer.id === primaryCombat.attacker_id);
  const myDefenderCombat = activeGroup.find((gc) => gc.defender_id === currentPlayer?.id) || null;
  const isDefenderInGroup = Boolean(myDefenderCombat);
  const isParticipant = isAttacker || isDefenderInGroup;

  const actor = currentPlayerData?.character?.actor;
  const defaultActorDefense = parseDefenseDices(actor?.NumberOfDefenseDices, 0);

  const getDefenseDiceFor = (gc) => {
    if (gc.defender_id === currentPlayer?.id) return currentDefenseDices;
    if (gc.defender_defense_dices !== null && gc.defender_defense_dices !== undefined) {
      return gc.defender_defense_dices;
    }
    const targetPlayer = players.find((p) => p.id === gc.defender_id);
    return parseDefenseDices(
      targetPlayer?.defense_dice_count ?? targetPlayer?.character?.actor?.NumberOfDefenseDices,
      0
    );
  };

  const getAttackerDefenseDice = () => {
    if (isAttacker) return currentDefenseDices;
    if (primaryCombat.attacker_defense_dices !== null && primaryCombat.attacker_defense_dices !== undefined) {
      return primaryCombat.attacker_defense_dices;
    }
    const atkPlayer = players.find((p) => p.id === primaryCombat.attacker_id);
    return parseDefenseDices(
      atkPlayer?.defense_dice_count ?? atkPlayer?.character?.actor?.NumberOfDefenseDices,
      0
    );
  };

  // Gaveta enxuta de equipamento (Trocar Arma / Modo / Dados de Defesa) para participantes
  const renderEquipmentPanel = () => {
    if (!isParticipant) return null;
    return (
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

            <button
              type="button"
              className="btn btn-sm btn-outline-warning w-100 mb-2"
              onClick={onOpenWeaponChange}
            >
              {localization?.['UI.Combat.ChangeWeapon'] || '⚔️ Trocar Arma'}{' '}
              {tempWeapon && (localization?.['UI.Combat.Changed'] || '(Alterada)')}
            </button>

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
          </div>
        </details>
      </div>
    );
  };

  // ==========================================================================
  // 1. RODADA 1 UNIFICADA (Atacante VS Todos os Defensores — igual para todos)
  // ==========================================================================
  const isInUnifiedRound1 = activeGroup.every((gc) => gc.current_round === 1);

  if (isInUnifiedRound1) {
    const sharedRoll = primaryCombat.attacker_shared_roll || primaryCombat.round_data?.[0]?.attacker;
    const attackerHasRolled = Boolean(sharedRoll?.rolled);
    const attackerDiceArr = sharedRoll?.roll || [];
    const atkExpectedDices = parseAttackDices(primaryCombat.attack_data?.Dices, 0);

    const pendingDefenders = activeGroup.filter((gc) => !gc.round_data?.[0]?.defender?.rolled);
    const allDefendersRolled = pendingDefenders.length === 0;
    const myDefRolled = Boolean(myDefenderCombat?.round_data?.[0]?.defender?.rolled);
    const hasFollowUpRounds = activeGroup.some((gc) => gc.total_rounds > 1);

    let banner;
    if (!attackerHasRolled) {
      banner = isAttacker
        ? {
            variant: 'danger',
            icon: '🎲',
            title: 'SUA VEZ: Role seu ataque para todos os alvos!',
            subtitle: primaryCombat.attack_data?.Name,
            highlight: true
          }
        : {
            variant: 'secondary',
            icon: '⏳',
            title: `Aguardando ${primaryCombat.attacker_name} rolar o ataque...`,
            subtitle: primaryCombat.attack_data?.Name
          };
    } else if (!allDefendersRolled) {
      banner =
        isDefenderInGroup && !myDefRolled
          ? {
              variant: 'info',
              icon: '🛡️',
              title: 'SUA VEZ: Role seus dados de DEFESA!',
              subtitle: `Defendendo contra ${primaryCombat.attacker_name}`,
              highlight: true
            }
          : {
              variant: 'secondary',
              icon: '⏳',
              title: `Aguardando defesa: ${pendingDefenders.map((d) => d.defender_name).join(', ')}`
            };
    } else {
      banner = isParticipant
        ? {
            variant: 'success',
            icon: '✅',
            title: hasFollowUpRounds
              ? 'Rodada 1 concluída! Clique em "Avançar Rodada".'
              : 'Combate concluído! Clique em "Ver Resultados".',
            highlight: true
          }
        : {
            variant: 'secondary',
            icon: '✅',
            title: 'Rodada 1 concluída — aguardando avançar'
          };
    }

    return (
      <>
        <TurnStatusBanner {...banner} />

        {!isParticipant && (
          <div className="alert alert-warning mb-2 py-2 px-3">
            <small>
              <strong>{localization?.['UI.Combat.SpectatorMode'] || '👁️ Modo Espectador'}</strong>
              <br />
              {localization?.['UI.Combat.SpectatorWatching'] || 'Você está assistindo este combate.'}
            </small>
          </div>
        )}

        <div className="combat-round-header mb-2">
          <div className="round-info mb-0">
            <span className="round-label">
              ⚔️ Multi-Alvo — {localization?.['UI.Combat.Round'] || 'Rodada'} 1 ({activeGroup.length} defensores)
            </span>
          </div>
        </div>

        {renderEquipmentPanel()}

        <section className="combatants-container mb-2" aria-label="Combatentes da rodada 1">
          {/* Card do Atacante */}
          <CombatantCard
            role="attacker"
            icon="⚔️"
            name={primaryCombat.attacker_name}
            weaponName={primaryCombat.attack_data?.Name}
            stats={
              <div className="weapon-stats-compact">
                <span className="stat-compact">🎲 {primaryCombat.attack_data?.Dices ?? '?'}</span>
                <span className="stat-compact">⚡ {primaryCombat.attack_data?.LoadTime ?? '?'}</span>
                <span className="stat-compact">💥 {primaryCombat.attack_data?.Damage ?? '0'}</span>
              </div>
            }
            isRolling={rolling && isAttacker}
            diceAnimation={diceAnimation}
            rolled={attackerHasRolled}
            diceArray={attackerDiceArr}
            minDieValue={atkExpectedDices === 0 ? 0 : 1}
            canAdjust={isAttacker}
            onAdjust={(newDice) => onAdjustDiceResult(newDice, true, primaryCombat)}
            canRoll={isAttacker && !attackerHasRolled}
            rollLabel={localization?.['UI.Combat.RollAttackAll'] || 'Rolar Ataque (Todos)'}
            onRoll={() => onRollDice(primaryCombat)}
            waitingText={localization?.['UI.Combat.Waiting'] || 'Aguardando...'}
            localization={localization}
          />

          <div className="vs-divider">
            <span className="vs-text">VS</span>
          </div>

          {/* Cards de TODOS os Defensores (visíveis para todos, sem somar dados) */}
          {activeGroup.map((gc) => {
            const defRound = gc.round_data?.[0]?.defender;
            const defRolled = Boolean(defRound?.rolled);
            const defDiceArr = defRound?.roll || [];
            const isThisMe = gc.defender_id === currentPlayer?.id;
            const defDiceCount = getDefenseDiceFor(gc);

            return (
              <CombatantCard
                key={gc.id}
                role="defender"
                icon="🛡️"
                name={`${gc.defender_name}${isThisMe ? ' (Você)' : ''}`}
                weaponName={
                  gc.defender_weapon?.Name
                    ? `${localization?.['UI.Combat.Defense'] || 'Defesa'} • ${gc.defender_weapon.Name}`
                    : localization?.['UI.Combat.Defense'] || 'Defesa'
                }
                stats={
                  <div className="weapon-stats-compact weapon-stats-enemy">
                    <span className="stat-compact" title="Dados de Defesa">
                      🛡️ {defDiceCount}
                    </span>
                  </div>
                }
                isRolling={rolling && rollingCombatId === gc.id && isThisMe}
                diceAnimation={diceAnimation}
                rolled={defRolled}
                diceArray={defDiceArr}
                minDieValue={defDiceCount === 0 ? 0 : 1}
                canAdjust={isThisMe}
                onAdjust={(newDice) => onAdjustDiceResult(newDice, false, gc)}
                canRoll={isThisMe && attackerHasRolled && !defRolled}
                rollLabel={localization?.['UI.Combat.RollDefense'] || 'Rolar Defesa'}
                onRoll={() => onRollDice(gc)}
                waitingText={
                  !attackerHasRolled
                    ? localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...'
                    : localization?.['UI.Combat.Waiting'] || 'Aguardando...'
                }
                localization={localization}
              />
            );
          })}
        </section>

        {/* Único botão para avançar todos juntos ou abrir resultados unificados */}
        {attackerHasRolled && allDefendersRolled && !rolling && isParticipant && (
          <button
            type="button"
            className="btn-combat-advance mb-2"
            onClick={hasFollowUpRounds ? onAdvanceMultiRound1 : onShowGroupResults}
          >
            <span className="combat-btn-icon">{hasFollowUpRounds ? '➡️' : '✅'}</span>
            <span className="combat-btn-text">
              {hasFollowUpRounds
                ? localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada'
                : localization?.['UI.Combat.ViewResults'] || 'Ver Resultados'}
            </span>
          </button>
        )}

        {isParticipant && (
          <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
            🚫 {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
          </button>
        )}
      </>
    );
  }

  // ==========================================================================
  // 2. RODADAS 2+ (Contra-ataques e ataques extras — visível para toda a mesa)
  // ==========================================================================
  const duelCombats = activeGroup.filter((gc) => gc.total_rounds > 1);
  const allDuelsDone = activeGroup.every(isCombatFullyDone);

  const selectedDuel =
    (activeCombatId && duelCombats.find((gc) => gc.id === activeCombatId)) ||
    duelCombats.find((gc) => !isCombatFullyDone(gc)) ||
    duelCombats[0] ||
    primaryCombat;

  const scRound = selectedDuel.round_data?.[selectedDuel.current_round - 1] || {};
  const isCounter = scRound.action_type === 'counter';
  const isOpportunity = scRound.action_type === 'opportunity';
  const scAtkRolled = Boolean(scRound.attacker?.rolled);
  const scDefRolled = Boolean(scRound.defender?.rolled);

  const leftSide = isOpportunity
    ? {
        playerId: scRound.opportunity_attacker_id,
        name: scRound.opportunity_attacker_name || 'Espectador',
        weapon: scRound.opportunity_weapon?.Name || 'Arma',
        weaponObj: scRound.opportunity_weapon,
        rolled: scAtkRolled,
        dice: scRound.attacker?.roll || [],
        icon: '⚡',
        adjustAsAttacker: true
      }
    : isCounter
    ? {
        playerId: selectedDuel.defender_id,
        name: selectedDuel.defender_name,
        weapon: selectedDuel.defender_weapon?.Name || 'Arma',
        weaponObj: selectedDuel.defender_weapon,
        rolled: scDefRolled,
        dice: scRound.defender?.roll || [],
        icon: '⚔️',
        adjustAsAttacker: false
      }
    : {
        playerId: selectedDuel.attacker_id,
        name: selectedDuel.attacker_name,
        weapon: selectedDuel.attack_data?.Name || 'Ataque',
        weaponObj: selectedDuel.attack_data,
        rolled: scAtkRolled,
        dice: scRound.attacker?.roll || [],
        icon: '⚔️',
        adjustAsAttacker: true
      };

  const rightSide = isOpportunity
    ? {
        playerId: scRound.opportunity_target === 'attacker' ? selectedDuel.attacker_id : selectedDuel.defender_id,
        name: scRound.opportunity_target === 'attacker' ? selectedDuel.attacker_name : selectedDuel.defender_name,
        rolled: scDefRolled,
        dice: scRound.defender?.roll || [],
        defenseDices:
          scRound.opportunity_target === 'attacker'
            ? getAttackerDefenseDice()
            : getDefenseDiceFor(selectedDuel),
        adjustAsAttacker: false
      }
    : isCounter
    ? {
        playerId: selectedDuel.attacker_id,
        name: selectedDuel.attacker_name,
        rolled: scAtkRolled,
        dice: scRound.attacker?.roll || [],
        defenseDices: getAttackerDefenseDice(),
        adjustAsAttacker: true
      }
    : {
        playerId: selectedDuel.defender_id,
        name: selectedDuel.defender_name,
        rolled: scDefRolled,
        dice: scRound.defender?.roll || [],
        defenseDices: getDefenseDiceFor(selectedDuel),
        adjustAsAttacker: false
      };

  const isMyOffense = Boolean(currentPlayer?.id && currentPlayer.id === leftSide.playerId);
  const isMyDefense = Boolean(currentPlayer?.id && currentPlayer.id === rightSide.playerId);
  const duelBothRolled = leftSide.rolled && rightSide.rolled;
  const duelHasMoreRounds = selectedDuel.current_round < selectedDuel.total_rounds;
  const nextPendingDuel = duelCombats.find((gc) => gc.id !== selectedDuel.id && !isCombatFullyDone(gc));

  let duelBanner;
  if (allDuelsDone) {
    duelBanner = isParticipant
      ? {
          variant: 'success',
          icon: '✅',
          title: 'Todas as rodadas concluídas! Clique em "Ver Resultados".',
          highlight: true
        }
      : { variant: 'secondary', icon: '✅', title: 'Todas as rodadas concluídas' };
  } else if (duelBothRolled) {
    duelBanner = {
      variant: 'success',
      icon: '✅',
      title: duelHasMoreRounds
        ? 'Rodada concluída! Clique em "Avançar Rodada".'
        : `Contra-ataque com ${selectedDuel.defender_name} concluído!`,
      highlight: isParticipant
    };
  } else if (isMyOffense && !leftSide.rolled) {
    duelBanner = {
      variant: 'danger',
      icon: '🎲',
      title: isCounter ? 'SUA VEZ: Role seu CONTRA-ATAQUE!' : 'SUA VEZ: Role seu ATAQUE!',
      highlight: true
    };
  } else if (isMyDefense && leftSide.rolled && !rightSide.rolled) {
    duelBanner = {
      variant: 'info',
      icon: '🛡️',
      title: 'SUA VEZ: Role seus dados de DEFESA!',
      highlight: true
    };
  } else if (!leftSide.rolled) {
    duelBanner = { variant: 'secondary', icon: '⏳', title: `Aguardando ${leftSide.name} rolar o ataque...` };
  } else {
    duelBanner = { variant: 'secondary', icon: '⏳', title: `Aguardando ${rightSide.name} rolar a defesa...` };
  }

  const leftExpectedDices = parseAttackDices(leftSide.weaponObj?.Dices, 0);

  return (
    <>
      <TurnStatusBanner {...duelBanner} />

      {/* Abas para todos acompanharem todos os defensores */}
      <div className="d-flex flex-wrap gap-1 mb-2">
        {duelCombats.map((gc) => {
          const isSelected = selectedDuel.id === gc.id;
          const done = isCombatFullyDone(gc);
          const btnClass = isSelected
            ? 'btn-primary'
            : done
            ? 'btn-outline-success'
            : 'btn-outline-warning';

          return (
            <button
              key={gc.id}
              type="button"
              className={`btn btn-sm ${btnClass}`}
              onClick={() => onSelectGroupCombat(gc, isAttacker)}
            >
              {gc.defender_name} {done ? '✅' : `R${gc.current_round}/${gc.total_rounds}`}
            </button>
          );
        })}
      </div>

      {renderEquipmentPanel()}

      <header className="combat-round-header mb-2">
        <div className="round-info mb-0">
          <span className="round-label">
            {selectedDuel.attacker_name} vs {selectedDuel.defender_name} —{' '}
            {localization?.['UI.Combat.Round'] || 'Rodada'} {selectedDuel.current_round}/{selectedDuel.total_rounds}
          </span>
        </div>
      </header>

      <section className="combatants-container mb-2" aria-label="Duelo atual">
        <CombatantCard
          role="attacker"
          icon={leftSide.icon}
          name={leftSide.name}
          weaponName={leftSide.weapon}
          stats={
            <div className="weapon-stats-compact">
              <span className="stat-compact">🎲 {leftSide.weaponObj?.Dices ?? '?'}</span>
              <span className="stat-compact">⚡ {leftSide.weaponObj?.LoadTime ?? '?'}</span>
              <span className="stat-compact">💥 {leftSide.weaponObj?.Damage ?? '0'}</span>
            </div>
          }
          isRolling={rolling && rollingCombatId === selectedDuel.id && isMyOffense}
          diceAnimation={diceAnimation}
          rolled={leftSide.rolled}
          diceArray={leftSide.dice}
          minDieValue={leftExpectedDices === 0 ? 0 : 1}
          canAdjust={isMyOffense}
          onAdjust={(newDice) => onAdjustDiceResult(newDice, leftSide.adjustAsAttacker, selectedDuel)}
          canRoll={isMyOffense && !leftSide.rolled}
          rollLabel={localization?.['UI.Combat.Roll'] || 'Rolar'}
          onRoll={() => onRollDice(selectedDuel)}
          waitingText={localization?.['UI.Combat.Waiting'] || 'Aguardando...'}
          localization={localization}
        />

        <div className="vs-divider">
          <span className="vs-text">VS</span>
        </div>

        <CombatantCard
          role="defender"
          icon="🛡️"
          name={rightSide.name}
          weaponName={localization?.['UI.Combat.Defense'] || 'Defesa'}
          stats={
            <div className="weapon-stats-compact weapon-stats-enemy">
              <span className="stat-compact">🛡️ {rightSide.defenseDices}</span>
            </div>
          }
          isRolling={rolling && rollingCombatId === selectedDuel.id && isMyDefense}
          diceAnimation={diceAnimation}
          rolled={rightSide.rolled}
          diceArray={rightSide.dice}
          minDieValue={rightSide.defenseDices === 0 ? 0 : 1}
          canAdjust={isMyDefense}
          onAdjust={(newDice) => onAdjustDiceResult(newDice, rightSide.adjustAsAttacker, selectedDuel)}
          canRoll={isMyDefense && leftSide.rolled && !rightSide.rolled}
          rollLabel={localization?.['UI.Combat.RollDefense'] || 'Rolar Defesa'}
          onRoll={() => onRollDice(selectedDuel)}
          waitingText={
            isMyDefense && !leftSide.rolled
              ? localization?.['UI.Combat.WaitForAttacker'] || 'Aguarde atacante...'
              : localization?.['UI.Combat.Waiting'] || 'Aguardando...'
          }
          localization={localization}
        />
      </section>

      {/* Um único botão contextual: avança rodada -> troca para próximo defensor -> Ver Resultados unificado */}
      {isParticipant && !rolling && (
        <>
          {allDuelsDone ? (
            <button type="button" className="btn-combat-advance mb-2" onClick={onShowGroupResults}>
              <span className="combat-btn-icon">✅</span>
              <span className="combat-btn-text">
                {localization?.['UI.Combat.ViewResults'] || 'Ver Resultados'}
              </span>
            </button>
          ) : duelBothRolled && duelHasMoreRounds ? (
            <button
              type="button"
              className="btn-combat-advance mb-2"
              onClick={() => onAdvanceSingleGroupDuel(selectedDuel)}
            >
              <span className="combat-btn-icon">➡️</span>
              <span className="combat-btn-text">
                {localization?.['UI.Combat.AdvanceRound'] || 'Avançar Rodada'}
              </span>
            </button>
          ) : duelBothRolled && nextPendingDuel ? (
            <button
              type="button"
              className="btn-combat-advance mb-2"
              onClick={() => onSelectGroupCombat(nextPendingDuel, true)}
            >
              <span className="combat-btn-icon">➡️</span>
              <span className="combat-btn-text">
                Próximo: {nextPendingDuel.defender_name}
              </span>
            </button>
          ) : null}
        </>
      )}

      {isParticipant && (
        <button type="button" className="btn btn-danger w-100" onClick={onEndCombat}>
          🚫 {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
        </button>
      )}
    </>
  );
};

export default MultiTargetRollingView;