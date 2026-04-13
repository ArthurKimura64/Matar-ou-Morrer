import React, { useState, memo } from 'react';

/**
 * Componente extraído de CombatPanel — permite ajustar resultados de dados individualmente ou em grupo.
 */
const DiceResultAdjuster = memo(({ diceArray, onAdjust, playerRole, localization = {} }) => {
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
        title={localization['UI.Dice.DecreaseAll'] || "Diminuir todos os dados"}
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
                title={localization['UI.Dice.Increase'] || "Aumentar"}
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
                title={localization['UI.Dice.Decrease'] || "Diminuir"}
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
                  title={localization['UI.Dice.RemoveDie'] || "Remover dado"}
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
        title={localization['UI.Dice.IncreaseAll'] || "Aumentar todos os dados"}
      >
        +
      </button>
    </div>
  );
});

DiceResultAdjuster.displayName = 'DiceResultAdjuster';

export default DiceResultAdjuster;
