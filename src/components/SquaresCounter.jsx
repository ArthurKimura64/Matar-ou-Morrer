import React, { useCallback, useState } from 'react';
import '../features/character/AdditionalCounters.css';

const SquaresCounter = ({ id, title, value = 0, min = 0, max = 5, onChange, localization = {} }) => {
  const parsedMax = Number.isFinite(Number(max)) ? Math.max(0, Math.floor(Number(max))) : 0;
  const clampedMax = parsedMax;
  const currentValue = Number(value) || 0;
  const firstUnmarkedIndex = currentValue < clampedMax ? currentValue + 1 : null;

  const [isHoveringGrid, setIsHoveringGrid] = useState(false);

  const handleMarkNext = useCallback(() => {
    const newValue = Math.min(currentValue + 1, clampedMax);
    onChange(newValue);
  }, [currentValue, clampedMax, onChange]);

  const handleUnmarkLast = useCallback(
    (e) => {
      e.stopPropagation();
      const newValue = Math.max(min, currentValue - 1);
      onChange(newValue);
    },
    [currentValue, min, onChange]
  );

  const handleReset = useCallback(
    (e) => {
      e.stopPropagation();
      onChange(min);
    },
    [min, onChange]
  );

  return (
    <div className="col-12 md:col-3 mb-2 md:mb-0 d-flex justify-content-center align-items-start squares-col">
      <div className="card-body p-2 d-flex flex-column align-items-center squares-card">
        <div className="fw-bold mb-1" style={{ fontSize: '0.95em' }}>
          {title}{' '}
          <small className="text-muted fw-normal" style={{ fontSize: '0.8em' }}>
            ({currentValue}/{clampedMax})
          </small>
        </div>

        <button
          type="button"
          className="squares-counter-wrapper"
          onMouseEnter={() => setIsHoveringGrid(true)}
          onMouseLeave={() => setIsHoveringGrid(false)}
          onClick={handleMarkNext}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && currentValue > min) {
              e.preventDefault();
              onChange(Math.max(min, currentValue - 1));
            }
          }}
          aria-label={`${title} (${currentValue} de ${clampedMax})`}
          style={{ cursor: 'pointer' }}
        >
          <span className="squares-counter d-flex flex-wrap justify-content-center">
            {Array.from({ length: clampedMax }).map((_, idx) => {
              const index = idx + 1;
              const marked = index <= currentValue;
              const isFirstUnmarked = index === firstUnmarkedIndex;
              const showHoverPreview = isHoveringGrid && isFirstUnmarked;

              return (
                <span
                  key={`${id}-sq-${index}`}
                  className={`square-counter ${marked ? 'marked' : ''} ${showHoverPreview ? 'hover-preview' : ''}`}
                  title={
                    marked
                      ? localization['UI.Counter.Used'] || 'Usado'
                      : localization['UI.Counter.NotUsed'] || 'Não usado'
                  }
                >
                  {marked ? '✕' : ''}
                </span>
              );
            })}
          </span>
        </button>
      </div>

      {currentValue > min && (
        <div className="squares-actions">
          <button
            type="button"
            className="squares-action-btn btn btn-outline-warning"
            onClick={handleUnmarkLast}
            title="Desfazer última marcação (−1)"
            aria-label="Desfazer última marcação"
          >
            −1
          </button>
          <button
            type="button"
            className="squares-action-btn btn btn-outline-light"
            onClick={handleReset}
            title={localization['UI.Counter.ResetCount'] || 'Reiniciar contagem'}
            aria-label={localization['UI.Counter.ResetCount'] || 'Reiniciar contagem'}
          >
            ⟳
          </button>
        </div>
      )}
    </div>
  );
};

export default SquaresCounter;