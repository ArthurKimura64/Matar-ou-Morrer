import { supabase } from '../config/supabaseClient';
import { v4 as uuidv4 } from "uuid"
import { validatePlayerName, validateRoomName, validateRoomId, validateJsonData } from "../utils/validation"
import authService from "./authService"
import { statsService } from "./statsService"

// Rate limiter simples para prevenir spam de requests
class RateLimiter {
  constructor() {
    this.actions = new Map()
  }

  check(key, cooldownMs) {
    const now = Date.now()
    const lastCall = this.actions.get(key) || 0
    const elapsed = now - lastCall
    if (elapsed < cooldownMs) {
      return { allowed: false, retryAfterMs: cooldownMs - elapsed }
    }
    this.actions.set(key, now)
    return { allowed: true }
  }
}

const rateLimiter = new RateLimiter()

// Sistema de cache simples para reduzir queries repetidas
class QueryCache {
  constructor(ttl = 5000) {
    this.cache = new Map()
    this.ttl = ttl
  }

  get(key) {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  clear(prefix) {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }
}

const queryCache = new QueryCache(3000)

// Debounced writer para operações frequentes de escrita (contadores, seleções, etc.)
// Mantém o token mais recente em memória para uso síncrono no fechamento da aba (pagehide)
let cachedAccessToken = null
const REST_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL || ""
const REST_SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.REACT_APP_SUPABASE_ANON_KEY || ""

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    cachedAccessToken = data?.session?.access_token || null
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token || null
  })
}

function sendKeepaliveRest(url, method, body, extraHeaders = {}) {
  if (!REST_SUPABASE_URL || !REST_SUPABASE_KEY || !cachedAccessToken) return false
  try {
    fetch(url, {
      method,
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: REST_SUPABASE_KEY,
        Authorization: `Bearer ${cachedAccessToken}`,
        ...extraHeaders
      },
      body: JSON.stringify(body)
    })
    return true
  } catch {
    return false
  }
}

// Debounced writer para operações frequentes de escrita (contadores, seleções, etc.)
class DebouncedWriter {
  constructor() {
    this.pending = new Map()
  }

  schedule(key, value, writeFn, delayMs = 300, keepaliveFn = null) {
    const existing = this.pending.get(key)
    if (existing?.timer) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(async () => {
      const entry = this.pending.get(key)
      if (!entry) return
      this.pending.delete(key)
      try {
        await entry.writeFn(entry.value)
      } catch (error) {
        console.error(`Erro no debounced write [${key}]:`, error)
      }
    }, delayMs)

    this.pending.set(key, { value, writeFn, keepaliveFn, timer })
  }

  async flushPlayer(playerId) {
    const playerEntries = [...this.pending.entries()].filter(([key]) => key.includes(playerId))
    await Promise.allSettled(
      playerEntries.map(([key, entry]) => {
        clearTimeout(entry.timer)
        this.pending.delete(key)
        return entry.writeFn(entry.value)
      })
    )
  }

  async flushAll() {
    const entries = [...this.pending.entries()]
    for (const [, entry] of entries) {
      clearTimeout(entry.timer)
    }
    this.pending.clear()
    await Promise.allSettled(entries.map(([, entry]) => entry.writeFn(entry.value)))
  }

  flushAllKeepalive() {
    const entries = [...this.pending.entries()]
    for (const [, entry] of entries) {
      clearTimeout(entry.timer)
    }
    this.pending.clear()
    entries.forEach(([, entry]) => {
      const sent = typeof entry.keepaliveFn === "function" ? entry.keepaliveFn(entry.value) : false
      if (!sent) {
        entry.writeFn(entry.value).catch(() => {})
      }
    })
  }
}

const debouncedWriter = new DebouncedWriter()

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      debouncedWriter.flushAllKeepalive()
    }
  })
  window.addEventListener("pagehide", () => {
    debouncedWriter.flushAllKeepalive()
  })
}

// Impede que uma requisição ociosa fique presa infinitamente
function withTimeout(promise, timeoutMs = 10000) {
  let timerId
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error("A conexão demorou demais para responder. Tente novamente.")
      err.isTimeout = true
      reject(err)
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId))
}

