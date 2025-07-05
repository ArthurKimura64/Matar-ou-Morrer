// Chaves para localStorage
const STORAGE_KEYS = {
  CURRENT_PLAYER: 'killOrDie_currentPlayer',
  CURRENT_ROOM: 'killOrDie_currentRoom'
};

export class PlayerPersistence {
  // Salvar dados do jogador
  static savePlayerData(player, room) {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PLAYER, JSON.stringify(player));
      localStorage.setItem(STORAGE_KEYS.CURRENT_ROOM, JSON.stringify(room));
      console.log('✅ Dados do jogador salvos no localStorage:', {
        playerId: player.id,
        playerName: player.name,
        roomId: room.id,
        roomName: room.name
      });
    } catch (error) {
      console.error('❌ Erro ao salvar dados do jogador:', error);
    }
  }

  // Recuperar dados do jogador
  static getPlayerData() {
    try {
      const playerData = localStorage.getItem(STORAGE_KEYS.CURRENT_PLAYER);
      const roomData = localStorage.getItem(STORAGE_KEYS.CURRENT_ROOM);
      
      if (playerData && roomData) {
        const parsed = {
          player: JSON.parse(playerData),
          room: JSON.parse(roomData)
        };
        
        console.log('📦 Dados recuperados do localStorage:', {
          playerId: parsed.player.id,
          playerName: parsed.player.name,
          roomId: parsed.room.id,
          roomName: parsed.room.name
        });
        
        return parsed;
      }
      
      console.log('📭 Nenhum dado salvo encontrado no localStorage');
      return null;
    } catch (error) {
      console.error('❌ Erro ao recuperar dados do jogador:', error);
      // Se houver erro, limpar dados corrompidos
      this.clearPlayerData();
      return null;
    }
  }

  // Limpar dados salvos
  static clearPlayerData() {
    try {
      const hadData = this.hasPlayerData();
      localStorage.removeItem(STORAGE_KEYS.CURRENT_PLAYER);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_ROOM);
      
      if (hadData) {
        console.log('🗑️ Dados do jogador removidos do localStorage');
      }
    } catch (error) {
      console.error('❌ Erro ao limpar dados do jogador:', error);
    }
  }

  // Verificar se há dados salvos
  static hasPlayerData() {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_PLAYER) && 
           localStorage.getItem(STORAGE_KEYS.CURRENT_ROOM);
  }

  // Atualizar apenas os dados do jogador (mantém room)
  static updatePlayerData(player) {
    try {
      const existingData = this.getPlayerData();
      if (existingData) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_PLAYER, JSON.stringify(player));
        console.log('🔄 Dados do jogador atualizados:', player.id);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar dados do jogador:', error);
    }
  }

  // Verificar se os dados salvos são válidos
  static validateSavedData() {
    try {
      const data = this.getPlayerData();
      if (!data) return false;
      
      // Verificar se tem campos obrigatórios
      const hasRequiredPlayerFields = data.player && 
                                     data.player.id && 
                                     data.player.name && 
                                     data.player.room_id;
                                     
      const hasRequiredRoomFields = data.room && 
                                   data.room.id && 
                                   data.room.name;
      
      const isValid = hasRequiredPlayerFields && 
                     hasRequiredRoomFields && 
                     data.player.room_id === data.room.id;
      
      if (!isValid) {
        console.warn('⚠️ Dados salvos inválidos detectados, limpando...');
        this.clearPlayerData();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erro ao validar dados salvos:', error);
      this.clearPlayerData();
      return false;
    }
  }
}
