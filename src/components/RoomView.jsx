import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoomService } from '../services/roomService';
import CharacterSelection from './CharacterSelection';
import CharacterBuilder from './CharacterBuilder';
import CharacterSheet from './CharacterSheet';
import PlayersSidebar from './PlayersSidebar';
import TableCards from './TableCards';
import CombatPanel from './CombatPanel';
import MatchBar from './MatchBar';
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
  const [showCharacterSelection, setShowCharacterSelection] = useState(true);
  const [showCharacterBuilder, setShowCharacterBuilder] = useState(true);
  const [showCharacterSheet, setShowCharacterSheet] = useState(true);
  
  // Controle centralizado das sidebars - apenas uma aberta por vez
  const [openSidebar, setOpenSidebar] = useState(null); // 'players', 'table', 'combat' ou null
  
  // Estado da partida (match)
  const [matchStatus, setMatchStatus] = useState(null); // null = sem partida, 'in_progress' = partida ativa
  const [roomData, setRoomData] = useState(room); // Room data atualizada via subscription
  
  // Usar useRef para controlar se já aplicou estado inicial
  const hasAppliedInitialState = useRef(false);
  
  // Funções de toggle das sidebars com useCallback para estabilidade
  const handleTogglePlayers = useCallback(() => {
    setOpenSidebar(prev => prev === 'players' ? null : 'players');
  }, []);
  
  const handleToggleTable = useCallback(() => {
    setOpenSidebar(prev => prev === 'table' ? null : 'table');
  }, []);
  
  const handleToggleCombat = useCallback(() => {
    setOpenSidebar(prev => prev === 'combat' ? null : 'combat');
  }, []);

  // Aplicar valores iniciais apenas UMA vez
  useEffect(() => {
    if (!hasAppliedInitialState.current) {
      if (initialView && initialView !== 'lobby') {
        setCurrentView(initialView);
      }
      
      if (initialSelectedActor) {
        setSelectedActor(initialSelectedActor);
      }
      
      if (initialCharacterSelections) {
        setCharacterSelections(initialCharacterSelections);
      }
      
      hasAppliedInitialState.current = true;
    }
  }, [initialView, initialSelectedActor, initialCharacterSelections]);

  // Gerenciar status automaticamente
  usePlayerStatus(currentPlayer?.id, currentView, selectedActor, characterSelections, localization);

  // Função para atualizar jogadores manualmente removida (refreshPlayers)

  useEffect(() => {
    let isMounted = true;
    let lastUpdateTime = Date.now();
    
    const loadPlayersData = async (forceRefresh = false) => {
      try {
        // Se forceRefresh, aguardar um pouco para garantir que o banco atualizou
        if (forceRefresh) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const result = await RoomService.getRoomPlayers(room.id);
        if (result.success && isMounted) {
          setPlayers(result.players);
          lastUpdateTime = Date.now();

          // Se o jogador atual não estiver mais na lista, foi expulso
          // Sair imediatamente da sala sem mostrar alert
          if (currentPlayer && !result.players.find(p => p.id === currentPlayer.id)) {
            if (onLeaveRoom) onLeaveRoom();
          }
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
      // Evitar múltiplas atualizações muito próximas (debounce de 200ms)
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      if (timeSinceLastUpdate < 200) {
        setTimeout(() => loadPlayersData(true), 200);
      } else {
        // Recarregar dados imediatamente com flag de forceRefresh
        loadPlayersData(true);
      }
    };

    const sub = RoomService.subscribeToRoom(room.id, handlePlayersChange);
    setSubscription(sub);

    // Verificar periodicamente se a subscription está ativa (a cada 30 segundos)
    const connectionCheckInterval = setInterval(() => {
      if (sub && !RoomService.checkAndReconnectSubscription(sub)) {
        loadPlayersData(true);
      }
    }, 30000); // 30 segundos

    // Listener para quando a página fica visível novamente
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadPlayersData(true);
        
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [room.id, currentPlayer, onLeaveRoom]);

  // Subscription para mudanças no status da sala (match_status)
  useEffect(() => {
    // Carregar match_status inicial
    setMatchStatus(room.match_status || null);

    const roomSub = RoomService.subscribeToRoomStatus(room.id, (updatedRoom) => {
      setMatchStatus(updatedRoom.match_status || null);
      setRoomData(prev => ({ ...prev, ...updatedRoom }));
    });

    return () => {
      if (roomSub) {
        RoomService.unsubscribeFromRoom(roomSub);
      }
    };
  }, [room.id, room.match_status]);

  // Dados do jogador atual derivados dos players
  const currentPlayerData = players.find(p => p.id === currentPlayer?.id);
  const isAlive = currentPlayerData?.is_alive !== false;

  const handleCharacterSelect = async (actor) => {
    setSelectedActor(actor);
    setCurrentView('builder');
    
    // Notificar App.js sobre mudanças
    if (onActorChange) onActorChange(actor);
    if (onViewChange) onViewChange('builder');
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
    // Bloquear se partida ativa e jogador está vivo
    if (matchStatus === 'in_progress' && isAlive) {
      alert('Você precisa se declarar eliminado antes de trocar de personagem!');
      return;
    }
    
    // Limpar TODOS os dados do personagem no banco de dados
    if (currentPlayer?.id) {
      
      // Limpar cartas expostas
      await RoomService.updatePlayerExposedCards(currentPlayer.id, []);
      
      // Limpar contadores (resetar para valores padrão)
      const resetCounters = {
        vida: 20,
        vida_max: 20,
        esquiva: 0,
        esquiva_max: 0,
        oport: 0,
        oport_max: 0,
        item: 0,
        item_max: 0,
        mortes: currentPlayerData?.counters?.mortes || 0
      };
      await RoomService.updatePlayerCounters(currentPlayer.id, resetCounters);
      
      // Limpar itens usados
      await RoomService.updatePlayerUsedItems(currentPlayer.id, []);
      
      // Limpar itens desbloqueados
      await RoomService.updatePlayerUnlockedItems(currentPlayer.id, []);
      
      // Limpar contadores adicionais
      await RoomService.updatePlayerAdditionalCounters(currentPlayer.id, {});
      
      // Limpar seleções (inclui copycatAssignments do Copiador)
      await RoomService.updatePlayerSelections(currentPlayer.id, {});
      
      // Limpar personagem
      await RoomService.updatePlayerCharacter(currentPlayer.id, null, null);
      
      // Atualizar status para 'selecting'
      await RoomService.updatePlayerStatus(currentPlayer.id, 'selecting', null);
      
      
    }
    
    // Limpar estados locais do RoomView
    setCurrentView('lobby');
    setSelectedActor(null);
    setCharacterSelections(null);
    
    // IMPORTANTE: Notificar App.js sobre as mudanças para limpar o estado persistido
    if (onViewChange) onViewChange('lobby');
    if (onActorChange) onActorChange(null);
    if (onSelectionsChange) onSelectionsChange(null);
    
    
  };

  // Quando o jogador trocar de personagem (voltar ao lobby e escolher outro), limpar completamente o histórico ever_exposed_cards
  const prevSelectedActorRef = useRef(selectedActor);
  useEffect(() => {
    // Só executar quando selectedActor mudar para null (saiu do personagem)
    if (prevSelectedActorRef.current && !selectedActor && currentPlayer?.id && currentView === 'lobby') {
      const clearHistory = async () => {
        try {
          const playerResult = await RoomService.getPlayer(currentPlayer.id);
          if (playerResult.success && playerResult.player) {
            const appState = playerResult.player.app_state || {};
            if (appState.ever_exposed_cards && Object.keys(appState.ever_exposed_cards).length) {
              await RoomService.updatePlayerAppState(currentPlayer.id, { ...appState, ever_exposed_cards: {} });
            }
          }
        } catch (e) {
          console.error('Erro ao limpar histórico de exposição ao trocar de personagem:', e);
        }
      };
      clearHistory();
    }
    prevSelectedActorRef.current = selectedActor;
  }, [selectedActor, currentView, currentPlayer?.id]);

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

  const handleKickPlayer = async (playerToKick) => {
    const confirmMessage = localization['UI.Room.ConfirmKick'] || 
      `Tem certeza que deseja expulsar ${playerToKick.name} da sala?`;
    
    const confirmKick = window.confirm(confirmMessage);
    
    if (!confirmKick) return;

    try {
      const result = await RoomService.kickPlayer(room.id, playerToKick.id, currentPlayer.id);
      
      if (result.success) {
        const successMessage = localization['UI.Room.PlayerKicked'] || 
          `${playerToKick.name} foi expulso da sala.`;
        alert(successMessage);
        // Os dados serão atualizados automaticamente via subscription
      } else {
        const errorMessage = localization['UI.Room.KickError'] || 
          `Erro ao expulsar jogador: ${result.error}`;
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Erro ao expulsar jogador:', error);
      const unexpectedError = localization['UI.Room.UnexpectedKickError'] || 
        'Erro inesperado ao expulsar jogador.';
      alert(unexpectedError);
    }
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

      {/* Barra de Partida */}
      <MatchBar
        matchStatus={matchStatus}
        players={players}
        currentPlayer={currentPlayer}
        isAlive={isAlive}
        roomId={room.id}
        room={roomData}
        currentUser={currentPlayer?.user_id || null}
        localization={localization}
        onMatchEnd={() => setMatchStatus(null)}
      />

      {currentView === 'lobby' && (
        <>
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
                matchStatus={matchStatus}
              />
            </div>
          </div>
        </>
      )}

      {currentView === 'sheet' && (
        <>
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
                players={players}
                matchStatus={matchStatus}
                isAlive={isAlive}
              />
            </div>
          </div>
        </>
      )}

      {/* Sidebar de jogadores - sempre visível */}
      <PlayersSidebar 
        players={players}
        currentPlayer={currentPlayer}
        localization={localization}
        gameData={gameData}
        room={room}
        onKickPlayer={handleKickPlayer}
        isOpen={openSidebar === 'players'}
        onToggle={handleTogglePlayers}
        matchStatus={matchStatus}
      />

      {/* Cartas na mesa - sempre visível */}
      <TableCards 
        players={players}
        gameData={gameData}
        localization={localization}
        isOpen={openSidebar === 'table'}
        onToggle={handleToggleTable}
      />

      {/* Painel Lateral de Combate - integra todo sistema de combate */}
      <CombatPanel
        currentPlayer={currentPlayer}
        currentPlayerData={players.find(p => p.id === currentPlayer?.id)}
        players={players}
        roomId={room.id}
        gameData={gameData}
        localization={localization}
        isOpen={openSidebar === 'combat'}
        onToggle={handleToggleCombat}
      />
    </div>
  );
};

export default RoomView;
