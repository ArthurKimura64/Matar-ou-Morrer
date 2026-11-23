import React, { useState, useEffect, useRef, memo } from 'react';

/**
 * Permite ajustar resultados de dados individualmente (hover no PC ou toque no celular) ou em grupo.
 */
const DiceResultAdjuster = memo(({ diceArray, onAdjust, playerRole, localization = {} }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const containerRef = useRef(null);

  // Fecha o controle do dado selecionado ao clicar/tocar fora
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSelectedIndex(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [selectedIndex]);

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
    const newDice = diceArray.map((die) => Math.max(1, Math.min(6, die + delta)));
    onAdjust(newDice);
  };

  const removeDie = (index) => {
    if (diceArray.length <= 1) return;
    const newDice = diceArray.filter((_, i) => i !== index);
    setSelectedIndex(null);
    setHoveredIndex(null);
    onAdjust(newDice);
  };

  const toggleDieSelection = (index) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  };

  const canIncreaseAll = diceArray.some((die) => die < 6);
  const canDecreaseAll = diceArray.some((die) => die > 1);

  return (
    <div ref={containerRef} className="dice-result-inline">
      <button
        type="button"
        className="dice-all-btn dice-all-down"
        onClick={(e) => {
          e.stopPropagation();
          adjustAllDice(-1);
        }}
        disabled={!canDecreaseAll}
        title={localization['UI.Dice.DecreaseAll'] || 'Diminuir todos os dados'}
      >
        −
      </button>

      {diceArray.map((die, i) => {
        const showControls = hoveredIndex === i || selectedIndex === i;

        return (
          <div
            key={i}
            className={`die-adjustable-wrapper ${showControls ? 'is-active' : ''}`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {showControls && (
              <div className="die-adjust-controls">
                <button
                  type="button"
                  className="die-adjust-btn die-adjust-up"
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustDie(i, 1);
                  }}
                  disabled={die >= 6}
                  title={localization['UI.Dice.Increase'] || 'Aumentar'}
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
                  title={localization['UI.Dice.Decrease'] || 'Diminuir'}
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
                    title={localization['UI.Dice.RemoveDie'] || 'Remover dado'}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              className="die-number border-0"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                toggleDieSelection(i);
              }}
              aria-expanded={showControls}
              aria-label={`Dado com valor ${die}. Clique para ajustar`}
            >
              {die}
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="dice-all-btn dice-all-up"
        onClick={(e) => {
          e.stopPropagation();
          adjustAllDice(1);
        }}
        disabled={!canIncreaseAll}
        title={localization['UI.Dice.IncreaseAll'] || 'Aumentar todos os dados'}
      >
        +
      </button>
    </div>
  );
});

DiceResultAdjuster.displayName = 'DiceResultAdjuster';

export default DiceResultAdjuster;