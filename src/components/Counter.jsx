import React from 'react';

const Counter = ({ id, title, value, min, max, onChange }) => {
  const handleDecrement = () => {
    onChange(Math.max(value - 1, min));
  };

  const handleIncrement = () => {
    if (max === null || max === undefined) {
      onChange(value + 1);
    } else {
      onChange(Math.min(value + 1, max));
    }
  };

  const handleChange = (e) => {
    const newValue = parseInt(e.target.value) || min;
    if (max === null || max === undefined) {
      onChange(Math.max(newValue, min));
    } else {
      onChange(Math.max(Math.min(newValue, max), min));
    }
  };

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
