import React from 'react';
import Counter from './Counter';
import SquaresCounter from './SquaresCounter';
import './AdditionalCounters.css';

const AdditionalCounters = ({ additionalCounters, onCounterChange, playerId, localization }) => {
  if (!additionalCounters || Object.keys(additionalCounters).length === 0) {
    return null;
  }

  const handleCounterChange = (counterId, newValue) => {
    const counter = additionalCounters[counterId];
    if (!counter) return;

    // Garantir que o valor está dentro dos limites (min/max FIXOS)
    const validValue = Math.max(
      counter.min || 0, 
      Math.min(newValue, counter.max || newValue)
    );

    const updatedCounters = {
      ...additionalCounters,
      [counterId]: {
        ...counter,
        current: validValue
        // IMPORTANTE: Não alterar max, min ou outros valores - apenas current!
      }
    };
    onCounterChange(updatedCounters);
  };

  return (
    <div className="mb-3">
      <h5 className="text-white mb-3">{localization['UI.CharacterSheet.AdditionalCounters'] || 'UI.CharacterSheet.AdditionalCounters'}</h5>
      <div className="row justify-content-center text-center align-items-start">
        {Object.entries(additionalCounters).map(([key, counterData]) => {
          const title = `${counterData.icon || '📊'} ${counterData.label || key}`;
          const isClassic = key === 'vida' || key === 'mortes' || counterData.type === 'classic';

          if (isClassic) {  
            return (
              <Counter
                key={key}
                id={key}
                title={title}
                value={counterData.current || 0}
                min={counterData.min || 0}
                max={counterData.max || 10}
                onChange={(value) => handleCounterChange(key, value)}
              />
            );
          }

          // Squares-style counter for other types
          return (
            <SquaresCounter
              key={key}
              id={key}
              title={title}
              value={counterData.current || 0}
              min={counterData.min || 0}
              max={counterData.max || 10}
              onChange={(newVal) => handleCounterChange(key, newVal)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default AdditionalCounters;
