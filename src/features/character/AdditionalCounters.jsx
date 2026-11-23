import React from 'react';
import Counter from '../../components/Counter';
import SquaresCounter from '../../components/SquaresCounter';
import './AdditionalCounters.css';

const AdditionalCounters = ({ additionalCounters, onCounterChange, localization = {} }) => {
  if (!additionalCounters) return null;

  // Filtra apenas contadores numéricos reais (ignora _notes e textos legados)
  const numericEntries = Object.entries(additionalCounters).filter(
    ([key, data]) =>
      key !== '_notes' &&
      typeof data === 'object' &&
      data !== null &&
      data.current !== undefined
  );

  if (numericEntries.length === 0) {
    return null;
  }

  const handleCounterChange = (counterId, newValue) => {
    const counter = additionalCounters[counterId];
    if (!counter) return;

    const min = counter.min ?? 0;
    const max = counter.max ?? newValue;
    const validValue = Math.max(min, Math.min(newValue, max));

    onCounterChange({
      ...additionalCounters,
      [counterId]: {
        ...counter,
        current: validValue
      }
    });
  };

  return (
    <section className="mb-3" aria-label={localization['UI.CharacterSheet.AdditionalCounters'] || 'Contadores Especiais'}>
      <h4 className="text-info text-center mb-3">
        {localization['UI.CharacterSheet.AdditionalCounters'] || 'Contadores Especiais'}
      </h4>
      <div className="row justify-content-center text-center align-items-start">
        {numericEntries.map(([key, counterData]) => {
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

          return (
            <SquaresCounter
              key={key}
              id={key}
              title={title}
              value={counterData.current || 0}
              min={counterData.min || 0}
              max={counterData.max || 10}
              onChange={(newVal) => handleCounterChange(key, newVal)}
              localization={localization}
            />
          );
        })}
      </div>
    </section>
  );
};

export default AdditionalCounters;