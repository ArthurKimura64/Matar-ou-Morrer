import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RoomService } from '../../services/roomService';
import { CombatService } from '../../services/combatService';
import { useToast } from '../../hooks/useToast';
import { useRoomSync } from '../../hooks/useRoomSync';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  serializeSelections,
  hydrateSelections,
  buildPublicCharacteristicsSummary
} from '../../utils/playerStateCodec';
import CharacterSelection from '../character/CharacterSelection';
import CharacterBuilder from '../character/CharacterBuilder';
import CharacterSheet from '../character/CharacterSheet';
import PlayersSidebar from './PlayersSidebar';
import TableCards from './TableCards';
import MatchBar from './MatchBar';
import CombatPanel from '../combat/CombatPanel';
import ConfirmModal from '../../components/ConfirmModal';
import BaseModal from '../../components/BaseModal';

const RoomView = ({
  room,
  currentPlayer,
  gameData,
  localization = {},
  onLeaveRoom,
  initialInternalView = 'selection',
  initialActor = null,
  initialSelections = null,
  initialPrivateState = null,
  onStateChange = null,
  backInterceptRef = null
}) => {
  const normalizedInitialView =
    initialInternalView === 'lobby' ? 'selection' : initialInternalView || 'selection';

  const [internalView, setInternalView] = useState(normalizedInitialView);
  const [selectedActor, setSelectedActor] = useState(initialActor || null);
  const [characterSelections, setCharacterSelections] = useState(initialSelections || null);
  const [privateState, setPrivateState] = useState(() => ({
    used_items: initialPrivateState?.used_items || [],
    unlocked_items: initialPrivateState?.unlocked_items || [],
    notes: initialPrivateState?.notes || {}
  }));
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [openSidebar, setOpenSidebar] = useState(null);
  const [characterMode, setCharacterMode] = useState('mode1');
  const [playerToKick, setPlayerToKick] = useState(null);
  const [playerToEliminate, setPlayerToEliminate] = useState(null);
  const [masterElimKillerId, setMasterElimKillerId] = useState('');
  const [masterElimLoading, setMasterElimLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [preselectedAttack, setPreselectedAttack] = useState(null);

  const { showToast } = useToast();
  const onStateChangeRef = useRef(onStateChange);
  const hasRestoredInitialSheetRef = useRef(false);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  const roomId = room?.id;
  const currentPlayerId = currentPlayer?.id;

  const closeSimpleSidebar = useCallback(() => setOpenSidebar(null), []);
  useEscapeKey(
    (openSidebar === 'players' || openSidebar === 'table') && !playerToKick && !playerToEliminate && !showLeaveConfirm,
    closeSimpleSidebar
  );

  useEffect(() => {
    if (!backInterceptRef) return;
    backInterceptRef.current = () => {
      if (playerToKick) {
        setPlayerToKick(null);
        return true;
      }
      if (playerToEliminate && !masterElimLoading) {
        setPlayerToEliminate(null);
        return true;
      }
      if (showLeaveConfirm) {
        setShowLeaveConfirm(false);
        return true;
      }
      if (openSidebar) {
        setOpenSidebar(null);
        return true;
      }
      return false;
    };
    return () => {
      if (backInterceptRef) backInterceptRef.current = null;
    };
  }, [
    backInterceptRef,
    openSidebar,
    playerToKick,
    playerToEliminate,
    masterElimLoading,
    showLeaveConfirm
  ]);

  const {
    players,
    roomData,
    currentPlayerData,
    isAlive,
    isInMatch,
    matchStatus,
    loadRoomData,
    applyLocalPlayerPatch,
    applyLocalRoomPatch,
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

  const connectedPlayersCount = useMemo(
    () => players.filter((p) => p.is_connected !== false).length,
    [players]
  );

  const handlePrivateStatePatch = useCallback((patch) => {
    if (!patch) return;
    if (patch.selections) {
      setCharacterSelections(patch.selections);
    }
    setPrivateState((prev) => ({
      ...prev,
      ...(patch.used_items !== undefined ? { used_items: patch.used_items } : {}),
      ...(patch.unlocked_items !== undefined ? { unlocked_items: patch.unlocked_items } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {})
    }));
  }, []);

  // Mescla dados públicos + cofre privado APENAS em memória local (para a Ficha e o Combate)
  const effectiveCurrentPlayer = useMemo(() => {
    const base = currentPlayerData || currentPlayer;
    if (!base) return null;

    const resolvedActor =
      selectedActor ||
      (base.actor_id && gameData?.ActorDefinitions
        ? gameData.ActorDefinitions.find((a) => a.ID === base.actor_id)
        : null) ||
      base.character?.actor ||
      null;

    const resolvedSelections =
      characterSelections ||
      (base.selections && Object.keys(base.selections).length > 0 ? base.selections : null) ||
      base.character?.selections ||
      null;

    return {
      ...base,
      id: base.id || currentPlayer?.id,
      actor_id: resolvedActor?.ID || base.actor_id || null,
      character: resolvedActor
        ? {
            ID: resolvedActor.ID,
            id: resolvedActor.ID,
            actor: resolvedActor,
            selections: resolvedSelections
          }
        : base.character,
      selections: resolvedSelections,
      used_items: privateState.used_items,
      unlocked_items: privateState.unlocked_items,
      _privateNotes: privateState.notes
    };
  }, [currentPlayerData, currentPlayer, selectedActor, characterSelections, privateState, gameData]);

  // Mantém o App.jsx atualizado para restaurar a tela após F5
  useEffect(() => {
    onStateChangeRef.current?.({
      roomInternalView: internalView,
      selectedActor,
      characterSelections
    });
  }, [internalView, selectedActor, characterSelections]);

  // Na carga inicial (F5), restaura ficha ou montagem lendo o cofre privado
  useEffect(() => {
    if (hasRestoredInitialSheetRef.current || players.length === 0) return;

    const myRecord = players.find((p) => p.id === currentPlayerId);
    if (!myRecord) return;

    hasRestoredInitialSheetRef.current = true;

    const restoreFromPrivate = async () => {
      let priv = initialPrivateState;
      if (!priv && currentPlayerId) {
        const res = await RoomService.getPrivateState(currentPlayerId);
        if (res.success && res.data) priv = res.data;
      }

      if (priv) {
        setPrivateState({
          used_items: priv.used_items || [],
          unlocked_items: priv.unlocked_items || [],
          notes: priv.notes || {}
        });
      }

      const actorId = priv?.actor_id || myRecord.actor_id || myRecord.character?.actor?.ID;
      const foundActor =
        actorId && gameData?.ActorDefinitions
          ? gameData.ActorDefinitions.find((a) => a.ID === actorId)
          : null;

      if (myRecord.status === 'ready' || myRecord.status === 'playing') {
        if (foundActor) setSelectedActor(foundActor);
        const rawSel = priv?.selections || myRecord.selections || myRecord.character?.selections;
        if (rawSel) setCharacterSelections(hydrateSelections(rawSel, gameData));
        setInternalView('sheet');
      } else if (myRecord.status === 'creating' && foundActor) {
        setSelectedActor((prev) => prev || foundActor);
        setInternalView('building');
      }
    };

    restoreFromPrivate();
  }, [players, currentPlayerId, gameData, initialPrivateState]);

  const handleTogglePlayers = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'players' ? null : 'players'));
  }, []);

  const handleToggleTableCards = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'table' ? null : 'table'));
  }, []);

  const handleToggleCombat = useCallback(() => {
    setOpenSidebar((prev) => (prev === 'combat' ? null : 'combat'));
  }, []);

  const handleQuickAttack = useCallback((item) => {
    if (!item?.ID) return;
    setPreselectedAttack({ id: item.ID, ts: Date.now() });
    setOpenSidebar('combat');
  }, []);

  const handleConsumePreselectedAttack = useCallback(() => {
    setPreselectedAttack(null);
  }, []);

  const handleHideTableCard = useCallback(
    async (itemId) => {
      if (!currentPlayerId) return;
      const currentExposed = Array.isArray(currentPlayerData?.exposed_cards)
        ? currentPlayerData.exposed_cards
        : [];
      const nextExposed = currentExposed.filter((id) => id !== itemId);

      applyLocalPlayerPatch({ exposed_cards: nextExposed });
      await RoomService.updatePlayerFields(currentPlayerId, {
        exposed_cards: nextExposed
      });
    },
    [currentPlayerId, currentPlayerData?.exposed_cards, applyLocalPlayerPatch]
  );

  // 1. Escolher personagem (bloqueia na sala sem vazar cartas)
  const handleActorSelect = async (actor) => {
    const characterName = String(localization[`Character.Name.${actor.ID}`] ?? actor.ID ?? '').trim();

    const takenBy = players.find((p) => {
      if (p.id === currentPlayerId || p.is_connected === false) return false;
      if (!['creating', 'ready', 'playing'].includes(p.status)) return false;
      const pActorId = p.actor_id ?? p.character?.actor?.ID ?? p.character?.ID;
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
    setPrivateState({ used_items: [], unlocked_items: [], notes: {} });
    setInternalView('building');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const publicPatch = {
        status: 'creating',
        actor_id: actor.ID,
        character_name: characterName,
        character: null,
        selections: {}
      };

      applyLocalPlayerPatch(publicPatch);
      const [pubRes] = await Promise.all([
        RoomService.updatePlayerFields(currentPlayerId, publicPatch),
        RoomService.savePrivateState(currentPlayerId, {
          actor_id: actor.ID,
          selections: {},
          used_items: [],
          unlocked_items: [],
          notes: {}
        })
      ]);
      if (!pubRes.success) {
        showToast('Erro ao sincronizar escolha do personagem.', 'error');
      }
    }
  };

  // 2. Salvar rascunho durante a montagem
  const handleDraftChange = useCallback((draftSelections) => {
    setCharacterSelections(draftSelections);
  }, []);

  // 3. Confirmar personagem pronto
  const handleCharacterCreate = async (selections) => {
    hasRestoredInitialSheetRef.current = true;
    setCharacterSelections(selections);
    setPrivateState({ used_items: [], unlocked_items: [], notes: {} });
    setInternalView('sheet');

    const characterName = String(
      localization[`Character.Name.${selectedActor.ID}`] ?? selectedActor.ID ?? ''
    ).trim();

    if (currentPlayerId) {
      const publicSummary = buildPublicCharacteristicsSummary({
        actor: selectedActor,
        selections
      });

      const publicPatch = {
        status: 'ready',
        actor_id: selectedActor.ID,
        character_name: characterName,
        defense_dice_count: selectedActor.defenseDices ?? 0,
        characteristics: publicSummary,
        character: null,
        selections: {},
        used_items: [],
        unlocked_items: []
      };

      applyLocalPlayerPatch(publicPatch);
      const [pubRes, privRes] = await Promise.all([
        RoomService.updatePlayerFields(currentPlayerId, publicPatch),
        RoomService.savePrivateState(currentPlayerId, {
          actor_id: selectedActor.ID,
          selections: serializeSelections(selections),
          used_items: [],
          unlocked_items: [],
          notes: {}
        })
      ]);
      if (!pubRes.success || !privRes.success) {
        showToast('Erro ao salvar personagem na sala.', 'error');
      }
    }
  };

  // Voltar da montagem para a seleção
  const handleBackToSelection = async () => {
    hasRestoredInitialSheetRef.current = true;
    setSelectedActor(null);
    setCharacterSelections(null);
    setPrivateState({ used_items: [], unlocked_items: [], notes: {} });
    setInternalView('selection');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const patch = {
        status: 'selecting',
        actor_id: null,
        character: null,
        character_name: null,
        defense_dice_count: null
      };
      applyLocalPlayerPatch(patch);
      await Promise.all([
        RoomService.updatePlayerFields(currentPlayerId, patch),
        RoomService.savePrivateState(currentPlayerId, { actor_id: null, selections: {} })
      ]);
    }
  };

  // Reiniciar ficha
  const handleBackToLobby = useCallback(async () => {
    hasRestoredInitialSheetRef.current = true;
    setSyncPaused(true);
    clearFieldLocks();

    setSelectedActor(null);
    setCharacterSelections(null);
    setPrivateState({ used_items: [], unlocked_items: [], notes: {} });
    setInternalView('selection');
    setCharacterMode('mode1');

    if (currentPlayerId) {
      const localPatch = {
        status: 'selecting',
        actor_id: null,
        character: null,
        character_name: null,
        defense_dice_count: null,
        selections: {},
        counters: {},
        characteristics: {},
        additional_counters: {},
        used_items: [],
        unlocked_items: [],
        exposed_cards: []
      };

      applyLocalPlayerPatch(localPatch);

      try {
        await RoomService.resetPlayerForLobby(currentPlayerId);
      } finally {
        setSyncPaused(false);
      }
    } else {
      setSyncPaused(false);
    }
  }, [currentPlayerId, applyLocalPlayerPatch, clearFieldLocks, setSyncPaused]);

  const handleLeaveRoom = async () => {
    if (currentPlayerId) {
      try {
        await CombatService.cancelPlayerCombats(currentPlayerId);
      } catch (e) {
        console.warn('Aviso ao limpar combates na saída:', e);
      }
      await RoomService.flushPlayerUpdates(currentPlayerId);

      // Se o jogador faz parte da partida atual, apenas desconecta para preservar histórico e abates
      const preserveForMatch = matchStatus === 'in_progress' && isInMatch;

      await RoomService.leaveRoom(currentPlayerId, { preserveForMatch });
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

  const handleConfirmMasterEliminate = useCallback(async () => {
    if (!playerToEliminate || masterElimLoading) return;
    setMasterElimLoading(true);
    try {
      const res = await RoomService.masterEliminatePlayer(
        roomId,
        playerToEliminate.id,
        masterElimKillerId || null
      );
      if (!res.success) {
        showToast('Erro ao eliminar jogador: ' + res.error, 'error');
      } else {
        showToast(`☠️ ${playerToEliminate.name} foi marcado como eliminado.`, 'info');
        setPlayerToEliminate(null);
        setMasterElimKillerId('');
        clearFieldLocks();
        broadcastRoomSync(null, { fullSync: true, clearLocks: true });
        loadRoomData();
      }
    } finally {
      setMasterElimLoading(false);
    }
  }, [
    playerToEliminate,
    masterElimKillerId,
    masterElimLoading,
    roomId,
    showToast,
    clearFieldLocks,
    broadcastRoomSync,
    loadRoomData
  ]);

  const handleMatchSync = useCallback(
    (roomPatch = null) => {
      clearFieldLocks();
      if (roomPatch) {
        applyLocalRoomPatch(roomPatch, { fullSync: true, clearLocks: true });
      } else {
        broadcastRoomSync(null, { fullSync: true, clearLocks: true });
      }
      loadRoomData();
    },
    [clearFieldLocks, applyLocalRoomPatch, broadcastRoomSync, loadRoomData]
  );

  const handleCopyRoomId = () => {
    if (!roomId) return;
    if (!navigator.clipboard?.writeText) {
      showToast(`Copie o código manualmente: ${roomId}`, 'info');
      return;
    }
    navigator.clipboard
      .writeText(roomId)
      .then(() => {
        setCopiedCode(true);
        showToast(`Código ${roomId} copiado!`, 'success');
        setTimeout(() => setCopiedCode(false), 2000);
      })
      .catch(() => {
        showToast(`Não foi possível copiar. Código da sala: ${roomId}`, 'warning');
      });
  };

  const handleCopyInviteLink = () => {
    if (!roomId) return;
    const inviteUrl = `${window.location.origin}/sala/${roomId}`;
    if (!navigator.clipboard?.writeText) {
      showToast(`Copie o link manualmente: ${inviteUrl}`, 'info');
      return;
    }
    navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopiedLink(true);
        showToast('🔗 Link de convite copiado! Envie para seus amigos.', 'success');
        setTimeout(() => setCopiedLink(false), 2000);
      })
      .catch(() => {
        showToast('Não foi possível copiar o link automaticamente.', 'warning');
      });
  };

  // Só bloqueia confirmar um novo personagem se o jogador estiver VIVO na partida atual
  const canConfirmCharacter = !(matchStatus === 'in_progress' && isInMatch && isAlive);

  return (
    <div className="container py-3 room-view-container">
      {/* Cabeçalho da Sala */}
      <header className="card bg-dark border-light mb-3">
        <div className="card-body py-2 px-3 d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div className="text-start">
            <h5 className="text-white fw-bold mb-0" style={{ lineHeight: 1.25 }}>
              {roomData?.name || room?.name}
            </h5>
            <small className="text-muted">
              {localization['UI.Room.Master'] || 'Anfitrião'}{' '}
              {roomData?.master_name || room?.master_name} |{' '}
              {localization['UI.Room.Players'] || 'Jogadores'} {connectedPlayersCount}
            </small>
          </div>

          <div className="d-flex align-items-center gap-2 ms-auto">
            <button
              type="button"
              onClick={handleCopyRoomId}
              className="btn btn-outline-light btn-sm fw-bold px-3"
              style={{ borderWidth: '1.5px' }}
              title={localization['UI.Room.CopyRoomId'] || 'Clique para copiar o código da sala'}
            >
              {copiedCode ? '✅' : '📋'} {roomId}
            </button>
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="btn btn-outline-info btn-sm fw-bold px-3"
              title="Copiar link direto para entrar nesta sala"
            >
              {copiedLink ? '✅ Link' : '🔗 Convidar'}
            </button>

            <button
              type="button"
              onClick={() => setShowLeaveConfirm(true)}
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
        isInMatch={isInMatch}
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
              canConfirmCharacter={canConfirmCharacter}
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
              onPrivateStatePatch={handlePrivateStatePatch}
              currentPlayer={effectiveCurrentPlayer}
              players={players}
              matchStatus={matchStatus}
              isAlive={isAlive}
              isInMatch={isInMatch}
              currentMode={characterMode}
              onChangeMode={setCharacterMode}
              onQuickAttack={handleQuickAttack}
              matchStartedAt={roomData?.match_started_at}
            />
          )}
        </div>
      </section>

      {/* 1. Gaveta Lateral: Cartas na Mesa (👁️) */}
      <TableCards
        players={players}
        currentPlayerId={currentPlayerId}
        onHideCard={handleHideTableCard}
        gameData={gameData}
        localization={localization}
        isOpen={openSidebar === 'table'}
        onToggle={handleToggleTableCards}
      />

      {/* 2. Gaveta Lateral: Painel de Combate (⚔️) */}
      <CombatPanel
        currentPlayer={effectiveCurrentPlayer}
        currentPlayerData={effectiveCurrentPlayer}
        players={players}
        roomId={roomId}
        localization={localization}
        isOpen={openSidebar === 'combat'}
        onToggle={handleToggleCombat}
        matchStatus={matchStatus}
        combatMode={characterMode}
        onChangeCombatMode={setCharacterMode}
        preselectedAttack={preselectedAttack}
        onConsumePreselectedAttack={handleConsumePreselectedAttack}
      />

      {/* 3. Gaveta Lateral: Jogadores Conectados (👥) */}
      <PlayersSidebar
        players={players}
        currentPlayer={currentPlayerData}
        localization={localization}
        gameData={gameData}
        room={roomData}
        onKickPlayer={setPlayerToKick}
        onEliminatePlayer={(target) => {
          setMasterElimKillerId('');
          setPlayerToEliminate(target);
        }}
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

      <ConfirmModal
        show={showLeaveConfirm}
        title={`🚪 ${localization['UI.Room.LeaveRoom'] || 'Sair da Sala'}`}
        message={
          matchStatus === 'in_progress' && isInMatch && isAlive
            ? 'Há uma partida em andamento. Tem certeza que deseja sair da sala agora?'
            : 'Tem certeza que deseja sair desta sala?'
        }
        confirmLabel={localization['UI.Room.LeaveRoom'] || 'Sair da Sala'}
        cancelLabel={localization['UI.Common.Cancel'] || 'Cancelar'}
        confirmVariant="danger"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          handleLeaveRoom();
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />
      <BaseModal
        show={Boolean(playerToEliminate)}
        onClose={() => !masterElimLoading && setPlayerToEliminate(null)}
        title="☠️ Eliminar Jogador da Partida"
        subtitle={
          playerToEliminate
            ? `Marcar ${playerToEliminate.name} como eliminado (ação de Anfitrião)`
            : ''
        }
        borderVariant="warning"
        maxWidth="460px"
        disableClose={masterElimLoading}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm px-3"
              disabled={masterElimLoading}
              onClick={() => setPlayerToEliminate(null)}
            >
              {localization['UI.Common.Cancel'] || 'Cancelar'}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm fw-bold px-3"
              disabled={masterElimLoading}
              onClick={handleConfirmMasterEliminate}
            >
              {masterElimLoading ? '⏳ Eliminando...' : '☠️ Confirmar Eliminação'}
            </button>
          </>
        }
      >
        <p className="text-light small mb-3">
          Use esta opção caso <strong>{playerToEliminate?.name}</strong> tenha perdido conexão ou saído da sala sem declarar eliminação.
        </p>
        <label htmlFor="master-elim-killer" className="form-label text-light small">
          Quem eliminou este jogador? (opcional)
        </label>
        <select
          id="master-elim-killer"
          className="form-select form-select-sm"
          value={masterElimKillerId}
          disabled={masterElimLoading}
          onChange={(e) => setMasterElimKillerId(e.target.value)}
        >
          <option value="">🚫 Ninguém / Desconexão</option>
          {players
            .filter((p) => p.in_match === true && p.id !== playerToEliminate?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                ⚔️ {p.name} {p.match_character_name || p.character_name ? `(${p.match_character_name || p.character_name})` : ''}
              </option>
            ))}
        </select>
      </BaseModal>
    </div>
  );
};

export default RoomView;