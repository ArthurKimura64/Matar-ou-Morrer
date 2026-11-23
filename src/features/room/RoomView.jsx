import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoomService } from '../../services/roomService';
import { CombatService } from '../../services/combatService'
import { useToast } from '../../hooks/useToast';
import { useRoomSync } from '../../hooks/useRoomSync';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import CharacterSelection from '../character/CharacterSelection';
import CharacterBuilder from '../character/CharacterBuilder';
import CharacterSheet from '../character/CharacterSheet';
import PlayersSidebar from './PlayersSidebar';
import TableCards from './TableCards';
import MatchBar from './MatchBar';
import CombatPanel from '../combat/CombatPanel';
import ConfirmModal from '../../components/ConfirmModal';

const RoomView = ({
  room,
  currentPlayer,
  gameData,
  localization = {},
  onLeaveRoom,
  initialInternalView = 'selection',
  initialActor = null,
  initialSelections = null,
  onStateChange = null
}) => {
  const normalizedInitialView =
    initialInternalView === 'lobby' ? 'selection' : initialInternalView || 'selection';

  const [internalView, setInternalView] = useState(normalizedInitialView);
  const [selectedActor, setSelectedActor] = useState(initialActor || null);
  const [characterSelections, setCharacterSelections] = useState(initialSelections || null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [openSidebar, setOpenSidebar] = useState(null);
  const [characterMode, setCharacterMode] = useState('mode1');
  const [playerToKick, setPlayerToKick] = useState(null);

  const { showToast, ToastComponent } = useToast();
  const onStateChangeRef = useRef(onStateChange);
  const hasRestoredInitialSheetRef = useRef(false);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  const roomId = room?.id;
  const currentPlayerId = currentPlayer?.id;

  // Fecha as gavetas de Jogadores ou Cartas na Mesa com Esc (sem interferir nos modais do Combate)
  const closeSimpleSidebar = useCallback(() => setOpenSidebar(null), []);
  useEscapeKey(
    (openSidebar === 'players' || openSidebar === 'table') && !playerToKick,
    closeSimpleSidebar
  );

  // Toda a sincronização em tempo real fica isolada no hook useRoomSync
  const {
    players,
    roomData,
    currentPlayerData,
    isAlive,
    matchStatus,
    loadRoomData,
    applyLocalPlayerPatch,
    broadcastRoomSync,
    clearFieldLocks,
    setSyncPaused
  } = useRoomSync({
    room,
    currentPlayer,
    onLeaveRoom,
    showToast,
    localization
  });

  // Mantém o App.js atualizado para restaurar a tela após F5
  useEffect(() => {
    onStateChangeRef.current?.({
      roomInternalView: internalView,
      selectedActor,
      characterSelections
    });
  }, [internalView, selectedActor, characterSelections]);

  // Na carga inicial (F5), restaura ficha pronta ou montagem em andamento
  useEffect(() => {
    if (hasRestoredInitialSheetRef.current || players.length === 0) return;

    const myRecord = players.find((p) => p.id === currentPlayerId);
    if (!myRecord) return;

    hasRestoredInitialSheetRef.current = true;

    if (
      (myRecord.status === 'ready' || myRecord.status === 'playing') &&
      myRecord.character?.actor &&
      (myRecord.character?.selections || myRecord.selections)
    ) {
      setSelectedActor(myRecord.character.actor);
      setCharacterSelections(myRecord.character.selections || myRecord.selections);
      setInternalView('sheet');
    } else if (myRecord.status === 'creating' && myRecord.character?.actor) {
      setSelectedActor((prev) => prev || myRecord.character.actor);
      setInternalView('building');
    }
  }, [players, currentPlayerId]);

  const handleTogglePlayers = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'players' ? null : 'players'));
  }, []);

  const handleToggleTableCards = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'table' ? null : 'table'));
  }, []);

  const handleToggleCombat = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'combat' ? null : 'combat'));
  }, []);

  // 1. Escolher personagem (bloqueia imediatamente para os outros jogadores da sala)
  const handleActorSelect = async (actor) => {
    const characterName = String(localization[`Character.Name.${actor.ID}`] ?? actor.ID ?? '').trim();

    const takenBy = players.find((p) => {
      if (p.id === currentPlayerId || p.is_connected === false) return false;
      if (!['creating', 'ready', 'playing'].includes(p.status)) return false;
      const pActorId = p.character?.actor?.ID ?? p.character?.ID;
      const pCharName = String(p.character_name ?? '').trim();
      return (
        (pActorId !== undefined && pActorId !== null && String(pActorId) === String(actor.ID)) ||
        (pCharName !== '' && pCharName === characterName)
      );
    });

    if (takenBy) {
      showToast(`🔒 ${characterName} já está sendo usado por ${takenBy.name}!`, 'warning');
      return;
    }

    hasRestoredInitialSheetRef.current = true;
    setSelectedActor(actor);
    setCharacterSelections({});
    setInternalView('building');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const creatingChar = { ID: actor.ID, id: actor.ID, actor };
      const patch = {
        status: 'creating',
        character: creatingChar,
        character_name: characterName
      };

      applyLocalPlayerPatch(patch);
      const res = await RoomService.updatePlayerFields(currentPlayerId, patch);
      if (!res.success) {
        showToast('Erro ao sincronizar escolha do personagem.', 'error');
      }
    }
  };

  // 2. Salvar rascunho das cartas durante a montagem (sobrevive ao F5)
  const handleDraftChange = useCallback((draftSelections) => {
    setCharacterSelections(draftSelections);
  }, []);

  // 3. Confirmar personagem pronto
  const handleCharacterCreate = async (selections) => {
    hasRestoredInitialSheetRef.current = true;
    setCharacterSelections(selections);
    setInternalView('sheet');

    const characterName = String(
      localization[`Character.Name.${selectedActor.ID}`] ?? selectedActor.ID ?? ''
    ).trim();
    const characterData = {
      ID: selectedActor.ID,
      id: selectedActor.ID,
      actor: selectedActor,
      selections
    };

    if (currentPlayerId) {
      const patch = {
        status: 'ready',
        character: characterData,
        character_name: characterName,
        selections
      };

      applyLocalPlayerPatch(patch);
      const res = await RoomService.updatePlayerFields(currentPlayerId, patch);
      if (!res.success) {
        showToast('Erro ao salvar personagem na sala.', 'error');
      }
    }
  };

  // Voltar da montagem para a seleção de personagens
  const handleBackToSelection = async () => {
    hasRestoredInitialSheetRef.current = true;
    setSelectedActor(null);
    setCharacterSelections(null);
    setInternalView('selection');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const patch = {
        status: 'selecting',
        character: null,
        character_name: null
      };
      applyLocalPlayerPatch(patch);
      await RoomService.updatePlayerFields(currentPlayerId, patch);
    }
  };

  // Reiniciar ficha preservando ever_exposed_cards (Copiador) via RoomService
  const handleBackToLobby = useCallback(async () => {
    hasRestoredInitialSheetRef.current = true;
    setSyncPaused(true);
    clearFieldLocks();

    setSelectedActor(null);
    setCharacterSelections(null);
    setInternalView('selection');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const localPatch = {
        status: 'selecting',
        character: null,
        selections: null,
        counters: null,
        characteristics: null,
        additional_counters: null,
        used_items: [],
        unlocked_items: [],
        exposed_cards: []
      };

      if (currentPlayerData?.elimination_order == null) {
        localPatch.character_name = null;
      }

      applyLocalPlayerPatch(localPatch);

      try {
        await RoomService.resetPlayerForLobby(currentPlayerId);
      } finally {
        setSyncPaused(false);
      }
    } else {
      setSyncPaused(false);
    }
  }, [
    currentPlayerId,
    currentPlayerData?.elimination_order,
    applyLocalPlayerPatch,
    clearFieldLocks,
    setSyncPaused
  ]);

  const handleLeaveRoom = async () => {
    if (currentPlayerId) {
      try {
        await CombatService.cancelPlayerCombats(currentPlayerId);
      } catch (e) {
        console.warn('Aviso ao limpar combates na saída:', e);
      }
      await RoomService.flushPlayerUpdates(currentPlayerId);
      await RoomService.leaveRoom(currentPlayerId);
      broadcastRoomSync(null, { fullSync: true });
    }
    onLeaveRoom();
  };

  const handleConfirmKickPlayer = useCallback(async () => {
    if (!playerToKick) return;
    const target = playerToKick;
    setPlayerToKick(null);

    try {
      const result = await RoomService.kickPlayer(roomId, target.id, currentPlayerId);
      if (!result.success) {
        showToast(
          (localization['UI.Room.KickError'] || 'Erro ao expulsar jogador: ') + result.error,
          'error'
        );
      } else {
        showToast(`${target.name} foi removido da sala.`, 'info');
        loadRoomData();
        broadcastRoomSync(null, { fullSync: true });
      }
    } catch (error) {
      console.error('Erro ao expulsar jogador:', error);
    }
  }, [
    playerToKick,
    roomId,
    currentPlayerId,
    localization,
    showToast,
    loadRoomData,
    broadcastRoomSync
  ]);

  const handleMatchSync = useCallback(() => {
    clearFieldLocks();
    loadRoomData();
    broadcastRoomSync(null, { fullSync: true, clearLocks: true });
  }, [clearFieldLocks, loadRoomData, broadcastRoomSync]);

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setCopiedCode(true);
      showToast(`Código ${roomId} copiado!`, 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  return (
    <div className="container py-3">
      {/* Cabeçalho da Sala */}
      <header className="card bg-dark border-light mb-3">
        <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div className="text-start">
            <h5 className="text-white fw-bold mb-0" style={{ lineHeight: 1.25 }}>
              {roomData?.name || room?.name}
            </h5>
            <small className="text-muted">
              {localization['UI.Room.Host'] || 'Anfitrião'}{' '}
              {roomData?.master_name || room?.master_name} |{' '}
              {localization['UI.Room.Players'] || 'Jogadores'} {players.length}
            </small>
          </div>

          <div className="d-flex align-items-center gap-2 ms-auto">
            <button
              type="button"
              onClick={handleCopyRoomId}
              className="btn btn-outline-light btn-sm fw-bold px-3"
              style={{ borderWidth: '1.5px' }}
              title={localization['UI.Room.CopyCode'] || 'Clique para copiar o código da sala'}
            >
              {copiedCode ? '✅' : '📋'} {roomId}
            </button>

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="btn btn-outline-danger btn-sm px-3"
            >
              {localization['UI.Room.LeaveRoom'] || 'Sair da Sala'}
            </button>
          </div>
        </div>
      </header>

      {/* Barra de Controle de Partida */}
      <MatchBar
        room={roomData}
        roomId={roomId}
        currentPlayer={currentPlayerData}
        players={players}
        matchStatus={matchStatus}
        isAlive={isAlive}
        onMatchUpdate={handleMatchSync}
        localization={localization}
      />

      {/* Área Principal do Jogo */}
      <section className="row justify-content-center" aria-label="Área da sala">
        <div className="col-12">
          {internalView === 'selection' && gameData && (
            <CharacterSelection
              gameData={gameData}
              players={players}
              currentPlayerId={currentPlayerId}
              currentPlayer={currentPlayerData}
              localization={localization}
              onCharacterSelect={handleActorSelect}
            />
          )}

          {internalView === 'building' && selectedActor && (
            <CharacterBuilder
              key={selectedActor.ID}
              actor={selectedActor}
              gameData={gameData}
              localization={localization}
              initialSelections={characterSelections}
              onDraftChange={handleDraftChange}
              onCharacterCreate={handleCharacterCreate}
              onBack={handleBackToSelection}
              matchStatus={matchStatus}
            />
          )}

          {internalView === 'sheet' && selectedActor && characterSelections && (
            <CharacterSheet
              actor={selectedActor}
              selections={characterSelections}
              gameData={gameData}
              localization={localization}
              onReset={handleBackToLobby}
              onPlayerPatch={applyLocalPlayerPatch}
              currentPlayer={currentPlayerData}
              players={players}
              matchStatus={matchStatus}
              isAlive={isAlive}
              currentMode={characterMode}
              onChangeMode={setCharacterMode}
            />
          )}
        </div>
      </section>

      {/* 1. Gaveta Lateral: Cartas na Mesa (👁️) */}
      <TableCards
        players={players}
        gameData={gameData}
        localization={localization}
        isOpen={openSidebar === 'table'}
        onToggle={handleToggleTableCards}
      />

      {/* 2. Gaveta Lateral: Painel de Combate (⚔️) */}
      <CombatPanel
        currentPlayer={currentPlayerData}
        currentPlayerData={currentPlayerData}
        players={players}
        roomId={roomId}
        localization={localization}
        isOpen={openSidebar === 'combat'}
        onToggle={handleToggleCombat}
        matchStatus={matchStatus}
        combatMode={characterMode}
        onChangeCombatMode={setCharacterMode}
      />

      {/* 3. Gaveta Lateral: Jogadores Conectados (👥) */}
      <PlayersSidebar
        players={players}
        currentPlayer={currentPlayerData}
        localization={localization}
        gameData={gameData}
        room={roomData}
        onKickPlayer={setPlayerToKick}
        isOpen={openSidebar === 'players'}
        onToggle={handleTogglePlayers}
        matchStatus={matchStatus}
      />

      <ConfirmModal
        show={Boolean(playerToKick)}
        title={`👢 ${localization['UI.Room.KickPlayer'] || 'Expulsar jogador'}`}
        message={
          playerToKick
            ? `Tem certeza que deseja expulsar ${playerToKick.name} da sala?`
            : ''
        }
        confirmLabel={localization['UI.Room.KickPlayer'] || 'Expulsar'}
        cancelLabel={localization['UI.Common.Cancel'] || 'Cancelar'}
        confirmVariant="danger"
        onConfirm={handleConfirmKickPlayer}
        onCancel={() => setPlayerToKick(null)}
      />

      <ToastComponent />
    </div>
  );
};

export default RoomView;