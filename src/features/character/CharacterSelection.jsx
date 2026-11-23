import React, { useState, useMemo } from 'react';

const DIFFICULTY_COLORS = {
  1: '#22c55e', // verde
  2: '#eab308', // amarelo
  3: '#ef4444'  // vermelho
};

const SORT_OPTIONS = [
  { type: 'name', order: 'asc', labelKey: 'UI.Sort.NameAsc', fallback: 'Nome ↑' },
  { type: 'name', order: 'desc', labelKey: 'UI.Sort.NameDesc', fallback: 'Nome ↓' },
  { type: 'title', order: 'asc', labelKey: 'UI.Sort.TitleAsc', fallback: 'Título ↑' },
  { type: 'title', order: 'desc', labelKey: 'UI.Sort.TitleDesc', fallback: 'Título ↓' },
  { type: 'difficulty', order: 'asc', labelKey: 'UI.Sort.DifficultyAsc', fallback: 'Dificuldade ↑' },
  { type: 'difficulty', order: 'desc', labelKey: 'UI.Sort.DifficultyDesc', fallback: 'Dificuldade ↓' },
  { type: 'generation', order: 'asc', labelKey: 'UI.Sort.GenerationAsc', fallback: 'Geração ↑' },
  { type: 'generation', order: 'desc', labelKey: 'UI.Sort.GenerationDesc', fallback: 'Geração ↓' }
];

const CharacterSelection = ({
  gameData,
  localization = {},
  onCharacterSelect,
  players = [],
  currentPlayerId,
  currentPlayer
}) => {
  const effectivePlayerId = currentPlayerId || currentPlayer?.id;
  const actorDefinitions = useMemo(
    () => gameData?.ActorDefinitions || [],
    [gameData?.ActorDefinitions]
  );

  const [sortIndex, setSortIndex] = useState(0);

  const currentSort = SORT_OPTIONS[sortIndex];
  const isSortedByGeneration = currentSort.type === 'generation';

  const generations = useMemo(() => {
    const gens = new Set(actorDefinitions.map((a) => a.Generation || 1));
    return [...gens].sort((a, b) => a - b);
  }, [actorDefinitions]);

  const getCharacterStatus = (actorId) => {
    const actorName = String(localization[`Character.Name.${actorId}`] ?? actorId ?? '').trim();

    const matchesActor = (player) => {
      const pActorId = player.character?.actor?.ID ?? player.character?.ID;
      const pCharName = String(player.character_name ?? '').trim();
      return (
        (pActorId !== undefined && pActorId !== null && String(pActorId) === String(actorId)) ||
        (pCharName !== '' && pCharName === actorName)
      );
    };

    const otherPlayersReady = players.filter(
      (player) =>
        player.id !== effectivePlayerId &&
        player.is_connected !== false &&
        (player.status === 'ready' || player.status === 'playing') &&
        matchesActor(player)
    );

    if (otherPlayersReady.length > 0) {
      return { disabled: true, status: 'taken', playerName: otherPlayersReady[0].name };
    }

    const otherPlayersCreating = players.filter(
      (player) =>
        player.id !== effectivePlayerId &&
        player.is_connected !== false &&
        player.status === 'creating' &&
        matchesActor(player)
    );

    if (otherPlayersCreating.length > 0) {
      return { disabled: true, status: 'creating', playerName: otherPlayersCreating[0].name };
    }

    return { disabled: false, status: 'available' };
  };

  const sortedActors = useMemo(() => {
    const actors = [...actorDefinitions];
    const { type, order } = currentSort;

    return actors.sort((a, b) => {
      let valueA;
      let valueB;

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
  }, [actorDefinitions, localization, currentSort]);

  const groupedByGeneration = useMemo(() => {
    if (!isSortedByGeneration) return null;
    const groups = {};
    sortedActors.forEach((actor) => {
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
    const localizedName = localization[`Character.Name.${actor.ID}`];
    const localizedTitle = localization[`Character.Title.${actor.ID}`];
    const characterName =
      localizedName && localizedTitle ? `${localizedName} (${localizedTitle})` : actor.ID;

    const difficulty = actor.Difficulty || 2;
    const diffColor = DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS[2];
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
              ? `${status.playerName} ${localization['UI.CharacterSelection.TakenByPlayer'] || 'está montando este personagem'}`
              : status.status === 'taken'
              ? `${status.playerName} ${localization['UI.CharacterSelection.AlreadyCreated'] || 'já escolheu este personagem'}`
              : `${localization['UI.CharacterSelection.ClickToCreate'] || 'Clique para montar'} ${characterName}\n${diffTooltip}`
          }
        >
          {status.status === 'creating' && <span className="me-1" aria-hidden="true">⚒️</span>}
          {status.status === 'taken' && <span className="me-1" aria-hidden="true">🔒</span>}
          {characterName}
        </button>
      </div>
    );
  };

  const sortedGenerations = currentSort.order === 'asc' ? generations : [...generations].reverse();

  return (
    <section aria-label="Seleção de personagem">
      {/* Controle de ordenação */}
      <header className="d-flex justify-content-start mb-2">
        <label htmlFor="character-sort-select" className="visually-hidden">
          {localization['UI.CharacterSelection.SortOptions'] || 'Ordenação'}
        </label>
        <select
          id="character-sort-select"
          className="form-select form-select-sm opacity-75"
          value={sortIndex}
          onChange={handleSortChange}
          style={{
            fontSize: '0.8rem',
            width: 'auto',
            padding: '0.25rem 2rem 0.25rem 0.5rem',
            background: 'transparent',
            color: 'inherit',
            border: '1px solid #6c757d'
          }}
          title={localization['UI.CharacterSelection.SortOptions'] || 'Ordenação'}
        >
          {SORT_OPTIONS.map((opt, i) => (
            <option key={i} value={i} style={{ background: '#212529' }}>
              {localization[opt.labelKey] || opt.fallback}
            </option>
          ))}
        </select>
      </header>

      {/* Lista de personagens */}
      <div id="characterSelection">
        {isSortedByGeneration && groupedByGeneration ? (
          sortedGenerations.map((gen) => {
            const actors = groupedByGeneration[gen];
            if (!actors || actors.length === 0) return null;
            const genLabel = localization[`Generation.${gen}`] || `Geração ${gen}`;

            return (
              <section key={gen} className="mb-3" aria-label={genLabel}>
                <div className="d-flex align-items-center mb-2" style={{ opacity: 0.6 }}>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: '#6c757d' }} />
                  <span
                    className="px-2"
                    style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}
                  >
                    {genLabel}
                  </span>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: '#6c757d' }} />
                </div>
                <div className="d-flex flex-wrap justify-content-center">
                  {actors.map(renderCharacterButton)}
                </div>
              </section>
            );
          })
        ) : (
          <div className="d-flex flex-wrap justify-content-center">
            {sortedActors.map(renderCharacterButton)}
          </div>
        )}
      </div>
    </section>
  );
};

export default CharacterSelection;