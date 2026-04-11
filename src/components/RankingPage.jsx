import React, { useState, useEffect } from 'react';
import authService from '../services/authService';

const LEADERBOARD_TYPES = [
  { key: 'composite', label: '🏅 Score Composto', column: 'composite_score' },
  { key: 'wins', label: '🏆 Vitórias', column: 'total_wins' },
  { key: 'eliminations', label: '☠️ Eliminações', column: 'total_eliminations' },
  { key: 'survival', label: '💪 Sobrevivência', column: 'total_survival_points' }
];

const RankingPage = ({ user, onBack, localization }) => {
  const [activeTab, setActiveTab] = useState('composite');
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState(null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    loadLeaderboard(activeTab);
  }, [activeTab]);

  const loadLeaderboard = async (type) => {
    setLoading(true);
    try {
      const data = await authService.getLeaderboard(type, 50);
      setLeaderboard(data || []);

      // Load user position if logged in and not in top 50
      if (user) {
        const inList = (data || []).some(e => e.user_id === user.id);
        if (!inList) {
          const rank = await authService.getUserRankPosition(user.id, type);
          setUserRank(rank);
        } else {
          setUserRank(null);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar ranking:', err);
      setLeaderboard([]);
    }
    setLoading(false);
  };

  const getStatValue = (entry) => {
    const type = LEADERBOARD_TYPES.find(t => t.key === activeTab);
    const val = entry[type?.column] || 0;
    return activeTab === 'composite' ? Number(val).toFixed(0) : val;
  };

  const getMedalEmoji = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const avgStat = (entry, field) => {
    if (!entry.total_matches || entry.total_matches === 0) return '0.0';
    return (entry[field] / entry.total_matches).toFixed(1);
  };

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
          <h2 className="text-white">🏆 Ranking Global</h2>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-10 col-lg-8">
          {/* Tabs */}
          <div className="d-flex gap-2 flex-wrap justify-content-center mb-3">
            {LEADERBOARD_TYPES.map(type => (
              <button
                key={type.key}
                className={`btn btn-sm ${activeTab === type.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab(type.key)}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Formula explanation */}
          <div className="mb-4">
            <button
              className="btn btn-sm btn-outline-info w-100"
              onClick={() => setShowFormula(!showFormula)}
              style={{ borderStyle: 'dashed' }}
            >
              {showFormula ? '▲' : '▼'} Como funciona a pontuação?
            </button>
            {showFormula && (
              <div className="card bg-dark border-info mt-2">
                <div className="card-body">
                  <h6 className="text-info mb-3">📊 Fórmula do Score Composto</h6>
                  <div className="p-2 rounded mb-3" style={{ background: 'rgba(13,110,253,0.1)', border: '1px solid rgba(13,110,253,0.3)' }}>
                    <code className="text-light" style={{ fontSize: '0.85rem' }}>
                      Score = (Vitórias × 40) + (Eliminações × 8) + (Sobrevivência × 4) + (Win Rate × Fator de Volume × 30)
                    </code>
                  </div>
                  <table className="table table-dark table-sm mb-3" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Componente</th>
                        <th className="text-center">Peso</th>
                        <th>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-success">🏆 Vitórias</td>
                        <td className="text-center">×40</td>
                        <td className="text-secondary">Cada vitória acumula 40 pontos. Principal fator de ranking.</td>
                      </tr>
                      <tr>
                        <td className="text-danger">☠️ Eliminações</td>
                        <td className="text-center">×8</td>
                        <td className="text-secondary">Cada eliminação vale 8 pontos. Recompensa agressividade.</td>
                      </tr>
                      <tr>
                        <td className="text-warning">💪 Sobrevivência</td>
                        <td className="text-center">×4</td>
                        <td className="text-secondary">Pontos por posição final. Sobreviver mais tempo vale mais.</td>
                      </tr>
                      <tr>
                        <td className="text-info">📈 Win Rate</td>
                        <td className="text-center">×30</td>
                        <td className="text-secondary">Porcentagem de vitórias, multiplicada pelo fator de volume.</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="p-2 rounded" style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)' }}>
                    <small className="text-warning">
                      <strong>⚖️ Fator de Volume:</strong> O peso do Win Rate cresce progressivamente conforme você joga, atingindo 100% após 10 partidas. 
                      Isso impede que jogadores com poucas partidas dominem o ranking por terem win rate inflado.
                    </small>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User position card (if not in top 50) */}
          {userRank && !loading && (
            <div className="card bg-dark border-primary mb-3">
              <div className="card-body py-2 px-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <small className="text-secondary">Sua posição</small>
                    <div>
                      <span className="fw-bold text-primary" style={{ fontSize: '1.2rem' }}>
                        #{userRank.position}
                      </span>
                      <span className="text-secondary ms-2" style={{ fontSize: '0.85rem' }}>
                        {userRank.stats.total_matches} partidas · {userRank.stats.total_wins} vitórias · {Number(userRank.stats.win_rate || 0).toFixed(1)}% WR
                      </span>
                    </div>
                  </div>
                  <span className="fw-bold text-warning">{Number(userRank.stats.composite_score || 0).toFixed(0)} pts</span>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="card bg-dark border-secondary">
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                  <span className="text-secondary ms-2">Carregando ranking...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center text-secondary py-4">
                  Nenhum jogador com partidas registradas ainda.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-hover mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>#</th>
                        <th>Jogador</th>
                        <th className="text-center">Partidas</th>
                        <th className="text-center">Vitórias</th>
                        <th className="text-center">Eliminações</th>
                        <th className="text-center d-none d-md-table-cell">Méd. Elim</th>
                        <th className="text-center d-none d-md-table-cell">Méd. Sobrev</th>
                        <th className="text-center">Win Rate</th>
                        <th className="text-end">{LEADERBOARD_TYPES.find(t => t.key === activeTab)?.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, idx) => {
                        const isCurrentUser = user && entry.user_id === user.id;
                        return (
                          <tr key={entry.user_id} className={isCurrentUser ? 'table-active' : ''}>
                            <td>
                              <span style={{ fontSize: idx < 3 ? '1.3rem' : '0.9rem' }}>
                                {getMedalEmoji(idx)}
                              </span>
                            </td>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                {entry.profile?.avatar_url ? (
                                  <img 
                                    src={entry.profile.avatar_url} 
                                    alt="" 
                                    width="28" 
                                    height="28" 
                                    className="rounded-circle"
                                  />
                                ) : (
                                  <span style={{ fontSize: '1.2rem' }}>👤</span>
                                )}
                                <span className={`text-light ${isCurrentUser ? 'fw-bold' : ''}`}>
                                  {entry.profile?.display_name || 'Jogador'}
                                  {isCurrentUser && <small className="text-primary ms-1">(você)</small>}
                                </span>
                              </div>
                            </td>
                            <td className="text-center text-secondary">{entry.total_matches}</td>
                            <td className="text-center text-success">{entry.total_wins}</td>
                            <td className="text-center text-danger">{entry.total_eliminations}</td>
                            <td className="text-center text-secondary d-none d-md-table-cell">{avgStat(entry, 'total_eliminations')}</td>
                            <td className="text-center text-secondary d-none d-md-table-cell">{avgStat(entry, 'total_survival_points')}</td>
                            <td className="text-center text-secondary">
                              {entry.win_rate ? Number(entry.win_rate).toFixed(1) : '0.0'}%
                            </td>
                            <td className="text-end">
                              <span className="fw-bold text-warning">{getStatValue(entry)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* User's position hint */}
          {user && !loading && leaderboard.length > 0 && !leaderboard.some(e => e.user_id === user.id) && !userRank && (
            <div className="text-center text-secondary mt-3">
              <small>Jogue partidas para aparecer no ranking!</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RankingPage;
