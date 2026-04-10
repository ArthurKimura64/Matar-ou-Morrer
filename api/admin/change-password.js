const { verifyAdmin, getServiceClient } = require('./middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const auth = await verifyAdmin(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { userId, newPassword } = req.body;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return res.status(400).json({ error: 'userId inválido (deve ser UUID)' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Nova senha é obrigatória (mínimo 6 caracteres)' });
  }

  if (newPassword.length > 72) {
    return res.status(400).json({ error: 'Senha muito longa (máximo 72 caracteres)' });
  }

  try {
    const serviceClient = getServiceClient();

    // Não permitir alterar senha de outro admin
    if (userId !== auth.user.id) {
      const { data: isTargetAdmin } = await serviceClient
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (isTargetAdmin) {
        return res.status(403).json({ error: 'Não é possível alterar a senha de outro administrador' });
      }
    }

    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    return res.status(500).json({ error: 'Erro interno ao alterar senha' });
  }
};
