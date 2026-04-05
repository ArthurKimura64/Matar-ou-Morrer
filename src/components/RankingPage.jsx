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

  useEffect(() => {
    loadLeaderboard(activeTab);
  }, [activeTab]);

  const loadLeaderboard = async (type) => {
    setLoading(true);
    try {
      const data = await authService.getLeaderboard(type, 50);
      setLeaderboard(data || []);
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
          <div className="d-flex gap-2 flex-wrap justify-content-center mb-4">
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
          {user && !loading && leaderboard.length > 0 && !leaderboard.some(e => e.user_id === user.id) && (
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
