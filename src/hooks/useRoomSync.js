import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';
import { RoomService } from '../services/roomService';

/**
 * ============================================================================
 * HOOK DE SINCRONIZAÇÃO DA SALA (useRoomSync.js)
 * ============================================================================
 * O QUE ESTE HOOK FAZ:
 * Centraliza toda a comunicação em tempo real da sala multiplayer:
 * 1. Carrega jogadores conectados e dados da sala.
 * 2. Sincroniza mudanças instantâneas via Broadcast + Postgres Changes + Polling 3s.
 * 3. Mantém o jogador online (heartbeat a cada 40s e reconexão ao voltar à aba).
 * 4. Dispara avisos quando alguém expõe uma carta (👁️) ou é eliminado (☠️).
 * ============================================================================
 */
export const useRoomSync = ({
  room,
  currentPlayer,
  onLeaveRoom,
  showToast,
  localization = {}
}) => {
  const [players, setPlayers] = useState([]);
  const [roomData, setRoomData] = useState(room);

  const roomId = room?.id;
  const currentPlayerId = currentPlayer?.id;
  const matchStatus = roomData?.match_status || null;

  const currentPlayerData = useMemo(
    () => players.find((p) => p.id === currentPlayerId) || currentPlayer,
    [players, currentPlayerId, currentPlayer]
  );

  const isAlive = currentPlayerData?.is_alive !== false;

  // Refs estáveis para evitar recriar canais do Supabase a cada render
  const onLeaveRoomRef = useRef(onLeaveRoom);
  const showToastRef = useRef(showToast);
  const localizationRef = useRef(localization);
  useEffect(() => { onLeaveRoomRef.current = onLeaveRoom; }, [onLeaveRoom]);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { localizationRef.current = localization; }, [localization]);

  const broadcastChannelRef = useRef(null);
  const lastPlayersHashRef = useRef('');
  const lastRoomHashRef = useRef('');
  const loadSeqRef = useRef(0);
  const isSyncPausedRef = useRef(false);
  const isReconnectingRef = useRef(false);

  // Travas curtas por campo (impedem leituras antigas do banco de sobrescrever cliques recentes)
  const fieldLocksRef = useRef({});
  const sessionIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const broadcastSeqRef = useRef(0);
  const remoteSeqRef = useRef({});

  const setSyncPaused = useCallback((paused) => {
    isSyncPausedRef.current = Boolean(paused);
  }, []);

  const clearFieldLocks = useCallback(() => {
    fieldLocksRef.current = {};
  }, []);

  const lockPlayerFields = useCallback((playerId, patch, durationMs = 2500) => {
    if (!playerId || !patch) return;
    const until = Date.now() + durationMs;
    if (!fieldLocksRef.current[playerId]) {
      fieldLocksRef.current[playerId] = {};
    }
    Object.entries(patch).forEach(([key, value]) => {
      if (key === 'id') return;
      fieldLocksRef.current[playerId][key] = { value, until };
    });
  }, []);

  const mergeWithFieldLocks = useCallback((playerRow) => {
    if (!playerRow?.id) return playerRow;
    const locks = fieldLocksRef.current[playerRow.id];
    if (!locks) return playerRow;

    const now = Date.now();
    let merged = null;
    let hasActiveLock = false;

    Object.keys(locks).forEach((key) => {
      if (locks[key].until > now) {
        hasActiveLock = true;
        if (!merged) merged = { ...playerRow };
        merged[key] = locks[key].value;
      } else {
        delete locks[key];
      }
    });

    if (!hasActiveLock) {
      delete fieldLocksRef.current[playerRow.id];
    }

    return merged || playerRow;
  }, []);

  const broadcastRoomSync = useCallback(
    (playerPatch = null, { fullSync = false, roomPatch = null, clearLocks = false } = {}) => {
      if (!broadcastChannelRef.current) return;
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'room_sync',
        payload: {
          senderId: currentPlayerId,
          sessionId: sessionIdRef.current,
          seq: ++broadcastSeqRef.current,
          playerPatch,
          roomPatch,
          fullSync,
          clearLocks,
          ts: Date.now()
        }
      });
    },
    [currentPlayerId]
  );

  // Atualiza o jogador local na tela imediatamente e avisa os outros via Broadcast
  const applyLocalPlayerPatch = useCallback(
    (patch, { fullSync = false } = {}) => {
      if (!currentPlayerId || !patch) return;
      const fullPatch = { id: currentPlayerId, ...patch };
      lockPlayerFields(currentPlayerId, fullPatch, 2500);

      setPlayers((prev) => {
        const updated = prev.map((p) =>
          p.id === currentPlayerId ? { ...p, ...fullPatch } : p
        );
        lastPlayersHashRef.current = JSON.stringify(updated);
        return updated;
      });

      broadcastRoomSync(fullPatch, { fullSync });
    },
    [currentPlayerId, lockPlayerFields, broadcastRoomSync]
  );

  const verifyOrReconnectCurrentPlayer = useCallback(async () => {
    if (!currentPlayerId || !roomId || isReconnectingRef.current) return;
    isReconnectingRef.current = true;

    try {
      const { data: myRow, error } = await supabase
        .from('players')
        .select('id, room_id, is_connected')
        .eq('id', currentPlayerId)
        .maybeSingle();

      if (error || !myRow) {
        showToastRef.current?.(
          localizationRef.current['UI.Room.RemovedFromRoom'] || 'Você foi removido da sala.',
          'error'
        );
        onLeaveRoomRef.current?.();
        return;
      }

      if (myRow.is_connected === false) {
        await RoomService.reconnectPlayer(currentPlayerId);
        broadcastRoomSync({ id: currentPlayerId, is_connected: true }, { fullSync: true });
      }
    } catch (err) {
      console.warn('Falha ao verificar reconexão:', err);
    } finally {
      isReconnectingRef.current = false;
    }
  }, [currentPlayerId, roomId, broadcastRoomSync]);

  const loadRoomData = useCallback(async () => {
    if (!roomId || isSyncPausedRef.current) return;

    const reqSeq = ++loadSeqRef.current;

    try {
      const [playersRes, roomRes] = await Promise.all([
        RoomService.getRoomPlayers(roomId, true),
        RoomService.getRoomById(roomId)
      ]);

      if (isSyncPausedRef.current || reqSeq !== loadSeqRef.current) return;

      if (playersRes.success && Array.isArray(playersRes.players)) {
        const activePlayers = playersRes.players.map(mergeWithFieldLocks);

        if (currentPlayerId && !activePlayers.some((p) => p.id === currentPlayerId)) {
          await verifyOrReconnectCurrentPlayer();
        } else {
          const nextHash = JSON.stringify(activePlayers);
          if (nextHash !== lastPlayersHashRef.current) {
            lastPlayersHashRef.current = nextHash;
            setPlayers(activePlayers);
          }
        }
      }

      if (!roomRes.success || !roomRes.room) {
        showToastRef.current?.('Esta sala foi encerrada.', 'info');
        onLeaveRoomRef.current?.();
        return;
      }

      const nextRoomHash = JSON.stringify(roomRes.room);
      if (nextRoomHash !== lastRoomHashRef.current) {
        lastRoomHashRef.current = nextRoomHash;
        setRoomData(roomRes.room);
      }
    } catch (err) {
      console.error('Erro ao sincronizar dados da sala:', err);
    }
  }, [roomId, currentPlayerId, mergeWithFieldLocks, verifyOrReconnectCurrentPlayer]);

  // Heartbeat (40s) + reconexão ao voltar para a aba ou internet retornar
  useEffect(() => {
    if (!currentPlayerId || !roomId) return;

    const sendHeartbeat = () => {
      if (document.visibilityState === 'visible') {
        RoomService.updatePlayerFields(currentPlayerId, { is_connected: true });
      }
    };

    const handleResume = async () => {
      if (document.visibilityState === 'visible') {
        await verifyOrReconnectCurrentPlayer();
        await loadRoomData();
      }
    };

    const handleOnline = async () => {
      await verifyOrReconnectCurrentPlayer();
      await loadRoomData();
    };

    const heartbeatTimer = setInterval(sendHeartbeat, 40000);
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentPlayerId, roomId, verifyOrReconnectCurrentPlayer, loadRoomData]);

  // Avisos automáticos de Carta Exposta (👁️) e Eliminação (☠️)
  const prevPlayersSnapRef = useRef({});
  useEffect(() => {
    const prevSnap = prevPlayersSnapRef.current;
    const nextSnap = {};

    players.forEach((p) => {
      const exposedCount = Array.isArray(p.exposed_cards) ? p.exposed_cards.length : 0;
      const isAliveNow = p.is_alive !== false;
      nextSnap[p.id] = { exposedCount, isAliveNow, name: p.name };

      const old = prevSnap[p.id];
      if (old && p.id !== currentPlayerId) {
        if (exposedCount > old.exposedCount) {
          showToastRef.current?.(`👁️ ${p.name} expôs uma carta na mesa!`, 'info');
        }
        if (old.isAliveNow && !isAliveNow && matchStatus === 'in_progress') {
          showToastRef.current?.(`☠️ ${p.name} foi eliminado da partida!`, 'error');
        }
      }
    });

    prevPlayersSnapRef.current = nextSnap;
  }, [players, currentPlayerId, matchStatus]);

  // Canais Realtime (Broadcast + Postgres Changes) + Backup Polling 3s
  useEffect(() => {
    if (!roomId) return;

    let isMounted = true;
    let bcastChannel = null;
    let pgChannel = null;
    let reconnectTimer = null;

    loadRoomData();

    const setupChannels = () => {
      if (!isMounted) return;
      if (bcastChannel) supabase.removeChannel(bcastChannel);
      if (pgChannel) supabase.removeChannel(pgChannel);

      bcastChannel = supabase
        .channel(`kod_bcast_${roomId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'room_sync' }, ({ payload }) => {
          if (!isMounted || isSyncPausedRef.current || !payload) return;

          if (payload.senderId && payload.sessionId && typeof payload.seq === 'number') {
            const last = remoteSeqRef.current[payload.senderId];
            if (last && last.sessionId === payload.sessionId && payload.seq <= last.seq) {
              return;
            }
            remoteSeqRef.current[payload.senderId] = {
              sessionId: payload.sessionId,
              seq: payload.seq
            };
          }

          if (payload.clearLocks) {
            fieldLocksRef.current = {};
          }

          if (payload.roomPatch) {
            setRoomData((prev) => {
              const updated = { ...prev, ...payload.roomPatch };
              lastRoomHashRef.current = JSON.stringify(updated);
              return updated;
            });
          }

          if (payload.playerPatch?.id) {
            lockPlayerFields(payload.playerPatch.id, payload.playerPatch, 2500);

            let playerFound = false;
            setPlayers((prev) => {
              const updated = prev.map((p) => {
                if (p.id === payload.playerPatch.id) {
                  playerFound = true;
                  return { ...p, ...payload.playerPatch };
                }
                return p;
              });
              if (playerFound) {
                lastPlayersHashRef.current = JSON.stringify(updated);
              }
              return updated;
            });

            if (!playerFound || payload.fullSync) {
              loadRoomData();
            }
          } else if (payload.fullSync) {
            loadRoomData();
          }
        })
        .subscribe();

      broadcastChannelRef.current = bcastChannel;

      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      pgChannel = supabase
        .channel(`kod_pg_${roomId}_${uniqueSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (!isMounted || isSyncPausedRef.current) return;

            if (payload.eventType === 'INSERT' && payload.new) {
              if (payload.new.is_connected !== false) {
                const row = mergeWithFieldLocks(payload.new);
                setPlayers((prev) => {
                  const exists = prev.some((p) => p.id === row.id);
                  const updated = exists
                    ? prev.map((p) => (p.id === row.id ? { ...p, ...row } : p))
                    : [...prev, row];
                  lastPlayersHashRef.current = JSON.stringify(updated);
                  return updated;
                });
              }
            } else if (payload.eventType === 'UPDATE' && payload.new) {
              if (payload.new.is_connected === false) {
                if (payload.new.id === currentPlayerId) {
                  verifyOrReconnectCurrentPlayer();
                  return;
                }
                setPlayers((prev) => {
                  const updated = prev.filter((p) => p.id !== payload.new.id);
                  lastPlayersHashRef.current = JSON.stringify(updated);
                  return updated;
                });
                return;
              }

              const row = mergeWithFieldLocks(payload.new);
              setPlayers((prev) => {
                const exists = prev.some((p) => p.id === row.id);
                const updated = !exists
                  ? [...prev, row]
                  : prev.map((p) => (p.id === row.id ? { ...p, ...row } : p));
                lastPlayersHashRef.current = JSON.stringify(updated);
                return updated;
              });
            } else if (payload.eventType === 'DELETE' && payload.old) {
              if (payload.old.id === currentPlayerId) {
                showToastRef.current?.(
                  localizationRef.current['UI.Room.RemovedFromRoom'] || 'Você foi removido da sala.',
                  'error'
                );
                onLeaveRoomRef.current?.();
                return;
              }
              setPlayers((prev) => {
                const updated = prev.filter((p) => p.id !== payload.old.id);
                lastPlayersHashRef.current = JSON.stringify(updated);
                return updated;
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            if (!isMounted) return;
            if (payload.new) {
              setRoomData((prev) => {
                const updated = { ...prev, ...payload.new };
                lastRoomHashRef.current = JSON.stringify(updated);
                return updated;
              });
            }
            loadRoomData();
          }
        )
        .subscribe((status) => {
          if (!isMounted) return;
          if (status === 'SUBSCRIBED') {
            loadRoomData();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (isMounted) setupChannels();
            }, 2500);
          }
        });
    };

    const initTimer = setTimeout(setupChannels, 80);
    const pollTimer = setInterval(() => {
      if (isMounted && document.visibilityState === 'visible' && !isSyncPausedRef.current) {
        loadRoomData();
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      broadcastChannelRef.current = null;
      if (bcastChannel) supabase.removeChannel(bcastChannel);
      if (pgChannel) supabase.removeChannel(pgChannel);
    };
  }, [roomId, currentPlayerId, loadRoomData, lockPlayerFields, mergeWithFieldLocks, verifyOrReconnectCurrentPlayer]);

  return {
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
  };
};