import { supabase, connectionMonitor } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export class RoomService {
  // Gerar ID de sala com 6 dígitos
  static generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
  static async joinRoom(roomId, playerName, character = null) {
    try {
      const playerId = uuidv4();
      console.log('Tentando entrar na sala:', roomId, 'como jogador:', playerName);
      
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
            joined_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      
      console.log('Jogador adicionado com sucesso:', data);
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

  // Obter jogadores de uma sala
  static async getRoomPlayers(roomId) {
    try {
      console.log('Buscando jogadores da sala:', roomId);
      
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_connected', true)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      
      console.log('Jogadores encontrados:', data);
      return { success: true, players: data };
    } catch (error) {
      console.error('Erro ao buscar jogadores:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar status do jogador
  static async updatePlayerStatus(playerId, status, characterName = null) {
    try {
      console.log('Atualizando status do jogador:', playerId, 'para:', status);
      
      const updateData = { status };
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
      
      console.log('Status atualizado com sucesso:', data);
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
      
      console.log('Personagem atualizado com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar personagem:', error);
      return { success: false, error: error.message };
    }
  }

  // Sair da sala
  static async leaveRoom(playerId) {
    try {
      const { error } = await supabase
        .from('players')
        .update({ is_connected: false })
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
      console.log(`🔄 Criando subscription para sala ${roomId} (tentativa ${reconnectAttempts + 1})`);
      
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
            console.log('Mudança detectada na sala:', roomId, payload);
            onPlayersChange(payload);
          }
        )
        .subscribe((status) => {
          console.log(`📡 Status da subscription ${roomId}:`, status);
          
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            reconnectAttempts = 0;
            console.log(`✅ Subscription ativa para sala ${roomId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isSubscribed = false;
            console.warn(`⚠️ Erro na subscription da sala ${roomId}:`, status);
            attemptReconnect();
          } else if (status === 'CLOSED') {
            isSubscribed = false;
            console.log(`🔌 Subscription fechada para sala ${roomId}`);
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
        console.log(`🔄 Tentando reconectar subscription da sala ${roomId} (${reconnectAttempts}/${maxReconnectAttempts})`);
        
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
      console.log('Removendo subscription');
      return supabase.removeChannel(subscription);
    }
  }

  // Verificar e reconectar subscription se necessário
  static checkAndReconnectSubscription(subscription) {
    if (!subscription) return false;
    
    if (subscription.isActive && !subscription.isActive()) {
      console.log('🔄 Subscription inativa detectada, tentando reconectar...');
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
      
      console.log(`✅ Teste de conexão bem-sucedido (${latency}ms)`);
      return { connected: true, error: null, latency };
    } catch (error) {
      console.error('❌ Erro no teste de conexão:', error);
      return { connected: false, error: error.message, latency: null };
    }
  }

  // Atualizar contadores do jogador
  static async updatePlayerCounters(playerId, counters) {
    try {
      console.log('Atualizando contadores do jogador:', playerId, counters);
      
      const { data, error } = await supabase
        .from('players')
        .update({ counters })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      console.log('Contadores atualizados com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar contadores:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar características do jogador
  static async updatePlayerCharacteristics(playerId, characteristics) {
    try {
      console.log('Atualizando características do jogador:', playerId, characteristics);
      
      const { data, error } = await supabase
        .from('players')
        .update({ characteristics })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      console.log('Características atualizadas com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar características:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar itens usados do jogador
  static async updatePlayerUsedItems(playerId, usedItems) {
    try {
      console.log('Atualizando itens usados do jogador:', playerId, usedItems);
      
      const { data, error } = await supabase
        .from('players')
        .update({ used_items: usedItems })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      console.log('Itens usados atualizados com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar itens usados:', error);
      return { success: false, error: error.message };
    }
  }

  // Atualizar contadores adicionais do jogador
  static async updatePlayerAdditionalCounters(playerId, additionalCounters) {
    try {
      console.log('Atualizando contadores adicionais do jogador:', playerId, additionalCounters);
      
      const { data, error } = await supabase
        .from('players')
        .update({ additional_counters: additionalCounters })
        .eq('id', playerId)
        .select()
        .single();

      if (error) throw error;
      
      console.log('Contadores adicionais atualizados com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('Erro ao atualizar contadores adicionais:', error);
      return { success: false, error: error.message };
    }
  }

  static async updatePlayerSelections(playerId, selections) {
    try {
      console.log('🎮 Atualizando seleções do jogador:', playerId, selections);
      
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
      
      console.log('✅ Seleções atualizadas com sucesso:', data);
      return { success: true, player: data };
    } catch (error) {
      console.error('❌ Erro geral ao atualizar seleções:', error);
      return { success: false, error: error.message };
    }
  }

  // Função para executar limpeza de dados antigos
  static async cleanupOldData() {
    try {
      console.log('🧹 Executando limpeza de dados antigos...');
      
      // Executar limpeza de jogadores inativos
      const { error: playersError } = await supabase.rpc('cleanup_inactive_players');
      if (playersError) {
        console.error('Erro na limpeza de jogadores:', playersError);
      } else {
        console.log('✅ Limpeza de jogadores concluída');
      }
      
      // Executar limpeza de salas inativas
      const { error: roomsError } = await supabase.rpc('cleanup_inactive_rooms');
      if (roomsError) {
        console.error('Erro na limpeza de salas:', roomsError);
      } else {
        console.log('✅ Limpeza de salas concluída');
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
}
