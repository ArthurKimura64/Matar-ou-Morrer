import React from 'react';
import DiceResultAdjuster from '../../components/DiceResultAdjuster';

/**
 * Faixa destacada no topo do painel indicando de quem é a vez de agir na rodada atual.
 */
export const TurnStatusBanner = ({ variant = 'secondary', icon, title, subtitle = null, highlight = false }) => {
  const glowMap = {
    danger: '0 0 14px rgba(239, 68, 68, 0.3)',
    info: '0 0 14px rgba(6, 182, 212, 0.3)',
    warning: '0 0 14px rgba(245, 158, 11, 0.3)',
    success: '0 0 14px rgba(16, 185, 129, 0.3)'
  };

  return (
    <div
      className={`alert alert-${variant} py-2 px-3 mb-2 text-center`}
      role="status"
      style={highlight && glowMap[variant] ? { boxShadow: glowMap[variant] } : undefined}
    >
      <div className="fw-bold small text-white">
        {icon} {title}
      </div>
      {subtitle && (
        <small className="text-light opacity-75 d-block" style={{ fontSize: '0.75rem' }}>
          {subtitle}
        </small>
      )}
    </div>
  );
};

/**
 * Cartão reutilizável de um combatente (Atacante ou Defensor) durante a fase de rolagem.
 * Exibe nome, arma, animação dos dados, botão de rolar ou ajuste do resultado.
 */
const CombatantCard = ({
  role = 'attacker', // 'attacker' | 'defender'
  icon,
  name,
  weaponName,
  stats = null,
  isRolling = false,
  diceAnimation = [],
  rolled = false,
  diceArray = [],
  minDieValue = 1,
  canAdjust = false,
  onAdjust,
  canRoll = false,
  rollDisabled = false,
  rollLabel = 'Rolar',
  onRoll,
  waitingText = 'Aguardando...',
  className = '',
  localization = {}
}) => {
  const isAttackerCard = role === 'attacker';

  return (
    <article
      className={`combatant-card ${isAttackerCard ? 'attacker-card' : 'defender-card'} ${className}`.trim()}
    >
      <div className="combatant-header">
        <span className="combatant-icon">{icon}</span>
        <h6 className="combatant-name">{name}</h6>
      </div>

      {weaponName && <div className="combatant-weapon">{weaponName}</div>}

      {stats}

      {isRolling && (
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

      {rolled ? (
        <div className="combatant-result">
          {canAdjust ? (
            <DiceResultAdjuster
              diceArray={diceArray}
              minValue={minDieValue}
              onAdjust={onAdjust}
              playerRole={isAttackerCard ? 'left' : 'right'}
              localization={localization}
            />
          ) : (
            <div className="dice-result-inline">
              {diceArray.map((die, i) => (
                <span key={i} className="die-number">
                  {die}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        !isRolling &&
        (canRoll ? (
          <button
            type="button"
            className="btn-combat-roll-inline"
            onClick={onRoll}
            disabled={rollDisabled}
          >
            <span className="combat-btn-icon">🎲</span>
            <span className="combat-btn-text">{rollLabel}</span>
          </button>
        ) : (
          <div className="combatant-waiting">
            <span className="waiting-spinner">⏳</span>
            <span>{waitingText}</span>
          </div>
        ))
      )}
    </article>
  );
};

export default CombatantCard;