import React, { useState, useEffect, useRef } from 'react';
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
  onLeaveRoom,
  // Novos props para controle de estado
  initialView = 'lobby',
  initialSelectedActor = null,
  initialCharacterSelections = null,
  onViewChange,
  onActorChange,
  onSelectionsChange
}) => {
  const [players, setPlayers] = useState([]);
  const [currentView, setCurrentView] = useState('lobby');
  const [selectedActor, setSelectedActor] = useState(null);
  const [characterSelections, setCharacterSelections] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPlayersList, setShowPlayersList] = useState(true);
  const [showCharacterSelection, setShowCharacterSelection] = useState(true);
  const [showCharacterBuilder, setShowCharacterBuilder] = useState(true);
  const [showCharacterSheet, setShowCharacterSheet] = useState(true);
  
  // Usar useRef para controlar se já aplicou estado inicial
  const hasAppliedInitialState = useRef(false);

  // Aplicar valores iniciais apenas UMA vez
  useEffect(() => {
    if (!hasAppliedInitialState.current) {
      console.log('🔧 ROOMVIEW - VALORES RECEBIDOS:', {
        initialView,
        initialSelectedActor: initialSelectedActor?.name || 'null',
        initialCharacterSelections: !!initialCharacterSelections
      });
      
      if (initialView && initialView !== 'lobby') {
        console.log('🔧 APLICANDO VIEW:', initialView);
        setCurrentView(initialView);
      }
      
      if (initialSelectedActor) {
        console.log('🔧 APLICANDO ACTOR:', initialSelectedActor.name);
        setSelectedActor(initialSelectedActor);
      }
      
      if (initialCharacterSelections) {
        console.log('🔧 APLICANDO SELECTIONS');
        setCharacterSelections(initialCharacterSelections);
      }
      
      hasAppliedInitialState.current = true;
      console.log('🔧 ESTADO FINAL ROOMVIEW:', {
        currentView: initialView || 'lobby',
        selectedActor: initialSelectedActor?.name || 'null',
        hasSelections: !!initialCharacterSelections
      });
    }
  }, [initialView, initialSelectedActor, initialCharacterSelections]);

  // Gerenciar status automaticamente
  usePlayerStatus(currentPlayer?.id, currentView, selectedActor, characterSelections, localization);

  // Função para atualizar jogadores manualmente removida (refreshPlayers)

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
    console.log('🎭 Personagem selecionado no RoomView:', actor.name);
    setSelectedActor(actor);
    setCurrentView('builder');
    
    // Notificar App.js sobre mudanças
    if (onActorChange) onActorChange(actor);
    if (onViewChange) onViewChange('builder');
  };

  const handleCharacterCreate = async (selections) => {
    console.log('🎯 Personagem criado no RoomView');
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
    
    // Notificar App.js sobre mudanças
    if (onSelectionsChange) onSelectionsChange(selections);
    if (onViewChange) onViewChange('sheet');
    
    // Scroll para o topo da página quando a ficha for criada
    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }, 100); // Pequeno delay para garantir que a ficha foi renderizada
  };

  const handleBackToLobby = async () => {
    console.log('🔄 VOLTANDO PARA LOBBY - limpando estados');
    
    // Limpar estados locais do RoomView
    setCurrentView('lobby');
    setSelectedActor(null);
    setCharacterSelections(null);
    
    // IMPORTANTE: Notificar App.js sobre as mudanças para limpar o estado persistido
    if (onViewChange) onViewChange('lobby');
    if (onActorChange) onActorChange(null);
    if (onSelectionsChange) onSelectionsChange(null);
    
    console.log('✅ Estados limpos e App.js notificado');
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

  const toggleCharacterSelection = () => {
    setShowCharacterSelection(!showCharacterSelection);
  };

  const toggleCharacterBuilder = () => {
    setShowCharacterBuilder(!showCharacterBuilder);
  };

  const toggleCharacterSheet = () => {
    setShowCharacterSheet(!showCharacterSheet);
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
            title={showPlayersList ? (localization['UI.Room.CollapseList'] || "Minimizar lista") : (localization['UI.Room.ExpandList'] || "Expandir lista")}
          >
            {showPlayersList ? '▼' : '▲'}
          </button>
        </div>
      </div>
      <div className="card-body py-2" style={{ display: showPlayersList ? 'block' : 'none' }}>
        <div className="row g-2">
          {players.map((player) => (
            <div key={player.id} className="col-md-6 col-lg-4">
              <PlayerDetailedStatus 
                player={player} 
                isCurrentPlayer={player.id === currentPlayer.id}
                localization={localization}
                gameData={gameData}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{localization['UI.Loading'] || 'UI.Loading'}</span>
          </div>
          <p className="mt-2 text-light">{localization['UI.Loading.Room'] || 'UI.Loading.Room'}</p>
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
                {localization['UI.Room.Master'] || 'UI.Room.Master'} {room.master_name} | {localization['UI.Room.Players'] || 'UI.Room.Players'} {players.length}
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
              {/* Botão de atualizar removido */}
              <button 
                className="btn btn-outline-danger btn-sm"
                onClick={handleLeaveRoom}
              >
                {localization['UI.Room.LeaveRoom'] || 'UI.Room.LeaveRoom'}
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
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="text-white mb-0">{localization['UI.Room.ConnectedPlayers'] || 'UI.Room.ConnectedPlayers'} ({players.length})</h5>
                  <div className="d-flex align-items-center gap-2">
                    <ConnectionStatusIndicator />
                    <button 
                      className="btn btn-outline-light btn-sm"
                      onClick={togglePlayersList}
                      title={showPlayersList ? (localization['UI.Room.CollapseList'] || "Minimizar lista") : (localization['UI.Room.ExpandList'] || "Expandir lista")}
                    >
                      {showPlayersList ? '▼' : '▲'}
                    </button>
                  </div>
                </div>
                <div className="card-body" style={{ display: showPlayersList ? 'block' : 'none' }}>
                  <div className="row">
                    {players.map((player) => (
                      <div key={player.id} className="col-md-6 col-lg-4 mb-3">
                        <PlayerDetailedStatus 
                          player={player} 
                          isCurrentPlayer={player.id === currentPlayer.id}
                          localization={localization}
                          gameData={gameData}
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
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="text-white mb-0">{localization['UI.Room.CreateYourCharacter'] || 'UI.Room.CreateYourCharacter'}</h5>
                  <button 
                    className="btn btn-outline-light btn-sm"
                    onClick={toggleCharacterSelection}
                    title={showCharacterSelection ? (localization['UI.Room.CollapseSelection'] || "Minimizar seleção") : (localization['UI.Room.ExpandSelection'] || "Expandir seleção")}
                  >
                    {showCharacterSelection ? '▼' : '▲'}
                  </button>
                </div>
                <div className="card-body" style={{ display: showCharacterSelection ? 'block' : 'none' }}>
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
          <div className="card bg-dark border-light mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="text-white mb-0">{localization['UI.CharacterBuilder.CreateCharacter'] || 'Criar Personagem'}</h5>
              <button 
                className="btn btn-outline-light btn-sm"
                onClick={toggleCharacterBuilder}
                title={showCharacterBuilder ? (localization['UI.Room.CollapseBuilder'] || "Minimizar construtor") : (localization['UI.Room.ExpandBuilder'] || "Expandir construtor")}
              >
                {showCharacterBuilder ? '▼' : '▲'}
              </button>
            </div>
            <div className="card-body" style={{ display: showCharacterBuilder ? 'block' : 'none' }}>
              <CharacterBuilder
                actor={selectedActor}
                gameData={gameData}
                localization={localization}
                onCharacterCreate={handleCharacterCreate}
                onBack={handleBackToLobby}
              />
            </div>
          </div>
        </>
      )}

      {currentView === 'sheet' && (
        <>
          {renderPlayersListCompact()}
          <div className="card bg-dark border-light mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="text-white mb-0">{localization['UI.CharacterSheet.Title'] || 'Ficha do Personagem'}</h5>
              <button 
                className="btn btn-outline-light btn-sm"
                onClick={toggleCharacterSheet}
                title={showCharacterSheet ? (localization['UI.Room.CollapseSheet'] || "Minimizar ficha") : (localization['UI.Room.ExpandSheet'] || "Expandir ficha")}
              >
                {showCharacterSheet ? '▼' : '▲'}
              </button>
            </div>
            <div className="card-body" style={{ display: showCharacterSheet ? 'block' : 'none' }}>
              <CharacterSheet
                actor={selectedActor}
                selections={characterSelections}
                gameData={gameData}
                localization={localization}
                onReset={handleBackToLobby}
                currentPlayer={currentPlayer}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RoomView;
