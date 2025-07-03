import React from 'react';

const CharacteristicCard = ({ actor, localization }) => {
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
              {actor.NumberOfDefenseDices}
            </li>
          </ul>
        </div>
        <div className="col-12 col-md-6">
          <div className="card-header">{localization['Characteristic.Tecnique']}</div>
          <ul className="list-group list-group-flush">
            <li className="list-group-item">
              <b>{localization['Terrain.Dessert']}: </b>
              {actor.Tecnique.Desert || localization['Characteristic.NotDefined'] || 'Não definido'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.City']}: </b>
              {actor.Tecnique.City || localization['Characteristic.NotDefined'] || 'Não definido'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.Junkyard']}: </b>
              {actor.Tecnique.Landfill || localization['Characteristic.NotDefined'] || 'Não definido'}
            </li>
            <li className="list-group-item">
              <b>{localization['Terrain.Mountain']}: </b>
              {actor.Tecnique.Mountain || localization['Characteristic.NotDefined'] || 'Não definido'}
            </li>
          </ul>
        </div>
      </div>
      <div className="mb-4 border-top px-3">
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
    </div>
  );
};

export default CharacteristicCard;
