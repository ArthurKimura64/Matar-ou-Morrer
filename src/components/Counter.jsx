import React, { useCallback } from 'react';

const Counter = ({ id, title, value, min, max, onChange, readOnly, quickStep = null }) => {
  const handleDecrement = useCallback(() => {
    onChange(Math.max(value - 1, min));
  }, [value, min, onChange]);

  const handleIncrement = useCallback(() => {
    const newValue = max === null || max === undefined ? value + 1 : Math.min(value + 1, max);
    onChange(newValue);
  }, [value, max, onChange]);

  const handleQuickDelta = useCallback(
    (delta) => {
      const rawValue = value + delta;
      const clampedValue =
        max === null || max === undefined
          ? Math.max(rawValue, min)
          : Math.max(Math.min(rawValue, max), min);
      onChange(clampedValue);
    },
    [value, min, max, onChange]
  );

  const handleChange = useCallback((e) => {
    const newValue = parseInt(e.target.value) || min;
    const clampedValue = max === null || max === undefined 
      ? Math.max(newValue, min) 
      : Math.max(Math.min(newValue, max), min);
    onChange(clampedValue);
  }, [min, max, onChange]);

  return (
    <div className="col-12 md:col-3 mb-2 md:mb-0 d-flex justify-content-center">
      <div className="card-body p-2 d-flex flex-column align-items-center numeric-counter-card">
        <div className="fw-bold mb-1" style={{fontSize: '0.95em'}}>
          {title}
        </div>
        {readOnly ? (
          <div className="d-flex align-items-center justify-content-center">
            <span className="fw-bold" style={{ fontSize: '1.4em' }}>
              {value}
            </span>
          </div>
        ) : (
        <>
          <div className="input-group flex-nowrap justify-content-center">
            <button
              className="btn btn-outline-danger btn-sm"
              type="button"
              onClick={handleDecrement}
            >
              -
            </button>
            <input
              type="number"
              className="form-control text-center mx-1"
              value={value}
              min={min}
              max={max !== null && max !== undefined ? max : undefined}
              onChange={handleChange}
              style={{ width: '60px', textAlign: 'center', fontSize: '1em' }}
            />
            <button
              className="btn btn-outline-success btn-sm"
              type="button"
              onClick={handleIncrement}
            >
              +
            </button>
          </div>
          {quickStep && (
            <div className="d-flex justify-content-center gap-2 mt-1">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                style={{ width: 'auto', height: '24px', padding: '0 8px', fontSize: '0.75rem' }}
                onClick={() => handleQuickDelta(-quickStep)}
                title={`Diminuir ${quickStep}`}
              >
                -{quickStep}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                style={{ width: 'auto', height: '24px', padding: '0 8px', fontSize: '0.75rem' }}
                onClick={() => handleQuickDelta(quickStep)}
                title={`Aumentar ${quickStep}`}
              >
                +{quickStep}
              </button>
            </div>
          )}
        </>
        )}
      </div>
    </div>
  );
};

export default Counter;
