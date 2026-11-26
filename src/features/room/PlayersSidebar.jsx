import React, { useRef, useState, useEffect, useMemo } from 'react';
import PlayerDetailedStatus from './PlayerDetailedStatus';
import ConnectionStatusIndicator from '../../components/ConnectionStatusIndicator';
import { supabase } from '../../config/supabaseClient';

const PlayersSidebar = ({
  players = [],
  currentPlayer,
  localization = {},
  gameData,
  room = null,
  onKickPlayer = null,
  onEliminatePlayer = null,
  isOpen: isOpenProp,
  onToggle,
  matchStatus = null
}) => {
  const [isOpenLocal, setIsOpenLocal] = useState(false);
  const [playersStatsMap, setPlayersStatsMap] = useState({});
  const lastFetchedRef = useRef({ key: '', ts: 0 });
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenLocal;

  const toggleSidebar = () => {
    if (onToggle) {
      onToggle();
    } else {
      setIsOpenLocal(!isOpenLocal);
    }
  };

  const userIdsKey = players.map((p) => p.user_id).filter(Boolean).sort().join(',');

  useEffect(() => {
    if (!isOpen) return;

    const userIds = userIdsKey ? userIdsKey.split(',') : [];
    if (userIds.length === 0) return;

    const now = Date.now();
    if (
      lastFetchedRef.current.key === userIdsKey &&
      now - lastFetchedRef.current.ts < 60000
    ) {
      return;
    }

    let isMounted = true;
    const fetchBriefStats = async () => {
      try {
        const { data, error } = await supabase.rpc('get_players_brief_stats', {
          p_user_ids: userIds
        });
        if (!error && Array.isArray(data) && isMounted) {
          const map = {};
          data.forEach((item) => {
            map[item.user_id] = item;
          });
          setPlayersStatsMap(map);
          lastFetchedRef.current = { key: userIdsKey, ts: Date.now() };
        }
      } catch (err) {
        console.warn('Erro ao buscar resumo dos jogadores:', err);
      }
    };

    fetchBriefStats();
    return () => {
      isMounted = false;
    };
  }, [userIdsKey, isOpen]);

  const isCurrentPlayerMaster = Boolean(
    room && currentPlayer && room.master_player_id === currentPlayer.id
  );

  const connectedPlayers = useMemo(
    () => players.filter((p) => p.is_connected !== false),
    [players]
  );

  // Durante partida ativa, mantém visíveis participantes que caíram/saíram para o anfitrião poder eliminá-los
  const visiblePlayers = useMemo(
    () =>
      players.filter(
        (p) => p.is_connected !== false || (matchStatus === 'in_progress' && p.in_match === true)
      ),
    [players, matchStatus]
  );

  const orderedPlayers = useMemo(() => {
    if (matchStatus !== 'in_progress') return visiblePlayers;
    const getPriority = (p) => {
      if (p.in_match === true && p.is_alive !== false && p.is_connected !== false) return 0; // Vivo e online
      if (p.in_match === true && p.is_alive !== false && p.is_connected === false) return 1; // Vivo e offline
      if (p.in_match === true && p.is_alive === false) return 2; // Eliminado
      return 3; // Espectador
    };
    return [...visiblePlayers].sort((a, b) => getPriority(a) - getPriority(b));
  }, [visiblePlayers, matchStatus]);

  const playerCountLabel = `${connectedPlayers.length} ${
    connectedPlayers.length === 1
      ? localization['UI.Common.PlayerSingular'] || 'jogador'
      : localization['UI.Common.PlayerPlural'] || 'jogadores'
  }`;

  return (
    <>
      <button
        type="button"
        onClick={toggleSidebar}
        className={`btn btn-dark sidebar-toggle-btn sidebar-toggle-players border border-light ${isOpen ? 'is-open' : ''}`}
        title={
          isOpen
            ? localization['UI.Room.CollapsePlayersList'] || 'Fechar lista de jogadores'
            : `${localization['UI.Room.ExpandPlayersList'] || 'Abrir lista de jogadores'} (${playerCountLabel})`
        }
      >
        <span className="sidebar-toggle-icon" aria-hidden="true">{isOpen ? '▶' : '👥'}</span>
        <span className="sidebar-toggle-label">Jogadores</span>

        {!isOpen && connectedPlayers.length > 0 && (
          <span className="badge bg-info text-dark sidebar-toggle-badge">
            {connectedPlayers.length}
          </span>
        )}
      </button>

      {isOpen && <div className="sidebar-backdrop" onClick={toggleSidebar} />}

      <aside
        className={`bg-dark border-start border-light game-sidebar ${isOpen ? 'is-open' : ''}`}
        aria-label={localization['UI.Room.ConnectedPlayers'] || 'Jogadores Conectados'}
      >
        <header className="card-header border-bottom border-light p-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-0 fw-bold">
                👥 {localization['UI.Room.ConnectedPlayers'] || 'Jogadores Conectados'}
              </h6>
              <small className="text-muted">{playerCountLabel}</small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <ConnectionStatusIndicator localization={localization} />
              <button
                type="button"
                onClick={toggleSidebar}
                className="btn btn-outline-light btn-sm"
                style={{ width: '32px', height: '32px', padding: 0 }}
                aria-label="Fechar lista de jogadores"
              >
                ✕
              </button>
            </div>
          </div>
        </header>

        <div
          className="p-3 players-sidebar-scroll"
          style={{
            height: 'calc(100dvh - 76px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <div className="d-flex flex-column gap-3">
            {visiblePlayers.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <div className="mb-2" style={{ fontSize: '2.5rem', opacity: 0.5 }}>👥</div>
                <p className="mb-0">
                  {localization['UI.Room.NoPlayersConnected'] || 'Nenhum jogador conectado'}
                </p>
              </div>
            ) : (
              orderedPlayers.map((player) => (
                <div key={player.id} className="player-card-sidebar">
                  <PlayerDetailedStatus
                    player={player}
                    briefStats={player.user_id ? playersStatsMap[player.user_id] : null}
                    isCurrentPlayer={player.id === currentPlayer?.id}
                    localization={localization}
                    gameData={gameData}
                    canKick={isCurrentPlayerMaster}
                    onKickPlayer={onKickPlayer}
                    canEliminate={isCurrentPlayerMaster && matchStatus === 'in_progress'}
                    onEliminatePlayer={onEliminatePlayer}
                    isMaster={Boolean(room && player.id === room.master_player_id)}
                    matchStatus={matchStatus}
                    players={players}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default PlayersSidebar;