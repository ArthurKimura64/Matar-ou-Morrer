import React from 'react';

const CharacterSelection = ({ 
  gameData, 
  localization, 
  onCharacterSelect, 
  players = [],
  currentPlayerId 
}) => {
  // Obter personagens que estão sendo criados por outros jogadores
  const getCharacterStatus = (actorId) => {
    // Nome do personagem localizado
    const actorName = localization[`Character.Name.${actorId}`] || actorId;
    
    const otherPlayersCreating = players.filter(player => 
      player.id !== currentPlayerId && 
      player.status === 'creating' && 
      player.character_name === actorName
    );
    
    const otherPlayersReady = players.filter(player =>
      player.id !== currentPlayerId &&
      player.status === 'ready' &&
      player.character_name === actorName
    );

    if (otherPlayersReady.length > 0) {
      return {
        disabled: true,
        status: 'taken',
        playerName: otherPlayersReady[0].name
      };
    }
    
    if (otherPlayersCreating.length > 0) {
      return {
        disabled: true,
        status: 'creating',
        playerName: otherPlayersCreating[0].name
      };
    }
    
    return { disabled: false, status: 'available' };
  };

  return (
    <div className="d-flex flex-wrap justify-content-center" id="characterSelection">
      {gameData.ActorDefinitions.map((actor) => {
        const status = getCharacterStatus(actor.ID);
        const characterName = localization[`Character.Name.${actor.ID}`] && localization[`Character.Title.${actor.ID}`] 
          ? `${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` 
          : actor.ID;
        
        return (
          <div key={actor.ID} className="position-relative">
            <button
              type="button"
              className={`btn ${status.disabled ? 'btn-secondary' : 'btn-outline-light'} text-center col-auto my-1 mx-2`}
              onClick={() => !status.disabled && onCharacterSelect(actor)}
              disabled={status.disabled}
              title={
                status.status === 'creating' 
                  ? `${status.playerName} ${localization['UI.CharacterSelection.TakenByPlayer'] || 'UI.CharacterSelection.TakenByPlayer'}`
                  : status.status === 'taken'
                  ? `${status.playerName} ${localization['UI.CharacterSelection.AlreadyCreated'] || 'UI.CharacterSelection.AlreadyCreated'}`
                  : `${localization['UI.CharacterSelection.ClickToCreate'] || 'UI.CharacterSelection.ClickToCreate'} ${characterName}`
              }
            >
              {characterName}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default CharacterSelection;
