const { verifyAdmin, getServiceClient } = require("./middleware")

module.exports = async function handler(req, res) {
  // Apenas POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" })
  }

  // Verificar admin
  const auth = await verifyAdmin(req)
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error })
  }

  const { email, password, displayName } = req.body || {}

  // Validação
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "email, password e displayName são obrigatórios" })
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim()) || email.length > 254) {
    return res.status(400).json({ error: "Email inválido" })
  }

  if (typeof password !== "string" || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: "Senha deve ter entre 6 e 72 caracteres" })
  }

  if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.length > 50) {
    return res.status(400).json({ error: "Nome deve ter entre 2 e 50 caracteres" })
  }
  const SAFE_NAME_REGEX = /^[a-zA-Z0-9\u00C0-\u017F\s\-_]+$/
  if (!SAFE_NAME_REGEX.test(displayName.trim())) {
    return res.status(400).json({ error: "Nome contém caracteres não permitidos" })
  }

  try {
    const serviceClient = getServiceClient()

    // Criar usuário via Admin API (SERVICE_ROLE)
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName.trim() },
      app_metadata: { created_by_admin: true }
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Registrar criação de conta no log de auditoria
    await serviceClient.from("admin_audit_log").insert({
      admin_user_id: auth.user.id,
      action: "create_user",
      target_user_id: data.user.id,
      details: {
        display_name: displayName.trim(),
        email: email.trim().toLowerCase()
      }
    })

    return res.status(201).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: displayName.trim()
      }
    })
  } catch (err) {
    console.error("Erro ao criar usuário:", err)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
}
