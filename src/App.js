import React, { useState, useEffect, useCallback } from 'react';
import CharacterSelection from './components/CharacterSelection';
import CharacterBuilder from './components/CharacterBuilder';
import CharacterSheet from './components/CharacterSheet';
import RoomLobby from './components/RoomLobby';
import RoomView from './components/RoomView';
import AdminPanel from './components/AdminPanel';
import { RoomService } from './services/roomService';
import { PlayerPersistence } from './utils/playerPersistence';
import './App.css';

function App() {
  const [gameData, setGameData] = useState(null);
  const [localization, setLocalization] = useState(null);
  const [currentView, setCurrentView] = useState('menu');
  const [selectedActor, setSelectedActor] = useState(null);
  const [characterSelections, setCharacterSelections] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [loading, setLoading] = useState(false);
  // Estado para controlar a view interna do RoomView
  const [roomInternalView, setRoomInternalView] = useState('lobby');
  const [isRestoringState, setIsRestoringState] = useState(false);

  // Função para salvar estado completo no banco (modo multiplayer)
  const saveCompleteState = useCallback(async () => {
    if (currentRoom && currentPlayer) {
      const completeState = {
        currentView: currentView,
        roomInternalView: roomInternalView,
        selectedActor: selectedActor,
        characterSelections: characterSelections,
        timestamp: new Date().toISOString()
      };
      
      console.log('💾 SALVANDO ESTADO NO BANCO:', {
        playerId: currentPlayer.id,
        view: completeState.currentView,
        internalView: completeState.roomInternalView,
        actor: completeState.selectedActor?.ID || completeState.selectedActor?.name || 'null',
        hasSelections: !!completeState.characterSelections
      });
      
      // Salvar no banco E no localStorage como backup
      const result = await RoomService.updatePlayerAppState(currentPlayer.id, completeState);
      if (result.success) {
        console.log('✅ Estado salvo no banco com sucesso');
        // Também salvar no localStorage como backup
        PlayerPersistence.saveAppState(completeState);
      } else {
        console.error('❌ Erro ao salvar no banco, salvando apenas no localStorage');
        PlayerPersistence.saveAppState(completeState);
      }
    } else {
      console.log('⚠️ Não salvando estado - falta room ou player');
    }
  }, [currentView, roomInternalView, selectedActor, characterSelections, currentRoom, currentPlayer]);

  // Função para salvar estado no modo solo (apenas localStorage)
  const saveSoloState = useCallback(() => {
    if (!currentRoom && !currentPlayer) {
      const soloState = {
        currentView: currentView,
        selectedActor: selectedActor,
        characterSelections: characterSelections,
        timestamp: new Date().toISOString(),
        isSoloMode: true
      };
      
      console.log('💾 SALVANDO ESTADO SOLO:', {
        view: soloState.currentView,
        actor: soloState.selectedActor?.ID || soloState.selectedActor?.name || 'null',
        hasSelections: !!soloState.characterSelections
      });
      
      PlayerPersistence.saveAppState(soloState);
    }
  }, [currentView, selectedActor, characterSelections, currentRoom, currentPlayer]);

  // Função para tentar reconectar jogador salvo
  const handleReconnectPlayer = useCallback(async (savedData, savedAppState, loadedGameData = null) => {
    try {
      setLoading(true);
      setIsRestoringState(true);
      console.log('🔄 INICIANDO RECONEXÃO:', savedData.player.name, 'na sala:', savedData.room.id);
      
      // Verificar se a sala ainda existe e está ativa
      const roomsResult = await RoomService.getActiveRooms();
      if (!roomsResult.success) {
        console.error('❌ Erro ao verificar salas:', roomsResult.error);
        // NÃO limpar dados ainda - pode ser erro temporário de rede
        alert('Erro ao verificar salas. Verifique sua conexão e recarregue a página.');
        setLoading(false);
        setIsRestoringState(false);
        return;
      }
      
      const room = roomsResult.rooms.find(r => r.id === savedData.room.id);
      if (!room) {
        console.log('⚠️ Sala não encontrada ou fechada');
        // Limpar dados apenas se sala realmente não existe mais
        PlayerPersistence.clearPlayerData();
        setCurrentView('menu');
        alert('A sala não está mais disponível. Voltando ao menu principal.');
        setLoading(false);
        setIsRestoringState(false);
        return;
      }
      
      // Tentar reconectar o jogador
      const reconnectResult = await RoomService.reconnectPlayer(savedData.player.id);
      if (reconnectResult.success) {
        console.log('✅ JOGADOR RECONECTADO, dados do banco:', reconnectResult.player);
        
        // Definir sala e jogador primeiro
        setCurrentRoom(room);
        setCurrentPlayer(reconnectResult.player);
        
        // PRIORIDADE: Estado do banco (app_state) > character > localStorage
        let stateToRestore = null;
        
        if (reconnectResult.player.app_state && 
            reconnectResult.player.app_state.timestamp) {
          console.log('🎯 USANDO ESTADO DO BANCO (app_state):', reconnectResult.player.app_state);
          stateToRestore = reconnectResult.player.app_state;
        } else if (reconnectResult.player.character && 
                   (reconnectResult.player.character.actor || reconnectResult.player.character.selections)) {
          // Se tem character salvo mas não tem app_state, criar state do character
          console.log('🎯 USANDO CHARACTER DO BANCO:', reconnectResult.player.character);
          stateToRestore = {
            selectedActor: reconnectResult.player.character.actor,
            characterSelections: reconnectResult.player.character.selections,
            roomInternalView: 'sheet', // Se tem character completo, está na sheet
            currentView: 'room'
          };
        } else if (savedAppState) {
          console.log('📦 USANDO ESTADO DO LOCALSTORAGE:', savedAppState);
          stateToRestore = savedAppState;
        }
        
        if (stateToRestore) {
          console.log('🔄 RESTAURANDO ESTADO:', stateToRestore);
          
          // Usar gameData carregado ou do estado
          const gameDataToUse = loadedGameData || gameData;
          
          if (gameDataToUse) {
            // Restaurar actor procurando pelo ID no gameData
            if (stateToRestore.selectedActor) {
              const actorId = stateToRestore.selectedActor.ID || stateToRestore.selectedActor.id;
              console.log('📖 PROCURANDO ACTOR COM ID:', actorId);
              
              if (actorId && gameDataToUse.ActorDefinitions) {
                const foundActor = gameDataToUse.ActorDefinitions.find(a => a.ID === actorId);
                if (foundActor) {
                  console.log('📖 ACTOR ENCONTRADO:', foundActor.ID);
                  setSelectedActor(foundActor);
                } else {
                  console.warn('⚠️ Actor não encontrado no gameData:', actorId);
                  setSelectedActor(stateToRestore.selectedActor);
                }
              } else {
                console.log('📖 DEFININDO ACTOR DIRETAMENTE');
                setSelectedActor(stateToRestore.selectedActor);
              }
            }
            
            if (stateToRestore.characterSelections) {
              console.log('📖 DEFININDO SELECTIONS');
              setCharacterSelections(stateToRestore.characterSelections);
            }
          } else {
            // Se gameData ainda não carregou, apenas definir os estados
            if (stateToRestore.selectedActor) {
              console.log('📖 DEFININDO ACTOR (gameData ainda não carregado)');
              setSelectedActor(stateToRestore.selectedActor);
            }
            
            if (stateToRestore.characterSelections) {
              console.log('📖 DEFININDO SELECTIONS');
              setCharacterSelections(stateToRestore.characterSelections);
            }
          }
          
          // Definir views
          if (stateToRestore.roomInternalView) {
            console.log('📖 DEFININDO INTERNAL VIEW:', stateToRestore.roomInternalView);
            setRoomInternalView(stateToRestore.roomInternalView);
          }
          
          // Sempre ir para 'room' no App, o RoomView controla internamente
          console.log('📖 DEFININDO CURRENT VIEW: room');
          setCurrentView('room');
          
          console.log('✅ ESTADO RESTAURADO:', {
            view: 'room',
            internalView: stateToRestore.roomInternalView,
            actor: stateToRestore.selectedActor?.ID || stateToRestore.selectedActor?.name,
            hasSelections: !!stateToRestore.characterSelections
          });
        } else {
          console.log('📭 NENHUM ESTADO ENCONTRADO - indo para lobby');
          setRoomInternalView('lobby');
          setCurrentView('room');
        }
        
        // Atualizar dados salvos com informações mais recentes
        PlayerPersistence.updatePlayerData(reconnectResult.player);
      } else {
        console.log('❌ Falha ao reconectar jogador');
        // Não limpar automaticamente - pode ser erro temporário
        alert('Não foi possível reconectar. Voltando ao menu principal.');
        PlayerPersistence.clearPlayerData();
        setCurrentView('menu');
      }
    } catch (error) {
      console.error('❌ Erro na reconexão:', error);
      alert('Erro ao tentar reconectar. Verifique sua conexão.');
      // Não limpar dados em caso de erro de rede
    } finally {
      setLoading(false);
      setIsRestoringState(false);
    }
  }, [gameData]);

  // useEffect para salvar estado sempre que mudanças importantes acontecerem
  useEffect(() => {
    if (!isRestoringState) {
      if (currentRoom && currentPlayer) {
        // Modo multiplayer - salvar no banco
        saveCompleteState();
      } else {
        // Modo solo - salvar apenas no localStorage
        saveSoloState();
      }
    }
  }, [currentView, roomInternalView, selectedActor, characterSelections, currentRoom, currentPlayer, isRestoringState, saveCompleteState, saveSoloState]);

  useEffect(() => {
    // Verificar se a URL contém "admin" para mostrar o painel escondido
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true' || window.location.pathname.includes('admin')) {
      setCurrentView('admin');
      return;
    }
    
    // Gerar ID de sessão para controlar múltiplas abas
    if (!PlayerPersistence.isSameSession()) {
      PlayerPersistence.generateSessionId();
    }
    
    // Carregar dados do jogo primeiro
    Promise.all([
      fetch("GameEconomyData.json").then(r => r.json()),
      fetch("LocalizationPortuguese.json").then(r => r.json())
    ]).then(([loadedGameData, loadedLocalization]) => {
      setGameData(loadedGameData);
      setLocalization(loadedLocalization);
      
      // Após carregar gameData, verificar se há dados salvos para restaurar
      const savedData = PlayerPersistence.getPlayerData();
      const savedAppState = PlayerPersistence.getAppState();
      
      if (savedData && PlayerPersistence.validateSavedData()) {
        console.log('🔄 Dados salvos encontrados, tentando reconectar...');
        // Reconectar passando o gameData carregado
        handleReconnectPlayer(savedData, savedAppState, loadedGameData);
      } else if (savedAppState && savedAppState.isSoloMode) {
        // Restaurar estado do modo solo
        console.log('🔄 RESTAURANDO ESTADO SOLO:', savedAppState);
        setIsRestoringState(true);
        
        if (savedAppState.selectedActor) {
          const actorId = savedAppState.selectedActor.ID || savedAppState.selectedActor.id;
          console.log('📖 PROCURANDO ACTOR SOLO COM ID:', actorId);
          
          if (actorId && loadedGameData.ActorDefinitions) {
            const foundActor = loadedGameData.ActorDefinitions.find(a => a.ID === actorId);
            if (foundActor) {
              console.log('📖 ACTOR SOLO ENCONTRADO:', foundActor.ID);
              setSelectedActor(foundActor);
            } else {
              console.warn('⚠️ Actor solo não encontrado no gameData:', actorId);
              setSelectedActor(savedAppState.selectedActor);
            }
          } else {
            console.log('📖 DEFININDO ACTOR SOLO DIRETAMENTE');
            setSelectedActor(savedAppState.selectedActor);
          }
        }
        
        if (savedAppState.characterSelections) {
          console.log('📖 DEFININDO SELECTIONS SOLO');
          setCharacterSelections(savedAppState.characterSelections);
        }
        
        if (savedAppState.currentView) {
          console.log('📖 DEFININDO VIEW SOLO:', savedAppState.currentView);
          setCurrentView(savedAppState.currentView);
        }
        
        setTimeout(() => setIsRestoringState(false), 100);
        console.log('✅ ESTADO SOLO RESTAURADO');
      }
    }).catch(error => {
      console.error('Erro ao carregar dados:', error);
    });
    
    // Salvar configurações do Supabase no localStorage para o painel de admin
    if (process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY) {
      localStorage.setItem('supabase_url', process.env.REACT_APP_SUPABASE_URL);
      localStorage.setItem('supabase_key', process.env.REACT_APP_SUPABASE_ANON_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executar apenas uma vez na montagem

  const handleCharacterSelect = (actor) => {
    console.log('🎯 SELECIONANDO PERSONAGEM:', actor.name);
    setSelectedActor(actor);
    setCurrentView('builder');
  };

  const handleCharacterCreate = (selections) => {
    console.log('🎯 CRIANDO PERSONAGEM');
    setCharacterSelections(selections);
    setCurrentView('sheet');
  };

  const handleReset = () => {
    console.log('🔄 RESETANDO APLICAÇÃO');
    setCurrentView('menu');
    setSelectedActor(null);
    setCharacterSelections(null);
    setCurrentRoom(null);
    setCurrentPlayer(null);
    
    // Limpar estado solo salvo
    PlayerPersistence.clearAppState();
  };

  const handleCreateRoom = async (roomName, masterName) => {
    setLoading(true);
    const result = await RoomService.createRoom(roomName, masterName);
    
    if (result.success) {
      // Criar jogador para o mestre
      const playerResult = await RoomService.joinRoom(result.room.id, masterName);
      if (playerResult.success) {
        setCurrentRoom(result.room);
        setCurrentPlayer(playerResult.player);
        setCurrentView('room');
        setRoomInternalView('lobby'); // Inicializar view interna
        
        // Salvar dados para persistência
        PlayerPersistence.savePlayerData(playerResult.player, result.room);
      }
    } else {
      alert('Erro ao criar sala: ' + result.error);
    }
    setLoading(false);
  };

  const handleJoinRoom = async (roomId, playerName) => {
    setLoading(true);
    // Forçar criação de novo jogador sempre que entrar manualmente na sala
    const result = await RoomService.joinRoom(roomId, playerName, null, true);
    
    if (result.success) {
      // Buscar dados da sala
      const roomsResult = await RoomService.getActiveRooms();
      if (roomsResult.success) {
        const room = roomsResult.rooms.find(r => r.id === roomId);
        if (room) {
          setCurrentRoom(room);
          setCurrentPlayer(result.player);
          setCurrentView('room');
          setRoomInternalView('lobby'); // Inicializar view interna
          
          // Salvar dados para persistência
          PlayerPersistence.savePlayerData(result.player, room);
          setTimeout(saveCompleteState, 100);
        } else {
          alert('Sala não encontrada ou inativa');
        }
      }
    } else {
      alert('Erro ao entrar na sala: ' + result.error);
    }
    setLoading(false);
  };

  const handleLeaveRoom = async () => {
    // Remover jogador do banco de dados quando sair definitivamente
    if (currentPlayer) {
      console.log('🚪 Jogador saindo da sala:', currentPlayer.id);
      await RoomService.leaveRoom(currentPlayer.id);
    }
    
    // Limpar dados salvos quando sair definitivamente da sala
    PlayerPersistence.clearPlayerData();
    
    setCurrentRoom(null);
    setCurrentPlayer(null);
    setSelectedActor(null);
    setCharacterSelections(null);
    setRoomInternalView('lobby');
    setCurrentView('lobby');
  };

  const handleSoloPlay = () => {
    console.log('🎮 INICIANDO MODO SOLO');
    setCurrentView('selection');
  };

  const handleBackToSelection = () => {
    console.log('🔄 VOLTANDO PARA SELEÇÃO - limpando personagem selecionado');
    setSelectedActor(null);
    setCharacterSelections(null);
    setCurrentView('selection');
  };

  if (!gameData || !localization) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{localization?.['UI.Loading'] || 'UI.Loading'}</span>
          </div>
          <p className="mt-2">{localization?.['UI.Loading.Game'] || 'UI.Loading.Game'}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
          <p className="mt-2 text-light">Processando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Menu Principal */}
      {currentView === 'menu' && (
        <>
          <div className="row">
            <div className="col-12 text-center">
              <img 
                src="KillOrDieLogo.png"
                alt="Kill or Die" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '300px'}} 
              />
              <h1 className="text-white">Kill or Die</h1>
              <h4 className="text-light mb-4">Escolha como jogar!</h4>
            </div>
          </div>
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="d-grid gap-3">
                <button 
                  className="btn btn-primary btn-lg"
                  onClick={() => setCurrentView('lobby')}
                >
                  🎮 Modo Multiplayer
                </button>
                <button 
                  className="btn btn-success btn-lg"
                  onClick={handleSoloPlay}
                >
                  👤 Modo Solo
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lobby de Salas */}
      {currentView === 'lobby' && (
        <RoomLobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onBack={() => setCurrentView('menu')}
          localization={localization}
        />
      )}

      {/* Sala Multiplayer */}
      {currentView === 'room' && currentRoom && currentPlayer && (
        <RoomView
          room={currentRoom}
          currentPlayer={currentPlayer}
          gameData={gameData}
          localization={localization}
          onLeaveRoom={handleLeaveRoom}
          // Passar estados do App para o RoomView
          initialView={roomInternalView}
          initialSelectedActor={selectedActor}
          initialCharacterSelections={characterSelections}
          onViewChange={(view) => {
            console.log('🔄 View mudou no RoomView:', view);
            setRoomInternalView(view);
            // Salvar estado completo quando view muda
            setTimeout(saveCompleteState, 100);
          }}
          onActorChange={(actor) => {
            console.log('🔄 Actor mudou no RoomView:', actor?.name);
            setSelectedActor(actor);
            // Salvar estado completo quando actor muda
            setTimeout(saveCompleteState, 100);
          }}
          onSelectionsChange={(selections) => {
            console.log('🔄 Selections mudaram no RoomView');
            setCharacterSelections(selections);
            // Salvar estado completo quando selections mudam
            setTimeout(saveCompleteState, 100);
          }}
        />
      )}

      {/* Modo Solo - Seleção de Personagem */}
      {currentView === 'selection' && (
        <>
          <div className="row">
            <div className="col-12 text-center">
              <img 
                src="KillOrDieLogo.png"
                alt="Kill or Die" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '300px'}} 
              />
              <h1 className="text-white">Kill or Die</h1>
              <h4 className="text-light mb-4">Escolha seu personagem!</h4>
              <button 
                className="btn btn-outline-light btn-sm mb-3"
                onClick={() => setCurrentView('menu')}
              >
                ← Voltar ao Menu
              </button>
            </div>
          </div>
          <CharacterSelection 
            gameData={gameData}
            localization={localization}
            onCharacterSelect={handleCharacterSelect}
          />
        </>
      )}

      {/* Construtor de Personagem */}
      {currentView === 'builder' && (
        <CharacterBuilder
          actor={selectedActor}
          gameData={gameData}
          localization={localization}
          onCharacterCreate={handleCharacterCreate}
          onBack={handleBackToSelection}
        />
      )}

      {/* Ficha do Personagem */}
      {currentView === 'sheet' && (
        <CharacterSheet
          actor={selectedActor}
          selections={characterSelections}
          gameData={gameData}
          localization={localization}
          onReset={handleReset}
        />
      )}

      {/* Painel de Administração Escondido */}
      {currentView === 'admin' && (
        <>
          <div className="row">
            <div className="col-12 text-center mb-4">
              <img 
                src="KillOrDieLogo.png"
                alt="Kill or Die" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '200px'}} 
              />
              <h2 className="text-white">🛠️ Painel de Administração</h2>
              <p className="text-light">Sistema de monitoramento e limpeza automática</p>
            </div>
          </div>
          
          <div className="row">
            <div className="col-12">
              <AdminPanel />
            </div>
          </div>
          
          <div className="row mt-4">
            <div className="col-12 text-center">
              <button 
                className="btn btn-outline-light btn-lg"
                onClick={() => {
                  setCurrentView('menu');
                  window.history.pushState({}, '', '/');
                }}
              >
                ← Voltar ao Jogo Principal
              </button>
            </div>
          </div>
          
          <div className="row mt-4">
            <div className="col-12">
              <div className="alert alert-warning" role="alert">
                <strong>⚠️ Página Restrita:</strong> Esta página é destinada apenas para administradores do sistema.
                Use com cuidado ao executar limpezas manuais.
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

export default App;
