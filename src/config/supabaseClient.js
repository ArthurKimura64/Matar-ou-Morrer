import { createClient } from '@supabase/supabase-js';

/**
 * ============================================================================
 * CLIENTE DO BANCO DE DADOS SUPABASE (supabaseClient.js)
 * ============================================================================
 * O QUE ESTE ARQUIVO FAZ:
 * 1. Conecta o jogo ao seu projeto no Supabase usando as chaves do arquivo .env
 * 2. Mantém a sessão de login (JWT) sempre renovada quando o jogador volta para a aba.
 * ============================================================================
 */

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Variáveis de ambiente REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY são obrigatórias.');
}

// Salva no localStorage para que o painel admin.html consiga ler as mesmas chaves públicas
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

/**
 * Verifica se o token de login (JWT) está perto de vencer (menos de 2 minutos)
 * e força a renovação quando o jogador volta para a aba ou recupera a internet.
 */
async function refreshSessionIfNeeded() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.expires_at) return;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (session.expires_at - nowInSeconds < 120) {
      await supabase.auth.refreshSession();
    }
  } catch (error) {
    console.warn('⚠️ Aviso ao verificar sessão:', error);
  }
}

// Renova a sessão sempre que o jogador voltar para a aba ou a internet reconectar
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshSessionIfNeeded();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    refreshSessionIfNeeded();
  });
}