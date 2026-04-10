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

  const { userId } = req.body;

  // Validação
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId é obrigatório' });
  }

  // UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return res.status(400).json({ error: 'userId inválido (deve ser UUID)' });
  }

  // Não permitir deletar a si mesmo
  if (userId === auth.user.id) {
    return res.status(400).json({ error: 'Não é possível deletar sua própria conta' });
  }

  try {
    const serviceClient = getServiceClient();

    // Verificar se o alvo é admin (não permitir deletar admins)
    const { data: isTargetAdmin } = await serviceClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (isTargetAdmin) {
      return res.status(403).json({ error: 'Não é possível deletar um administrador' });
    }

    // Remover jogadores do usuário de todas as salas
    await serviceClient
      .from('players')
      .delete()
      .eq('user_id', userId);

    // Deletar usuário via Admin API (SERVICE_ROLE)
    // Isso remove auth.users + cascadeia para user_profiles, user_stats, etc.
    const { error } = await serviceClient.auth.admin.deleteUser(userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Registrar no audit log
    await serviceClient
      .from('admin_audit_log')
      .insert({
        admin_user_id: auth.user.id,
        action: 'delete_user',
        target_user_id: userId,
        details: {}
      });

    return res.status(200).json({
      success: true,
      userId
    });
  } catch (err) {
    console.error('Erro ao deletar usuário:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
