import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { validatePlayerName, validateRoomName, validateRoomId, validateJsonData } from '../utils/validation';

// Rate limiter simples para prevenir spam de requests
class RateLimiter {
  constructor() {
    this.actions = new Map();
  }

  /**
   * Verifica se a ação pode ser executada.
   * @param {string} key - Identificador da ação (ex: 'createRoom', 'joinRoom')
   * @param {number} cooldownMs - Tempo mínimo entre chamadas em milissegundos
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  check(key, cooldownMs) {
    const now = Date.now();
    const lastCall = this.actions.get(key) || 0;
    const elapsed = now - lastCall;
    if (elapsed < cooldownMs) {
      return { allowed: false, retryAfterMs: cooldownMs - elapsed };
    }
    this.actions.set(key, now);
    return { allowed: true };
  }
}

const rateLimiter = new RateLimiter();

// Sistema de cache simples para reduzir queries repetidas
class QueryCache {
  constructor(ttl = 5000) { // TTL padrão de 5 segundos
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear(prefix) {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}

// Cache com TTL de 3 segundos — invalidado por subscriptions em tempo real
const queryCache = new QueryCache(3000);

// Debounced writer para operações frequentes de escrita (contadores, seleções, etc.)
// Garante que o ÚLTIMO valor sempre seja enviado ao banco, mesmo com cliques rápidos.
// Substitui o rate limiter que descartava silenciosamente atualizações.
class DebouncedWriter {
  constructor() {
    this.pending = new Map(); // key -> { value, writeFn, timer }
  }

  /**
   * Agenda uma escrita debounced. O último valor será enviado após delayMs.
   * Se chamado novamente antes do timer disparar, o timer é resetado com o novo valor.
   */
  schedule(key, value, writeFn, delayMs = 300) {
    const existing = this.pending.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
      const entry = this.pending.get(key);
      if (!entry) return;
      this.pending.delete(key);
      try {
        await entry.writeFn(entry.value);
      } catch (error) {
        console.error(`Erro no debounced write [${key}]:`, error);
      }
    }, delayMs);

    this.pending.set(key, { value, writeFn, timer });
  }

  /**
   * Força envio imediato de um write pendente por chave.
   */
  async flush(key) {
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(key);
    try {
      await entry.writeFn(entry.value);
    } catch (error) {
      console.error(`Erro no flush [${key}]:`, error);
    }
  }

  /**
   * Força envio de todos os writes pendentes de um jogador específico.
   */
  async flushPlayer(playerId) {
    const playerEntries = [...this.pending.entries()].filter(([key]) => key.includes(playerId));
    await Promise.allSettled(playerEntries.map(([key, entry]) => {
      clearTimeout(entry.timer);
      this.pending.delete(key);
      return entry.writeFn(entry.value);
    }));
  }

  /**
   * Força envio de TODOS os writes pendentes.
   */
  async flushAll() {
    const entries = [...this.pending.entries()];
    for (const [, entry] of entries) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    await Promise.allSettled(entries.map(([, entry]) => entry.writeFn(entry.value)));
  }
}

const debouncedWriter = new DebouncedWriter();

