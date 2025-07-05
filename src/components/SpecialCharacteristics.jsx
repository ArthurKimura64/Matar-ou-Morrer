import React, { useState } from 'react';

const SpecialCharacteristics = ({ actor, gameData, localization }) => {
  const [textboxValues, setTextboxValues] = useState({});

  // Filtrar apenas características especiais que NÃO são do tipo 'counter'
  // Os contadores são gerenciados pelo componente AdditionalCounters
  const nonCounterCharacteristics = actor.SpecialCharacteristics?.filter(specialId => {
    const spec = gameData.SpecialDefinitions?.find(s => s.ID === specialId);
    return spec && spec.Type !== 'counter';
  }) || [];

  if (!actor.SpecialCharacteristics || !Array.isArray(actor.SpecialCharacteristics) || nonCounterCharacteristics.length === 0) {
    return null;
  }

  const handleTextboxChange = (id, value) => {
    setTextboxValues(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const renderSpecialCharacteristic = (specialId, index) => {
    const spec = gameData.SpecialDefinitions?.find(s => s.ID === specialId);
    if (!spec) return null;

    const title = localization[spec.Title] || spec.Title || (localization['UI.SpecialCharacteristics.Default'] || 'UI.SpecialCharacteristics.Default');

    // Apenas renderizar tipos que NÃO são 'counter' (contadores são gerenciados pelo AdditionalCounters)
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
                  placeholder={spec.Placeholder || (localization['UI.SpecialCharacteristics.Placeholder'] || 'UI.SpecialCharacteristics.Placeholder')}
                  value={textboxValues[specialId] || ''}
                  onChange={(e) => handleTextboxChange(specialId, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Adicionar outros tipos de SpecialCharacteristics aqui conforme necessário
    // (mas NÃO incluir 'counter' pois é gerenciado pelo AdditionalCounters)

    return null;
  };

  return (
    <div className="row g-2 mb-2 gap-3 d-flex flex-wrap justify-content-center">
      {nonCounterCharacteristics.map((specialId, index) => 
        renderSpecialCharacteristic(specialId, index)
      )}
    </div>
  );
};

export default SpecialCharacteristics;
