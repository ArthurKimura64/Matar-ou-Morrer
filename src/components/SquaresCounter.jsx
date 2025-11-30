import React, { useCallback, useState } from 'react';
import './AdditionalCounters.css';

const SquaresCounter = ({ id, title, value = 0, min = 0, max = 5, onChange }) => {
  // Garantir que `max` seja um número inteiro não-negativo
  const parsedMax = Number.isFinite(Number(max)) ? Math.max(0, Math.floor(Number(max))) : 0;
  const clampedMax = parsedMax;
  const currentValue = Number(value) || 0;

  // Índice (1-based) do primeiro quadrado não marcado
  const firstUnmarkedIndex = currentValue < clampedMax ? currentValue + 1 : null;

  // Estado para detectar hover na área toda da grade
  const [isHoveringGrid, setIsHoveringGrid] = useState(false);

  const handleMarkNext = useCallback(() => {
    // marca o primeiro quadrado não marcado -> incrementa current em 1
    const newValue = Math.min(currentValue + 1, clampedMax);
    onChange(newValue);
  }, [currentValue, clampedMax, onChange]);

  const handleReset = useCallback(() => {
    // Reinicia contador para 0 (nenhum marcado)
    onChange(0);
  }, [onChange]);

  return (
    <div className="col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center align-items-start squares-col">
      <div className="card-body p-2 d-flex flex-column align-items-center squares-card">
        <div className="fw-bold mb-1" style={{ fontSize: '0.95em' }}>{title}</div>
        {/* Área clicável e com hover */}
        <div
          className="squares-counter-wrapper"
          onMouseEnter={() => setIsHoveringGrid(true)}
          onMouseLeave={() => setIsHoveringGrid(false)}
          onClick={handleMarkNext}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleMarkNext();
            }
          }}
          role="group"
          aria-label={title}
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="squares-counter d-flex flex-wrap justify-content-center">
            {Array.from({ length: clampedMax }).map((_, idx) => {
              const index = idx + 1;
              const marked = index <= currentValue;
              const isFirstUnmarked = index === firstUnmarkedIndex;
              const showHoverPreview = isHoveringGrid && isFirstUnmarked;

              return (
                <span
                  key={`${id}-sq-${index}`}
                  className={`square-counter ${marked ? 'marked' : ''} ${showHoverPreview ? 'hover-preview' : ''}`}
                  aria-pressed={marked}
                  title={marked ? 'Usado' : 'Não usado'}
                >
                  {marked ? '✕' : ''}
                </span>
              );
            })}
          </div>
        </div>
        {/* botão fica fora do card para evitar overlay */}
      </div>
      {currentValue > 0 && (
        <button
          type="button"
          className="squares-reset-btn btn btn-outline-light"
          onClick={(e) => { handleReset(); }}
          title="Reiniciar contagem"
          aria-label="Reiniciar contagem"
        >
          ⟳
        </button>
      )}
    </div>
  );
};

export default SquaresCounter;
