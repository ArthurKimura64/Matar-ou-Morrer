import React, { useCallback } from 'react';

const Counter = ({ id, title, value, min, max, onChange }) => {
  const handleDecrement = useCallback(() => {
    onChange(Math.max(value - 1, min));
  }, [value, min, onChange]);

  const handleIncrement = useCallback(() => {
    const newValue = max === null || max === undefined ? value + 1 : Math.min(value + 1, max);
    onChange(newValue);
  }, [value, max, onChange]);

  const handleChange = useCallback((e) => {
    const newValue = parseInt(e.target.value) || min;
    const clampedValue = max === null || max === undefined 
      ? Math.max(newValue, min) 
      : Math.max(Math.min(newValue, max), min);
    onChange(clampedValue);
  }, [min, max, onChange]);

  return (
    <div className="col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center">
      <div className="card-body p-2 d-flex flex-column align-items-center">
        <div className="fw-bold mb-1" style={{fontSize: '0.95em'}}>
          {title}
        </div>
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
            style={{width: '60px', textAlign: 'center', fontSize: '1em'}}
          />
          <button 
            className="btn btn-outline-success btn-sm" 
            type="button" 
            onClick={handleIncrement}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default Counter;
