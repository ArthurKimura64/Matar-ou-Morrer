const { createClient } = require('@supabase/supabase-js');

/**
 * Middleware para rotas admin do Vercel Serverless.
 * Verifica JWT do usuário e se é admin via RPC.
 */
async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Token de autenticação ausente', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: 'Configuração do servidor incompleta', status: 500 };
  }

  // Usar anon key + JWT do usuário para verificar identidade
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'Token inválido ou expirado', status: 401 };
  }

  // Verificar se é admin
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_user_admin', {
    p_user_id: user.id
  });

  if (adminError || !isAdmin) {
    return { error: 'Acesso negado: apenas administradores', status: 403 };
  }

  return { user };
}

/**
 * Cria um Supabase client com SERVICE_ROLE key (bypassa RLS).
 */
function getServiceClient() {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = { verifyAdmin, getServiceClient };
