import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { supabase } from "../config/supabaseClient"
import { RoomService } from "../services/roomService"
import authService from "../services/authService"
import { statsService } from "../services/statsService"

/**
 * ============================================================================
 * HOOK DE SINCRONIZAÇÃO DA SALA (useRoomSync.js)
 * ============================================================================
 * Centraliza toda a comunicação em tempo real da sala multiplayer:
 * 1. Carrega jogadores conectados e dados da sala.
 * 2. Sincroniza mudanças instantâneas via Broadcast + Postgres Changes (ambos com reconexão).
 * 3. Polling inteligente: 10s de checagem leve com Realtime ativo, ou 4s se cair.
 * 4. Mantém o jogador online (heartbeat a cada 40s e reconexão suave ao voltar à aba).
 * 5. Dispara avisos quando alguém expõe uma carta (👁️) ou é eliminado (☠️).
 * ============================================================================
 */
export const useRoomSync = ({ room, currentPlayer, onLeaveRoom, showToast, localization = {} }) => {
  const [players, setPlayers] = useState([])
  const playersRef = useRef(players)
  playersRef.current = players
  const [roomData, setRoomData] = useState(room)

  const roomId = room?.id
  const currentPlayerId = currentPlayer?.id
  const matchStatus = roomData?.match_status || null
  const matchStatusRef = useRef(matchStatus)
  matchStatusRef.current = matchStatus
  const currentPlayerData = useMemo(() => players.find((p) => p.id === currentPlayerId) || currentPlayer, [players, currentPlayerId, currentPlayer])

  const isAlive = currentPlayerData?.is_alive !== false
  const isInMatch = currentPlayerData?.in_match === true

  const onLeaveRoomRef = useRef(onLeaveRoom)
  const showToastRef = useRef(showToast)
  const localizationRef = useRef(localization)
  const hasAnnouncedJoinRef = useRef(false)

  const lastBroadcastAtRef = useRef(0)
  const broadcastThrottleTimerRef = useRef(null)
  const pendingBroadcastRef = useRef(null)

  useEffect(() => {
    onLeaveRoomRef.current = onLeaveRoom
  }, [onLeaveRoom])
  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])
  useEffect(() => {
    localizationRef.current = localization
  }, [localization])

  const broadcastChannelRef = useRef(null)
  const reconnectChannelsRef = useRef(null)
  const isPgSubscribedRef = useRef(false)
  const isBcastSubscribedRef = useRef(false)
  const lastSyncTimeRef = useRef(0)
  const lastPlayersHashRef = useRef("")
  const lastRoomHashRef = useRef("")
  const loadSeqRef = useRef(0)
  const isSyncPausedRef = useRef(false)
  const isReconnectingRef = useRef(false)

  const fieldLocksRef = useRef({})
  const sessionIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const broadcastSeqRef = useRef(0)
  const remoteSeqRef = useRef({})

  const setSyncPaused = useCallback((paused) => {
    isSyncPausedRef.current = Boolean(paused)
  }, [])

  const clearFieldLocks = useCallback(() => {
    fieldLocksRef.current = {}
  }, [])

  const lockPlayerFields = useCallback((playerId, patch, durationMs = 2500) => {
    if (!playerId || !patch) return
    const until = Date.now() + durationMs
    if (!fieldLocksRef.current[playerId]) {
      fieldLocksRef.current[playerId] = {}
    }
    Object.entries(patch).forEach(([key, value]) => {
      if (key === "id") return
      fieldLocksRef.current[playerId][key] = { value, until }
    })
  }, [])

  const mergeWithFieldLocks = useCallback((playerRow) => {
    if (!playerRow?.id) return playerRow
    const locks = fieldLocksRef.current[playerRow.id]
    if (!locks) return playerRow

    const now = Date.now()
    let merged = null
    let hasActiveLock = false

    Object.keys(locks).forEach((key) => {
      if (locks[key].until > now) {
        hasActiveLock = true
        if (!merged) merged = { ...playerRow }
        merged[key] = locks[key].value
      } else {
        delete locks[key]
      }
    })

    if (!hasActiveLock) {
      delete fieldLocksRef.current[playerRow.id]
    }

    return merged || playerRow
  }, [])

  const broadcastRoomSync = useCallback(
    (playerPatch = null, { fullSync = false, roomPatch = null, clearLocks = false } = {}) => {
      if (!broadcastChannelRef.current) return
      broadcastChannelRef.current.send({
        type: "broadcast",
        event: "room_sync",
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
      })
    },
    [currentPlayerId]
  )

  // Atualiza o jogador local imediatamente e avisa os outros via Broadcast
  const applyLocalPlayerPatch = useCallback(
    (patch, { fullSync = false } = {}) => {
      if (!currentPlayerId || !patch) return
      const fullPatch = { id: currentPlayerId, ...patch }
      lockPlayerFields(currentPlayerId, fullPatch, 2500)

      // 1. Atualiza imediatamente a sua própria tela (0ms)
      setPlayers((prev) => {
        const updated = prev.map((p) => (p.id === currentPlayerId ? { ...p, ...fullPatch } : p))
        lastPlayersHashRef.current = JSON.stringify(updated)
        return updated
      })

      // 2. Envia para os outros jogadores em throttle (máx. ~9x/segundo, sempre garantindo o último valor)
      const now = Date.now()
      const elapsed = now - lastBroadcastAtRef.current
      const mergedPatch = pendingBroadcastRef.current ? { ...pendingBroadcastRef.current.patch, ...fullPatch } : fullPatch
      const mergedFullSync = Boolean(pendingBroadcastRef.current?.fullSync || fullSync)

      if (elapsed >= 110 || fullSync) {
        if (broadcastThrottleTimerRef.current) {
          clearTimeout(broadcastThrottleTimerRef.current)
          broadcastThrottleTimerRef.current = null
        }
        pendingBroadcastRef.current = null
        lastBroadcastAtRef.current = now
        broadcastRoomSync(mergedPatch, { fullSync: mergedFullSync })
      } else {
        pendingBroadcastRef.current = { patch: mergedPatch, fullSync: mergedFullSync }
        if (!broadcastThrottleTimerRef.current) {
          broadcastThrottleTimerRef.current = setTimeout(() => {
            broadcastThrottleTimerRef.current = null
            const pending = pendingBroadcastRef.current
            pendingBroadcastRef.current = null
            if (pending) {
              lastBroadcastAtRef.current = Date.now()
              broadcastRoomSync(pending.patch, { fullSync: pending.fullSync })
            }
          }, 110 - elapsed)
        }
      }
    },
    [currentPlayerId, lockPlayerFields, broadcastRoomSync]
  )

  // Atualiza dados da sala imediatamente (ex: início/fim de partida) e envia via Broadcast
  const applyLocalRoomPatch = useCallback(
    (roomPatch, { fullSync = true, clearLocks = false } = {}) => {
      if (!roomPatch) return
      if (clearLocks) {
        fieldLocksRef.current = {}
      }
      setRoomData((prev) => {
        const updated = { ...prev, ...roomPatch }
        lastRoomHashRef.current = JSON.stringify(updated)
        return updated
      })
      broadcastRoomSync(null, { roomPatch, fullSync, clearLocks })
    },
    [broadcastRoomSync]
  )

  const verifyOrReconnectCurrentPlayer = useCallback(async () => {
    if (!currentPlayerId || !roomId || isReconnectingRef.current) return
    isReconnectingRef.current = true

    try {
      const { data: myRow, error } = await supabase.from("players").select("id, room_id, is_connected").eq("id", currentPlayerId).maybeSingle()

      // Erro temporário (token renovando ou internet voltando): não expulsa da sala
      if (error) {
        console.warn("Aviso temporário ao verificar jogador na sala:", error.message)
        return
      }

      if (!myRow) {
        showToastRef.current?.(localizationRef.current["UI.Room.RemovedFromRoom"] || "Você foi removido da sala.", "error")
        onLeaveRoomRef.current?.()
        return
      }

      if (myRow.is_connected === false) {
        await RoomService.reconnectPlayer(currentPlayerId)
        broadcastRoomSync({ id: currentPlayerId, is_connected: true }, { fullSync: true })
      }
    } catch (err) {
      console.warn("Falha ao verificar reconexão:", err)
    } finally {
      isReconnectingRef.current = false
    }
  }, [currentPlayerId, roomId, broadcastRoomSync])

  const loadRoomData = useCallback(async () => {
    if (!roomId || isSyncPausedRef.current) return

    const reqSeq = ++loadSeqRef.current
    lastSyncTimeRef.current = Date.now()

    try {
      const [playersRes, roomRes] = await Promise.all([RoomService.getRoomPlayers(roomId, true), RoomService.getRoomById(roomId)])

      if (isSyncPausedRef.current || reqSeq !== loadSeqRef.current) return

      if (playersRes.success && Array.isArray(playersRes.players)) {
        const activePlayers = playersRes.players.map(mergeWithFieldLocks)

        if (currentPlayerId && !activePlayers.some((p) => p.id === currentPlayerId)) {
          await verifyOrReconnectCurrentPlayer()
        } else {
          const nextHash = JSON.stringify(activePlayers)
          if (nextHash !== lastPlayersHashRef.current) {
            lastPlayersHashRef.current = nextHash
            setPlayers(activePlayers)
          }
        }
      }

      if (roomRes.notFound) {
        showToastRef.current?.("Esta sala foi encerrada.", "info")
        onLeaveRoomRef.current?.()
        return
      }

      if (roomRes.success && roomRes.room) {
        const nextRoomHash = JSON.stringify(roomRes.room)
        if (nextRoomHash !== lastRoomHashRef.current) {
          lastRoomHashRef.current = nextRoomHash
          setRoomData(roomRes.room)
        }
      }
    } catch (err) {
      console.error("Erro ao sincronizar dados da sala:", err)
    }
  }, [roomId, currentPlayerId, mergeWithFieldLocks, verifyOrReconnectCurrentPlayer])

  // Heartbeat (40s) + reconexão suave ao voltar para a aba ou internet retornar
  useEffect(() => {
    if (!currentPlayerId || !roomId) return

    let resumeTimer = null

    const sendHeartbeat = () => {
      if (document.visibilityState === "visible") {
        RoomService.updatePlayerFields(currentPlayerId, { is_connected: true })
      }
    }

    const runResumeSync = async () => {
      if (!isPgSubscribedRef.current || !isBcastSubscribedRef.current) {
        reconnectChannelsRef.current?.()
      }
      await verifyOrReconnectCurrentPlayer()
      await loadRoomData()
    }

    const handleResume = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(resumeTimer)
        // Aguarda 500ms para a renovação automática de sessão do Supabase concluir
        resumeTimer = setTimeout(runResumeSync, 450)
      }
    }

    const handleOnline = () => {
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(runResumeSync, 350)
    }

    const heartbeatTimer = setInterval(sendHeartbeat, 40000)
    document.addEventListener("visibilitychange", handleResume)
    window.addEventListener("online", handleOnline)

    return () => {
      clearTimeout(resumeTimer)
      clearInterval(heartbeatTimer)
      document.removeEventListener("visibilitychange", handleResume)
      window.removeEventListener("online", handleOnline)
    }
  }, [currentPlayerId, roomId, verifyOrReconnectCurrentPlayer, loadRoomData])

  // Avisos automáticos de Carta Exposta (👁️) e Eliminação (☠️)
  const prevPlayersSnapRef = useRef({})
  useEffect(() => {
    const prevSnap = prevPlayersSnapRef.current
    const nextSnap = {}

    players.forEach((p) => {
      const exposedCount = Array.isArray(p.exposed_cards) ? p.exposed_cards.length : 0
      const isAliveNow = p.is_alive !== false
      nextSnap[p.id] = { exposedCount, isAliveNow, name: p.name }

      const old = prevSnap[p.id]
      if (old && p.id !== currentPlayerId) {
        if (exposedCount > old.exposedCount) {
          showToastRef.current?.(`👁️ ${p.name} expôs uma carta na mesa!`, "info")
        }
        if (old.isAliveNow && !isAliveNow && matchStatus === "in_progress") {
          showToastRef.current?.(`☠️ ${p.name} foi eliminado da partida!`, "error")
        }
      }
    })

    prevPlayersSnapRef.current = nextSnap
  }, [players, currentPlayerId, matchStatus])

  // Canais Realtime (Broadcast + Postgres Changes) + Polling Inteligente (10s ativo / 4s fallback)
  useEffect(() => {
    if (!roomId) return

    let isMounted = true
    let bcastChannel = null
    let pgChannel = null
    let reconnectTimer = null

    loadRoomData()

    const scheduleReconnect = () => {
      if (!isMounted) return
      clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        if (isMounted) setupChannels()
      }, 2500)
    }

    const setupChannels = () => {
      if (!isMounted) return
      isPgSubscribedRef.current = false
      isBcastSubscribedRef.current = false
      if (bcastChannel) supabase.removeChannel(bcastChannel)
      if (pgChannel) supabase.removeChannel(pgChannel)

      bcastChannel = supabase
        .channel(`kod_bcast_${roomId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "room_sync" }, ({ payload }) => {
          if (!isMounted || isSyncPausedRef.current || !payload) return

          if (payload.senderId && payload.sessionId && typeof payload.seq === "number") {
            const last = remoteSeqRef.current[payload.senderId]
            if (last && last.sessionId === payload.sessionId && payload.seq <= last.seq) {
              return
            }
            remoteSeqRef.current[payload.senderId] = {
              sessionId: payload.sessionId,
              seq: payload.seq
            }
          }

          if (payload.clearLocks) {
            fieldLocksRef.current = {}
          }

          if (payload.roomPatch) {
            setRoomData((prev) => {
              const updated = { ...prev, ...payload.roomPatch }
              lastRoomHashRef.current = JSON.stringify(updated)
              return updated
            })
          }

          if (payload.playerPatch?.id) {
            lockPlayerFields(payload.playerPatch.id, payload.playerPatch, 2500)

            const playerFound = playersRef.current.some((p) => p.id === payload.playerPatch.id)

            if (playerFound) {
              setPlayers((prev) => {
                const updated = prev.map((p) => (p.id === payload.playerPatch.id ? { ...p, ...payload.playerPatch } : p))
                lastPlayersHashRef.current = JSON.stringify(updated)
                return updated
              })
            }

            if (!playerFound || payload.fullSync) {
              loadRoomData()
            }
          } else if (payload.fullSync) {
            loadRoomData()
          }
        })
        .subscribe((status) => {
          if (!isMounted) return
          if (status === "SUBSCRIBED") {
            isBcastSubscribedRef.current = true
            if (!hasAnnouncedJoinRef.current && currentPlayerId) {
              hasAnnouncedJoinRef.current = true
              bcastChannel.send({
                type: "broadcast",
                event: "room_sync",
                payload: {
                  senderId: currentPlayerId,
                  sessionId: sessionIdRef.current,
                  seq: ++broadcastSeqRef.current,
                  fullSync: true,
                  ts: Date.now()
                }
              })
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            isBcastSubscribedRef.current = false
            scheduleReconnect()
          }
        })

      broadcastChannelRef.current = bcastChannel

      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      pgChannel = supabase
        .channel(`kod_pg_${roomId}_${uniqueSuffix}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, (payload) => {
          if (!isMounted || isSyncPausedRef.current) return

          if (payload.eventType === "INSERT" && payload.new) {
            if (payload.new.is_connected !== false || payload.new.in_match === true) {
              const row = mergeWithFieldLocks(payload.new)
              setPlayers((prev) => {
                const exists = prev.some((p) => p.id === row.id)
                const updated = exists ? prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)) : [...prev, row]
                lastPlayersHashRef.current = JSON.stringify(updated)
                return updated
              })
            }
          } else if (payload.eventType === "UPDATE" && payload.new) {
            if (payload.new.is_connected === false && payload.new.in_match !== true) {
              if (payload.new.id === currentPlayerId) {
                verifyOrReconnectCurrentPlayer()
                return
              }
              setPlayers((prev) => {
                const updated = prev.filter((p) => p.id !== payload.new.id)
                lastPlayersHashRef.current = JSON.stringify(updated)
                return updated
              })
              return
            }

            if (payload.new.is_connected === false && payload.new.id === currentPlayerId) {
              verifyOrReconnectCurrentPlayer()
              return
            }

            const row = mergeWithFieldLocks(payload.new)
            setPlayers((prev) => {
              const exists = prev.some((p) => p.id === row.id)
              const updated = !exists ? [...prev, row] : prev.map((p) => (p.id === row.id ? { ...p, ...row } : p))
              lastPlayersHashRef.current = JSON.stringify(updated)
              return updated
            })
          } else if (payload.eventType === "DELETE" && payload.old) {
            if (payload.old.id === currentPlayerId) {
              showToastRef.current?.(localizationRef.current["UI.Room.RemovedFromRoom"] || "Você foi removido da sala.", "error")
              onLeaveRoomRef.current?.()
              return
            }
            setPlayers((prev) => {
              const updated = prev.filter((p) => p.id !== payload.old.id)
              lastPlayersHashRef.current = JSON.stringify(updated)
              return updated
            })
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (payload) => {
          if (!isMounted || !payload.new) return

          const prevMatchStatus = matchStatusRef.current
          const nextMatchStatus = payload.new.match_status || null
          const roomWasClosed = payload.new.is_active === false

          if (prevMatchStatus === "in_progress" && nextMatchStatus === null) {
            authService.clearLeaderboardCache()
            statsService.clearCache()
          }

          matchStatusRef.current = nextMatchStatus

          setRoomData((prev) => {
            const updated = { ...prev, ...payload.new }
            lastRoomHashRef.current = JSON.stringify(updated)
            return updated
          })

          // Só baixa todos os jogadores novamente se a partida começou/terminou ou a sala fechou
          if (nextMatchStatus !== prevMatchStatus || roomWasClosed) {
            loadRoomData()
          }
        })
        .subscribe((status) => {
          if (!isMounted) return
          if (status === "SUBSCRIBED") {
            isPgSubscribedRef.current = true
            loadRoomData()
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            isPgSubscribedRef.current = false
            scheduleReconnect()
          }
        })
    }

    reconnectChannelsRef.current = setupChannels
    const initTimer = setTimeout(setupChannels, 80)

    // Polling inteligente: 10s com Realtime conectado, ou 4s se algum canal cair
    const pollTimer = setInterval(() => {
      if (!isMounted || document.visibilityState !== "visible" || isSyncPausedRef.current) return
      const elapsed = Date.now() - lastSyncTimeRef.current
      const bothConnected = isPgSubscribedRef.current && isBcastSubscribedRef.current
      const targetInterval = bothConnected ? 45000 : 4000
      if (elapsed >= targetInterval) {
        loadRoomData()
      }
    }, 4000)

    return () => {
      isMounted = false
      isPgSubscribedRef.current = false
      isBcastSubscribedRef.current = false
      reconnectChannelsRef.current = null
      clearTimeout(initTimer)
      clearTimeout(reconnectTimer)
      clearInterval(pollTimer)
      if (broadcastThrottleTimerRef.current) {
        clearTimeout(broadcastThrottleTimerRef.current)
        broadcastThrottleTimerRef.current = null
      }
      pendingBroadcastRef.current = null
      broadcastChannelRef.current = null
      if (bcastChannel) supabase.removeChannel(bcastChannel)
      if (pgChannel) supabase.removeChannel(pgChannel)
    }
  }, [roomId, currentPlayerId, loadRoomData, lockPlayerFields, mergeWithFieldLocks, verifyOrReconnectCurrentPlayer])

  return {
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
  }
}
