import React, { useState, useMemo } from "react"

const DIFFICULTY_COLORS = {
  1: "#22c55e", // verde
  2: "#eab308", // amarelo
  3: "#ef4444" // vermelho
}

const SORT_OPTIONS = [
  { type: "name", order: "asc", labelKey: "UI.Sort.NameAsc", fallback: "Nome ↑" },
  { type: "name", order: "desc", labelKey: "UI.Sort.NameDesc", fallback: "Nome ↓" },
  { type: "title", order: "asc", labelKey: "UI.Sort.TitleAsc", fallback: "Título ↑" },
  { type: "title", order: "desc", labelKey: "UI.Sort.TitleDesc", fallback: "Título ↓" },
  { type: "difficulty", order: "asc", labelKey: "UI.Sort.DifficultyAsc", fallback: "Dificuldade ↑" },
  { type: "difficulty", order: "desc", labelKey: "UI.Sort.DifficultyDesc", fallback: "Dificuldade ↓" },
  { type: "generation", order: "asc", labelKey: "UI.Sort.GenerationAsc", fallback: "Geração ↑" },
  { type: "generation", order: "desc", labelKey: "UI.Sort.GenerationDesc", fallback: "Geração ↓" }
]

const CharacterSelection = ({ gameData, localization = {}, onCharacterSelect, players = [], currentPlayerId, currentPlayer }) => {
  const effectivePlayerId = currentPlayerId || currentPlayer?.id
  const actorDefinitions = useMemo(() => gameData?.ActorDefinitions || [], [gameData?.ActorDefinitions])

  const [sortIndex, setSortIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState(null) // null | 1 | 2 | 3
  const [selectedGeneration, setSelectedGeneration] = useState("all")

  const currentSort = SORT_OPTIONS[sortIndex]
  const isSortedByGeneration = currentSort.type === "generation"

  const generations = useMemo(() => {
    const gens = new Set(actorDefinitions.map((a) => a.Generation || 1))
    return [...gens].sort((a, b) => a - b)
  }, [actorDefinitions])

  const getCharacterStatus = (actorId) => {
    const actorName = String(localization[`Character.Name.${actorId}`] ?? actorId ?? "").trim()

    const matchesActor = (player) => {
      const pActorId = player.actor_id ?? player.character?.actor?.ID ?? player.character?.ID
      const pCharName = String(player.character_name ?? "").trim()
      return (pActorId !== undefined && pActorId !== null && String(pActorId) === String(actorId)) || (pCharName !== "" && pCharName === actorName)
    }

    const otherPlayersReady = players.filter(
      (player) =>
        player.id !== effectivePlayerId &&
        player.is_connected !== false &&
        (player.status === "ready" || player.status === "playing") &&
        matchesActor(player)
    )

    if (otherPlayersReady.length > 0) {
      return { disabled: true, status: "taken", playerName: otherPlayersReady[0].name }
    }

    const otherPlayersCreating = players.filter(
      (player) => player.id !== effectivePlayerId && player.is_connected !== false && player.status === "creating" && matchesActor(player)
    )

    if (otherPlayersCreating.length > 0) {
      return { disabled: true, status: "creating", playerName: otherPlayersCreating[0].name }
    }

    return { disabled: false, status: "available" }
  }

  const sortedActors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = actorDefinitions.filter((a) => {
      if (selectedDifficulty !== null && (a.Difficulty || 2) !== selectedDifficulty) {
        return false
      }
      if (selectedGeneration !== "all" && String(a.Generation || 1) !== String(selectedGeneration)) {
        return false
      }
      if (!q) return true
      const name = String(localization[`Character.Name.${a.ID}`] || a.ID || "").toLowerCase()
      const title = String(localization[`Character.Title.${a.ID}`] || "").toLowerCase()
      const idStr = String(a.ID || "").toLowerCase()
      return name.includes(q) || title.includes(q) || idStr.includes(q)
    })

    const { type, order } = currentSort
    const dir = order === "asc" ? 1 : -1

    const getName = (a) => String(localization[`Character.Name.${a.ID}`] || a.ID || "")
    const getTitle = (a) => String(localization[`Character.Title.${a.ID}`] || "")

    return [...filtered].sort((a, b) => {
      let comparison = 0

      if (type === "name") {
        comparison = getName(a).localeCompare(getName(b))
      } else if (type === "title") {
        comparison = getTitle(a).localeCompare(getTitle(b))
      } else if (type === "difficulty") {
        comparison = (a.Difficulty || 2) - (b.Difficulty || 2)
      } else if (type === "generation") {
        comparison = (a.Generation || 1) - (b.Generation || 1)
      }

      // Desempate por nome quando dificuldade ou geração forem iguais
      if (comparison === 0 && type !== "name") {
        return getName(a).localeCompare(getName(b))
      }

      return comparison * dir
    })
  }, [actorDefinitions, localization, currentSort, searchQuery, selectedDifficulty, selectedGeneration])

  const groupedByGeneration = useMemo(() => {
    if (!isSortedByGeneration) return null
    const groups = {}
    sortedActors.forEach((actor) => {
      const gen = actor.Generation || 1
      if (!groups[gen]) groups[gen] = []
      groups[gen].push(actor)
    })
    return groups
  }, [sortedActors, isSortedByGeneration])

  const renderCharacterButton = (actor) => {
    const status = getCharacterStatus(actor.ID)
    const localizedName = localization[`Character.Name.${actor.ID}`]
    const localizedTitle = localization[`Character.Title.${actor.ID}`]
    const characterName = localizedName && localizedTitle ? `${localizedName} (${localizedTitle})` : actor.ID

    const difficulty = actor.Difficulty || 2
    const diffColor = DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS[2]
    const diffLabel = localization[`Difficulty.${difficulty}`] || ""
    const diffTooltip = `${localization["Difficulty.Label"] || "Dificuldade"}: ${diffLabel}`

    return (
      <div key={actor.ID} className="position-relative">
        <button
          type="button"
          className={`btn ${status.disabled ? "btn-secondary" : "btn-outline-light"} text-center col-auto my-1 mx-2`}
          onClick={() => !status.disabled && onCharacterSelect(actor)}
          disabled={status.disabled}
          style={{ borderLeft: `3px solid ${diffColor}` }}
          title={
            status.status === "creating" ?
              `${status.playerName} ${localization["UI.CharacterSelection.TakenByPlayer"] || "está montando este personagem"}`
            : status.status === "taken" ?
              `${status.playerName} ${localization["UI.CharacterSelection.AlreadyCreated"] || "já escolheu este personagem"}`
            : `${localization["UI.CharacterSelection.ClickToCreate"] || "Clique para montar"} ${characterName}\n${diffTooltip}`
          }
        >
          {status.status === "creating" && (
            <span className="me-1" aria-hidden="true">
              ⚒️
            </span>
          )}
          {status.status === "taken" && (
            <span className="me-1" aria-hidden="true">
              🔒
            </span>
          )}
          {characterName}
        </button>
      </div>
    )
  }

  const sortedGenerations = currentSort.order === "asc" ? generations : [...generations].reverse()

  return (
    <section aria-label="Seleção de personagem">
      <header className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: "300px" }}>
          <label htmlFor="character-search-input" className="visually-hidden">
            Buscar personagem
          </label>
          <input
            id="character-search-input"
            type="text"
            className="form-control form-control-sm"
            placeholder="🔍 Buscar por nome ou título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            maxLength={40}
          />
          {searchQuery && (
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Limpar busca" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        <div className="d-flex align-items-center gap-2">
          <select
            id="character-gen-filter"
            className="form-select form-select-sm opacity-75"
            value={selectedGeneration}
            onChange={(e) => setSelectedGeneration(e.target.value)}
            style={{ fontSize: "0.8rem", width: "auto", padding: "0.25rem 2rem 0.25rem 0.5rem" }}
            aria-label={localization["Generation.Label"] || "Filtrar por geração"}
          >
            <option value="all" style={{ background: "#212529" }}>
              {localization["Generation.All"] || "Todas as gerações"}
            </option>
            {generations.map((gen) => (
              <option key={gen} value={gen} style={{ background: "#212529" }}>
                {localization[`Generation.${gen}`] || `Geração ${gen}`}
              </option>
            ))}
          </select>
          <label htmlFor="character-sort-select" className="visually-hidden">
            {localization["UI.CharacterSelection.SortOptions"] || "Ordenação"}
          </label>
          <select
            id="character-sort-select"
            className="form-select form-select-sm opacity-75"
            value={sortIndex}
            onChange={(e) => setSortIndex(Number(e.target.value))}
            style={{
              fontSize: "0.8rem",
              width: "auto",
              padding: "0.25rem 2rem 0.25rem 0.5rem"
            }}
            title={localization["UI.CharacterSelection.SortOptions"] || "Ordenação"}
          >
            {SORT_OPTIONS.map((opt, i) => (
              <option key={i} value={i} style={{ background: "#212529" }}>
                {localization[opt.labelKey] || opt.fallback}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="d-flex justify-content-center align-items-center gap-2 flex-wrap mb-3" role="group" aria-label="Filtrar por dificuldade">
        {[1, 2, 3].map((level) => {
          const isActive = selectedDifficulty === level
          const label =
            localization[`Difficulty.${level}`] ||
            (level === 1 ? "Fácil"
            : level === 2 ? "Médio"
            : "Difícil")

          return (
            <button
              key={level}
              type="button"
              onClick={() => setSelectedDifficulty((prev) => (prev === level ? null : level))}
              className={`btn btn-sm py-0 px-2 d-inline-flex align-items-center gap-1 ${
                isActive ? "btn-light text-dark fw-bold" : "btn-outline-secondary"
              }`}
              style={{
                fontSize: "0.75rem",
                borderColor: isActive ? DIFFICULTY_COLORS[level] : undefined
              }}
              aria-pressed={isActive}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  backgroundColor: DIFFICULTY_COLORS[level],
                  display: "inline-block"
                }}
              />
              {label}
            </button>
          )
        })}

        {(selectedDifficulty !== null || selectedGeneration !== "all" || searchQuery) && (
          <button
            type="button"
            className="btn btn-sm btn-link text-info py-0 px-1 text-decoration-none"
            style={{ fontSize: "0.75rem" }}
            onClick={() => {
              setSelectedDifficulty(null)
              setSelectedGeneration("all")
              setSearchQuery("")
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>
      <div id="characterSelection">
        {sortedActors.length === 0 ?
          <div className="text-center text-muted py-4 small">Nenhum personagem encontrado para "{searchQuery}".</div>
        : isSortedByGeneration && groupedByGeneration ?
          sortedGenerations.map((gen) => {
            const actors = groupedByGeneration[gen]
            if (!actors || actors.length === 0) return null
            const genLabel = localization[`Generation.${gen}`] || `Geração ${gen}`

            return (
              <section key={gen} className="mb-3" aria-label={genLabel}>
                <div className="d-flex align-items-center mb-2" style={{ opacity: 0.6 }}>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: "#6c757d" }} />
                  <span className="px-2" style={{ fontSize: "0.7rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {genLabel}
                  </span>
                  <hr className="flex-grow-1 m-0" style={{ borderColor: "#6c757d" }} />
                </div>
                <div className="d-flex flex-wrap justify-content-center">{actors.map(renderCharacterButton)}</div>
              </section>
            )
          })
        : <div className="d-flex flex-wrap justify-content-center">{sortedActors.map(renderCharacterButton)}</div>}
      </div>
    </section>
  )
}

export default CharacterSelection
