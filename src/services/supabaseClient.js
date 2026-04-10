import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Variáveis de ambiente REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY são obrigatórias.');
}

// Salvar no localStorage para uso pelo admin.html (são chaves públicas, não secretas)
if (supabaseUrl && supabaseAnonKey) {
  localStorage.setItem('supabase_url', supabaseUrl);
  localStorage.setItem('supabase_key', supabaseAnonKey);
}

// Configurar Supabase com reconexão automática e otimizações
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    heartbeatIntervalMs: 60000, // Heartbeat a cada 60 segundos (reduzido overhead)
    reconnectAfterMs: (tries) => Math.min(tries * 1500, 30000), // Reconexão progressiva mais suave
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  // Adicionar configurações de pool para melhor performance
  db: {
    schema: 'public'
  }
});

// Sistema de monitoramento de conexão
class ConnectionMonitor {
  constructor() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.heartbeatInterval = null;
    this.callbacks = new Set();
    
    this.startHeartbeat();
    this.setupConnectionListeners();
  }

  startHeartbeat() {
    // Heartbeat a cada 60 segundos para manter a conexão ativa (reduzido overhead)
    this.heartbeatInterval = setInterval(async () => {
      try {
        const { error } = await supabase
          .from('rooms')
          .select('id')
          .limit(1);
          
        if (error) throw error;
        
        if (!this.isConnected) {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.notifyCallbacks('connected');
        }
      } catch (error) {
        if (this.isConnected) {
          this.isConnected = false;
          console.warn('⚠️ Conexão Supabase perdida, tentando reconectar...');
          this.notifyCallbacks('disconnected');
        }
        this.attemptReconnect();
      }
    }, 60000); // Aumentado para 60 segundos
  }

  setupConnectionListeners() {
    // Listener para quando a página fica visível novamente
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.isConnected) {
        this.attemptReconnect();
      }
    });

    // Listener para quando a conexão de rede é restabelecida
    window.addEventListener('online', () => {
      this.attemptReconnect();
    });
  }

  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Máximo de tentativas de reconexão atingido');
      return;
    }

    this.reconnectAttempts++;

    try {
      const { error } = await supabase
        .from('rooms')
        .select('id')
        .limit(1);
        
      if (!error) {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyCallbacks('reconnected');
      }
    } catch (error) {
      console.error('❌ Falha na reconexão:', error);
      // Tentar novamente após um delay
      setTimeout(() => this.attemptReconnect(), 5000);
    }
  }

  onConnectionChange(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  notifyCallbacks(status) {
    this.callbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Erro no callback de conexão:', error);
      }
    });
  }

  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.callbacks.clear();
  }
}

export const connectionMonitor = new ConnectionMonitor();
