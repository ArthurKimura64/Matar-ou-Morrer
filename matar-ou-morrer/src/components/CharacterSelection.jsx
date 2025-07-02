import React from 'react';

const CharacterSelection = ({ gameData, localization, onCharacterSelect }) => {
  return (
    <div className="d-flex flex-wrap justify-content-center" id="characterSelection">
      {gameData.ActorDefinitions.map((actor) => (
        <button
          key={actor.ID}
          type="button"
          className="btn btn-outline-light text-center col-auto my-1 mx-2"
          onClick={() => onCharacterSelect(actor)}
        >
          {localization[`Character.Name.${actor.ID}`] && localization[`Character.Title.${actor.ID}`] 
            ? `${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` 
            : actor.ID}
        </button>
      ))}
    </div>
  );
};

export default CharacterSelection;
