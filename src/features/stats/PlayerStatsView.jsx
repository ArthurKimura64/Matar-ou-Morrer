import React, { useState, useEffect } from 'react';
import authService from '../../services/authService';
import { statsService } from '../../services/statsService';
import { validatePlayerName } from '../../utils/validation';

const formatDate = (isoString) => {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  } catch {
    return '—';
  }
};

const PlayerStatsView = ({
  data,
  user = null,
  isOwnProfile = false,
  onInspectPlayer,
  onProfileUpdated,
  onClose
}) => {
  const profile = data?.profile || {};
  const summary = data?.summary || {};
  const characters = Array.isArray(data?.characters) ? data.characters : [];
  const rivalries = data?.rivalries || {};
  const recentMatches = Array.isArray(data?.recent_matches) ? data.recent_matches : [];

  const [editingName, setEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(profile.display_name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    setNewDisplayName(profile.display_name || '');
    setEditingName(false);
    setNameError('');
  }, [profile.user_id, profile.display_name]);

  const handleSaveName = async (e) => {
    e?.preventDefault();
    if (!isOwnProfile || !user?.id || savingName) return;

    setNameError('');
    const check = validatePlayerName(newDisplayName, 50);
    if (!check.valid) {
      setNameError(check.error);
      return;
    }

    if (check.sanitized === profile.display_name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const updated = await authService.updateProfile(user.id, {
        display_name: check.sanitized
      });
      statsService.clearCache();
      setEditingName(false);
      onProfileUpdated?.(updated);
    } catch (err) {
      setNameError('Erro ao atualizar nome. Tente novamente.');
      console.error('Erro ao atualizar nome:', err);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Cabeçalho do Jogador Inspecionado / Meu Perfil */}
      <header className="card bg-dark border-info">
        <div className="card-body d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3 flex-grow-1">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                width="52"
                height="52"
                className="rounded-circle border border-info flex-shrink-0"
              />
            ) : (
              <div
                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '52px', height: '52px', fontSize: '1.5rem' }}
                aria-hidden="true"
              >
                👤
              </div>
            )}

            <div className="flex-grow-1">
              {isOwnProfile && editingName ? (
                <form onSubmit={handleSaveName} className="d-flex flex-column gap-1">
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ maxWidth: '240px' }}
                      value={newDisplayName}
                      onChange={(e) => {
                        setNewDisplayName(e.target.value);
                        if (nameError) setNameError('');
                      }}
                      maxLength={50}
                      autoFocus
                      disabled={savingName}
                    />
                    <button
                      type="submit"
                      className="btn btn-success btn-sm"
                      disabled={savingName}
                    >
                      {savingName ? '⏳' : '✓ Salvar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={savingName}
                      onClick={() => {
                        setNewDisplayName(profile.display_name || '');
                        setNameError('');
                        setEditingName(false);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {nameError && <small className="text-danger">{nameError}</small>}
                </form>
              ) : (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <h4 className="text-white fw-bold mb-0">{profile.display_name}</h4>
                  {isOwnProfile && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm py-0 px-2"
                        title="Editar nome de exibição"
                        onClick={() => setEditingName(true)}
                      >
                        ✏️
                      </button>
                      <span className="badge bg-primary">Você</span>
                    </>
                  )}
                  {summary.rank_position && (
                    <span className="badge bg-warning text-dark">
                      🏆 #{summary.rank_position} no Ranking
                    </span>
                  )}
                </div>
              )}

              {isOwnProfile && user?.email && (
                <small className="text-secondary d-block">{user.email}</small>
              )}

              <small className="text-muted">
                Conta criada em {formatDate(profile.created_at)}
                {summary.favorite_character ? ` • Favorito: ${summary.favorite_character}` : ''}
              </small>
            </div>
          </div>

          {onClose && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              ← Voltar à Busca
            </button>
          )}
        </div>
      </header>

      {/* Indicadores Principais */}
      <section className="row g-3" aria-label="Resumo de estatísticas do jogador">
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-info h-100 text-center p-3">
            <div className="fs-4 fw-bold text-info">{summary.composite_score || 0}</div>
            <small className="text-muted">Pontuação Composta</small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-success h-100 text-center p-3">
            <div className="fs-4 fw-bold text-success">
              {summary.total_wins || 0} / {summary.total_matches || 0}
            </div>
            <small className="text-muted">Vitórias ({summary.win_rate || 0}%)</small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-danger h-100 text-center p-3">
            <div className="fs-4 fw-bold text-danger">{summary.total_eliminations || 0}</div>
            <small className="text-muted">
              Abates ({summary.avg_eliminations || 0}/part. • Máx {summary.best_match_eliminations || 0})
            </small>
          </div>
        </article>
        <article className="col-6 md:col-3">
          <div className="card bg-dark border-warning h-100 text-center p-3">
            <div className="fs-4 fw-bold text-warning">{summary.total_survival_points || 0}</div>
            <small className="text-muted">
              Sobrevivência (Média {summary.avg_survival_points || 0})
            </small>
          </div>
        </article>
      </section>

      {/* Rivalidades (Carrasco & Vítima Favorita) */}
      {(rivalries.nemesis || rivalries.favorite_victim) && (
        <section className="row g-3" aria-label="Rivalidades do jogador">
          <article className="col-12 md:col-6">
            <div className="card bg-dark border-danger h-100 p-3">
              <small className="text-muted mb-1">☠️ Maior Carrasco (quem mais o eliminou)</small>
              {rivalries.nemesis ? (
                <div className="d-flex justify-content-between align-items-center">
                  {rivalries.nemesis.user_id && onInspectPlayer ? (
                    <button
                      type="button"
                      className="btn btn-link p-0 fw-bold text-danger fs-5 text-decoration-none"
                      onClick={() => onInspectPlayer(rivalries.nemesis.user_id)}
                    >
                      {rivalries.nemesis.name} →
                    </button>
                  ) : (
                    <span className="fw-bold text-danger fs-5">{rivalries.nemesis.name}</span>
                  )}
                  <span className="badge bg-danger">
                    {rivalries.nemesis.times} {rivalries.nemesis.times === 1 ? 'vez' : 'vezes'}
                  </span>
                </div>
              ) : (
                <small className="text-muted">Sem eliminações registradas.</small>
              )}
            </div>
          </article>

          <article className="col-12 md:col-6">
            <div className="card bg-dark border-success h-100 p-3">
              <small className="text-muted mb-1">🎯 Vítima Favorita (quem ele mais eliminou)</small>
              {rivalries.favorite_victim ? (
                <div className="d-flex justify-content-between align-items-center">
                  {rivalries.favorite_victim.user_id && onInspectPlayer ? (
                    <button
                      type="button"
                      className="btn btn-link p-0 fw-bold text-success fs-5 text-decoration-none"
                      onClick={() => onInspectPlayer(rivalries.favorite_victim.user_id)}
                    >
                      {rivalries.favorite_victim.name} →
                    </button>
                  ) : (
                    <span className="fw-bold text-success fs-5">{rivalries.favorite_victim.name}</span>
                  )}
                  <span className="badge bg-success">
                    {rivalries.favorite_victim.times}{' '}
                    {rivalries.favorite_victim.times === 1 ? 'eliminação' : 'eliminações'}
                  </span>
                </div>
              ) : (
                <small className="text-muted">Sem vítimas registradas ainda.</small>
              )}
            </div>
          </article>
        </section>
      )}

      {/* Desempenho por Personagem */}
      <section className="card bg-dark border-secondary" aria-label="Personagens jogados">
        <header className="card-header">
          <h6 className="text-white fw-bold mb-0">🎭 Personagens Jogados ({characters.length})</h6>
        </header>
        <div className="card-body p-0">
          {characters.length === 0 ? (
            <div className="text-center text-muted py-4 small">
              Nenhuma partida registrada com personagem ainda.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0 small">
                <thead>
                  <tr>
                    <th className="ps-3">Personagem</th>
                    <th className="text-center">Partidas</th>
                    <th className="text-center">Vitórias</th>
                    <th className="text-center">Win Rate</th>
                    <th className="text-center">Abates</th>
                    <th className="text-center pe-3">Sobrevivência</th>
                  </tr>
                </thead>
                <tbody>
                  {characters.map((c) => (
                    <tr key={c.character_name}>
                      <td className="ps-3 fw-bold text-white">{c.character_name}</td>
                      <td className="text-center">{c.matches}</td>
                      <td className="text-center text-success fw-bold">{c.wins}</td>
                      <td className="text-center">
                        <span className={`badge ${c.win_rate >= 50 ? 'bg-success' : 'bg-secondary'}`}>
                          {c.win_rate}%
                        </span>
                      </td>
                      <td className="text-center text-danger fw-bold">
                        {c.eliminations} <small className="text-muted">({c.avg_eliminations}/p)</small>
                      </td>
                      <td className="text-center pe-3 text-warning">{c.survival_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Histórico das Últimas 20 Partidas */}
      <section className="card bg-dark border-secondary" aria-label="Histórico recente de partidas">
        <header className="card-header">
          <h6 className="text-white fw-bold mb-0">📜 Últimas Partidas ({recentMatches.length})</h6>
        </header>
        <div className="card-body p-0">
          {recentMatches.length === 0 ? (
            <div className="text-center text-muted py-4 small">
              Nenhuma partida concluída encontrada.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0 small">
                <thead>
                  <tr>
                    <th className="ps-3">Data</th>
                    <th>Sala</th>
                    <th>Personagem</th>
                    <th className="text-center">Resultado</th>
                    <th className="text-center">Abates</th>
                    <th className="pe-3">Eliminado por</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.map((m) => (
                    <tr key={m.match_id}>
                      <td className="ps-3 text-muted">{formatDate(m.ended_at)}</td>
                      <td className="text-white">{m.room_name || 'Sala'}</td>
                      <td className="text-info">{m.character_name || '—'}</td>
                      <td className="text-center">
                        {m.is_winner ? (
                          <span className="badge bg-success">🏆 Vitória</span>
                        ) : (
                          <span className="badge bg-secondary">
                            {m.elimination_order ? `${m.elimination_order}º eliminado` : 'Derrota'}
                          </span>
                        )}
                      </td>
                      <td className="text-center text-danger fw-bold">{m.eliminations_made}</td>
                      <td className="pe-3 text-muted">
                        {m.is_winner ? '—' : m.killed_by_player_name || '—'}
                      </td>
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

export default PlayerStatsView;