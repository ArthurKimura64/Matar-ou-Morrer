import React, { useState } from 'react';

const RoomLobby = ({ onCreateRoom, onJoinRoom, onBack, localization = {} }) => {
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
      alert(localization['UI.Lobby.InvalidRoomCode'] || 'UI.Lobby.InvalidRoomCode');
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12 text-center">
          <img 
            src="KillOrDieLogo.png"
            alt={localization['Begin.Title'] || 'Begin.Title'} 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{maxHeight: '200px'}} 
          />
          <h1 className="text-white">{localization['UI.Lobby.SystemTitle'] || 'UI.Lobby.SystemTitle'}</h1>
          <h4 className="text-light mb-4">{localization['UI.Lobby.PlayWithFriends'] || 'UI.Lobby.PlayWithFriends'}</h4>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="row">
            {/* Criar Sala */}
            <div className="col-md-6 mb-4">
              <div className="card bg-dark border-light">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">{localization['UI.Lobby.CreateRoom'] || 'UI.Lobby.CreateRoom'}</h5>
                </div>
                <div className="card-body">
                  {!isCreating ? (
                    <button 
                      className="btn btn-primary w-100"
                      onClick={() => setIsCreating(true)}
                    >
                      {localization['UI.Lobby.CreateSala'] || 'UI.Lobby.CreateSala'}
                    </button>
                  ) : (
                    <form onSubmit={handleCreateRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.RoomName'] || 'UI.Lobby.RoomName'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder={localization['UI.Lobby.RoomNamePlaceholder'] || 'UI.Lobby.RoomNamePlaceholder'}
                          maxLength={50}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.YourMasterName'] || 'UI.Lobby.YourMasterName'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={masterName}
                          onChange={(e) => setMasterName(e.target.value)}
                          placeholder={localization['UI.Lobby.MasterNamePlaceholder'] || 'UI.Lobby.MasterNamePlaceholder'}
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          {localization['UI.Lobby.Create'] || 'UI.Lobby.Create'}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsCreating(false)}
                        >
                          {localization['UI.Lobby.Cancel'] || 'UI.Lobby.Cancel'}
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
                  <h5 className="mb-0">{localization['UI.Lobby.JoinRoom'] || 'UI.Lobby.JoinRoom'}</h5>
                </div>
                <div className="card-body">
                  {!isJoining ? (
                    <button 
                      className="btn btn-success w-100"
                      onClick={() => setIsJoining(true)}
                    >
                      {localization['UI.Lobby.JoinSala'] || 'UI.Lobby.JoinSala'}
                    </button>
                  ) : (
                    <form onSubmit={handleJoinRoom}>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.RoomId'] || 'UI.Lobby.RoomId'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={roomId}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setRoomId(value);
                          }}
                          placeholder={localization['UI.Lobby.RoomIdPlaceholder'] || 'UI.Lobby.RoomIdPlaceholder'}
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                        />
                        <span className="form-text text-muted">
                          {localization['UI.Lobby.RoomIdHelper'] || 'UI.Lobby.RoomIdHelper'}
                        </span>
                      </div>
                      <div className="mb-3">
                        <label className="form-label text-light">{localization['UI.Lobby.PlayerName'] || 'UI.Lobby.PlayerName'}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder={localization['UI.Lobby.YourNamePlaceholder'] || 'UI.Lobby.YourNamePlaceholder'}
                          maxLength={30}
                          required
                        />
                      </div>
                      <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success">
                          {localization['UI.Lobby.Join'] || 'UI.Lobby.Join'}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => setIsJoining(false)}
                        >
                          {localization['UI.Lobby.Cancel'] || 'UI.Lobby.Cancel'}
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
                  <h6 className="text-warning mb-2">{localization['UI.Lobby.ContinueSolo'] || 'UI.Lobby.ContinueSolo'}</h6>
                  <button 
                    className="btn btn-warning"
                    onClick={onBack}
                  >
                    {localization['UI.Lobby.CreateSolo'] || 'UI.Lobby.CreateSolo'}
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
