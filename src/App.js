import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Verificar se a URL contém "admin" para mostrar o painel escondido
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true' || window.location.pathname.includes('admin')) {
      setCurrentView('admin');
      return;
    }
    
    // Verificar se há dados de jogador salvos para reconexão
    const savedData = PlayerPersistence.getPlayerData();
    if (savedData && PlayerPersistence.validateSavedData()) {
      console.log('🔄 Dados salvos encontrados, tentando reconectar...');
      handleReconnectPlayer(savedData);
    }
    
    // Salvar configurações do Supabase no localStorage para o painel de admin
    if (process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY) {
      localStorage.setItem('supabase_url', process.env.REACT_APP_SUPABASE_URL);
      localStorage.setItem('supabase_key', process.env.REACT_APP_SUPABASE_ANON_KEY);
    }
    
    Promise.all([
      fetch("GameEconomyData.json").then(r => r.json()),
      fetch("LocalizationPortuguese.json").then(r => r.json())
    ]).then(([gameData, localization]) => {
      setGameData(gameData);
      setLocalization(localization);
    }).catch(error => {
      console.error('Erro ao carregar dados:', error);
    });
  }, []);

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
    const result = await RoomService.joinRoom(roomId, playerName);
    
    if (result.success) {
      // Buscar dados da sala
      const roomsResult = await RoomService.getActiveRooms();
      if (roomsResult.success) {
        const room = roomsResult.rooms.find(r => r.id === roomId);
        if (room) {
          setCurrentRoom(room);
          setCurrentPlayer(result.player);
          setCurrentView('room');
          
          // Salvar dados para persistência
          PlayerPersistence.savePlayerData(result.player, room);
        } else {
          alert('Sala não encontrada ou inativa');
        }
      }
    } else {
      alert('Erro ao entrar na sala: ' + result.error);
    }
    setLoading(false);
  };

  const handleLeaveRoom = () => {
    // Limpar dados salvos quando sair definitivamente da sala
    PlayerPersistence.clearPlayerData();
    
    setCurrentRoom(null);
    setCurrentPlayer(null);
    setCurrentView('lobby');
  };

  const handleSoloPlay = () => {
    setCurrentView('selection');
  };

  // Função para tentar reconectar jogador salvo
  const handleReconnectPlayer = async (savedData) => {
    try {
      setLoading(true);
      console.log('🔄 Tentando reconectar jogador:', savedData.player.name, 'na sala:', savedData.room.id);
      
      // Verificar se a sala ainda existe e está ativa
      const roomsResult = await RoomService.getActiveRooms();
      if (!roomsResult.success) {
        console.log('❌ Erro ao verificar salas, limpando dados salvos');
        PlayerPersistence.clearPlayerData();
        return;
      }
      
      const room = roomsResult.rooms.find(r => r.id === savedData.room.id);
      if (!room) {
        console.log('🗑️ Sala não encontrada, limpando dados salvos');
        PlayerPersistence.clearPlayerData();
        return;
      }
      
      // Tentar reconectar o jogador
      const reconnectResult = await RoomService.reconnectPlayer(savedData.player.id);
      if (reconnectResult.success) {
        console.log('✅ Jogador reconectado com sucesso');
        setCurrentRoom(room);
        setCurrentPlayer(reconnectResult.player);
        setCurrentView('room');
        
        // Atualizar dados salvos com informações mais recentes
        PlayerPersistence.updatePlayerData(reconnectResult.player);
      } else {
        console.log('❌ Falha ao reconectar, limpando dados salvos');
        PlayerPersistence.clearPlayerData();
      }
    } catch (error) {
      console.error('❌ Erro na reconexão:', error);
      PlayerPersistence.clearPlayerData();
    } finally {
      setLoading(false);
    }
  };

  if (!gameData || !localization) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
          <p className="mt-2">Carregando dados do jogo...</p>
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
                alt="Matar ou Morrer" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '300px'}} 
              />
              <h1 className="text-white">Matar ou Morrer</h1>
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
        />
      )}

      {/* Modo Solo - Seleção de Personagem */}
      {currentView === 'selection' && (
        <>
          <div className="row">
            <div className="col-12 text-center">
              <img 
                src="KillOrDieLogo.png"
                alt="Matar ou Morrer" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '300px'}} 
              />
              <h1 className="text-white">Matar ou Morrer</h1>
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
          onBack={() => setCurrentView('selection')}
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
                alt="Matar ou Morrer" 
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
