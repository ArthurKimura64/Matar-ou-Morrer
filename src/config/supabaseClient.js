import { createClient } from '@supabase/supabase-js';

/**
 * ============================================================================
 * CLIENTE DO BANCO DE DADOS SUPABASE (supabaseClient.js)
 * ============================================================================
 * 1. Conecta o jogo ao seu projeto no Supabase usando as chaves do arquivo .env.
 * 2. Deixa o autoRefreshToken nativo do Supabase cuidar da troca de abas
 *    (evitando conflito de lock entre duas abas abertas no mesmo navegador).
 * ============================================================================
 */

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias.');
}

// Salva no localStorage para que o painel administrativo possa ler as mesmas chaves públicas
if (supabaseUrl && supabaseAnonKey) {
  localStorage.setItem('supabase_url', supabaseUrl);
  localStorage.setItem('supabase_key', supabaseAnonKey);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries) => Math.min(tries * 1500, 30000)
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  db: {
    schema: 'public'
  }
});

// Renova apenas quando a internet cai e volta (com pequeno atraso para evitar fila de locks)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.expires_at) return;

        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (session.expires_at - nowInSeconds < 120) {
          await supabase.auth.refreshSession();
        }
      } catch (error) {
        console.warn('⚠️ Aviso ao verificar sessão após reconexão:', error);
      }
    }, 300);
  });
}