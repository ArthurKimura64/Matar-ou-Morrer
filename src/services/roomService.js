import { supabase } from '../config/supabaseClient';
import { v4 as uuidv4 } from "uuid"
import { validatePlayerName, validateRoomName, validateRoomId, validateJsonData } from "../utils/validation"

// Rate limiter simples para prevenir spam de requests
class RateLimiter {
  constructor() {
    this.actions = new Map()
  }

  /**
   * Verifica se a ação pode ser executada.
   * @param {string} key - Identificador da ação (ex: 'createRoom', 'joinRoom')
   * @param {number} cooldownMs - Tempo mínimo entre chamadas em milissegundos
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
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

// Cache com TTL de 3 segundos — invalidado por subscriptions em tempo real
const queryCache = new QueryCache(3000)

// Debounced writer para operações frequentes de escrita (contadores, seleções, etc.)
// Garante que o ÚLTIMO valor sempre seja enviado ao banco, mesmo com cliques rápidos.
class DebouncedWriter {
  constructor() {
    this.pending = new Map() // key -> { value, writeFn, timer }
  }

  /**
   * Agenda uma escrita debounced. O último valor será enviado após delayMs.
   * Se chamado novamente antes do timer disparar, o timer é resetado com o novo valor.
   */
  schedule(key, value, writeFn, delayMs = 300) {
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

    this.pending.set(key, { value, writeFn, timer })
  }

  /**
   * Força envio imediato de um write pendente por chave.
   */
  async flush(key) {
    const entry = this.pending.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(key)
    try {
      await entry.writeFn(entry.value)
    } catch (error) {
      console.error(`Erro no flush [${key}]:`, error)
    }
  }

  /**
   * Força envio de todos os writes pendentes de um jogador específico.
   */
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

  /**
   * Força envio de TODOS os writes pendentes.
   */
  async flushAll() {
    const entries = [...this.pending.entries()]
    for (const [, entry] of entries) {
      clearTimeout(entry.timer)
    }
    this.pending.clear()
    await Promise.allSettled(entries.map(([, entry]) => entry.writeFn(entry.value)))
  }
}

const debouncedWriter = new DebouncedWriter()

// Garante que qualquer contador/anotação pendente seja enviado se o jogador fechar ou recarregar a aba
if (typeof window !== "undefined") {
  const flushOnExit = () => {
    debouncedWriter.flushAll()
  }
  window.addEventListener("pagehide", flushOnExit)
  window.addEventListener("beforeunload", flushOnExit)
}

