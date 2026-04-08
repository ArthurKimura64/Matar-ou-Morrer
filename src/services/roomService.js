import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

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

// Helper para retry em operações de escrita
async function withRetry(operation, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
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
      const roomId = this.generateRoomId();
      
      const { data, error } = await supabase
        .from('rooms')
        .insert([
          {
            id: roomId,
            name: roomName,
            master_name: masterName,
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
      
      // Se não forçar novo jogador, verificar se o jogador já existe (apenas para reconexão automática)
      if (!forceNewPlayer) {
        const existingResult = await this.findExistingPlayer(roomId, playerName);
        
        if (existingResult.success && existingResult.player) {
          // Reconectar jogador existente
          return await this.reconnectPlayer(existingResult.player.id);
        }
      }
      
      // Se não existe ou está forçando novo jogador, criar novo jogador
      
      const playerId = uuidv4();
      
      const playerData = {
        id: playerId,
        room_id: roomId,
        name: playerName,
        character: character,
        status: 'selecting',
        character_name: null,
        is_connected: true,
        joined_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };
      if (userId) playerData.user_id = userId;
      
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

  // Listar salas ativas
  static async getActiveRooms() {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          players:players(count)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, rooms: data };
    } catch (error) {
      console.error('Erro ao buscar salas:', error);
      return { success: false, error: error.message };
    }
  }

  // Obter jogadores de uma sala com cache (cache invalidado por subscriptions)
  static async getRoomPlayers(roomId) {
    try {
      // Tentar obter do cache primeiro
      const cacheKey = `players_${roomId}`;
      const cached = queryCache.get(cacheKey);
      if (cached) {
        return { success: true, players: cached };
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

  // Fechar sala (apenas para o mestre)
  static async closeRoom(roomId) {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ is_active: false })
        .eq('id', roomId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao fechar sala:', error);
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

  // Atualizar contadores do jogador
  static async updatePlayerCounters(playerId, counters) {
    try {
      const { data } = await withRetry(async () => {
        const result = await supabase
          .from('players')
          .update({ 
            counters,
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
      console.error('Erro ao atualizar contadores:', error);
      return { success: false, error: error.message };
    }
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

  // Atualizar contadores adicionais do jogador
  static async updatePlayerAdditionalCounters(playerId, additionalCounters) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          additional_counters: additionalCounters,
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
      console.error('Erro ao atualizar contadores adicionais:', error);
      return { success: false, error: error.message };
    }
  }

  static async updatePlayerSelections(playerId, selections) {
    try {
      const { data, error } = await supabase
        .from('players')
        .update({ 
          selections: selections,
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) {
        console.error('Erro SQL ao atualizar seleções:', error);
        throw error;
      }
      
      // Limpar cache relacionado
      if (data?.room_id) {
        queryCache.clear(`players_${data.room_id}`);
      }
      
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro geral ao atualizar seleções:', error);
      return { success: false, error: error.message };
    }
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
      
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('name', playerName)
        .order('joined_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      if (data) {
      } else {
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
  static async kickPlayer(roomId, playerId, masterPlayerId) {
    try {
      
      // Verificar se quem está expulsando é realmente o mestre da sala
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('master_player_id')
        .eq('id', roomId)
        .single();

      if (roomError) throw roomError;

      if (room.master_player_id !== masterPlayerId) {
        throw new Error('Apenas o mestre da sala pode expulsar jogadores');
      }

      // Não permitir que o mestre expulse a si mesmo
      if (playerId === masterPlayerId) {
        throw new Error('O mestre não pode expulsar a si mesmo');
      }

      // Remover o jogador da sala
      const { error: deleteError } = await supabase
        .from('players')
        .delete()
        .eq('id', playerId)
        .eq('room_id', roomId);

      if (deleteError) throw deleteError;
      
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

  // Iniciar uma partida na sala
  static async startMatch(roomId) {
    try {
      const matchStartedAt = new Date().toISOString();

      // Atualizar status da sala para partida em andamento
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ 
          match_status: 'in_progress',
          match_started_at: matchStartedAt,
          last_activity: matchStartedAt
        })
        .eq('id', roomId);

      if (roomError) throw roomError;

      // Marcar todos os jogadores conectados e prontos como vivos, resetar elimination_order
      const { error: playersError } = await supabase
        .from('players')
        .update({ 
          is_alive: true, 
          killed_by_player_id: null,
          elimination_order: null,
          last_activity: matchStartedAt
        })
        .eq('room_id', roomId)
        .eq('status', 'ready')
        .eq('is_connected', true);

      if (playersError) throw playersError;

      // Limpar cache
      queryCache.clear(`players_${roomId}`);

      return { success: true };
    } catch (error) {
      console.error('Erro ao iniciar partida:', error);
      return { success: false, error: error.message };
    }
  }

  // Declarar eliminação de um jogador
  static async declareElimination(playerId, killerPlayerId = null) {
    try {
      // Buscar room_id do jogador
      const { data: player, error: fetchError } = await supabase
        .from('players')
        .select('room_id')
        .eq('id', playerId)
        .single();

      if (fetchError) throw fetchError;

      // Contar quantos jogadores já foram eliminados para determinar a ordem
      const { count, error: countError } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', player.room_id)
        .eq('is_alive', false)
        .not('elimination_order', 'is', null);

      if (countError) throw countError;

      const eliminationOrder = (count || 0) + 1;

      // Marcar jogador como eliminado com ordem de eliminação
      const { error: updateError } = await supabase
        .from('players')
        .update({ 
          is_alive: false, 
          killed_by_player_id: killerPlayerId,
          elimination_order: eliminationOrder,
          last_activity: new Date().toISOString()
        })
        .eq('id', playerId);

      if (updateError) throw updateError;

      // Limpar cache
      queryCache.clear(`players_${player.room_id}`);

      return { success: true };
    } catch (error) {
      console.error('Erro ao declarar eliminação:', error);
      return { success: false, error: error.message };
    }
  }

  // Declarar vitória e encerrar a partida
  static async declareVictory(roomId) {
    try {
      // Encerrar a partida (match_status volta a NULL)
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ 
          match_status: null,
          match_started_at: null,
          last_activity: new Date().toISOString()
        })
        .eq('id', roomId);

      if (roomError) throw roomError;

      // Resetar is_alive, killed_by e elimination_order de todos os jogadores da sala
      const { error: playersError } = await supabase
        .from('players')
        .update({ 
          is_alive: true, 
          killed_by_player_id: null,
          elimination_order: null,
          last_activity: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (playersError) throw playersError;

      // Limpar cache
      queryCache.clear(`players_${roomId}`);

      return { success: true };
    } catch (error) {
      console.error('Erro ao declarar vitória:', error);
      return { success: false, error: error.message };
    }
  }

  // Subscrever para mudanças na sala (match_status, etc.)
  static subscribeToRoomStatus(roomId, onRoomChange) {
    const channelName = `room-status-${roomId}`;

    const channel = supabase
      .channel(channelName)
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
      .subscribe();

    return channel;
  }

  // Resetar jogador para o lobby em uma única operação (batch)
  static async resetPlayerForLobby(playerId) {
    try {
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
}
