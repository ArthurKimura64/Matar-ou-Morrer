import React, { useState, useMemo } from 'react';

const GlobalStatsTab = ({ data, onInspectPlayer }) => {
  const [searchChar, setSearchChar] = useState('');
  const [minMatches, setMinMatches] = useState(1);
  const [sortBy, setSortBy] = useState('times_picked'); // 'times_picked' | 'win_rate' | 'total_eliminations' | 'avg_eliminations'

  const overview = data?.overview || {};
  const records = data?.records || {};
  const characterMeta = useMemo(
    () => (Array.isArray(data?.character_meta) ? data.character_meta : []),
    [data?.character_meta]
  );

  // Destaques automáticos do Meta
  const highlights = useMemo(() => {
    if (characterMeta.length === 0) return {};
    const mostPicked = [...characterMeta].sort((a, b) => b.times_picked - a.times_picked)[0];
    const deadliest = [...characterMeta].sort((a, b) => b.total_eliminations - a.total_eliminations)[0];
    const eligibleForWinRate = characterMeta.filter((c) => c.times_picked >= 3);
    const highestWinRate = (eligibleForWinRate.length > 0 ? eligibleForWinRate : characterMeta)
      .slice()
      .sort((a, b) => b.win_rate - a.win_rate || b.wins - a.wins)[0];

    return { mostPicked, deadliest, highestWinRate };
  }, [characterMeta]);

  const filteredCharacters = useMemo(() => {
    const q = searchChar.trim().toLowerCase();
    return characterMeta
      .filter((c) => c.times_picked >= minMatches)
      .filter((c) => !q || c.character_name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'win_rate') return b.win_rate - a.win_rate || b.times_picked - a.times_picked;
        if (sortBy === 'total_eliminations') return b.total_eliminations - a.total_eliminations;
        if (sortBy === 'avg_eliminations') return b.avg_eliminations - a.avg_eliminations;
        return b.times_picked - a.times_picked || b.win_rate - a.win_rate;
      });
  }, [characterMeta, searchChar, minMatches, sortBy]);

  return (
    <div className="d-flex flex-column gap-3">
      {/* Cartões de Resumo da Comunidade */}
      <section className="row g-3" aria-label="Números gerais da comunidade">
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-primary h-100 text-center p-3">
            <div className="fs-3 fw-bold text-primary">{overview.total_matches || 0}</div>
            <small className="text-muted">Partidas Concluídas</small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-success h-100 text-center p-3">
            <div className="fs-3 fw-bold text-success">{overview.active_players || 0}</div>
            <small className="text-muted">
              Jogadores Ativos <span className="opacity-75">({overview.total_registered_players || 0} contas)</span>
            </small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-danger h-100 text-center p-3">
            <div className="fs-3 fw-bold text-danger">{overview.total_eliminations || 0}</div>
            <small className="text-muted">Eliminações Registradas</small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-info h-100 text-center p-3">
            <div className="fs-3 fw-bold text-info">{overview.avg_players_per_match || 0}</div>
            <small className="text-muted">
              Média Jogadores/Sala
              {overview.avg_duration_minutes > 0 ? ` • ~${overview.avg_duration_minutes} min` : ''}
            </small>
          </div>
        </article>
      </section>

      {/* Destaques e Recordes */}
      {(highlights.mostPicked || records.best_single_match_eliminations) && (
        <section className="row g-3" aria-label="Destaques e recordes globais">
          {highlights.mostPicked && (
            <article className="col-12 md:col-4">
              <div className="card bg-dark border-secondary h-100 p-3">
                <small className="text-muted mb-1">⭐ Mais Escolhido</small>
                <div className="fw-bold text-white fs-5">{highlights.mostPicked.character_name}</div>
                <small className="text-info">
                  {highlights.mostPicked.times_picked} partidas ({highlights.mostPicked.pick_rate}% das escolhas)
                </small>
              </div>
            </article>
          )}

          {highlights.highestWinRate && (
            <article className="col-12 md:col-4">
              <div className="card bg-dark border-secondary h-100 p-3">
                <small className="text-muted mb-1">🏆 Maior Win Rate</small>
                <div className="fw-bold text-white fs-5">{highlights.highestWinRate.character_name}</div>
                <small className="text-success">
                  {highlights.highestWinRate.win_rate}% de vitórias ({highlights.highestWinRate.wins}/{highlights.highestWinRate.times_picked})
                </small>
              </div>
            </article>
          )}

          {records.best_single_match_eliminations && (
            <article className="col-12 md:col-4">
              <div className="card bg-dark border-secondary h-100 p-3">
                <small className="text-muted mb-1">💀 Recorde em 1 Partida</small>
                <div className="fw-bold text-white fs-5">
                  {records.best_single_match_eliminations.eliminations} abates
                </div>
                <small className="text-warning">
                  {records.best_single_match_eliminations.user_id && onInspectPlayer ? (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-warning fw-bold align-baseline"
                      onClick={() => onInspectPlayer(records.best_single_match_eliminations.user_id)}
                    >
                      {records.best_single_match_eliminations.player_name}
                    </button>
                  ) : (
                    records.best_single_match_eliminations.player_name
                  )}
                  {records.best_single_match_eliminations.character_name
                    ? ` (${records.best_single_match_eliminations.character_name})`
                    : ''}
                </small>
              </div>
            </article>
          )}

          {highlights.deadliest && (
            <article className="col-12 md:col-3">
              <div className="card bg-dark border-secondary h-100 p-3">
                <small className="text-muted mb-1">🔥 Mais Letal</small>
                <div className="fw-bold text-white fs-5">{highlights.deadliest.character_name}</div>
                <small className="text-danger">
                  {highlights.deadliest.total_eliminations} abates ({highlights.deadliest.avg_eliminations}/part.)
                </small>
              </div>
            </article>
          )}
        </section>
      )}

      {/* Tabela de Meta dos Personagens */}
      <section className="card bg-dark border-secondary" aria-label="Meta de personagens">
        <header className="card-header d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h5 className="text-white fw-bold mb-0">🎭 Desempenho por Personagem</h5>
            <small className="text-muted">
              Estatísticas acumuladas de todas as partidas concluídas
            </small>
          </div>

          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ width: '180px' }}
              placeholder="Filtrar personagem..."
              value={searchChar}
              onChange={(e) => setSearchChar(e.target.value)}
            />

            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={minMatches}
              onChange={(e) => setMinMatches(Number(e.target.value))}
              title="Mínimo de partidas"
            >
              <option value={1}>Mín. 1 partida</option>
              <option value={3}>Mín. 3 partidas</option>
              <option value={5}>Mín. 5 partidas</option>
              <option value={10}>Mín. 10 partidas</option>
            </select>

            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Ordenar por"
            >
              <option value="times_picked">Mais escolhidos</option>
              <option value="win_rate">Maior Win Rate</option>
              <option value="total_eliminations">Mais eliminações</option>
              <option value="avg_eliminations">Média de abates</option>
            </select>
          </div>
        </header>

        <div className="card-body p-0">
          {filteredCharacters.length === 0 ? (
            <div className="text-center text-muted py-4">
              Nenhum personagem encontrado com esses filtros.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0 small">
                <thead>
                  <tr>
                    <th className="ps-3">Personagem</th>
                    <th className="text-center">Escolhas</th>
                    <th className="text-center">Pick Rate</th>
                    <th className="text-center">Vitórias</th>
                    <th className="text-center">Win Rate</th>
                    <th className="text-center">Abates</th>
                    <th className="text-center pe-3">Abates/Partida</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCharacters.map((char) => (
                    <tr key={char.character_name}>
                      <td className="ps-3 fw-bold text-white">{char.character_name}</td>
                      <td className="text-center">{char.times_picked}</td>
                      <td className="text-center text-info">{char.pick_rate}%</td>
                      <td className="text-center text-success fw-bold">{char.wins}</td>
                      <td className="text-center">
                        <span
                          className={`badge ${
                            char.win_rate >= 50
                              ? 'bg-success'
                              : char.win_rate >= 25
                              ? 'bg-warning text-dark'
                              : 'bg-secondary'
                          }`}
                        >
                          {char.win_rate}%
                        </span>
                      </td>
                      <td className="text-center text-danger fw-bold">{char.total_eliminations}</td>
                      <td className="text-center pe-3 text-muted">{char.avg_eliminations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default GlobalStatsTab;