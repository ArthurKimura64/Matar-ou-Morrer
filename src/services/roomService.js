import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

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
      let roomId = this.generateRoomId();
      let attempts = 0;
      
      // Verificar se o ID já existe e gerar um novo se necessário
      while (attempts < 5) {
        const { data: existingRoom } = await supabase
          .from('rooms')
          .select('id')
          .eq('id', roomId)
          .eq('is_active', true)
          .single();
          
        if (!existingRoom) break;
        
        roomId = this.generateRoomId();
        attempts++;
      }
      
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

      if (error) throw error;
      return { success: true, room: data };
    } catch (error) {
      console.error('Erro ao criar sala:', error);
      return { success: false, error: error.message };
    }
  }

  // Entrar em uma sala
  static async joinRoom(roomId, playerName, character = null, forceNewPlayer = false) {
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
      
      const { data, error } = await supabase
        .from('players')
        .insert([
          {
            id: playerId,
            room_id: roomId,
            name: playerName,
            character: character,
            status: 'selecting',
            character_name: null,
            is_connected: true,
            joined_at: new Date().toISOString(),
            last_activity: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro ao entrar na sala:', error);
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

  // Obter jogadores de uma sala
  static async getRoomPlayers(roomId) {
    try {
      
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_connected', true)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return { success: true, players: data };
    } catch (error) {
      console.error('Erro ao buscar jogadores:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar status do jogador
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
      console.error('❌ Erro ao sair da sala:', error);
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
    
    
    
    let channel = null;
    let isSubscribed = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const createSubscription = () => {
      
      
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
            onPlayersChange(payload);
          }
        )
        .subscribe((status) => {
          
          
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            reconnectAttempts = 0;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isSubscribed = false;
            console.warn(`⚠️ Erro na subscription da sala ${roomId}:`, status);
            attemptReconnect();
          } else if (status === 'CLOSED') {
            isSubscribed = false;
          }
        });

      return channel;
    };

    const attemptReconnect = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error(`❌ Máximo de tentativas de reconexão atingido para sala ${roomId}`);
        return;
      }

      reconnectAttempts++;
      
      setTimeout(() => {
        
        // Remover subscription anterior se existir
        if (channel) {
          supabase.removeChannel(channel);
        }
        
        // Criar nova subscription
        createSubscription();
      }, Math.min(reconnectAttempts * 2000, 10000)); // Delay progressivo até 10s
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
        console.error('❌ Teste de conexão falhou:', error);
        return { connected: false, error: error.message, latency: null };
      }
      
  return { connected: true, error: null, latency };
    } catch (error) {
      console.error('❌ Erro no teste de conexão:', error);
      return { connected: false, error: error.message, latency: null };
    }
  }

  // Atualizar contadores do jogador
  static async updatePlayerCounters(playerId, counters) {
    try {
      
      const { data, error } = await supabase
        .from('players')
        .update({ counters })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
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
        .update({ characteristics })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
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
        .update({ used_items: usedItems })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
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
        .update({ unlocked_items: unlockedItems })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
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
        .update({ additional_counters: additionalCounters })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
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
        .update({ selections: selections })
        .eq('id', playerId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro SQL ao atualizar seleções:', error);
        throw error;
      }
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro geral ao atualizar seleções:', error);
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
      console.error('❌ Erro ao verificar jogador existente:', error);
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
          last_activity: new Date().toISOString(),
          exposed_cards: [] // Limpar cartas expostas na reconexão
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro ao reconectar jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar estado da aplicação de um jogador
  static async updatePlayerAppState(playerId, appState) {
    try {
      
      const { data, error } = await supabase
        .from('players')
        .update({ 
          app_state: appState,
          last_seen: new Date().toISOString()
        })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro ao atualizar app state:', error);
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
      console.error('❌ Erro ao expulsar jogador:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar cartas expostas do jogador
  static async updatePlayerExposedCards(playerId, exposedCards) {
    try {
      
      const { data, error } = await supabase
        .from('players')
        .update({ exposed_cards: exposedCards })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro ao atualizar cartas expostas:', error);
      return { success: false, error: error.message };
    }
  }
}