// Helper para retry em operações de escrita (com timeout e refresh automático de JWT)
async function withRetry(operation, maxRetries = 2, timeoutMs = 10000) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(operation(), timeoutMs)
    } catch (error) {
      lastError = error
      // Erros de regra de negócio das RPCs (RAISE EXCEPTION = P0001) não devem repetir
      if (error?.code === "P0001") {
        throw error
      }
      const msg = error?.message || ""
      if (msg.includes("JWT") || error?.code === "PGRST301") {
        try {
          await supabase.auth.refreshSession()
        } catch (_) {
          /* ignorar erro de refresh */
        }
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

export class RoomService {
  static updatePlayerFields(playerId, fields, { debounced = false, debounceKey = null, delayMs = 450 } = {}) {
    if (!playerId || !fields) {
      return Promise.resolve({ success: false, error: "playerId e fields são obrigatórios" })
    }

    const validation = validateJsonData(fields)
    if (!validation.valid) {
      console.warn("Payload JSONB rejeitado:", validation.error)
      return Promise.resolve({ success: false, error: validation.error })
    }

    const executeUpdate = async (payload) => {
      try {
        const { data } = await withRetry(async () => {
          const result = await supabase
            .from("players")
            .update({
              ...payload,
              last_activity: new Date().toISOString()
            })
            .eq("id", playerId)
            .select()
            .single()
          if (result.error) throw result.error
          return result
        })

        if (data?.room_id) {
          queryCache.clear(`players_${data.room_id}`)
        }
        return { success: true, player: data }
      } catch (error) {
        console.error("Erro ao atualizar campos do jogador:", error)
        return { success: false, error: error.message }
      }
    }

    if (debounced) {
      const key = debounceKey || `fields_${playerId}`
      const keepaliveFn = (payload) =>
        sendKeepaliveRest(
          `${REST_SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}`,
          "PATCH",
          { ...payload, last_activity: new Date().toISOString() }
        )
      debouncedWriter.schedule(key, fields, executeUpdate, delayMs, keepaliveFn)
      return Promise.resolve({ success: true, pending: true })
    }

    return executeUpdate(fields)
  }

  static async getPlayer(playerId) {
    try {
      const { data, error } = await supabase.from("players").select("*").eq("id", playerId).single()

      if (error) throw error
      return { success: true, player: data }
    } catch (error) {
      console.error("Erro ao obter jogador:", error)
      return { success: false, error: error.message }
    }
  }

  static async getRoomById(roomId) {
    try {
      const { data } = await withRetry(
        async () => {
          const result = await supabase
            .from("rooms")
            .select("*")
            .eq("id", roomId)
            .eq("is_active", true)
            .maybeSingle()
          if (result.error) throw result.error
          return result
        },
        1,
        8000
      )

      if (!data) {
        return { success: false, notFound: true, error: "Sala não encontrada ou inativa" }
      }
      return { success: true, room: data }
    } catch (error) {
      console.error("Erro ao buscar sala:", error)
      return { success: false, notFound: false, error: error.message }
    }
  }

  static async joinRoom(roomId, playerName, character = null, forceNewPlayer = false, userId = null) {
    try {
      const rl = rateLimiter.check("joinRoom", 3000)
      if (!rl.allowed) {
        return { success: false, error: `Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s antes de tentar novamente.` }
      }

      const nameResult = validatePlayerName(playerName)
      if (!nameResult.valid) {
        return { success: false, error: nameResult.error }
      }
      const roomIdResult = validateRoomId(roomId)
      if (!roomIdResult.valid) {
        return { success: false, error: roomIdResult.error }
      }

      const { data, error } = await supabase.rpc("join_room", {
        p_room_id: roomIdResult.sanitized,
        p_player_name: nameResult.sanitized
      })

      if (error || !data?.success) {
        throw new Error(error?.message || "Erro ao entrar na sala")
      }

      queryCache.clear(`players_${roomIdResult.sanitized}`)
      return {
        success: true,
        room: data.room,
        player: data.player,
        reconnected: Boolean(data.reconnected)
      }
    } catch (error) {
      console.error("Erro ao entrar na sala:", error)
      return { success: false, error: error.message }
    }
  }

  static async getRoomPlayers(roomId, forceRefresh = false) {
    try {
      const cacheKey = `players_${roomId}`

      if (!forceRefresh) {
        const cached = queryCache.get(cacheKey)
        if (cached) {
          return { success: true, players: cached }
        }
      }

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .or("is_connected.eq.true,in_match.eq.true")
        .order("joined_at", { ascending: true })

      if (error) throw error

      queryCache.set(cacheKey, data)

      return { success: true, players: data }
    } catch (error) {
      console.error("Erro ao buscar jogadores:", error)
      return { success: false, error: error.message }
    }
  }

  static async leaveRoom(playerId, { preserveForMatch = false } = {}) {
    try {
      if (preserveForMatch) {
        // Mantém o jogador no banco como desconectado até o fim da partida
        // para não perder abates nem pontos no histórico
        const { error } = await supabase
          .from("players")
          .update({
            is_connected: false,
            last_activity: new Date().toISOString()
          })
          .eq("id", playerId)

        if (error) throw error
        return { success: true }
      }

      const { error } = await supabase.from("players").delete().eq("id", playerId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error("Erro ao sair da sala:", error)
      return { success: false, error: error.message }
    }
  }

  static async testConnection() {
    try {
      const start = Date.now()
      const { error } = await supabase.from("rooms").select("id").limit(1)
      const latency = Date.now() - start

      if (error) {
        console.error("Teste de conexão falhou:", error)
        return { connected: false, error: error.message, latency: null }
      }

      return { connected: true, error: null, latency }
    } catch (error) {
      console.error("Erro no teste de conexão:", error)
      return { connected: false, error: error.message, latency: null }
    }
  }

  static async createRoomWithHost(roomName, masterName) {
    try {
      const rl = rateLimiter.check("createRoom", 5000)
      if (!rl.allowed) {
        return { success: false, error: `Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s antes de criar outra sala.` }
      }

      const roomNameResult = validateRoomName(roomName)
      if (!roomNameResult.valid) return { success: false, error: roomNameResult.error }

      const masterNameResult = validatePlayerName(masterName)
      if (!masterNameResult.valid) return { success: false, error: masterNameResult.error }

      const { data, error } = await supabase.rpc("create_room_with_host", {
        p_room_name: roomNameResult.sanitized,
        p_master_name: masterNameResult.sanitized
      })

      if (error || !data?.success) {
        throw new Error(error?.message || "Erro ao criar sala")
      }

      return { success: true, room: data.room, player: data.player }
    } catch (error) {
      console.error("Erro ao criar sala:", error)
      return { success: false, error: error.message }
    }
  }

  static async getPrivateState(playerId) {
    if (!playerId) return { success: false, data: null }
    try {
      const { data, error } = await supabase
        .from("player_private_state")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle()

      if (error) throw error
      return { success: true, data: data || null }
    } catch (error) {
      console.error("Erro ao carregar estado privado:", error)
      return { success: false, data: null, error: error.message }
    }
  }

  static savePrivateState(playerId, fields, { userId = null, debounced = false, debounceKey = null, delayMs = 450 } = {}) {
    if (!playerId || !fields) {
      return Promise.resolve({ success: false, error: "playerId e fields são obrigatórios" })
    }

    const validation = validateJsonData(fields)
    if (!validation.valid) {
      console.warn("Payload privado rejeitado:", validation.error)
      return Promise.resolve({ success: false, error: validation.error })
    }

    const executeUpsert = async (payload) => {
      try {
        let ownerId = userId
        if (!ownerId) {
          const { data: { session } } = await supabase.auth.getSession()
          ownerId = session?.user?.id || null
        }
        if (!ownerId) {
          return { success: false, error: "Usuário não autenticado" }
        }

        const { data } = await withRetry(async () => {
          const result = await supabase
            .from("player_private_state")
            .upsert(
              {
                player_id: playerId,
                user_id: ownerId,
                ...payload,
                updated_at: new Date().toISOString()
              },
              { onConflict: "player_id" }
            )
            .select()
            .single()
          if (result.error) throw result.error
          return result
        })

        return { success: true, data }
      } catch (error) {
        console.error("Erro ao salvar estado privado:", error)
        return { success: false, error: error.message }
      }
    }

    if (debounced) {
      const key = debounceKey || `private_${playerId}`
      const keepaliveFn = (payload) =>
        userId
          ? sendKeepaliveRest(
              `${REST_SUPABASE_URL}/rest/v1/player_private_state?on_conflict=player_id`,
              "POST",
              { player_id: playerId, user_id: userId, ...payload, updated_at: new Date().toISOString() },
              { Prefer: "resolution=merge-duplicates" }
            )
          : false
      debouncedWriter.schedule(key, fields, executeUpsert, delayMs, keepaliveFn)
      return Promise.resolve({ success: true, pending: true })
    }
    return executeUpsert(fields)
  }

  static async findExistingPlayer(roomId, playerName = "") {
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      const user = session?.user || (await supabase.auth.getUser()).data?.user || null

      if (user) {
        const { data: byUser, error: userError } = await supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (userError) throw userError
        if (byUser) {
          return { success: true, player: byUser }
        }
      }

      if (!playerName) {
        return { success: true, player: null }
      }

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("name", playerName)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error

      if (data && data.user_id && user && data.user_id !== user.id) {
        return { success: true, player: null }
      }

      return { success: true, player: data || null }
    } catch (error) {
      console.error("Erro ao verificar jogador existente:", error)
      return { success: false, error: error.message }
    }
  }

  static async reconnectPlayer(playerId) {
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      const authenticatedUserId = session?.user?.id || null

      const updatePayload = {
        is_connected: true
      }
      if (authenticatedUserId) {
        updatePayload.user_id = authenticatedUserId
      }

      return await this.updatePlayerFields(playerId, updatePayload)
    } catch (error) {
      console.error("Erro ao reconectar jogador:", error)
      return { success: false, error: error.message }
    }
  }

  static updatePlayerAppState(playerId, appState, userId = null) {
    return this.savePrivateState(
      playerId,
      { app_state: appState },
      { userId, debounced: true, debounceKey: `private_app_${playerId}`, delayMs: 400 }
    )
  }

  static async kickPlayer(roomId, playerId, masterPlayerId) {
    try {
      if (playerId === masterPlayerId) {
        throw new Error("O mestre não pode expulsar a si mesmo")
      }

      const { error } = await supabase.rpc("master_kick_player", {
        p_room_id: roomId,
        p_player_id: playerId
      })

      if (error) throw error

      return { success: true }
    } catch (error) {
      console.error("Erro ao expulsar jogador:", error)
      return { success: false, error: error.message }
    }
  }

  // ================================
  // SISTEMA DE PARTIDAS (MATCH) — COM TIMEOUT + RETRY
  // ================================

  static async startMatch(roomId) {
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.rpc("start_match", { p_room_id: roomId })
          if (error) throw error
        },
        1,
        10000
      )
      queryCache.clear(`players_${roomId}`)
      return { success: true }
    } catch (error) {
      console.error("Erro ao iniciar partida:", error)
      return { success: false, error: error.message }
    }
  }

  static async declareElimination(playerId, killerPlayerId = null) {
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.rpc("declare_elimination", {
            p_player_id: playerId,
            p_killer_player_id: killerPlayerId
          })
          if (error) throw error
        },
        1,
        10000
      )

      const { data: player } = await supabase.from("players").select("room_id").eq("id", playerId).single()
      if (player) {
        queryCache.clear(`players_${player.room_id}`)
      }

      return { success: true }
    } catch (error) {
      console.error("Erro ao declarar eliminação:", error)
      return { success: false, error: error.message }
    }
  }

  static async masterEliminatePlayer(roomId, playerId, killerPlayerId = null) {
    try {
      const data = await withRetry(
        async () => {
          const res = await supabase.rpc("master_eliminate_player", {
            p_room_id: roomId,
            p_player_id: playerId,
            p_killer_player_id: killerPlayerId
          })
          if (res.error) throw res.error
          return res.data
        },
        1,
        10000
      )
      queryCache.clear(`players_${roomId}`)
      return { success: true, data }
    } catch (error) {
      console.error("Erro ao eliminar jogador pelo anfitrião:", error)
      return { success: false, error: error.message }
    }
  }

  static async declareVictory(roomId) {
    try {
      const data = await withRetry(
        async () => {
          const res = await supabase.rpc("end_match", { p_room_id: roomId })
          if (res.error) throw res.error
          return res.data
        },
        1,
        10000
      )
      queryCache.clear(`players_${roomId}`)
      authService.clearLeaderboardCache()
      statsService.clearCache()
      return { success: true, data }
    } catch (error) {
      console.error("Erro ao declarar vitória:", error)
      return { success: false, error: error.message }
    }
  }

  static async cancelMatch(roomId) {
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.rpc("master_cancel_match", { p_room_id: roomId })
          if (error) throw error
        },
        1,
        10000
      )
      queryCache.clear(`players_${roomId}`)
      return { success: true }
    } catch (error) {
      console.error("Erro ao cancelar partida:", error)
      return { success: false, error: error.message }
    }
  }

  static async resetPlayerForLobby(playerId) {
    try {
      await debouncedWriter.flushPlayer(playerId)

      await this.savePrivateState(playerId, {
        actor_id: null,
        selections: {},
        used_items: [],
        unlocked_items: [],
        notes: {},
        app_state: {}
      })

      return await this.updatePlayerFields(playerId, {
        actor_id: null,
        character: null,
        character_name: null,
        defense_dice_count: null,
        status: "selecting",
        counters: {},
        characteristics: {},
        additional_counters: {},
        used_items: [],
        unlocked_items: [],
        selections: {},
        exposed_cards: [],
        app_state: {}
      })
    } catch (error) {
      console.error("Erro ao resetar jogador para lobby:", error)
      return { success: false, error: error.message }
    }
  }

  static async flushPlayerUpdates(playerId) {
    return debouncedWriter.flushPlayer(playerId)
  }

  static async flushAllPendingUpdates() {
    return debouncedWriter.flushAll()
  }
}