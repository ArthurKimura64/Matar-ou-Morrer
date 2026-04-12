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
    heartbeatIntervalMs: 15000, // Heartbeat a cada 15 segundos (adequado para jogo em tempo real)
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

  // Refresh proativo da sessão auth para evitar JWT expired
  async refreshSessionIfNeeded() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // Sem sessão (anônimo) — nada a fazer

      // Se o token expira em menos de 2 minutos, forçar refresh
      const expiresAt = session.expires_at; // Unix timestamp em segundos
      const nowSecs = Math.floor(Date.now() / 1000);
      if (expiresAt && (expiresAt - nowSecs) < 120) {
        console.log('🔄 Renovando sessão JWT proativamente...');
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.warn('⚠️ Falha ao renovar sessão:', error.message);
        } else {
          console.log('✅ Sessão JWT renovada com sucesso');
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao verificar/renovar sessão:', error);
    }
  }

  startHeartbeat() {
    // Heartbeat a cada 15 segundos para manter a conexão ativa
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Renovar sessão antes do heartbeat para evitar JWT expired
        await this.refreshSessionIfNeeded();

        const { error } = await supabase
          .from('rooms')
          .select('id')
          .limit(1);
          
        if (error) {
          // Se for JWT expired, tentar refresh imediato e retry
          if (error.message?.includes('JWT') || error.code === 'PGRST301') {
            console.warn('⚠️ JWT expirado no heartbeat, forçando refresh...');
            await supabase.auth.refreshSession();
            // Retry após refresh
            const { error: retryError } = await supabase
              .from('rooms')
              .select('id')
              .limit(1);
            if (retryError) throw retryError;
            // Se chegou aqui, refresh funcionou
            if (!this.isConnected) {
              this.isConnected = true;
              this.reconnectAttempts = 0;
              this.notifyCallbacks('connected');
            }
            return;
          }
          throw error;
        }
        
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
    }, 15000); // 15 segundos para jogo em tempo real
  }

  setupConnectionListeners() {
    // Listener para quando a página fica visível novamente
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Sempre renovar sessão ao voltar à aba — JWT pode ter expirado em background
        this.refreshSessionIfNeeded();
        if (!this.isConnected) {
          this.attemptReconnect();
        }
      }
    });

    // Listener para quando a conexão de rede é restabelecida
    window.addEventListener('online', () => {
      this.refreshSessionIfNeeded();
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
      // Refresh da sessão antes de tentar reconectar
      await this.refreshSessionIfNeeded();

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
