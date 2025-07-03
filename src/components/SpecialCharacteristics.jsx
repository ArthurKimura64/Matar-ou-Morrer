import React, { useState, useEffect } from 'react';

const SpecialCharacteristics = ({ actor, gameData, localization }) => {
  const [textboxValues, setTextboxValues] = useState({});
  const [counterValues, setCounterValues] = useState({});

  // Inicializar valores dos contadores com os valores padrão das características especiais
  useEffect(() => {
    if (actor.SpecialCharacteristics && gameData.SpecialDefinitions) {
      const initialCounters = {};
      
      actor.SpecialCharacteristics.forEach(specialId => {
        const spec = gameData.SpecialDefinitions.find(s => s.ID === specialId);
        if (spec && spec.Type === 'counter') {
          initialCounters[specialId] = spec.InitialValue || 0;
        }
      });
      
      setCounterValues(initialCounters);
    }
  }, [actor.SpecialCharacteristics, gameData.SpecialDefinitions]);

  if (!actor.SpecialCharacteristics || !Array.isArray(actor.SpecialCharacteristics) || actor.SpecialCharacteristics.length === 0) {
    return null;
  }

  const handleTextboxChange = (id, value) => {
    setTextboxValues(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleCounterChange = (id, value) => {
    setCounterValues(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const renderSpecialCharacteristic = (specialId, index) => {
    const spec = gameData.SpecialDefinitions?.find(s => s.ID === specialId);
    if (!spec) return null;

    const title = localization[spec.Title] || spec.Title || 'Característica Especial';

    if (spec.Type === 'textbox') {
      return (
        <div key={specialId} className="col-12 col-md-5 mb-3 mb-md-0 d-flex justify-content-center">
          <div className="card bg-dark text-white w-100">
            <div className="card-body p-2 d-flex flex-column align-items-center">
              <div 
                className="fw-bold mb-1"
                dangerouslySetInnerHTML={{ __html: title }}
              />
              <div className="input-group flex-nowrap justify-content-center">
                <textarea
                  rows="4"
                  className="form-control w-75 mb-2 rounded shadow-sm"
                  placeholder={spec.Placeholder || 'Digite aqui...'}
                  value={textboxValues[specialId] || ''}
                  onChange={(e) => handleTextboxChange(specialId, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (spec.Type === 'counter') {
      const initialValue = spec.InitialValue || 0;
      const minValue = spec.Min || 0;
      const maxValue = spec.Max || 99;
      const currentValue = counterValues[specialId] ?? initialValue;
      
      return (
        <div key={specialId} className="col-12 col-md-3 mb-2 mb-md-0 d-flex justify-content-center">
          <div className="card-body p-2 d-flex flex-column align-items-center">
            <div 
              className="fw-bold mb-1" 
              style={{fontSize: '0.95em'}}
              dangerouslySetInnerHTML={{ __html: title }}
            />
            <div className="input-group flex-nowrap justify-content-center">
              <button 
                className="btn btn-outline-danger btn-sm" 
                type="button" 
                onClick={() => handleCounterChange(specialId, Math.max(currentValue - 1, minValue))}
              >
                -
              </button>
              <input 
                type="number" 
                className="form-control text-center mx-1" 
                value={currentValue}
                min={minValue}
                max={maxValue}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value) || minValue;
                  handleCounterChange(specialId, Math.max(Math.min(newValue, maxValue), minValue));
                }}
                style={{width: '60px', textAlign: 'center', fontSize: '1em'}}
              />
              <button 
                className="btn btn-outline-success btn-sm" 
                type="button" 
                onClick={() => handleCounterChange(specialId, Math.min(currentValue + 1, maxValue))}
              >
                +
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="row g-2 mb-2 gap-3 d-flex flex-wrap justify-content-center">
      {actor.SpecialCharacteristics.map((specialId, index) => 
        renderSpecialCharacteristic(specialId, index)
      )}
    </div>
  );
};

export default SpecialCharacteristics;
