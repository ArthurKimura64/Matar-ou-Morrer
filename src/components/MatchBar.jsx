import React, { useState } from 'react';
import { RoomService } from '../services/roomService';

const MatchBar = ({ matchStatus, players, currentPlayer, isAlive, roomId, room, currentUser, localization, onMatchEnd, onMatchStart }) => {
  const [showEliminationModal, setShowEliminationModal] = useState(false);
  const [selectedKiller, setSelectedKiller] = useState(null);
  const [loading, setLoading] = useState(false);

  // Jogadores conectados e prontos
  const connectedReadyPlayers = players.filter(p => p.is_connected && p.status === 'ready');
  const allPlayersReady = connectedReadyPlayers.length >= 2 && 
    players.filter(p => p.is_connected).every(p => p.status === 'ready');

  // Jogadores vivos durante partida
  const alivePlayers = players.filter(p => p.is_connected && p.is_alive !== false);
  const isLastAlive = matchStatus === 'in_progress' && alivePlayers.length === 1 && alivePlayers[0]?.id === currentPlayer?.id;

  // Jogadores que podem ser selecionados como killer (vivos, exceto o próprio)
  const possibleKillers = players.filter(p => 
    p.id !== currentPlayer?.id && 
    p.is_connected && 
    p.is_alive !== false
  );

  const handleStartMatch = async () => {
    setLoading(true);
    try {
      const result = await RoomService.startMatch(roomId);
      if (result.success) {
        if (onMatchStart) onMatchStart();
      } else {
        alert((localization?.['UI.Error.StartMatch'] || 'Erro ao iniciar partida: ') + (result.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('Erro ao iniciar partida:', err);
      alert((localization?.['UI.Error.StartMatch'] || 'Erro ao iniciar partida: ') + (err.message || 'Erro de conexão'));
    }
    setLoading(false);
  };

  const handleDeclareElimination = async () => {
    setLoading(true);
    try {
      const result = await RoomService.declareElimination(currentPlayer.id, selectedKiller);
      if (result.success) {
        setShowEliminationModal(false);
        setSelectedKiller(null);
      } else {
        alert((localization?.['UI.Error.DeclareElimination'] || 'Erro ao declarar eliminação: ') + (result.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('Erro ao declarar eliminação:', err);
      alert((localization?.['UI.Error.DeclareElimination'] || 'Erro ao declarar eliminação: ') + (err.message || 'Erro de conexão'));
    }
    setLoading(false);
  };

  const handleDeclareVictory = async () => {
    if (!window.confirm(localization?.['UI.Match.ConfirmVictory'] || 'Você tem certeza que deseja declarar vitória e encerrar a partida?')) return;
    setLoading(true);
    try {
      // end_match RPC registra stats + reseta match atomicamente no servidor
      const result = await RoomService.declareVictory(roomId);
      if (result.success) {
        if (onMatchEnd) onMatchEnd();
      } else {
        alert((localization?.['UI.Error.EndMatch'] || 'Erro ao encerrar partida: ') + (result.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('Erro ao declarar vitória:', err);
      alert((localization?.['UI.Error.EndMatch'] || 'Erro ao encerrar partida: ') + (err.message || 'Erro de conexão'));
    }
    setLoading(false);
  };

  // Não renderizar se jogador não tem personagem pronto
  const currentPlayerData = players.find(p => p.id === currentPlayer?.id);
  if (!currentPlayerData || currentPlayerData.status !== 'ready') {
    // Mostrar barra informativa se partida estiver ativa
    if (matchStatus === 'in_progress') {
      return (
        <div className="row mb-3">
          <div className="col-12">
            <div className="alert alert-warning d-flex align-items-center justify-content-center mb-0 py-2" 
                 style={{ borderRadius: '8px' }}>
              <span className="me-2">⚔️</span>
              <strong>{localization?.['UI.Match.InProgress'] || 'Partida em andamento'}</strong>
              <span className="ms-2">— {localization?.['UI.Match.PrepareNextMatch'] || 'Monte seu personagem para a próxima partida'}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // Sem partida ativa — mostrar botão de iniciar
  if (!matchStatus) {
    return (
      <div className="row mb-3">
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-center gap-3 py-2 px-3 bg-dark border border-light" 
               style={{ borderRadius: '8px' }}>
            <span style={{ fontSize: '14px', color: '#adb5bd' }}>
              {allPlayersReady 
                ? `✅ ${localization?.['UI.Match.AllReady'] || 'Todos prontos'} (${connectedReadyPlayers.length} ${connectedReadyPlayers.length === 1 ? (localization?.['UI.Common.PlayerSingular'] || 'jogador') : (localization?.['UI.Common.PlayerPlural'] || 'jogadores')})` 
                : `⏳ ${localization?.['UI.Match.WaitingPlayers'] || 'Aguardando jogadores ficarem prontos'} (${connectedReadyPlayers.length}/${players.filter(p => p.is_connected).length})`
              }
            </span>
            <button
              className="btn btn-success btn-sm fw-bold"
              onClick={handleStartMatch}
              disabled={!allPlayersReady || loading}
            >
              {loading ? (
                <><span className="spinner-border spinner-border-sm me-1" /> {localization?.['UI.Match.Starting'] || 'Iniciando...'}</>
              ) : (
                <>{localization?.['UI.Match.StartMatch'] || '🏁 Iniciar Partida'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Partida ativa
  return (
    <>
      <div className="row mb-3">
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-center gap-3 py-2 px-3" 
               style={{ 
                 borderRadius: '8px', 
                 background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                 border: '2px solid #e74c3c',
                 boxShadow: '0 0 15px rgba(231, 76, 60, 0.3)'
               }}>
            <span style={{ fontSize: '14px' }}>
              ⚔️ <strong className="text-danger">{localization?.['UI.Match.InProgress'] || 'Partida em andamento'}</strong>
              <span className="text-muted ms-2">
                — {alivePlayers.length} {alivePlayers.length === 1 ? (localization?.['UI.Match.SurvivorSingular'] || 'sobrevivente') : (localization?.['UI.Match.SurvivorPlural'] || 'sobreviventes')}
              </span>
            </span>
            
            {isAlive && !isLastAlive && (
              <button
                className="btn btn-outline-danger btn-sm fw-bold"
                onClick={() => setShowEliminationModal(true)}
                disabled={loading}
              >
                {localization?.['UI.Match.DeclareEliminated'] || '☠️ Fui Eliminado'}
              </button>
            )}

            {isLastAlive && (
              <button
                className="btn btn-warning btn-sm fw-bold"
                onClick={handleDeclareVictory}
                disabled={loading}
                style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-1" /> {localization?.['UI.Match.Ending'] || 'Encerrando...'}</>
                ) : (
                  <>{localization?.['UI.Match.DeclareVictory'] || '🏆 Sou o Vencedor!'}</>
                )}
              </button>
            )}

            {!isAlive && (
              <span className="badge bg-secondary" style={{ fontSize: '13px' }}>
                {localization?.['UI.Match.EliminatedBadge'] || '💀 Eliminado'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Eliminação */}
      {showEliminationModal && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000 }}
            onClick={() => { setShowEliminationModal(false); setSelectedKiller(null); }}
          />
          <div
            className="position-fixed top-50 start-50 translate-middle bg-dark border border-danger rounded p-4"
            style={{ zIndex: 2001, maxWidth: '400px', width: '90%' }}
          >
            <h5 className="text-danger mb-3">
              <span className="me-2">☠️</span>
              {localization?.['UI.Match.DeclareEliminationTitle'] || 'Declarar Eliminação'}
            </h5>

            <p className="text-white mb-3" style={{ fontSize: '14px' }}>
              {localization?.['UI.Match.WhoKilledYou'] || 'Quem te eliminou?'} <small className="text-muted">{localization?.['UI.Common.Optional'] || '(opcional)'}</small>
            </p>

            <div className="d-flex flex-column gap-2 mb-3">
              {/* Opção: Ninguém */}
              <div
                className={`card border ${selectedKiller === null ? 'border-danger bg-danger bg-opacity-25' : 'border-secondary'} cursor-pointer`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedKiller(null)}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-white small">{localization?.['UI.Match.NoKiller'] || '🚫 Ninguém / Não sei'}</span>
                    {selectedKiller === null && <span className="text-danger">✓</span>}
                  </div>
                </div>
              </div>

              {/* Lista de jogadores vivos */}
              {possibleKillers.map(player => (
                <div
                  key={player.id}
                  className={`card border ${selectedKiller === player.id ? 'border-danger bg-danger bg-opacity-25' : 'border-secondary'} cursor-pointer`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedKiller(player.id)}
                >
                  <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span className="text-white small">{player.name}</span>
                        {player.character_name && (
                          <small className="text-muted ms-2">({player.character_name})</small>
                        )}
                      </div>
                      {selectedKiller === player.id && <span className="text-danger">✓</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="d-flex gap-2">
              <button
                className="btn btn-secondary flex-fill"
                onClick={() => { setShowEliminationModal(false); setSelectedKiller(null); }}
              >
                {localization?.['UI.Common.Cancel'] || 'Cancelar'}
              </button>
              <button
                className="btn btn-danger flex-fill fw-bold"
                onClick={handleDeclareElimination}
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-1" /> {localization?.['UI.Match.Confirming'] || 'Confirmando...'}</>
                ) : (
                  <>{localization?.['UI.Match.ConfirmElimination'] || '☠️ Confirmar Eliminação'}</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </>
  );
};

export default MatchBar;
