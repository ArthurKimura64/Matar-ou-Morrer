import React from 'react';

/**
 * ============================================================================
 * FASE 3 DO COMBATE: TELA DE RESULTADOS (CombatResultsView.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Exibe o histórico de todas as rodadas jogadas (tanto em combates 1v1 quanto
 * em combates Multi-Alvo) e permite encerrar o combate.
 * ============================================================================
 */
const CombatResultsView = ({
  combat,
  combatGroup = [],
  currentPlayer,
  onEndCombat,
  localization = {}
}) => {
  const roundData = combat.round_data || [];
  const isAttacker = currentPlayer?.id === combat?.attacker_id;
  const isMultiGroup = combatGroup.length > 1;

  // 1. Resultados Multi-Alvo (para o Atacante)
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
          {combatGroup.filter((gc) => gc.status !== 'cancelled').map((gc) => {
            const gcRounds = gc.round_data || [];
            return (
              <div key={gc.id} className="card bg-dark border-secondary mb-2">
                <div className="card-header py-1 px-2">
                  <strong className="text-white small">
                    {combat.attacker_name} ⚔️ vs 🛡️ {gc.defender_name}
                  </strong>
                  <span className={`badge ms-2 ${gc.combat_phase === 'results' ? 'bg-success' : 'bg-warning text-dark'}`}>
                    {gc.combat_phase === 'results' ? (localization?.['UI.Combat.StatusFinished'] || 'Finalizado') : gc.combat_phase}
                  </span>
                </div>
                <div className="card-body p-2">
                  {gcRounds.map((round, idx) => {
                    const atkRoll = round.attacker?.roll || [];
                    const defRoll = round.defender?.roll || [];
                    const label = round.action_type === 'counter'
                      ? (localization?.['UI.Combat.RoundType.Counter'] || 'Contra')
                      : round.action_type === 'opportunity'
                      ? (localization?.['UI.Combat.RoundType.Opportunity'] || 'Oportunidade')
                      : (localization?.['UI.Combat.RoundType.Attack'] || 'Ataque');

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

        <button type="button" className="btn btn-danger w-100 mt-3" onClick={onEndCombat}>
          <span className="me-2">✅</span>
          {localization?.['UI.Combat.EndAllCombats'] || 'Encerrar Todos os Combates'}
        </button>
      </>
    );
  }

  // 2. Resultados 1v1 Padrão
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
      </div>

      <div className="combat-results-rounds" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {roundData.map((round, idx) => {
          const isCounterAttack = round.action_type === 'counter';
          const isOpportunityRound = round.action_type === 'opportunity';
          const attackerRollData = round.attacker?.roll || [];
          const defenderRollData = round.defender?.roll || [];

          let displayAttackerName = combat.attacker_name;
          let displayDefenderName = combat.defender_name;
          let attackerIcon = '⚔️';
          let roundLabel = `${localization?.['UI.Combat.Round'] || 'Rodada'} ${round.round} - ${localization?.['UI.Combat.RoundType.Attack'] || 'Ataque'}`;

          if (isOpportunityRound) {
            displayAttackerName = round.opportunity_attacker_name || (localization?.['UI.Combat.Spectator'] || 'Espectador');
            displayDefenderName = round.opportunity_target === 'attacker' ? combat.attacker_name : combat.defender_name;
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
                    {attackerRollData.map((die, i) => (
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

      <button type="button" className="btn btn-danger w-100 mt-3" onClick={onEndCombat}>
        <span className="me-2">✅</span>
        {localization?.['UI.Combat.EndCombat'] || 'Encerrar Combate'}
      </button>
    </>
  );
};

export default CombatResultsView;