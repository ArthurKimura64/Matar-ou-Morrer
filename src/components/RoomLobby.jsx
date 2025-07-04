import React, { useState } from 'react';

const RoomLobby = ({ onCreateRoom, onJoinRoom, onBack }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [masterName, setMasterName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (roomName.trim() && masterName.trim()) {
      await onCreateRoom(roomName.trim(), masterName.trim());
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (roomId.trim().length === 6 && playerName.trim()) {
      await onJoinRoom(roomId.trim(), playerName.trim());
    } else {
      alert('Por favor, digite um código de sala válido (6 dígitos) e seu nome.');
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12 text-center">
          <img 
            src="KillOrDieLogo.png"
            alt="Matar ou Morrer" 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{maxHeight: '200px'}} 
          />
          <h1 className="text-white">Sistema de Salas</h1>
          <h4 className="text-light mb-4">Jogue com seus amigos!</h4>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="row">
            {/* Criar Sala */}
            <div className="col-md-6 mb-4">
              <div className="card bg-dark border-light">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Criar Nova Sala</h5>
                </div>
                <div className="card-body">
                  {!isCreating ? (
                    <button 
                      className="btn btn-primary w-100"
                      onClick={() => setIsCreating(true)}
                    >
                      Criar Sala
                    </button>
                  ) : (
                    <form onSubmit={handleCreateRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">Nome da Sala</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder="Ex: Mesa do Arthur"
                          maxLength={50}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">Seu Nome (Mestre)</label>
                        <input
                          type="text"
                          className="form-control"
                          value={masterName}
                          onChange={(e) => setMasterName(e.target.value)}
                          placeholder="Ex: Arthur"
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          Criar Sala
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsCreating(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>

            {/* Entrar em Sala */}
            <div className="col-md-6 mb-4">
              <div className="card bg-dark border-light">
                <div className="card-header bg-success text-white">
                  <h5 className="mb-0">Entrar em Sala</h5>
                </div>
                <div className="card-body">
                  {!isJoining ? (
                    <button 
                      className="btn btn-success w-100"
                      onClick={() => setIsJoining(true)}
                    >
                      Entrar em Sala
                    </button>
                  ) : (
                    <form onSubmit={handleJoinRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">ID da Sala</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomId}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setRoomId(value);
                          }}
                          placeholder="123456"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                        />
                        <spam className="form-text text-muted">
                          Digite o código de 6 dígitos da sala
                        </spam>
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">Seu Nome</label>
                        <input
                          type="text"
                          className="form-control"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder="Ex: João"
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          Entrar na Sala
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsJoining(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Modo Solo */}
          <div className="row">
            <div className="col-12">
              <div className="card bg-dark border-warning">
                <div className="card-body text-center">
                  <h6 className="text-warning mb-2">Ou continue no modo solo</h6>
                  <button 
                    className="btn btn-warning"
                    onClick={onBack}
                  >
                    Criar Personagem Solo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomLobby;
