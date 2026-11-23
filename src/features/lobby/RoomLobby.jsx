import React, { useState, useEffect } from 'react';

const RoomLobby = ({ onCreateRoom, onJoinRoom, onBack, localization = {}, defaultPlayerName = '' }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [masterName, setMasterName] = useState(defaultPlayerName);
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (defaultPlayerName) {
      setMasterName((prev) => prev || defaultPlayerName);
      setPlayerName((prev) => prev || defaultPlayerName);
    }
  }, [defaultPlayerName]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (roomName.trim() && masterName.trim()) {
      await onCreateRoom(roomName.trim(), masterName.trim());
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setJoinError('');
    if (roomId.trim().length === 6 && playerName.trim()) {
      await onJoinRoom(roomId.trim(), playerName.trim());
    } else {
      setJoinError(
        localization['UI.Lobby.InvalidRoomCode'] ||
          'Por favor, digite um código de sala válido (6 dígitos) e seu nome.'
      );
    }
  };

  return (
    <section className="container-fluid">
      <div className="row">
        <div className="col-12 text-center">
          <img 
            src="KillOrDieLogo.png"
            alt={localization['Begin.Title'] || 'Begin.Title'} 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{maxHeight: '200px'}} 
          />
          <h1 className="text-white">{localization['UI.Lobby.SystemTitle'] || 'Sistema de Salas'}</h1>
          <h4 className="text-light mb-4">{localization['UI.Lobby.PlayWithFriends'] || 'Jogue com seus amigos!'}</h4>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="md:col-8">
          <div className="row">
            {/* Criar Sala */}
            <div className="md:col-6 mb-4">
              <div className="card bg-dark border-light">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">{localization['UI.Lobby.CreateRoom'] || 'Criar Nova Sala'}</h5>
                </div>
                <div className="card-body">
                  {!isCreating ? (
                    <button 
                      className="btn btn-primary w-100"
                      onClick={() => setIsCreating(true)}
                    >
                      {localization['UI.Lobby.CreateSala'] || 'Criar Sala'}
                    </button>
                  ) : (
                    <form onSubmit={handleCreateRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.RoomName'] || 'Nome da Sala'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder={localization['UI.Lobby.RoomNamePlaceholder'] || 'Ex: Liga da Justiça'}
                          maxLength={50}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.YourMasterName'] || 'Seu Nome (Anfitrião)'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={masterName}
                          onChange={(e) => setMasterName(e.target.value)}
                          placeholder={localization['UI.Lobby.MasterNamePlaceholder'] || 'Ex: Batman'}
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          {localization['UI.Lobby.Create'] || 'Criar'}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsCreating(false)}
                        >
                          {localization['UI.Lobby.Cancel'] || 'Cancelar'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>

            {/* Entrar em Sala */}
            <div className="md:col-6 mb-4">
              <div className="card bg-dark border-light">
                <div className="card-header bg-success text-white">
                  <h5 className="mb-0">{localization['UI.Lobby.JoinRoom'] || 'Entrar em Sala'}</h5>
                </div>
                <div className="card-body">
                  {!isJoining ? (
                    <button 
                      className="btn btn-success w-100"
                      onClick={() => setIsJoining(true)}
                    >
                      {localization['UI.Lobby.JoinSala'] || 'Entrar em Sala'}
                    </button>
                  ) : (
                    <form onSubmit={handleJoinRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.RoomId'] || 'ID da Sala'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomId}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setRoomId(value);
                          }}
                          placeholder={localization['UI.Lobby.RoomIdPlaceholder'] || '123456'}
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                        />
                        <span className="form-text text-muted">
                          {localization['UI.Lobby.RoomIdHelper'] || 'Digite o código de 6 dígitos da sala'}
                        </span>
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.PlayerName'] || 'Seu Nome'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder={localization['UI.Lobby.YourNamePlaceholder'] || 'Ex: João'}
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          {localization['UI.Lobby.Join'] || 'Entrar'}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsJoining(false)}
                        >
                          {localization['UI.Lobby.Cancel'] || 'Cancelar'}
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
                  <h6 className="text-warning mb-2">{localization['UI.Lobby.ContinueSolo'] || 'Ou continue no modo solo'}</h6>
                  <button 
                    className="btn btn-warning w-100"
                    onClick={onBack}
                  >
                    {localization['UI.Lobby.CreateSolo'] || 'Criar Personagem Solo'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomLobby;