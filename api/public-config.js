module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Variáveis públicas do Supabase não configuradas no servidor." })
  }

  res.setHeader("Cache-Control", "public, max-age=300")
  return res.status(200).json({ supabaseUrl, supabaseAnonKey })
}
