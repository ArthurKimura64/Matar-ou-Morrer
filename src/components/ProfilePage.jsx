import React, { useState, useEffect } from 'react';
import authService from '../services/authService';

const ProfilePage = ({ user, onBack, localization }) => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [matchHistory, setMatchHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const HISTORY_PAGE_SIZE = 10;

  useEffect(() => {
    if (user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profileData, statsData, historyData] = await Promise.all([
        authService.getProfile(user.id),
        authService.getUserStats(user.id),
        authService.getMatchHistory(user.id, HISTORY_PAGE_SIZE, 0)
      ]);
      setProfile(profileData);
      setStats(statsData);
      setMatchHistory(historyData || []);
      setHasMoreHistory((historyData || []).length === HISTORY_PAGE_SIZE);
      setNewDisplayName(profileData?.display_name || '');
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
    }
    setLoading(false);
  };

  const loadMoreHistory = async () => {
    const nextPage = historyPage + 1;
    try {
      const data = await authService.getMatchHistory(user.id, HISTORY_PAGE_SIZE, nextPage * HISTORY_PAGE_SIZE);
      setMatchHistory(prev => [...prev, ...(data || [])]);
      setHistoryPage(nextPage);
      setHasMoreHistory((data || []).length === HISTORY_PAGE_SIZE);
    } catch (err) {
      console.error('Erro ao carregar mais histórico:', err);
    }
  };

  const handleSaveName = async () => {
    if (!newDisplayName.trim() || newDisplayName.trim() === profile?.display_name) {
      setEditingName(false);
      return;
    }
    try {
      const updated = await authService.updateProfile(user.id, { display_name: newDisplayName.trim() });
      setProfile(updated);
      setEditingName(false);
    } catch (err) {
      console.error('Erro ao atualizar nome:', err);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12 text-center mb-4">
          <img 
            src="KillOrDieLogo.png"
            alt="Kill or Die" 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{ maxHeight: '150px' }} 
          />
          <button 
            className="btn btn-outline-light btn-sm mb-3"
            onClick={onBack}
          >
            ← Voltar ao Menu
          </button>
          <h2 className="text-white">📊 Meu Perfil</h2>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-10 col-lg-8">
          {/* Perfil Header */}
          <div className="card bg-dark border-secondary mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" width="64" height="64" className="rounded-circle" />
                ) : (
                  <div className="rounded-circle bg-primary d-flex align-items-center justify-content-center" 
                       style={{ width: '64px', height: '64px', fontSize: '28px' }}>
                    👤
                  </div>
                )}
                <div className="flex-grow-1">
                  {editingName ? (
                    <div className="d-flex gap-2">
                      <input 
                        type="text" 
                        className="form-control bg-dark text-light border-secondary" 
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        maxLength={50}
                        autoFocus
                      />
                      <button className="btn btn-success btn-sm" onClick={handleSaveName}>✓</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingName(false)}>✗</button>
                    </div>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <h4 className="text-white mb-0">{profile?.display_name || 'Jogador'}</h4>
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingName(true)}>
                        ✏️
                      </button>
                    </div>
                  )}
                  <small className="text-secondary">{user.email}</small>
                  <br />
                  <small className="text-secondary">
                    Membro desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <div className="card bg-dark border-primary text-center h-100">
                <div className="card-body py-3">
                  <div className="text-primary" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {stats?.total_matches || 0}
                  </div>
                  <small className="text-secondary">Partidas</small>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card bg-dark border-success text-center h-100">
                <div className="card-body py-3">
                  <div className="text-success" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {stats?.total_wins || 0}
                  </div>
                  <small className="text-secondary">Vitórias</small>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card bg-dark border-danger text-center h-100">
                <div className="card-body py-3">
                  <div className="text-danger" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {stats?.total_eliminations || 0}
                  </div>
                  <small className="text-secondary">Eliminações</small>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card bg-dark border-warning text-center h-100">
                <div className="card-body py-3">
                  <div className="text-warning" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {stats?.composite_score ? Number(stats.composite_score).toFixed(0) : '0'}
                  </div>
                  <small className="text-secondary">Score</small>
                </div>
              </div>
            </div>
          </div>

          {/* Extra stats */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-4">
              <div className="card bg-dark border-secondary text-center">
                <div className="card-body py-2">
                  <small className="text-secondary d-block">Taxa de Vitória</small>
                  <span className="text-white fw-bold">
                    {stats?.win_rate ? Number(stats.win_rate).toFixed(1) : '0.0'}%
                  </span>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-4">
              <div className="card bg-dark border-secondary text-center">
                <div className="card-body py-2">
                  <small className="text-secondary d-block">Pontos de Sobrevivência</small>
                  <span className="text-white fw-bold">{stats?.total_survival_points || 0}</span>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="card bg-dark border-secondary text-center">
                <div className="card-body py-2">
                  <small className="text-secondary d-block">Personagem Favorito</small>
                  <span className="text-white fw-bold">{stats?.favorite_character || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Match History */}
          <div className="card bg-dark border-secondary">
            <div className="card-header border-secondary">
              <h5 className="text-white mb-0">📜 Histórico de Partidas</h5>
            </div>
            <div className="card-body p-0">
              {matchHistory.length === 0 ? (
                <div className="text-center text-secondary py-4">
                  Nenhuma partida registrada ainda.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Resultado</th>
                        <th>Sala</th>
                        <th>Personagem</th>
                        <th>Jogadores</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchHistory.map((entry, idx) => (
                        <tr key={entry.id || idx}>
                          <td>
                            {entry.is_winner ? (
                              <span className="badge bg-success">🏆 Vitória</span>
                            ) : (
                              <span className="badge bg-secondary">
                                💀 #{entry.elimination_order || '?'}
                              </span>
                            )}
                          </td>
                          <td className="text-light">{entry.match?.room_name || '—'}</td>
                          <td className="text-light">{entry.character_name || '—'}</td>
                          <td className="text-light">{entry.match?.total_players || '—'}</td>
                          <td className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            {entry.match?.ended_at 
                              ? new Date(entry.match.ended_at).toLocaleDateString('pt-BR', { 
                                  day: '2-digit', month: '2-digit', year: '2-digit',
                                  hour: '2-digit', minute: '2-digit' 
                                })
                              : '—'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasMoreHistory && (
                <div className="text-center py-3">
                  <button className="btn btn-outline-light btn-sm" onClick={loadMoreHistory}>
                    Carregar mais
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
