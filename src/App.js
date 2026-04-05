import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { RoomService } from './services/roomService';
import { PlayerPersistence } from './utils/playerPersistence';
import authService from './services/authService';
import AuthModal from './components/AuthModal';
import UserMenu from './components/UserMenu';
import './App.css';

// Lazy loading para componentes grandes
const CharacterSelection = lazy(() => import('./components/CharacterSelection'));
const CharacterBuilder = lazy(() => import('./components/CharacterBuilder'));
const CharacterSheet = lazy(() => import('./components/CharacterSheet'));
const RoomLobby = lazy(() => import('./components/RoomLobby'));
const RoomView = lazy(() => import('./components/RoomView'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const RankingPage = lazy(() => import('./components/RankingPage'));

// Componente de loading reutilizável
const LoadingFallback = () => (
  <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
    <div className="text-center">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Carregando...</span>
      </div>
      <p className="mt-2 text-light">Carregando componente...</p>
    </div>
  </div>
);

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

  // Estado de autenticação
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
      
      // Salvar no banco E no localStorage como backup
      const result = await RoomService.updatePlayerAppState(currentPlayer.id, completeState);
      if (result.success) {
        PlayerPersistence.saveAppState(completeState);
      } else {
        console.warn('Erro ao salvar estado no banco, usando localStorage como fallback');
        PlayerPersistence.saveAppState(completeState);
      }
    }
  }, [currentView, roomInternalView, selectedActor, characterSelections, currentRoom, currentPlayer]);

  // Função para salvar estado no modo solo (apenas localStorage)
  const saveSoloState = useCallback(() => {
    if (!currentRoom && !currentPlayer && currentView !== 'menu' && currentView !== 'lobby' && currentView !== 'profile' && currentView !== 'ranking') {
      const soloState = {
        currentView: currentView,
        selectedActor: selectedActor,
        characterSelections: characterSelections,
        timestamp: new Date().toISOString(),
        isSoloMode: true
      };
      
      PlayerPersistence.saveAppState(soloState);
    }
  }, [currentView, selectedActor, characterSelections, currentRoom, currentPlayer]);

  // Memoizar função de reconexão para evitar recriação
  const handleReconnectPlayer = useCallback(async (savedData, savedAppState, loadedGameData = null) => {
    try {
      setLoading(true);
      setIsRestoringState(true);
      
      // Buscar dados completos da sala diretamente
      const roomResult = await RoomService.getRoomById(savedData.room.id);
      if (!roomResult.success || !roomResult.room) {
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
        // Definir sala e jogador primeiro (usando dados atualizados)
        setCurrentRoom(roomResult.room);
        setCurrentPlayer(reconnectResult.player);
        
        // PRIORIDADE: Estado do banco (app_state) > character > localStorage
        let stateToRestore = null;
        
        if (reconnectResult.player.app_state && 
            reconnectResult.player.app_state.timestamp) {
          stateToRestore = reconnectResult.player.app_state;
        } else if (reconnectResult.player.character && 
                   (reconnectResult.player.character.actor || reconnectResult.player.character.selections)) {
          // Se tem character salvo mas não tem app_state, criar state do character
          stateToRestore = {
            selectedActor: reconnectResult.player.character.actor,
            characterSelections: reconnectResult.player.character.selections,
            roomInternalView: 'sheet', // Se tem character completo, está na sheet
            currentView: 'room'
          };
        } else if (savedAppState) {
          stateToRestore = savedAppState;
        }
        
        if (stateToRestore) {
          // Usar gameData carregado ou do estado
          const gameDataToUse = loadedGameData || gameData;
          
          if (gameDataToUse) {
            // Restaurar actor procurando pelo ID no gameData
            if (stateToRestore.selectedActor) {
              const actorId = stateToRestore.selectedActor.ID || stateToRestore.selectedActor.id;
              
              if (actorId && gameDataToUse.ActorDefinitions) {
                const foundActor = gameDataToUse.ActorDefinitions.find(a => a.ID === actorId);
                if (foundActor) {
                  setSelectedActor(foundActor);
                } else {
                  setSelectedActor(stateToRestore.selectedActor);
                }
              } else {
                setSelectedActor(stateToRestore.selectedActor);
              }
            }
            
            if (stateToRestore.characterSelections) {
              setCharacterSelections(stateToRestore.characterSelections);
            }
          } else {
            // Se gameData ainda não carregou, apenas definir os estados
            if (stateToRestore.selectedActor) {
              setSelectedActor(stateToRestore.selectedActor);
            }
            
            if (stateToRestore.characterSelections) {
              setCharacterSelections(stateToRestore.characterSelections);
            }
          }
          
          // Definir views
          if (stateToRestore.roomInternalView) {
            setRoomInternalView(stateToRestore.roomInternalView);
          }
          
          // Sempre ir para 'room' no App, o RoomView controla internamente
          setCurrentView('room');
        } else {
          setRoomInternalView('lobby');
          setCurrentView('room');
        }
        
        // Atualizar dados salvos com informações mais recentes
        PlayerPersistence.updatePlayerData(reconnectResult.player);
      } else {
        // Não limpar automaticamente - pode ser erro temporário
        alert('Não foi possível reconectar. Voltando ao menu principal.');
        PlayerPersistence.clearPlayerData();
        setCurrentView('menu');
      }
    } catch (error) {
      console.error('Erro na reconexão:', error);
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
      // Debounce para evitar múltiplos saves em sequência rápida
      const timeoutId = setTimeout(() => {
        if (currentRoom && currentPlayer) {
          // Modo multiplayer - salvar no banco
          saveCompleteState();
        } else {
          // Modo solo - salvar apenas no localStorage
          saveSoloState();
        }
      }, 300); // 300ms de debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentView, roomInternalView, selectedActor, characterSelections, currentRoom, currentPlayer, isRestoringState, saveCompleteState, saveSoloState]);

  // Inicializar auth listener
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (user) => {
      if (!isMounted) return;
      try {
        const profile = await authService.getProfile(user.id);
        if (isMounted) setUserProfile(profile);
      } catch (err) {
        console.warn('Perfil ainda não disponível:', err);
      }
    };

    // Verificar sessão existente primeiro (síncrono com cache)
    authService.getSession().then((session) => {
      if (session?.user && isMounted) {
        setCurrentUser(session.user);
        loadProfile(session.user);
      }
    });

    // Listener para mudanças futuras (login, logout, token refresh)
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      // Ignorar INITIAL_SESSION — já tratado por getSession acima
      if (event === 'INITIAL_SESSION') return;

      if (session?.user) {
        setCurrentUser(session.user);
        loadProfile(session.user);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Verificar se a URL contém "admin" para mostrar o painel escondido
    const urlParams = new URLSearchParams(window.location.search);
    const adminKey = process.env.REACT_APP_ADMIN_KEY || '';
    if ((urlParams.get('admin') === 'true' || window.location.pathname.includes('admin')) && 
        (!adminKey || urlParams.get('key') === adminKey)) {
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
        // Reconectar passando o gameData carregado
        handleReconnectPlayer(savedData, savedAppState, loadedGameData);
      } else if (savedAppState && savedAppState.isSoloMode) {
        // Restaurar estado do modo solo
        setIsRestoringState(true);
        
        if (savedAppState.selectedActor) {
          const actorId = savedAppState.selectedActor.ID || savedAppState.selectedActor.id;
          
          if (actorId && loadedGameData.ActorDefinitions) {
            const foundActor = loadedGameData.ActorDefinitions.find(a => a.ID === actorId);
            if (foundActor) {
              setSelectedActor(foundActor);
            } else {
              setSelectedActor(savedAppState.selectedActor);
            }
          } else {
            setSelectedActor(savedAppState.selectedActor);
          }
        }
        
        if (savedAppState.characterSelections) {
          setCharacterSelections(savedAppState.characterSelections);
        }
        
        if (savedAppState.currentView) {
          setCurrentView(savedAppState.currentView);
        }
        
        setTimeout(() => setIsRestoringState(false), 100);
      }
    }).catch(error => {
      console.error('Erro ao carregar dados:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executar apenas uma vez na montagem

  const handleCharacterSelect = (actor) => {
    setSelectedActor(actor);
    setCurrentView('builder');
  };

  const handleCharacterCreate = (selections) => {
    setCharacterSelections(selections);
    setCurrentView('sheet');
  };

  const handleReset = () => {
    setCurrentView('menu');
    setSelectedActor(null);
    setCharacterSelections(null);
    setCurrentRoom(null);
    setCurrentPlayer(null);
    
    // Limpar estado solo salvo
    PlayerPersistence.clearAppState();
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    // Pequeno delay para garantir que o trigger do DB criou o perfil
    const fetchProfile = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const profile = await authService.getProfile(user.id);
          setUserProfile(profile);
          return;
        } catch (err) {
          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, 500));
          } else {
            console.warn('Perfil ainda carregando:', err);
          }
        }
      }
    };
    fetchProfile();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserProfile(null);
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
  };

  const handleCreateRoom = async (roomName, masterName) => {
    setLoading(true);
    const result = await RoomService.createRoom(roomName, masterName);
    
    if (result.success) {
      // Criar jogador para o mestre
      const playerResult = await RoomService.joinRoom(result.room.id, masterName, null, false, currentUser?.id || null);
      if (playerResult.success) {
        // Armazenar o relacionamento room.master_player_id para controle de permissões (kick)
        try {
          const setMaster = await RoomService.setRoomMasterPlayerId(result.room.id, playerResult.player.id);
          if (setMaster.success && setMaster.room) {
            // atualizar o objeto de sala local com o master_player_id
            result.room.master_player_id = playerResult.player.id;
          }
        } catch (e) {
          console.warn('Não foi possível definir master_player_id no banco:', e);
        }

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
    const result = await RoomService.joinRoom(roomId, playerName, null, true, currentUser?.id || null);
    
    if (result.success) {
      // Buscar dados completos da sala usando getRoomById
      const roomResult = await RoomService.getRoomById(roomId);
      if (roomResult.success && roomResult.room) {
        setCurrentRoom(roomResult.room);
        setCurrentPlayer(result.player);
        setCurrentView('room');
        setRoomInternalView('lobby'); // Inicializar view interna
        
        // Salvar dados para persistência
        PlayerPersistence.savePlayerData(result.player, roomResult.room);
      } else {
        alert('Sala não encontrada ou inativa');
      }
    } else {
      alert('Erro ao entrar na sala: ' + result.error);
    }
    setLoading(false);
  };

  const handleLeaveRoom = async () => {
    // Remover jogador do banco de dados quando sair definitivamente
    if (currentPlayer) {
      await RoomService.leaveRoom(currentPlayer.id);
    }
    
    // Limpar dados salvos quando sair definitivamente da sala
    PlayerPersistence.clearPlayerData();
    
    setCurrentRoom(null);
    setCurrentPlayer(null);
    setSelectedActor(null);
    setCharacterSelections(null);
    setRoomInternalView('lobby');
    setCurrentView('menu');
  };

  const handleSoloPlay = () => {
    setCurrentView('selection');
  };

  const handleBackToSelection = () => {
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
      {/* Auth Modal */}
      <AuthModal 
        show={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Menu Principal */}
      {currentView === 'menu' && (
        <>
          {/* Auth bar */}
          <div className="row">
            <div className="col-12 d-flex justify-content-end py-2">
              {currentUser ? (
                <UserMenu 
                  user={currentUser} 
                  profile={userProfile} 
                  onLogout={handleLogout} 
                  onNavigate={handleNavigate}
                />
              ) : (
                <button 
                  className="btn btn-outline-light btn-sm"
                  onClick={() => setShowAuthModal(true)}
                >
                  🔑 Entrar / Criar Conta
                </button>
              )}
            </div>
          </div>
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
                <button 
                  className="btn btn-outline-warning btn-lg"
                  onClick={() => setCurrentView('ranking')}
                >
                  🏆 Ranking
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lobby de Salas */}
      {currentView === 'lobby' && (
        <Suspense fallback={<LoadingFallback />}>
          <RoomLobby
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onBack={() => setCurrentView('menu')}
            localization={localization}
          />
        </Suspense>
      )}

      {/* Sala Multiplayer */}
      {currentView === 'room' && currentRoom && currentPlayer && (
        <Suspense fallback={<LoadingFallback />}>
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
              setRoomInternalView(view);
            }}
            onActorChange={(actor) => {
              setSelectedActor(actor);
            }}
            onSelectionsChange={(selections) => {
              setCharacterSelections(selections);
            }}
          />
        </Suspense>
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
          <Suspense fallback={<LoadingFallback />}>
            <CharacterSelection 
              gameData={gameData}
              localization={localization}
              onCharacterSelect={handleCharacterSelect}
            />
          </Suspense>
        </>
      )}

      {/* Construtor de Personagem */}
      {currentView === 'builder' && (
        <Suspense fallback={<LoadingFallback />}>
          <CharacterBuilder
            actor={selectedActor}
            gameData={gameData}
            localization={localization}
            onCharacterCreate={handleCharacterCreate}
            onBack={handleBackToSelection}
          />
        </Suspense>
      )}

      {/* Ficha do Personagem */}
      {currentView === 'sheet' && (
        <Suspense fallback={<LoadingFallback />}>
          <CharacterSheet
            actor={selectedActor}
            selections={characterSelections}
            gameData={gameData}
            localization={localization}
            onReset={handleReset}
          />
        </Suspense>
      )}

      {/* Perfil do Jogador */}
      {currentView === 'profile' && currentUser && (
        <Suspense fallback={<LoadingFallback />}>
          <ProfilePage
            user={currentUser}
            onBack={() => setCurrentView('menu')}
            localization={localization}
          />
        </Suspense>
      )}

      {/* Ranking */}
      {currentView === 'ranking' && (
        <Suspense fallback={<LoadingFallback />}>
          <RankingPage
            user={currentUser}
            onBack={() => setCurrentView('menu')}
            localization={localization}
          />
        </Suspense>
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
              <Suspense fallback={<LoadingFallback />}>
                <AdminPanel />
              </Suspense>
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
