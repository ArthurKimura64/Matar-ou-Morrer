const { verifyAdmin, getServiceClient } = require('./middleware');

module.exports = async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar admin
  const auth = await verifyAdmin(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { email, password, displayName } = req.body;

  // Validação
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password e displayName são obrigatórios' });
  }

  if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: 'Senha deve ter entre 6 e 128 caracteres' });
  }

  if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.length > 50) {
    return res.status(400).json({ error: 'Nome deve ter entre 2 e 50 caracteres' });
  }

  try {
    const serviceClient = getServiceClient();

    // Criar usuário via Admin API (SERVICE_ROLE)
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // Confirmar email automaticamente
      user_metadata: { display_name: displayName.trim() }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: displayName.trim()
      }
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