// Helper para retry em operações de escrita (com refresh automático de JWT)
async function withRetry(operation, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      // Se o erro for JWT expirado, tentar refresh da sessão antes do retry
      const msg = error?.message || '';
      if (msg.includes('JWT') || error?.code === 'PGRST301') {
        try {
          await supabase.auth.refreshSession();
        } catch (_) { /* ignorar erro de refresh */ }
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export class RoomService {
  // Gerar ID de sala com 6 dígitos
  static generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Obter um jogador pelo ID
  static async getPlayer(playerId) {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao obter jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Criar uma nova sala
  static async createRoom(roomName, masterName) {
    try {
      // Rate limit: máximo 1 criação de sala a cada 5 segundos
      const rl = rateLimiter.check('createRoom', 5000);
      if (!rl.allowed) {
        return { success: false, error: `Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s antes de criar outra sala.` };
      }

      // Validar entradas
      const roomNameResult = validateRoomName(roomName);
      if (!roomNameResult.valid) {
        return { success: false, error: roomNameResult.error };
      }
      const masterNameResult = validatePlayerName(masterName);
      if (!masterNameResult.valid) {
        return { success: false, error: masterNameResult.error };
      }

      const roomId = this.generateRoomId();
      
      const { data, error } = await supabase
        .from('rooms')
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
        .single();

      if (error) {
        // Se houver conflito de ID (improvável), tentar uma vez com novo ID
        if (error.code === '23505') {
          const retryId = this.generateRoomId();
          const { data: retryData, error: retryError } = await supabase
            .from('rooms')
            .insert([{
              id: retryId,
              name: roomName,
              master_name: masterName,
              is_active: true,
              created_at: new Date().toISOString()
            }])
            .select()
            .single();
          if (retryError) throw retryError;
          return { success: true, room: retryData };
        }
        throw error;
      }
      return { success: true, room: data };
    } catch (error) {
      console.error('Erro ao criar sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Definir o player mestre da sala (armazenar master_player_id)
  static async setRoomMasterPlayerId(roomId, masterPlayerId) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .update({ master_player_id: masterPlayerId })
        .eq('id', roomId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, room: data };
    } catch (error) {
      console.error('Erro ao definir master_player_id na sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Obter dados de uma sala específica
  static async getRoomById(roomId) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return { success: true, room: data };
    } catch (error) {
      console.error('Erro ao buscar sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Entrar em uma sala
  static async joinRoom(roomId, playerName, character = null, forceNewPlayer = false, userId = null) {
    try {
      // Rate limit: máximo 1 entrada a cada 3 segundos
      const rl = rateLimiter.check('joinRoom', 3000);
      if (!rl.allowed) {
        return { success: false, error: `Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s antes de tentar novamente.` };
      }

      // Validar entradas
      const nameResult = validatePlayerName(playerName);
      if (!nameResult.valid) {
        return { success: false, error: nameResult.error };
      }
      const roomIdResult = validateRoomId(roomId);
      if (!roomIdResult.valid) {
        return { success: false, error: roomIdResult.error };
      }
      if (character) {
        const jsonResult = validateJsonData(character);
        if (!jsonResult.valid) {
          return { success: false, error: jsonResult.error };
        }
      }

      // Se não forçar novo jogador, verificar se o jogador já existe (apenas para reconexão automática)
      if (!forceNewPlayer) {
        const existingResult = await this.findExistingPlayer(roomIdResult.sanitized, nameResult.sanitized);
        
        if (existingResult.success && existingResult.player) {
          // Reconectar jogador existente
          return await this.reconnectPlayer(existingResult.player.id);
        }
      }
      
      // Se não existe ou está forçando novo jogador, criar novo jogador
      // Obter user_id do auth session para garantir integridade
      let authenticatedUserId = userId;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) authenticatedUserId = user.id;
      } catch (e) {
        // Se não tem auth, continuar sem user_id
      }
      
      const playerId = uuidv4();
      
      const playerData = {
        id: playerId,
        room_id: roomIdResult.sanitized,
        name: nameResult.sanitized,
        character: character,
        status: 'selecting',
        character_name: null,
        is_connected: true,
        joined_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };
      if (authenticatedUserId) playerData.user_id = authenticatedUserId;
      
      const { data, error } = await supabase
        .from('players')
        .insert([playerData])
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao entrar na sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Obter jogadores de uma sala com cache (cache invalidado por subscriptions)
  static async getRoomPlayers(roomId, forceRefresh = false) {
    try {
      const cacheKey = `players_${roomId}`;
      
      // Tentar obter do cache primeiro (exceto se forceRefresh)
      if (!forceRefresh) {
        const cached = queryCache.get(cacheKey);
        if (cached) {
          return { success: true, players: cached };
        }
      }
      
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_connected', true)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      
      // Armazenar no cache (usa TTL global de 3s para evitar múltiplas queries simultâneas)
      queryCache.set(cacheKey, data);
      
      return { success: true, players: data };
    } catch (error) {
      console.error('Erro ao buscar jogadores:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar status do jogador e limpar cache
  static async updatePlayerStatus(playerId, status, characterName = null) {
    try {
      const updateData = { status };
      if (characterName) {
        updateData.character_name = characterName;
      }
      
      // Se o status voltou para 'selecting', limpar cartas expostas
      if (status === 'selecting') {
        updateData.exposed_cards = [];
      }
      
      const { data, error } = await supabase
        .from('players')
        .update(updateData)
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      // Limpar cache relacionado ao jogador
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar personagem do jogador (mantém compatibilidade)
  static async updatePlayerCharacter(playerId, character, characterName = null) {
    try {
      const updateData = { 
        character: character,
        status: 'ready'
      };
      
      if (characterName) {
        updateData.character_name = characterName;
      }
      
      const { data, error } = await supabase
        .from('players')
        .update(updateData)
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar personagem:', error);
      return { success: false, error: error.message };
    }
  }

  // Sair da sala
  static async leaveRoom(playerId) {
    try {
      
      // Remover completamente o jogador quando sair definitivamente
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', playerId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao sair da sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Inscrever-se para mudanças em tempo real na sala com reconexão automática
  static subscribeToRoom(roomId, onPlayersChange) {
    const channelName = `room-players-${roomId}`;
    
    console.log('Criando subscription para sala:', roomId);
    
    let channel = null;
    let isSubscribed = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const createSubscription = () => {
      console.log('Criando nova subscription');
      
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'players',
            filter: `room_id=eq.${roomId}`
          },
          (payload) => {
            queryCache.clear(`players_${roomId}`);
            onPlayersChange(payload);
          }
        )
        .subscribe((status, err) => {
          console.log('Status da subscription:', status, err);
          
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            reconnectAttempts = 0;
            console.log('Subscription ativa para sala', roomId);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isSubscribed = false;
            console.warn(`Erro na subscription da sala ${roomId}:`, status);
            attemptReconnect();
          } else if (status === 'CLOSED') {
            isSubscribed = false;
            console.log('Subscription fechada para sala', roomId);
          }
        });

      return channel;
    };

    const attemptReconnect = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error(`Máximo de tentativas de reconexão atingido para sala ${roomId}`);
        return;
      }

      reconnectAttempts++;
      console.log(`Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts}`);
      
      setTimeout(() => {
        // Remover subscription anterior se existir
        if (channel) {
          supabase.removeChannel(channel);
        }
        
        // Criar nova subscription
        createSubscription();
      }, Math.min(reconnectAttempts * 1000, 5000)); // Delay progressivo até 5s (mais rápido)
    };

    // Criar subscription inicial
    channel = createSubscription();

    // Adicionar método para verificar se está ativo
    channel.isActive = () => isSubscribed;
    channel.reconnect = attemptReconnect;

    return channel;
  };

  // Cancelar inscrição
  static unsubscribeFromRoom(subscription) {
    if (subscription) {
      return supabase.removeChannel(subscription);
    }
  }

  // Verificar e reconectar subscription se necessário
  static checkAndReconnectSubscription(subscription) {
    if (!subscription) return false;
    
    if (subscription.isActive && !subscription.isActive()) {
      if (subscription.reconnect) {
        subscription.reconnect();
        return true;
      }
    }
    
    return false;
  }

  // Função utilitária para testar conectividade
  static async testConnection() {
    try {
      const start = Date.now();
      const { error } = await supabase
        .from('rooms')
        .select('id')
        .limit(1);
        
      const latency = Date.now() - start;
      
      if (error) {
        console.error('Teste de conexão falhou:', error);
        return { connected: false, error: error.message, latency: null };
      }
      
  return { connected: true, error: null, latency };
    } catch (error) {
      console.error('Erro no teste de conexão:', error);
      return { connected: false, error: error.message, latency: null };
    }
  }

  // Atualizar contadores do jogador (debounced para garantir que o último valor sempre seja sincronizado)
  static updatePlayerCounters(playerId, counters) {
    debouncedWriter.schedule(
      `counters_${playerId}`,
      counters,
      async (value) => {
        try {
          const { data } = await withRetry(async () => {
            const result = await supabase
              .from('players')
              .update({ 
                counters: value,
                last_activity: new Date().toISOString()
              })
              .eq('id', playerId)
              .select()
              .single();
            if (result.error) throw result.error;
            return result;
          });
          
          if (data?.room_id) {
            queryCache.clear(`players_${data.room_id}`);
          }
        } catch (error) {
          console.error('Erro ao atualizar contadores:', error);
        }
      },
      300 // 300ms debounce — rápido o suficiente para parecer tempo real
    );
    // Retornar imediatamente (escrita otimista — estado local já foi atualizado)
    return Promise.resolve({ success: true, pending: true });
  }

  // Atualizar características do jogador
  static async updatePlayerCharacteristics(playerId, characteristics) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          characteristics,
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar características:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar itens usados do jogador
  static async updatePlayerUsedItems(playerId, usedItems) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          used_items: usedItems,
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar itens usados:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar itens desbloqueados do jogador
  static async updatePlayerUnlockedItems(playerId, unlockedItems) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          unlocked_items: unlockedItems,
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar itens desbloqueados:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar contadores adicionais do jogador (debounced)
  static updatePlayerAdditionalCounters(playerId, additionalCounters) {
    debouncedWriter.schedule(
      `additionalCounters_${playerId}`,
      additionalCounters,
      async (value) => {
        try {
          const { data } = await withRetry(async () => {
            const result = await supabase
              .from('players')
              .update({ 
                additional_counters: value,
                last_activity: new Date().toISOString()
              })
              .eq('id', playerId)
              .select()
              .single();
            if (result.error) throw result.error;
            return result;
          });
          
          if (data?.room_id) {
            queryCache.clear(`players_${data.room_id}`);
          }
        } catch (error) {
          console.error('Erro ao atualizar contadores adicionais:', error);
        }
      },
      300
    );
    return Promise.resolve({ success: true, pending: true });
  }

  // Atualizar seleções do jogador (debounced para garantir que o último valor sempre seja sincronizado)
  static updatePlayerSelections(playerId, selections) {
    debouncedWriter.schedule(
      `selections_${playerId}`,
      selections,
      async (value) => {
        try {
          const { data } = await withRetry(async () => {
            const result = await supabase
              .from('players')
              .update({ 
                selections: value,
                last_activity: new Date().toISOString()
              })
              .eq('id', playerId)
              .select()
              .single();
            if (result.error) throw result.error;
            return result;
          });
          
          if (data?.room_id) {
            queryCache.clear(`players_${data.room_id}`);
          }
        } catch (error) {
          console.error('Erro ao atualizar seleções:', error);
        }
      },
      500 // 500ms debounce — seleções mudam com menos frequência
    );
    return Promise.resolve({ success: true, pending: true });
  }

  // Função para executar limpeza de dados antigos
  static async cleanupOldData() {
    try {

      // Executar limpeza de jogadores inativos
      const { error: playersError } = await supabase.rpc('cleanup_inactive_players');
      if (playersError) {
        console.error('Erro na limpeza de jogadores:', playersError);
      }
      
      // Executar limpeza de salas inativas
      const { error: roomsError } = await supabase.rpc('cleanup_inactive_rooms');
      if (roomsError) {
        console.error('Erro na limpeza de salas:', roomsError);
      } 
      
      return { success: true };
    } catch (error) {
      console.error('Erro geral na limpeza:', error);
      return { success: false, error: error.message };
    }
  }

  // Função para atualizar atividade do jogador
  static async updatePlayerActivity(playerId) {
    try {
      const { error } = await supabase
        .from('players')
        .update({ 
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao atualizar atividade do jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Verificar se jogador já existe na sala
  static async findExistingPlayer(roomId, playerName) {
    try {
      // Se autenticado, buscar primeiro por user_id (mais confiável)
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: byUser, error: userError } = await supabase
          .from('players')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false })
          .limit(1)
          .single();

        if (byUser) {
          return { success: true, player: byUser };
        }
        if (userError && userError.code !== 'PGRST116') throw userError;
      }

      // Fallback: buscar por nome (anônimos ou jogadores antigos sem user_id)
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('name', playerName)
        .order('joined_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Se encontrou por nome mas pertence a outro usuário, não retornar
      if (data && data.user_id && user && data.user_id !== user.id) {
        return { success: true, player: null };
      }

      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao verificar jogador existente:', error);
      return { success: false, error: error.message };
    }
  }

  // Reconectar jogador existente
  static async reconnectPlayer(playerId) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          is_connected: true,
          last_activity: new Date().toISOString()
          // IMPORTANT: do not clear `exposed_cards` here - we want
          // players' exposed cards (eye selections) to persist across
          // reconnects / page reloads. Clearing them on reconnect caused
          // the UI to lose the "cards on table" state.
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao reconectar jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar estado da aplicação de um jogador
  static async updatePlayerAppState(playerId, appState) {
    try {
      const { data } = await withRetry(async () => {
        const result = await supabase
          .from('players')
          .update({ 
            app_state: appState,
            last_activity: new Date().toISOString()
          })
          .eq('id', playerId)
          .select()
          .single();
        if (result.error) throw result.error;
        return result;
      });
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar app state:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar dados de defesa do jogador
  static async updatePlayerDefenseDice(playerId, defenseDiceCount) {
    try {
      
      const { data, error } = await supabase
        .from('players')
        .update({ defense_dice_count: defenseDiceCount })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar dados de defesa:', error);
      return { success: false, error: error.message };
    }
  }

  // Expulsar jogador da sala (apenas para o mestre da sala)
  // Usa RPC SECURITY DEFINER para bypassar RLS
  static async kickPlayer(roomId, playerId, masterPlayerId) {
    try {
      // Não permitir que o mestre expulse a si mesmo
      if (playerId === masterPlayerId) {
        throw new Error('O mestre não pode expulsar a si mesmo');
      }

      // Chamar função SECURITY DEFINER no banco
      const { error } = await supabase.rpc('master_kick_player', {
        p_room_id: roomId,
        p_player_id: playerId
      });

      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      console.error('Erro ao expulsar jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar cartas expostas do jogador
  static async updatePlayerExposedCards(playerId, exposedCards) {
    try {
      const { data } = await withRetry(async () => {
        const result = await supabase
          .from('players')
          .update({ 
            exposed_cards: exposedCards,
            last_activity: new Date().toISOString()
          })
          .eq('id', playerId)
          .select()
          .single();
        if (result.error) throw result.error;
        return result;
      });
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar cartas expostas:', error);
      return { success: false, error: error.message };
    }
  }

  // ================================
  // SISTEMA DE PARTIDAS (MATCH)
  // ================================

  // Iniciar uma partida na sala (via RPC server-side)
  static async startMatch(roomId) {
    try {
      const { error } = await supabase.rpc('start_match', { p_room_id: roomId });
      if (error) throw error;

      // Limpar cache
      queryCache.clear(`players_${roomId}`);

      return { success: true };
    } catch (error) {
      console.error('Erro ao iniciar partida:', error);
      return { success: false, error: error.message };
    }
  }

  // Declarar eliminação de um jogador (via RPC server-side atômico)
  static async declareElimination(playerId, killerPlayerId = null) {
    try {
      const { error } = await supabase.rpc('declare_elimination', {
        p_player_id: playerId,
        p_killer_player_id: killerPlayerId
      });

      if (error) throw error;

      // Limpar cache — buscar room_id do jogador para invalidar corretamente
      const { data: player } = await supabase
        .from('players')
        .select('room_id')
        .eq('id', playerId)
        .single();

      if (player) {
        queryCache.clear(`players_${player.room_id}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Erro ao declarar eliminação:', error);
      return { success: false, error: error.message };
    }
  }

  // Declarar vitória e encerrar a partida (via RPC server-side)
  // Registra stats + reseta match atomicamente
  static async declareVictory(roomId) {
    try {
      const { data, error } = await supabase.rpc('end_match', { p_room_id: roomId });
      if (error) throw error;

      // Limpar cache
      queryCache.clear(`players_${roomId}`);

      return { success: true, data };
    } catch (error) {
      console.error('Erro ao declarar vitória:', error);
      return { success: false, error: error.message };
    }
  }

  // Subscrever para mudanças na sala (match_status, etc.)
  static subscribeToRoomStatus(roomId, onRoomChange) {
    const channelName = `room-status-${roomId}`;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let channel = null;

    const createSubscription = () => {
      channel = supabase
        .channel(`${channelName}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`
          },
          (payload) => {
            onRoomChange(payload.new);
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Room status subscription ativa para sala:', roomId);
            reconnectAttempts = 0;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('❌ Erro na room status subscription:', status, err);
            if (reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              setTimeout(() => {
                if (channel) supabase.removeChannel(channel);
                createSubscription();
              }, Math.min(reconnectAttempts * 1000, 5000));
            }
          }
        });

      return channel;
    };

    channel = createSubscription();
    return channel;
  }

  // Resetar jogador para o lobby em uma única operação (batch)
  static async resetPlayerForLobby(playerId) {
    try {
      // Cancelar escritas debounced pendentes para este jogador antes de resetar
      // (evita que um write pendente sobrescreva o reset)
      await debouncedWriter.flushPlayer(playerId);
      
      const { data } = await withRetry(async () => {
        const result = await supabase
          .from('players')
          .update({
            character: null,
            character_name: null,
            status: 'selecting',
            counters: null,
            characteristics: null,
            additional_counters: null,
            used_items: null,
            unlocked_items: null,
            selections: null,
            exposed_cards: [],
            app_state: null,
            last_activity: new Date().toISOString()
          })
          .eq('id', playerId)
          .select()
          .single();
        if (result.error) throw result.error;
        return result;
      });

      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }

      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao resetar jogador para lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Forçar envio imediato de todas as escritas pendentes de um jogador
  static async flushPlayerUpdates(playerId) {
    return debouncedWriter.flushPlayer(playerId);
  }

  // Forçar envio imediato de TODAS as escritas pendentes (todos jogadores)
  static async flushAllPendingUpdates() {
    return debouncedWriter.flushAll();
  }
}