// Helper para retry em operações de escrita (com refresh automático de JWT)
async function withRetry(operation, maxRetries = 2) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const msg = error?.message || ""
      if (msg.includes("JWT") || error?.code === "PGRST301") {
        try {
          await supabase.auth.refreshSession()
        } catch (_) {
          /* ignorar erro de refresh */
        }
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

export class RoomService {
  // Gerar ID de sala com 6 dígitos
  static generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  /**
   * Método único para atualizar qualquer campo do jogador (com retry automático).
   * Se `debounced: true`, agrupa cliques rápidos (ideal para vida e contadores).
   */
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
      debouncedWriter.schedule(key, fields, executeUpdate, delayMs)
      return Promise.resolve({ success: true, pending: true })
    }

    return executeUpdate(fields)
  }

  /**
   * Registra no histórico permanente do jogador (`app_state.ever_exposed_cards`)
   * qual carta foi exposta na mesa (usado pelo Copiador).
   */
  static async recordExposedCardHistory(playerId, actorId, itemId) {
    if (!playerId || !actorId || !itemId) return { success: false }
    try {
      const { data } = await supabase
        .from("players")
        .select("app_state")
        .eq("id", playerId)
        .single()

      const currentAppState = data?.app_state || {}
      const ever = { ...(currentAppState.ever_exposed_cards || {}) }
      const list = new Set([...(ever[actorId] || []), itemId])
      ever[actorId] = Array.from(list)

      return await this.updatePlayerFields(playerId, {
        app_state: { ...currentAppState, ever_exposed_cards: ever }
      })
    } catch (error) {
      console.error("Falha ao registrar histórico de exposição:", error)
      return { success: false, error: error.message }
    }
  }

  // Obter um jogador pelo ID
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

  // Criar uma nova sala
  static async createRoom(roomName, masterName) {
    try {
      const rl = rateLimiter.check("createRoom", 5000)
      if (!rl.allowed) {
        return { success: false, error: `Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s antes de criar outra sala.` }
      }

      const roomNameResult = validateRoomName(roomName)
      if (!roomNameResult.valid) {
        return { success: false, error: roomNameResult.error }
      }
      const masterNameResult = validatePlayerName(masterName)
      if (!masterNameResult.valid) {
        return { success: false, error: masterNameResult.error }
      }

      const roomId = this.generateRoomId()

      const { data, error } = await supabase
        .from("rooms")
        .insert([
          {
            id: roomId,
            name: roomNameResult.sanitized,
            master_name: masterNameResult.sanitized,
            is_active: true,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single()

      if (error) {
        if (error.code === "23505") {
          const retryId = this.generateRoomId()
          const { data: retryData, error: retryError } = await supabase
            .from("rooms")
            .insert([
              {
                id: retryId,
                name: roomNameResult.sanitized,
                master_name: masterNameResult.sanitized,
                is_active: true,
                created_at: new Date().toISOString()
              }
            ])
            .select()
            .single()
          if (retryError) throw retryError
          return { success: true, room: retryData }
        }
        throw error
      }
      return { success: true, room: data }
    } catch (error) {
      console.error("Erro ao criar sala:", error)
      return { success: false, error: error.message }
    }
  }

  // Definir o player mestre da sala (armazenar master_player_id)
  static async setRoomMasterPlayerId(roomId, masterPlayerId) {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .update({ master_player_id: masterPlayerId })
        .eq("id", roomId)
        .select()
        .single()

      if (error) throw error
      return { success: true, room: data }
    } catch (error) {
      console.error("Erro ao definir master_player_id na sala:", error)
      return { success: false, error: error.message }
    }
  }

  // Obter dados de uma sala específica
  static async getRoomById(roomId) {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("is_active", true)
        .single()

      if (error) throw error
      return { success: true, room: data }
    } catch (error) {
      console.error("Erro ao buscar sala:", error)
      return { success: false, error: error.message }
    }
  }

  // Entrar em uma sala
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
      if (character) {
        const jsonResult = validateJsonData(character)
        if (!jsonResult.valid) {
          return { success: false, error: jsonResult.error }
        }
      }

      if (!forceNewPlayer) {
        const existingResult = await this.findExistingPlayer(roomIdResult.sanitized, nameResult.sanitized)

        if (existingResult.success && existingResult.player) {
          return await this.reconnectPlayer(existingResult.player.id)
        }
      }

      let authenticatedUserId = userId
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser()
        if (user) authenticatedUserId = user.id
      } catch (e) {
        // Se não tem auth, continuar sem user_id
      }

      const playerId = uuidv4()

      const playerData = {
        id: playerId,
        room_id: roomIdResult.sanitized,
        name: nameResult.sanitized,
        character: character,
        status: "selecting",
        character_name: null,
        is_connected: true,
        joined_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      }
      if (authenticatedUserId) playerData.user_id = authenticatedUserId

      const { data, error } = await supabase.from("players").insert([playerData]).select().single()

      if (error) throw error
      return { success: true, player: data }
    } catch (error) {
      console.error("Erro ao entrar na sala:", error)
      return { success: false, error: error.message }
    }
  }

  // Obter jogadores de uma sala com cache (cache invalidado por subscriptions)
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
        .eq("is_connected", true)
        .order("joined_at", { ascending: true })

      if (error) throw error

      queryCache.set(cacheKey, data)

      return { success: true, players: data }
    } catch (error) {
      console.error("Erro ao buscar jogadores:", error)
      return { success: false, error: error.message }
    }
  }

  // Atualizar status do jogador e limpar cache
  static async updatePlayerStatus(playerId, status, characterName = null) {
    const updateData = { status }
    if (characterName) {
      updateData.character_name = characterName
    }
    if (status === "selecting") {
      updateData.exposed_cards = []
    }
    return this.updatePlayerFields(playerId, updateData)
  }

  // Atualizar personagem do jogador (mantém compatibilidade)
  static async updatePlayerCharacter(playerId, character, characterName = null) {
    const updateData = {
      character: character,
      status: "ready"
    }
    if (characterName) {
      updateData.character_name = characterName
    }
    return this.updatePlayerFields(playerId, updateData)
  }

  // Sair da sala
  static async leaveRoom(playerId) {
    try {
      const { error } = await supabase.from("players").delete().eq("id", playerId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error("Erro ao sair da sala:", error)
      return { success: false, error: error.message }
    }
  }

  // Função utilitária para testar conectividade
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

  // Atualizar contadores do jogador (debounced)
  static updatePlayerCounters(playerId, counters) {
    return this.updatePlayerFields(
      playerId,
      { counters },
      { debounced: true, debounceKey: `counters_${playerId}`, delayMs: 300 }
    )
  }

  // Atualizar características do jogador
  static async updatePlayerCharacteristics(playerId, characteristics) {
    return this.updatePlayerFields(playerId, { characteristics })
  }

  // Atualizar itens usados do jogador
  static async updatePlayerUsedItems(playerId, usedItems) {
    return this.updatePlayerFields(playerId, { used_items: usedItems })
  }

  // Atualizar itens desbloqueados do jogador
  static async updatePlayerUnlockedItems(playerId, unlockedItems) {
    return this.updatePlayerFields(playerId, { unlocked_items: unlockedItems })
  }

  // Atualizar contadores adicionais do jogador (debounced)
  static updatePlayerAdditionalCounters(playerId, additionalCounters) {
    return this.updatePlayerFields(
      playerId,
      { additional_counters: additionalCounters },
      { debounced: true, debounceKey: `additionalCounters_${playerId}`, delayMs: 300 }
    )
  }

  // Atualizar seleções do jogador (debounced)
  static updatePlayerSelections(playerId, selections) {
    return this.updatePlayerFields(
      playerId,
      { selections },
      { debounced: true, debounceKey: `selections_${playerId}`, delayMs: 500 }
    )
  }

  // Função para executar limpeza de dados antigos
  static async cleanupOldData() {
    try {
      const { error: playersError } = await supabase.rpc("cleanup_inactive_players")
      if (playersError) console.error("Erro na limpeza de jogadores:", playersError)

      const { error: roomsError } = await supabase.rpc("cleanup_inactive_rooms")
      if (roomsError) console.error("Erro na limpeza de salas:", roomsError)

      return { success: true }
    } catch (error) {
      console.error("Erro geral na limpeza:", error)
      return { success: false, error: error.message }
    }
  }

  // Função para atualizar atividade do jogador
  static async updatePlayerActivity(playerId) {
    return this.updatePlayerFields(playerId, { is_connected: true })
  }

  // Verificar se jogador já existe na sala
  static async findExistingPlayer(roomId, playerName) {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (user) {
        const { data: byUser, error: userError } = await supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false })
          .limit(1)
          .single()

        if (byUser) {
          return { success: true, player: byUser }
        }
        if (userError && userError.code !== "PGRST116") throw userError
      }

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("name", playerName)
        .order("joined_at", { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== "PGRST116") {
        throw error
      }

      if (data && data.user_id && user && data.user_id !== user.id) {
        return { success: true, player: null }
      }

      return { success: true, player: data }
    } catch (error) {
      console.error("Erro ao verificar jogador existente:", error)
      return { success: false, error: error.message }
    }
  }

  // Reconectar jogador existente
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

  // Atualizar estado da aplicação preservando ever_exposed_cards do banco
  static async updatePlayerAppState(playerId, appState) {
    const validation = validateJsonData(appState)
    if (!validation.valid) {
      console.warn("Payload JSONB rejeitado por tamanho inválido:", validation.error)
      return Promise.resolve({ success: false, error: validation.error })
    }
    try {
      const { data: currentRow } = await supabase
        .from("players")
        .select("app_state")
        .eq("id", playerId)
        .maybeSingle()

      const mergedAppState = {
        ...(currentRow?.app_state?.ever_exposed_cards
          ? { ever_exposed_cards: currentRow.app_state.ever_exposed_cards }
          : {}),
        ...appState
      }

      return await this.updatePlayerFields(playerId, { app_state: mergedAppState })
    } catch (error) {
      console.error("Erro ao atualizar app state:", error)
      return { success: false, error: error.message }
    }
  }

  // Atualizar dados de defesa do jogador
  static async updatePlayerDefenseDice(playerId, defenseDiceCount) {
    return this.updatePlayerFields(playerId, { defense_dice_count: defenseDiceCount })
  }

  // Expulsar jogador da sala (apenas para o mestre da sala)
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

  // Atualizar cartas expostas do jogador
  static async updatePlayerExposedCards(playerId, exposedCards) {
    return this.updatePlayerFields(playerId, { exposed_cards: exposedCards })
  }

  // ================================
  // SISTEMA DE PARTIDAS (MATCH)
  // ================================

  static async startMatch(roomId) {
    try {
      const { error } = await supabase.rpc("start_match", { p_room_id: roomId })
      if (error) throw error
      queryCache.clear(`players_${roomId}`)
      return { success: true }
    } catch (error) {
      console.error("Erro ao iniciar partida:", error)
      return { success: false, error: error.message }
    }
  }

  static async declareElimination(playerId, killerPlayerId = null) {
    try {
      const { error } = await supabase.rpc("declare_elimination", {
        p_player_id: playerId,
        p_killer_player_id: killerPlayerId
      })

      if (error) throw error

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

  static async declareVictory(roomId) {
    try {
      const { data, error } = await supabase.rpc("end_match", { p_room_id: roomId })
      if (error) throw error
      queryCache.clear(`players_${roomId}`)
      return { success: true, data }
    } catch (error) {
      console.error("Erro ao declarar vitória:", error)
      return { success: false, error: error.message }
    }
  }

  // Resetar jogador para seleção preservando character_name (se eliminado) e ever_exposed_cards (Copiador)
  static async resetPlayerForLobby(playerId) {
    try {
      await debouncedWriter.flushPlayer(playerId)

      const { data: current } = await supabase
        .from("players")
        .select("elimination_order, character_name, app_state")
        .eq("id", playerId)
        .single()

      const preserveCharName = current?.elimination_order != null ? current.character_name : null
      const preservedEverExposed = current?.app_state?.ever_exposed_cards || null
      const nextAppState = preservedEverExposed
        ? { ever_exposed_cards: preservedEverExposed }
        : {}

      return await this.updatePlayerFields(playerId, {
        character: null,
        character_name: preserveCharName,
        status: "selecting",
        counters: null,
        characteristics: null,
        additional_counters: null,
        used_items: [],
        unlocked_items: [],
        selections: null,
        exposed_cards: [],
        app_state: nextAppState
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