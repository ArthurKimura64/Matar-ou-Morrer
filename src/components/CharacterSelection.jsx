import React, { useState, useMemo } from 'react';

const CharacterSelection = ({ 
  gameData, 
  localization, 
  onCharacterSelect, 
  players = [],
  currentPlayerId 
}) => {
  // Estados de ordenação mais simples - apenas um índice para ciclar
  const [sortIndex, setSortIndex] = useState(0);
  
  // Opções de ordenação (ciclo)
  const sortOptions = [
    { type: 'name', order: 'asc', label: 'Nome ↑', icon: '📝' },
    { type: 'name', order: 'desc', label: 'Nome ↓', icon: '📝' },
    { type: 'title', order: 'asc', label: 'Título ↑', icon: '🏷️' },
    { type: 'title', order: 'desc', label: 'Título ↓', icon: '🏷️' }
  ];
  
  const currentSort = sortOptions[sortIndex];
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

  // Ordenar personagens baseado nas preferências
  const sortedActors = useMemo(() => {
    const actors = [...gameData.ActorDefinitions];
    const { type, order } = currentSort;
    
    return actors.sort((a, b) => {
      let valueA, valueB;
      
      if (type === 'name') {
        valueA = localization[`Character.Name.${a.ID}`] || a.ID || '';
        valueB = localization[`Character.Name.${b.ID}`] || b.ID || '';
      } else if (type === 'title') {
        valueA = localization[`Character.Title.${a.ID}`] || '';
        valueB = localization[`Character.Title.${b.ID}`] || '';
      }
      
      // Garantir que os valores são strings antes de normalizar
      valueA = String(valueA || '').toLowerCase();
      valueB = String(valueB || '').toLowerCase();
      
      if (order === 'asc') {
        return valueA.localeCompare(valueB);
      } else {
        return valueB.localeCompare(valueA);
      }
    });
  }, [gameData.ActorDefinitions, localization, currentSort]);

  // Função para ciclar entre as opções de ordenação
  const cycleSortOption = () => {
    setSortIndex((prevIndex) => (prevIndex + 1) % sortOptions.length);
  };

  return (
    <div>
      {/* Botão de ordenação discreto alinhado à esquerda */}
      <div className="d-flex justify-content-start mb-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm d-flex align-items-center opacity-75"
          onClick={cycleSortOption}
          title={`${localization['UI.CharacterSelection.SortOptions'] || 'Ordenação'}: ${currentSort.label}`}
          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
        >
          <span style={{ marginRight: '3px', fontSize: '0.7rem' }}>{currentSort.icon}</span>
          <span style={{ fontSize: '0.7rem' }}>{currentSort.label}</span>
        </button>
      </div>

      {/* Lista de personagens ordenados */}
      <div className="d-flex flex-wrap justify-content-center" id="characterSelection">
        {sortedActors.map((actor) => {
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
    </div>
  );
};

export default CharacterSelection;
