import React, { useState, useEffect } from 'react';
import { RoomService } from '../services/roomService';
import CharacterSelection from './CharacterSelection';
import CharacterBuilder from './CharacterBuilder';
import CharacterSheet from './CharacterSheet';
import PlayerDetailedStatus from './PlayerDetailedStatus';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';
import { usePlayerStatus } from '../hooks/usePlayerStatus';

const RoomView = ({ 
  room, 
  currentPlayer, 
  gameData, 
  localization, 
  onLeaveRoom 
}) => {
  const [players, setPlayers] = useState([]);
  const [currentView, setCurrentView] = useState('lobby');
  const [selectedActor, setSelectedActor] = useState(null);
  const [characterSelections, setCharacterSelections] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPlayersList, setShowPlayersList] = useState(true);

  // Gerenciar status automaticamente
  usePlayerStatus(currentPlayer?.id, currentView, selectedActor, characterSelections, localization);

  // Função para atualizar jogadores manualmente
  const refreshPlayers = async () => {
    console.log('🔄 Atualizando lista de jogadores manualmente...');
    setLoading(true);
    
    try {
      const { success, players: updatedPlayers } = await RoomService.getPlayersInRoom(room.id);
      if (success) {
        setPlayers(updatedPlayers);
        console.log('✅ Lista de jogadores atualizada');
      } else {
        console.error('❌ Falha ao atualizar jogadores');
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar jogadores:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const loadPlayersData = async () => {
      try {
        const result = await RoomService.getRoomPlayers(room.id);
        if (result.success && isMounted) {
          setPlayers(result.players);
          console.log('Jogadores carregados:', result.players);
        }
      } catch (error) {
        console.error('Erro ao carregar jogadores:', error);
      }
      if (isMounted) {
        setLoading(false);
      }
    };

    // Carregar dados iniciais
    loadPlayersData();
    
    // Configurar subscription para mudanças em tempo real com monitoramento
    const handlePlayersChange = (payload) => {
      console.log('Evento recebido:', payload);
      // Recarregar dados sempre que houver mudança
      loadPlayersData();
    };

    const sub = RoomService.subscribeToRoom(room.id, handlePlayersChange);
    setSubscription(sub);

    // Verificar periodicamente se a subscription está ativa
    const connectionCheckInterval = setInterval(() => {
      if (sub && !RoomService.checkAndReconnectSubscription(sub)) {
        // Se a subscription está inativa, tentar recarregar dados manualmente
        console.log('🔄 Verificando dados da sala devido à subscription inativa...');
        loadPlayersData();
      }
    }, 60000); // Verificar a cada minuto

    // Limpeza automática de dados antigos a cada 10 minutos
    const cleanupInterval = setInterval(async () => {
      console.log('🧹 Executando limpeza automática...');
      try {
        const result = await RoomService.cleanupOldData();
        if (result.success) {
          console.log('✅ Limpeza automática concluída');
        }
      } catch (error) {
        console.error('❌ Erro na limpeza automática:', error);
      }
    }, 10 * 60 * 1000); // 10 minutos

    // Listener para quando a página fica visível novamente
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👁️ Página visível novamente, verificando dados...');
        loadPlayersData();
        
        // Verificar se a subscription precisa ser reconectada
        if (sub) {
          RoomService.checkAndReconnectSubscription(sub);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      isMounted = false;
      if (sub) {
        RoomService.unsubscribeFromRoom(sub);
      }
      clearInterval(connectionCheckInterval);
      clearInterval(cleanupInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [room.id]);

  const handleCharacterSelect = async (actor) => {
    setSelectedActor(actor);
    setCurrentView('builder');
  };

  const handleCharacterCreate = async (selections) => {
    setCharacterSelections(selections);
    
    // Salvar personagem na sala
    const characterData = {
      actor: selectedActor,
      selections: selections
    };
    
    // Obter nome do personagem das localizações
    const characterName = localization[`Character.Name.${selectedActor.ID}`] || selectedActor.ID;
    
    const result = await RoomService.updatePlayerCharacter(
      currentPlayer.id, 
      characterData, 
      characterName
    );
    
    if (result.success) {
      console.log('Personagem atualizado com sucesso');
    }
    
    setCurrentView('sheet');
    
    // Scroll para o topo da página quando a ficha for criada
    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }, 100); // Pequeno delay para garantir que a ficha foi renderizada
  };

  const handleBackToLobby = async () => {
    setCurrentView('lobby');
    setSelectedActor(null);
    setCharacterSelections(null);
  };

  const handleLeaveRoom = async () => {
    await RoomService.leaveRoom(currentPlayer.id);
    if (subscription) {
      RoomService.unsubscribeFromRoom(subscription);
    }
    onLeaveRoom();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.id);
    alert('ID da sala copiado para a área de transferência!');
  };

  const togglePlayersList = () => {
    setShowPlayersList(!showPlayersList);
  };

  const renderPlayersListCompact = () => (
    <div className="card bg-dark border-light mb-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h6 className="text-white mb-0">
          Jogadores ({players.length})
        </h6>
        <div className="d-flex align-items-center gap-2">
          <ConnectionStatusIndicator />
          <button 
            className="btn btn-outline-light btn-sm"
            onClick={togglePlayersList}
            title={showPlayersList ? "Minimizar lista" : "Expandir lista"}
          >
            {showPlayersList ? '▼' : '▲'}
          </button>
        </div>
      </div>
      {showPlayersList && (
        <div className="card-body py-2">
          <div className="row g-2">
            {players.map((player) => (
              <div key={player.id} className="col-md-6 col-lg-4">
                <PlayerDetailedStatus 
                  player={player} 
                  isCurrentPlayer={player.id === currentPlayer.id}
                  localization={localization}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
          <p className="mt-2 text-light">Carregando sala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Header da Sala */}
      <div className="row bg-dark border-bottom border-light mb-3">
        <div className="col-12 py-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="text-white mb-1">{room.name}</h4>
              <span className="text-muted">
                Mestre: {room.master_name} | Jogadores: {players.length}
              </span>
            </div>
            <div>
              <button 
                className="btn btn-outline-light btn-sm me-2"
                onClick={copyRoomId}
                title="Copiar ID da sala"
              >
                📋 {room.id}
              </button>
              <button 
                className="btn btn-outline-info btn-sm me-2"
                onClick={refreshPlayers}
                title="Atualizar lista de jogadores"
              >
                🔄
              </button>
              <button 
                className="btn btn-outline-danger btn-sm"
                onClick={handleLeaveRoom}
              >
                Sair da Sala
              </button>
            </div>
          </div>
        </div>
      </div>

      {currentView === 'lobby' && (
        <>
          {/* Lista de Jogadores */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card bg-dark border-light">
                <div className="card-header">
                  <h5 className="text-white mb-0">Jogadores Conectados</h5>
                </div>
                <div className="card-body">
                  <div className="row">
                    {players.map((player) => (
                      <div key={player.id} className="col-md-6 col-lg-4 mb-3">
                        <PlayerDetailedStatus 
                          player={player} 
                          isCurrentPlayer={player.id === currentPlayer.id}
                          localization={localization}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Criar Personagem */}
          <div className="row">
            <div className="col-12">
              <div className="card bg-dark border-light">
                <div className="card-header">
                  <h5 className="text-white mb-0">Criar Seu Personagem</h5>
                </div>
                <div className="card-body">
                  <CharacterSelection 
                    gameData={gameData}
                    localization={localization}
                    onCharacterSelect={handleCharacterSelect}
                    players={players}
                    currentPlayerId={currentPlayer.id}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {currentView === 'builder' && (
        <>
          {renderPlayersListCompact()}
          <CharacterBuilder
            actor={selectedActor}
            gameData={gameData}
            localization={localization}
            onCharacterCreate={handleCharacterCreate}
            onBack={handleBackToLobby}
          />
        </>
      )}

      {currentView === 'sheet' && (
        <>
          {renderPlayersListCompact()}
          <CharacterSheet
            actor={selectedActor}
            selections={characterSelections}
            gameData={gameData}
            localization={localization}
            onReset={handleBackToLobby}
            currentPlayer={currentPlayer}
          />
        </>
      )}
    </div>
  );
};

export default RoomView;
