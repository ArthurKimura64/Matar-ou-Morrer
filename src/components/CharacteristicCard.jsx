import React from 'react';

const CharacteristicCard = ({ actor, localization, deathCount = 0, exposedCards = new Set(), onToggleCardExposure }) => {
  return (
    <div className="card col-sm-10 my-3 p-0">
      <div className="row g-0">
        <div className="col-12 col-md-6 border-end">
          <div className="card-header">{localization['Characteristic.Title']}</div>
          <ul className="list-group list-group-flush">
            <li className="list-group-item">
              <b>{localization['Characteristic.DodgePoints']}: </b>
              {actor.DodgePoints}
            </li>
            <li className="list-group-item">
              <b>{localization['Characteristic.OportunityAttack']}: </b>
              {actor.OportunityAttacks}
            </li>
            <li className="list-group-item">
              <b>{localization['Characteristic.ExplorationItens']}: </b>
              {actor.ExplorationItens}
            </li>
            <li className="list-group-item">
              <b>{localization['Characteristic.DefenseDices']}: </b>
              {typeof actor.NumberOfDefenseDices === 'string' 
                ? (localization[actor.NumberOfDefenseDices] || actor.NumberOfDefenseDices)
                : actor.NumberOfDefenseDices}
            </li>
          </ul>
        </div>
        <div className="col-12 col-md-6">
          <div className="card-header">{localization['Characteristic.Tecnique']}</div>
          <ul className="list-group list-group-flush">
            <li className="list-group-item">
              <b>{localization['Terrain.Dessert']}: </b>
              {actor.Tecnique.Desert || localization['Characteristic.NotDefined'] || 'Characteristic.NotDefined'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.City']}: </b>
              {actor.Tecnique.City || localization['Characteristic.NotDefined'] || 'Characteristic.NotDefined'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.Junkyard']}: </b>
              {actor.Tecnique.Landfill || localization['Characteristic.NotDefined'] || 'Characteristic.NotDefined'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.Mountain']}: </b>
              {actor.Tecnique.Mountain || localization['Characteristic.NotDefined'] || 'Characteristic.NotDefined'}
            </li>
          </ul>
        </div>
      </div>
      {/* Só mostrar descrição do Reivolk se houver 2+ mortes */}
      {deathCount >= 2 && (
        <div className="mb-4 border-top px-3 position-relative">
          {/* Botão de olho para expor o modo Reivolk na mesa */}
          {onToggleCardExposure && (
            <button 
              className={`btn btn-sm position-absolute ${exposedCards.has(`Reivolk.${actor.ID}`) ? 'btn-success' : 'btn-outline-secondary'}`}
              style={{ 
                top: '10px', 
                right: '10px', 
                zIndex: 1,
                width: '28px',
                height: '28px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px'
              }}
              onClick={() => onToggleCardExposure(`Reivolk.${actor.ID}`)}
              title={exposedCards.has(`Reivolk.${actor.ID}`) ? 'Ocultar Reivolk da mesa' : 'Expor Reivolk na mesa'}
            >
              👁️
            </button>
          )}
          <h5 className="text-secondary mb-2 text-center">
            {localization['Characteristic.Reivolk.Title']}
          </h5>
          <h5 className="mb-2 text-info text-center">
            {localization[`Character.Reivolk.${actor.ID}.Title`]}
          </h5>
          <div 
            className="col-12 text-light text-center"
            dangerouslySetInnerHTML={{ __html: localization[`Character.Reivolk.${actor.ID}.Description`] }}
          />
        </div>
      )}
    </div>
  );
};

export default CharacteristicCard;
