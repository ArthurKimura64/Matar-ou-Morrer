import React, { useState, useEffect } from 'react';

const RoomLobby = ({
  onCreateRoom,
  onJoinRoom,
  onBack,
  onGoSolo,
  localization = {},
  defaultPlayerName = '',
  initialRoomCode = ''
}) => {
  const [roomName, setRoomName] = useState('');
  const [masterName, setMasterName] = useState(defaultPlayerName);
  const [roomId, setRoomId] = useState(initialRoomCode);
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (defaultPlayerName) {
      setMasterName((prev) => prev || defaultPlayerName);
      setPlayerName((prev) => prev || defaultPlayerName);
    }
  }, [defaultPlayerName]);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomId(initialRoomCode);
    }
  }, [initialRoomCode]);

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

  const hasInvite = Boolean(initialRoomCode);

  const createCard = (
    <div key="create" className="col-12 md:col-6 mb-3">
      <div className="card bg-dark border-light h-100">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">✨ {localization['UI.Lobby.CreateRoom'] || 'Criar Nova Sala'}</h5>
        </div>
        <div className="card-body">
          <form onSubmit={handleCreateRoom}>
            <div className="mb-3">
              <label htmlFor="lobby-room-name" className="form-label text-light small">
                {localization['UI.Lobby.RoomName'] || 'Nome da Sala'}
              </label>
              <input
                id="lobby-room-name"
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
              <label htmlFor="lobby-master-name" className="form-label text-light small">
                {localization['UI.Lobby.YourMasterName'] || 'Seu Nome (Anfitrião)'}
              </label>
              <input
                id="lobby-master-name"
                type="text"
                className="form-control"
                value={masterName}
                onChange={(e) => setMasterName(e.target.value)}
                placeholder={localization['UI.Lobby.MasterNamePlaceholder'] || 'Ex: Batman'}
                maxLength={30}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100 fw-bold">
              {localization['UI.Lobby.CreateSala'] || 'Criar Sala'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const joinCard = (
    <div key="join" className="col-12 md:col-6 mb-3">
      <div className={`card bg-dark ${hasInvite ? 'border-success border-3' : 'border-light'} h-100`}>
        <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
          <h5 className="mb-0">🚪 {localization['UI.Lobby.JoinRoom'] || 'Entrar em Sala'}</h5>
          {hasInvite && <span className="badge bg-light text-dark">Convite</span>}
        </div>
        <div className="card-body">
          {hasInvite && (
            <div className="alert alert-success py-2 px-3 small mb-3">
              🔗 Convite detectado para a sala <strong>{initialRoomCode}</strong>! Confirme seu nome e clique em entrar.
            </div>
          )}
          <form onSubmit={handleJoinRoom} noValidate>
            {joinError && (
              <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">
                ⚠️ {joinError}
              </div>
            )}
            <div className="mb-3">
              <label htmlFor="lobby-room-id" className="form-label text-light small">
                {localization['UI.Lobby.RoomId'] || 'ID da Sala'}
              </label>
              <input
                id="lobby-room-id"
                type="text"
                className="form-control fw-bold"
                value={roomId}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setRoomId(value);
                  if (joinError) setJoinError('');
                }}
                placeholder={localization['UI.Lobby.RoomIdPlaceholder'] || '123456'}
                maxLength={6}
                inputMode="numeric"
                required
              />
              <span className="form-text text-muted small">
                {localization['UI.Lobby.RoomIdHelper'] || 'Digite o código de 6 dígitos da sala'}
              </span>
            </div>
            <div className="mb-3">
              <label htmlFor="lobby-player-name" className="form-label text-light small">
                {localization['UI.Lobby.PlayerName'] || 'Seu Nome'}
              </label>
              <input
                id="lobby-player-name"
                type="text"
                className="form-control"
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  if (joinError) setJoinError('');
                }}
                placeholder={localization['UI.Lobby.YourNamePlaceholder'] || 'Ex: João'}
                maxLength={30}
                required
              />
            </div>
            <button type="submit" className="btn btn-success w-100 fw-bold">
              {localization['UI.Lobby.Join'] || 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <section className="container-fluid py-2">
      <div className="row">
        <div className="col-12 text-center">
          <img
            src="/KillOrDieLogo.png"
            alt={localization['Begin.Title'] || 'Matar ou Morrer'}
            className="img-fluid rounded mx-auto d-block my-2"
            style={{ maxHeight: '170px' }}
          />
          <button
            type="button"
            className="btn btn-outline-light btn-sm mb-2"
            onClick={onBack}
          >
            {localization['UI.Menu.BackToMenu'] || '← Voltar ao Menu'}
          </button>
          <h1 className="text-white h2">{localization['UI.Lobby.SystemTitle'] || 'Sistema de Salas'}</h1>
          <p className="text-light mb-3">{localization['UI.Lobby.PlayWithFriends'] || 'Jogue com seus amigos!'}</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-12 md:col-9 lg:col-8">
          <div className="row">
            {hasInvite ? [joinCard, createCard] : [createCard, joinCard]}
          </div>

          <div className="card bg-dark border-warning mt-1">
            <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
              <span className="text-warning small fw-bold">
                👤 {localization['UI.Lobby.ContinueSolo'] || 'Ou continue no modo solo'}
              </span>
              <button
                type="button"
                className="btn btn-warning btn-sm fw-bold px-3"
                onClick={onGoSolo || onBack}
              >
                {localization['UI.Lobby.CreateSolo'] || 'Criar Personagem Solo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoomLobby;