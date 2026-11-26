import React, { useState, useEffect, useCallback } from 'react';
import { statsService } from '../../services/statsService';
import GlobalStatsTab from './GlobalStatsTab';
import PlayerStatsView from './PlayerStatsView';

const StatsPage = ({ user, initialTargetUserId = null, onProfileUpdated, onBack }) => {
  const [activeTab, setActiveTab] = useState(initialTargetUserId ? 'player' : 'global');

  // Estado Global
  const [globalData, setGlobalData] = useState(null);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState('');

  // Estado de Busca Ativa de Jogadores
  const [searchTerm, setSearchTerm] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Jogador atualmente inspecionado
  const [selectedPlayerData, setSelectedPlayerData] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [playerError, setPlayerError] = useState('');

  const loadGlobalStats = useCallback(async (forceRefresh = false) => {
    setLoadingGlobal(true);
    setGlobalError('');
    const res = await statsService.getGlobalStats(forceRefresh);
    if (res.success) {
      setGlobalData(res.data);
    } else {
      setGlobalError(res.error || 'Erro ao carregar estatísticas globais.');
    }
    setLoadingGlobal(false);
  }, []);

  const handleInspectPlayer = useCallback(async (targetUserId) => {
    if (!targetUserId) return;
    setActiveTab('player');
    setLoadingPlayer(true);
    setPlayerError('');
    const res = await statsService.getPlayerPublicStats(targetUserId);
    if (res.success) {
      setSelectedPlayerData(res.data);
    } else {
      setSelectedPlayerData(null);
      setPlayerError(res.error || 'Não foi possível carregar este jogador.');
    }
    setLoadingPlayer(false);
  }, []);

  // Carrega aba Global somente quando o usuário entra nela
  useEffect(() => {
    if (activeTab === 'global' && !globalData && !loadingGlobal) {
      loadGlobalStats();
    }
  }, [activeTab, globalData, loadingGlobal, loadGlobalStats]);

  // Se o usuário veio clicando diretamente em alguém (ex: no Ranking ou Meu Perfil)
  useEffect(() => {
    if (initialTargetUserId) {
      handleInspectPlayer(initialTargetUserId);
    }
  }, [initialTargetUserId, handleInspectPlayer]);

  const handleProfileUpdated = useCallback(
    (updatedProfile) => {
      if (updatedProfile?.display_name) {
        setSelectedPlayerData((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  display_name: updatedProfile.display_name
                }
              }
            : prev
        );
      }
      onProfileUpdated?.(updatedProfile);
    },
    [onProfileUpdated]
  );

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const clean = searchTerm.trim();
    if (clean.length < 2) return;

    setSearching(true);
    setHasSearched(true);
    setSelectedPlayerData(null);
    setPlayerError('');

    const res = await statsService.searchPlayers(clean);
    if (res.success) {
      setSearchResults(res.players);
    } else {
      setSearchResults([]);
      setPlayerError(res.error || 'Erro ao buscar jogadores.');
    }
    setSearching(false);
  };

  return (
    <section className="container py-3" aria-label="Central de Estatísticas">
      <header className="card bg-dark border-light mb-3">
        <div className="card-body d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h4 className="text-white fw-bold mb-0">📈 Central de Estatísticas</h4>
            <small className="text-muted">
              Consulte o panorama geral do jogo, seu perfil ou procure as estatísticas de qualquer jogador
            </small>
          </div>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={onBack}>
            ← Voltar ao Menu
          </button>
        </div>
      </header>

      {/* Navegação entre Abas */}
      <nav className="d-flex gap-2 mb-3 flex-wrap" aria-label="Seções de estatísticas">
        <button
          type="button"
          className={`btn ${activeTab === 'global' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setActiveTab('global')}
        >
          🌍 Estatísticas Globais
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'player' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setActiveTab('player')}
        >
          🔍 Buscar Jogador
        </button>
        {user?.id && (
          <button
            type="button"
            className="btn btn-outline-info ms-auto"
            onClick={() => handleInspectPlayer(user.id)}
          >
            👤 Meu Perfil / Stats
          </button>
        )}
      </nav>

      {/* ABA 1: GLOBAL */}
      {activeTab === 'global' && (
        <>
          {loadingGlobal ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status" />
              <p className="text-muted mt-2 small">Carregando estatísticas da comunidade...</p>
            </div>
          ) : globalError ? (
            <div className="alert alert-danger d-flex justify-content-between align-items-center">
              <span>{globalError}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => loadGlobalStats(true)}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            globalData && (
              <GlobalStatsTab data={globalData} onInspectPlayer={handleInspectPlayer} />
            )
          )}
        </>
      )}

      {/* ABA 2: BUSCA ATIVA E PERFIL PÚBLICO */}
      {activeTab === 'player' && (
        <div className="d-flex flex-column gap-3">
          {/* Formulário de Busca Ativa */}
          <section className="card bg-dark border-secondary" aria-label="Pesquisar jogador">
            <div className="card-body">
              <form
                onSubmit={handleSearchSubmit}
                className="d-flex flex-row gap-2 flex-wrap align-items-center"
              >
                <input
                  type="text"
                  className="form-control flex-grow-1"
                  style={{ minWidth: '200px' }}
                  placeholder="Digite pelo menos 2 letras do nome do jogador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  maxLength={50}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={searching || searchTerm.trim().length < 2}
                >
                  {searching ? '⏳ Buscando...' : '🔍 Procurar'}
                </button>
              </form>
            </div>
          </section>

          {loadingPlayer && (
            <div className="text-center py-5">
              <div className="spinner-border text-info" role="status" />
              <p className="text-muted mt-2 small">Carregando estatísticas do jogador...</p>
            </div>
          )}

          {playerError && !loadingPlayer && (
            <div className="alert alert-danger">{playerError}</div>
          )}

          {/* Perfil Público Detalhado (ou Meu Perfil com edição de nome) */}
          {!loadingPlayer && selectedPlayerData && (
            <PlayerStatsView
              data={selectedPlayerData}
              user={user}
              isOwnProfile={selectedPlayerData.profile?.user_id === user?.id}
              onInspectPlayer={handleInspectPlayer}
              onProfileUpdated={handleProfileUpdated}
              onClose={() => setSelectedPlayerData(null)}
            />
          )}

          {/* Resultados da Busca */}
          {!loadingPlayer && !selectedPlayerData && hasSearched && (
            <section className="card bg-dark border-secondary" aria-label="Resultados da busca">
              <header className="card-header">
                <h6 className="text-white fw-bold mb-0">
                  Resultados encontrados ({searchResults.length})
                </h6>
              </header>
              <div className="card-body">
                {searchResults.length === 0 ? (
                  <div className="text-center text-muted py-3 small">
                    Nenhum jogador encontrado com "{searchTerm}".
                  </div>
                ) : (
                  <div className="row g-2">
                    {searchResults.map((p) => (
                      <article key={p.user_id} className="col-12 md:col-6">
                        <div
                          className="card bg-dark border-secondary cursor-pointer h-100"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleInspectPlayer(p.user_id)}
                        >
                          <div className="card-body p-3 d-flex flex-row justify-content-between align-items-center gap-2">
                            <div className="text-start">
                              <div className="fw-bold text-white">{p.display_name}</div>
                              <small className="text-muted">
                                {p.total_matches} partidas • {p.total_wins} vitórias ({p.win_rate}%)
                                {p.favorite_character ? ` • ${p.favorite_character}` : ''}
                              </small>
                            </div>
                            <span className="badge bg-info text-dark flex-shrink-0">
                              ⭐ {p.composite_score} pts
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Estado inicial antes de qualquer busca */}
          {!loadingPlayer && !selectedPlayerData && !hasSearched && (
            <div className="text-center text-muted py-5">
              <div style={{ fontSize: '2.5rem', opacity: 0.4 }} aria-hidden="true">🔍</div>
              <p className="mt-2 mb-0 small">
                Pesquise o nome de um jogador acima ou clique em <strong>Meu Perfil / Stats</strong> para consultar os detalhes.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default StatsPage;