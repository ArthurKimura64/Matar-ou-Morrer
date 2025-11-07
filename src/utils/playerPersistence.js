// Chaves para localStorage
const STORAGE_KEYS = {
  CURRENT_PLAYER: 'killOrDie_currentPlayer',
  CURRENT_ROOM: 'killOrDie_currentRoom',
  APP_STATE: 'killOrDie_appState',
  SESSION_ID: 'killOrDie_sessionId'
};

export class PlayerPersistence {
  // Salvar dados do jogador
  static savePlayerData(player, room) {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PLAYER, JSON.stringify(player));
      localStorage.setItem(STORAGE_KEYS.CURRENT_ROOM, JSON.stringify(room));
    } catch (error) {
      console.error('❌ Erro ao salvar dados do jogador:', error);
    }
  }

  // Salvar estado da aplicação (view, personagem selecionado, etc.)
  static saveAppState(appState) {
    try {
      const stateToSave = {
        ...appState,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.APP_STATE, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('❌ Erro ao salvar estado da aplicação:', error);
    }
  }

  // Recuperar estado da aplicação
  static getAppState() {
    try {
      const stateData = localStorage.getItem(STORAGE_KEYS.APP_STATE);
      if (stateData) {
        const parsed = JSON.parse(stateData);
        return parsed;
      }
  return null;
    } catch (error) {
      console.error('❌ Erro ao recuperar estado da aplicação:', error);
      return null;
    }
  }

  // Gerar ID de sessão único para cada aba
  static generateSessionId() {
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
    return sessionId;
  }

  // Verificar se é a mesma sessão (mesmo navegador, mesma aba)
  static isSameSession() {
    const currentSessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
    return currentSessionId !== null;
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
        return parsed;
      }
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
      localStorage.removeItem(STORAGE_KEYS.APP_STATE);
      localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      
      if (hadData) {
      }
    } catch (error) {
      console.error('❌ Erro ao limpar dados do jogador:', error);
    }
  }

  // Limpar apenas o estado da aplicação (manter dados do jogador)
  static clearAppState() {
    try {
      const hadState = localStorage.getItem(STORAGE_KEYS.APP_STATE) !== null;
      localStorage.removeItem(STORAGE_KEYS.APP_STATE);
      
      if (hadState) {
      }
    } catch (error) {
      console.error('❌ Erro ao limpar estado da aplicação:', error);
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
