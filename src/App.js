import React, { useState, useEffect } from 'react';
import CharacterSelection from './components/CharacterSelection';
import CharacterBuilder from './components/CharacterBuilder';
import CharacterSheet from './components/CharacterSheet';
import RoomLobby from './components/RoomLobby';
import RoomView from './components/RoomView';
import { RoomService } from './services/roomService';
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
    setCurrentRoom(null);
    setCurrentPlayer(null);
    setCurrentView('lobby');
  };

  const handleSoloPlay = () => {
    setCurrentView('selection');
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
    </div>
  );
}

export default App;
