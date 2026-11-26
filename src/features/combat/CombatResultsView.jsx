import React from 'react';

const sortDiceDesc = (diceArray) =>
  Array.isArray(diceArray) ? [...diceArray].sort((a, b) => Number(b) - Number(a)) : [];

const CombatResultsView = ({
  combat,
  combatGroup = [],
  currentPlayer,
  onEndCombat,
  localization = {}
}) => {
  const activeGroup = combatGroup.filter((gc) => gc.status !== 'cancelled');
  const isMultiGroup = activeGroup.length > 1;
  const isParticipant = isMultiGroup
    ? activeGroup.some(
        (gc) => gc.attacker_id === currentPlayer?.id || gc.defender_id === currentPlayer?.id
      )
    : currentPlayer?.id === combat?.attacker_id || currentPlayer?.id === combat?.defender_id;

  // 1. RESULTADOS MULTI-ALVO UNIFICADOS (igual para Atacante, Defensores e Espectadores)
  if (isMultiGroup) {
    const primary = activeGroup[0];
    const sharedAtkRoll = sortDiceDesc(
      primary.attacker_shared_roll?.roll || primary.round_data?.[0]?.attacker?.roll
    );
    const followUpCombats = activeGroup.filter((gc) => (gc.round_data || []).length > 1);

    return (
      <>
        <div className="combat-results-header mb-3">
          <div className="results-title">
            <span className="results-icon">📊</span>
            <h5 className="mb-0">
              {localization?.['UI.Combat.ResultsMultiTarget'] || 'Resultados — Multi-Alvo'}
            </h5>
          </div>
          <div className="results-fighters">
            <span className="fighter-name attacker-name">{primary.attacker_name}</span>
            <span className="vs-small">VS</span>
            <span className="fighter-name defender-name">
              {activeGroup.map((gc) => gc.defender_name).join(', ')}
            </span>
          </div>
          <small className="d-block mt-2 opacity-75">Dados ordenados do maior para o menor</small>
        </div>

        <div className="combat-results-rounds" style={{ maxHeight: '460px', overflowY: 'auto' }}>
          {/* Rodada 1: 1 rolagem do atacante vs todos os defensores */}
          <div className="round-result-card">
            <div className="round-result-header">
              <span className="round-badge">
                {localization?.['UI.Combat.Round'] || 'Rodada'} 1 -{' '}
                {localization?.['UI.Combat.RoundType.Attack'] || 'Ataque'} ({primary.attack_data?.Name})
              </span>
            </div>
            <div className="round-result-body">
              <div className="result-player attacker-result">
                <div className="result-player-name">
                  <span className="player-icon">⚔️</span>
                  <span>{primary.attacker_name}</span>
                </div>
                <div className="dice-result-final">
                  {sharedAtkRoll.map((die, i) => (
                    <span key={i} className="die-number-final">{die}</span>
                  ))}
                </div>
              </div>

              {activeGroup.map((gc) => {
                const defRoll = sortDiceDesc(gc.round_data?.[0]?.defender?.roll);
                return (
                  <div key={gc.id} className="result-player defender-result">
                    <div className="result-player-name">
                      <span className="player-icon">🛡️</span>
                      <span>{gc.defender_name}</span>
                    </div>
                    <div className="dice-result-final">
                      {defRoll.map((die, i) => (
                        <span key={i} className="die-number-final">{die}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rodadas 2+: Contra-ataques e rodadas extras com orientação correta */}
          {followUpCombats.map((gc) =>
            (gc.round_data || []).slice(1).map((round, idx) => {
              const isCounterAttack = round.action_type === 'counter';
              const isOpportunityRound = round.action_type === 'opportunity';

              const offenseRoll = sortDiceDesc(
                isCounterAttack ? round.defender?.roll : round.attacker?.roll
              );
              const defenseRoll = sortDiceDesc(
                isCounterAttack ? round.attacker?.roll : round.defender?.roll
              );

              const offenseName = isOpportunityRound
                ? round.opportunity_attacker_name || 'Espectador'
                : isCounterAttack
                ? gc.defender_name
                : gc.attacker_name;

              const defenseName = isOpportunityRound
                ? round.opportunity_target === 'attacker'
                  ? gc.attacker_name
                  : gc.defender_name
                : isCounterAttack
                ? gc.attacker_name
                : gc.defender_name;

              const roundLabel = isOpportunityRound
                ? `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - Oportunidade`
                : isCounterAttack
                ? `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - Contra-Ataque (${gc.defender_name})`
                : `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - Ataque (vs ${gc.defender_name})`;

              return (
                <div key={`${gc.id}-${idx}`} className="round-result-card">
                  <div className="round-result-header">
                    <span className="round-badge">{roundLabel}</span>
                  </div>
                  <div className="round-result-body">
                    <div className="result-player attacker-result">
                      <div className="result-player-name">
                        <span className="player-icon">{isOpportunityRound ? '⚡' : '⚔️'}</span>
                        <span>{offenseName}</span>
                      </div>
                      <div className="dice-result-final">
                        {offenseRoll.map((die, i) => (
                          <span key={i} className="die-number-final">{die}</span>
                        ))}
                      </div>
                    </div>

                    <div className="result-player defender-result">
                      <div className="result-player-name">
                        <span className="player-icon">🛡️</span>
                        <span>{defenseName}</span>
                      </div>
                      <div className="dice-result-final">
                        {defenseRoll.map((die, i) => (
                          <span key={i} className="die-number-final">{die}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isParticipant && (
          <button type="button" className="btn btn-danger w-100 mt-3" onClick={onEndCombat}>
            <span className="me-2">✅</span>
            {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
          </button>
        )}
      </>
    );
  }

  // 2. RESULTADOS 1v1 PADRÃO
  const roundData = combat.round_data || [];

  return (
    <>
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
        <small className="d-block mt-2 opacity-75">Dados ordenados do maior para o menor</small>
      </div>

      <div className="combat-results-rounds" style={{ maxHeight: '420px', overflowY: 'auto' }}>
        {roundData.map((round, idx) => {
          const isCounterAttack = round.action_type === 'counter';
          const isOpportunityRound = round.action_type === 'opportunity';

          const offenseRoll = sortDiceDesc(
            isCounterAttack ? round.defender?.roll : round.attacker?.roll
          );
          const defenseRoll = sortDiceDesc(
            isCounterAttack ? round.attacker?.roll : round.defender?.roll
          );

          let displayAttackerName = combat.attacker_name;
          let displayDefenderName = combat.defender_name;
          let attackerIcon = '⚔️';
          let roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.Attack'] || 'Ataque'}`;

          if (isOpportunityRound) {
            displayAttackerName =
              round.opportunity_attacker_name || localization?.['UI.Combat.Spectator'] || 'Espectador';
            displayDefenderName =
              round.opportunity_target === 'attacker' ? combat.attacker_name : combat.defender_name;
            attackerIcon = '⚡';
            roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.OpportunityAttack'] || 'Ataque de Oportunidade'}`;
          } else if (isCounterAttack) {
            displayAttackerName = combat.defender_name;
            displayDefenderName = combat.attacker_name;
            roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.CounterAttack'] || 'Contra-Ataque'}`;
          }

          return (
            <div key={idx} className="round-result-card">
              <div className="round-result-header">
                <span className="round-badge">{roundLabel}</span>
              </div>
              <div className="round-result-body">
                <div className="result-player attacker-result">
                  <div className="result-player-name">
                    <span className="player-icon">{attackerIcon}</span>
                    <span>{displayAttackerName}</span>
                  </div>
                  <div className="dice-result-final">
                    {offenseRoll.map((die, i) => (
                      <span key={i} className="die-number-final">{die}</span>
                    ))}
                  </div>
                </div>

                <div className="result-player defender-result">
                  <div className="result-player-name">
                    <span className="player-icon">🛡️</span>
                    <span>{displayDefenderName}</span>
                  </div>
                  <div className="dice-result-final">
                    {defenseRoll.map((die, i) => (
                      <span key={i} className="die-number-final">{die}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isParticipant && (
        <button type="button" className="btn btn-danger w-100 mt-3" onClick={onEndCombat}>
          <span className="me-2">✅</span>
          {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
        </button>
      )}
    </>
  );
};

export default CombatResultsView;