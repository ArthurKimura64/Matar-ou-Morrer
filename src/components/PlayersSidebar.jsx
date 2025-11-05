import React, { useState } from 'react';
import PlayerDetailedStatus from './PlayerDetailedStatus';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';

const PlayersSidebar = ({ 
  players = [], 
  currentPlayer, 
  localization = {}, 
  gameData,
  room = null,
  onKickPlayer = null
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // Verificar se o jogador atual é o mestre da sala
  const isCurrentPlayerMaster = room && currentPlayer && room.master_player_id === currentPlayer.id;

  return (
    <>
      {/* Botão de toggle fixo na lateral direita */}
      <button
        onClick={toggleSidebar}
        className="btn btn-dark position-fixed d-flex align-items-center justify-content-center sidebar-toggle-btn border border-light"
        style={{
          right: isOpen ? '320px' : '0px',
          top: 'calc(50% + 60px)',
          transform: 'translateY(-50%)',
          zIndex: 1055,
          width: '40px',
          height: '80px',
          borderRadius: '8px 0 0 8px',
          transition: 'all 0.3s ease-in-out',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}
        title={isOpen ? 
          (localization['UI.Room.CollapsePlayersList'] || "Fechar lista de jogadores") : 
          `${localization['UI.Room.ExpandPlayersList'] || "Abrir lista de jogadores"} (${players.length} ${players.length === 1 ? 'jogador' : 'jogadores'})`
        }
      >
        {/* Ícone centralizado */}
        <span style={{ 
          fontSize: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%'
        }}>
          {isOpen ? '▶' : '👥'}
        </span>
      </button>

      {/* Overlay escuro quando a sidebar está aberta */}
      {isOpen && (
        <div
          className="position-fixed"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1050
          }}
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className="position-fixed bg-dark border-start border-light d-none d-md-block"
        style={{
          top: 0,
          right: isOpen ? '0' : '-320px',
          width: '320px',
          height: '100vh',
          transition: 'right 0.3s ease-in-out',
          zIndex: 1051,
          boxShadow: isOpen ? '-4px 0 12px rgba(0, 0, 0, 0.3)' : 'none'
        }}
      >
        {/* Header da sidebar */}
        <div className="bg-secondary border-bottom border-light p-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-1 fw-bold">
                {localization['UI.Room.ConnectedPlayers'] || 'Jogadores Conectados'}
              </h6>
              <small className="text-light">
                {players.length} {players.length === 1 ? 'jogador' : 'jogadores'}
              </small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <ConnectionStatusIndicator />
              <button
                onClick={toggleSidebar}
                className="btn btn-outline-light btn-sm"
                style={{ width: '32px', height: '32px' }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Lista de jogadores com scroll */}
        <div
          className="p-3 players-sidebar-scroll"
          style={{
            height: 'calc(100vh - 80px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <div className="d-flex flex-column gap-3">
            {players.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-muted">
                  <div className="mb-2" style={{ fontSize: '3rem', opacity: 0.5 }}>
                    👥
                  </div>
                  <p>{localization['UI.Room.NoPlayersConnected'] || 'Nenhum jogador conectado'}</p>
                </div>
              </div>
            ) : (
              players.map((player) => (
                <div key={player.id} className="player-card-sidebar">
                  <PlayerDetailedStatus 
                    player={player} 
                    isCurrentPlayer={player.id === currentPlayer?.id}
                    localization={localization}
                    gameData={gameData}
                    canKick={isCurrentPlayerMaster}
                    onKickPlayer={onKickPlayer}
                    isMaster={room && player.id === room.master_player_id}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Mobile - Fullscreen */}
      <div
        className="position-fixed bg-dark d-block d-md-none"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease-in-out',
          zIndex: 1051
        }}
      >
        {/* Header da sidebar mobile */}
        <div className="bg-secondary border-bottom border-light p-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="text-white mb-1 fw-bold">
                {localization['UI.Room.ConnectedPlayers'] || 'Jogadores Conectados'}
              </h6>
              <small className="text-light">
                {players.length} {players.length === 1 ? 'jogador' : 'jogadores'}
              </small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <ConnectionStatusIndicator />
              <button
                onClick={toggleSidebar}
                className="btn btn-outline-light btn-sm"
                style={{ width: '32px', height: '32px' }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Lista de jogadores mobile */}
        <div
          className="p-3"
          style={{
            height: 'calc(100vh - 80px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <div className="d-flex flex-column gap-3">
            {players.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-muted">
                  <div className="mb-2" style={{ fontSize: '3rem', opacity: 0.5 }}>
                    👥
                  </div>
                  <p>{localization['UI.Room.NoPlayersConnected'] || 'Nenhum jogador conectado'}</p>
                </div>
              </div>
            ) : (
              players.map((player) => (
                <div key={player.id} className="player-card-sidebar">
                  <PlayerDetailedStatus 
                    player={player} 
                    isCurrentPlayer={player.id === currentPlayer?.id}
                    localization={localization}
                    gameData={gameData}
                    canKick={isCurrentPlayerMaster}
                    onKickPlayer={onKickPlayer}
                    isMaster={room && player.id === room.master_player_id}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default PlayersSidebar;
