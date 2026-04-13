import React, { useState, useMemo } from 'react';

const CharacterSelection = ({ 
  gameData, 
  localization, 
  onCharacterSelect, 
  players = [],
  currentPlayerId 
}) => {
  // Cores de dificuldade (1=Fácil → 7=Extremo)
  const difficultyColors = {
    1: '#22c55e', // verde
    2: '#eab308', // amarelo
    3: '#ef4444', // vermelho
  };

  const [sortIndex, setSortIndex] = useState(0);
  
  const sortOptions = [
    { type: 'name', order: 'asc', labelKey: 'UI.Sort.NameAsc', fallback: 'Nome ↑' },
    { type: 'name', order: 'desc', labelKey: 'UI.Sort.NameDesc', fallback: 'Nome ↓' },
    { type: 'title', order: 'asc', labelKey: 'UI.Sort.TitleAsc', fallback: 'Título ↑' },
    { type: 'title', order: 'desc', labelKey: 'UI.Sort.TitleDesc', fallback: 'Título ↓' },
    { type: 'difficulty', order: 'asc', labelKey: 'UI.Sort.DifficultyAsc', fallback: 'Dificuldade ↑' },
    { type: 'difficulty', order: 'desc', labelKey: 'UI.Sort.DifficultyDesc', fallback: 'Dificuldade ↓' },
    { type: 'generation', order: 'asc', labelKey: 'UI.Sort.GenerationAsc', fallback: 'Geração ↑' },
    { type: 'generation', order: 'desc', labelKey: 'UI.Sort.GenerationDesc', fallback: 'Geração ↓' }
  ];
  
  const currentSort = sortOptions[sortIndex];
  const isSortedByGeneration = currentSort.type === 'generation';

  // Gerações disponíveis
  const generations = useMemo(() => {
    const gens = new Set(gameData.ActorDefinitions.map(a => a.Generation || 1));
    return [...gens].sort((a, b) => a - b);
  }, [gameData.ActorDefinitions]);

  const getCharacterStatus = (actorId) => {
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
      return { disabled: true, status: 'taken', playerName: otherPlayersReady[0].name };
    }
    if (otherPlayersCreating.length > 0) {
      return { disabled: true, status: 'creating', playerName: otherPlayersCreating[0].name };
    }
    return { disabled: false, status: 'available' };
  };

  // Ordenar personagens
  const sortedActors = useMemo(() => {
    const actors = [...gameData.ActorDefinitions];
    const { type, order } = currentSort;
    
    return actors.sort((a, b) => {
      let valueA, valueB;
      
      if (type === 'difficulty') {
        valueA = a.Difficulty || 2;
        valueB = b.Difficulty || 2;
        return order === 'asc' ? valueA - valueB : valueB - valueA;
      }

      if (type === 'generation') {
        valueA = a.Generation || 1;
        valueB = b.Generation || 1;
        return order === 'asc' ? valueA - valueB : valueB - valueA;
      }

      if (type === 'name') {
        valueA = localization[`Character.Name.${a.ID}`] || a.ID || '';
        valueB = localization[`Character.Name.${b.ID}`] || b.ID || '';
      } else if (type === 'title') {
        valueA = localization[`Character.Title.${a.ID}`] || '';
        valueB = localization[`Character.Title.${b.ID}`] || '';
      }
      
      valueA = String(valueA || '').toLowerCase();
      valueB = String(valueB || '').toLowerCase();
      
      return order === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    });
  }, [gameData.ActorDefinitions, localization, currentSort]);

  // Agrupar por geração (só quando ordenado por geração)
  const groupedByGeneration = useMemo(() => {
    if (!isSortedByGeneration) return null;
    const groups = {};
    sortedActors.forEach(actor => {
      const gen = actor.Generation || 1;
      if (!groups[gen]) groups[gen] = [];
      groups[gen].push(actor);
    });
    return groups;
  }, [sortedActors, isSortedByGeneration]);

  const handleSortChange = (e) => {
    setSortIndex(Number(e.target.value));
  };

  const renderCharacterButton = (actor) => {
    const status = getCharacterStatus(actor.ID);
    const characterName = localization[`Character.Name.${actor.ID}`] && localization[`Character.Title.${actor.ID}`] 
      ? `${localization[`Character.Name.${actor.ID}`]} (${localization[`Character.Title.${actor.ID}`]})` 
      : actor.ID;
    const difficulty = actor.Difficulty || 2;
    const diffColor = difficultyColors[difficulty] || difficultyColors[2];
    const diffLabel = localization[`Difficulty.${difficulty}`] || '';
    const diffTooltip = `${localization['Difficulty.Label'] || 'Dificuldade'}: ${diffLabel}`;
    
    return (
      <div key={actor.ID} className="position-relative">
        <button
          type="button"
          className={`btn ${status.disabled ? 'btn-secondary' : 'btn-outline-light'} text-center col-auto my-1 mx-2`}
          onClick={() => !status.disabled && onCharacterSelect(actor)}
          disabled={status.disabled}
          style={{ borderLeft: `3px solid ${diffColor}` }}
          title={
            status.status === 'creating' 
              ? `${status.playerName} ${localization['UI.CharacterSelection.TakenByPlayer'] || 'UI.CharacterSelection.TakenByPlayer'}`
              : status.status === 'taken'
              ? `${status.playerName} ${localization['UI.CharacterSelection.AlreadyCreated'] || 'UI.CharacterSelection.AlreadyCreated'}`
              : `${localization['UI.CharacterSelection.ClickToCreate'] || 'UI.CharacterSelection.ClickToCreate'} ${characterName}\n${diffTooltip}`
          }
        >
          {characterName}
        </button>
      </div>
    );
  };

  // Ordem das gerações conforme a direção do sort
  const sortedGenerations = currentSort.order === 'asc' ? generations : [...generations].reverse();

  return (
    <div>
      {/* Dropdown de ordenação */}
      <div className="d-flex justify-content-start mb-2">
        <select
          className="form-select form-select-sm opacity-75"
          value={sortIndex}
          onChange={handleSortChange}
          style={{ fontSize: '0.8rem', width: 'auto', padding: '0.25rem 2rem 0.25rem 0.5rem', background: 'transparent', color: 'inherit', border: '1px solid #6c757d' }}
          title={localization['UI.CharacterSelection.SortOptions'] || 'Ordenação'}
        >
          {sortOptions.map((opt, i) => (
            <option key={i} value={i} style={{ background: '#212529' }}>
              {localization[opt.labelKey] || opt.fallback}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de personagens */}
      <div id="characterSelection">
        {isSortedByGeneration && groupedByGeneration ? (
          // Ordenado por geração — mostrar seções separadas
          sortedGenerations.map(gen => {
            const actors = groupedByGeneration[gen];
            if (!actors || actors.length === 0) return null;
            return (
              <div key={gen} className="mb-3">
                <div className="d-flex align-items-center mb-2" style={{ opacity: 0.6 }}>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: '#6c757d' }} />
                  <span className="px-2" style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {localization[`Generation.${gen}`] || `Geração ${gen}`}
                  </span>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: '#6c757d' }} />
                </div>
                <div className="d-flex flex-wrap justify-content-center">
                  {actors.map(renderCharacterButton)}
                </div>
              </div>
            );
          })
        ) : (
          // Outros sorts — lista simples
          <div className="d-flex flex-wrap justify-content-center">
            {sortedActors.map(renderCharacterButton)}
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterSelection;
