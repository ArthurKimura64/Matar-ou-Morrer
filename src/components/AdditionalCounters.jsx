import React from 'react';
import Counter from './Counter';

const AdditionalCounters = ({ additionalCounters, onCounterChange, playerId }) => {
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
      <h5 className="text-white mb-3">🔧 Contadores Especiais</h5>
      <div className="row justify-content-center text-center">
        {Object.entries(additionalCounters).map(([key, counterData]) => (
          <Counter
            key={key}
            id={key}
            title={`${counterData.icon || '📊'} ${counterData.label || key}`}
            value={counterData.current || 0}
            min={counterData.min || 0}
            max={counterData.max || 10} // Usar o valor máximo definido, não null
            onChange={(value) => handleCounterChange(key, value)}
          />
        ))}
      </div>
    </div>
  );
};

export default AdditionalCounters;
