import { supabase } from '../config/supabaseClient';

class AuthService {
  // ==================== AUTENTICAÇÃO ====================

  async signUpWithEmail(email, password, displayName) {
    // Verificar se cadastro está aberto
    const { data: regOpen, error: regErr } = await supabase.rpc('get_app_setting', { p_key: 'registration_open' });
    if (regErr) throw new Error('Erro ao verificar cadastro');
    if (regOpen !== 'true') throw new Error('Novos cadastros estão desativados no momento.');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName }
      }
    });
    if (error) throw error;
    return data;
  }

  async signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  }

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }

  // ==================== PERFIL ====================

  async isRegistrationOpen() {
    const { data, error } = await supabase.rpc('get_app_setting', { p_key: 'registration_open' });
    if (error) return true; // em caso de erro, permitir
    return data === 'true';
  }

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateTheme(userId, themeId) {
    // 1. Chama a RPC segura no banco para gravar na coluna theme de user_profiles
    const { error: rpcError } = await supabase.rpc('update_user_theme', {
      p_theme: themeId
    });

    if (rpcError) {
      // Fallback via update direto caso a RPC ainda não tenha sido rodada
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ theme: themeId, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    return { id: userId, theme: themeId };
  }

  // ==================== ESTATÍSTICAS ====================

  async getUserStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  async getMatchHistory(userId, limit = 20, offset = 0) {
    const safeLimit = Math.max(1, Number(limit) || 20);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const { data, error } = await supabase
      .from('match_history')
      .select(`
        id,
        room_id,
        room_name,
        started_at,
        ended_at,
        winner_user_id,
        winner_player_name,
        total_players,
        match_participants!inner (
          id,
          match_id,
          user_id,
          player_name,
          character_name,
          elimination_order,
          killed_by_user_id,
          killed_by_player_name,
          survival_points,
          eliminations_made,
          is_winner
        )
      `)
      .eq('match_participants.user_id', userId)
      .order('ended_at', { ascending: false })
      .order('id', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) throw error;

    return (data || []).flatMap((row) => {
      const { match_participants, ...matchInfo } = row;
      const participantsList = Array.isArray(match_participants)
        ? match_participants
        : [match_participants];

      return participantsList.filter(Boolean).map((participant) => ({
        ...matchInfo,
        ...participant,
        match: matchInfo,
        match_history: matchInfo
      }));
    });
  }

  async getMatchDetails(matchId) {
    const { data, error } = await supabase
      .from('match_history')
      .select(`
        *,
        participants:match_participants(*)
      `)
      .eq('id', matchId)
      .single();
    if (error) throw error;
    return data;
  }

  // ==================== RANKING ====================

  async getLeaderboard(type = 'composite', limit = 50) {
    const orderColumn = {
      composite: 'composite_score',
      wins: 'total_wins',
      eliminations: 'total_eliminations',
      survival: 'total_survival_points'
    }[type] || 'composite_score';

    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profile:user_profiles(display_name, avatar_url)
      `)
      .gt('total_matches', 0)
      .order(orderColumn, { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async getUserRankPosition(userId, type = 'composite') {
    const orderColumn = {
      composite: 'composite_score',
      wins: 'total_wins',
      eliminations: 'total_eliminations',
      survival: 'total_survival_points'
    }[type] || 'composite_score';

    // Get current user's stat value
    const { data: userStats, error: userError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (userError || !userStats || userStats.total_matches === 0) return null;

    // Count how many players have a higher score
    const { count, error: countError } = await supabase
      .from('user_stats')
      .select('*', { count: 'exact', head: true })
      .gt('total_matches', 0)
      .gt(orderColumn, userStats[orderColumn] || 0);
    if (countError) return null;

    return { position: (count || 0) + 1, stats: userStats };
  }

  async getRoomLeaderboard(roomId, type = 'composite', limit = 50) {
    const orderColumn = {
      composite: 'composite_score',
      wins: 'total_wins',
      eliminations: 'total_eliminations',
      survival: 'total_survival_points'
    }[type] || 'composite_score';

    // Get user_ids that participated in matches in this room
    const { data: matchIds, error: matchError } = await supabase
      .from('match_history')
      .select('id')
      .eq('room_id', roomId);
    if (matchError) throw matchError;

    if (!matchIds || matchIds.length === 0) return [];

    const ids = matchIds.map(m => m.id);
    const { data: participants, error: partError } = await supabase
      .from('match_participants')
      .select('user_id')
      .in('match_id', ids)
      .not('user_id', 'is', null);
    if (partError) throw partError;

    const uniqueUserIds = [...new Set(participants.map(p => p.user_id))];
    if (uniqueUserIds.length === 0) return [];

    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profile:user_profiles(display_name, avatar_url)
      `)
      .in('user_id', uniqueUserIds)
      .order(orderColumn, { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  // ==================== VERIFICAÇÃO DE ADMIN ====================

  async checkIsAdmin() {
    try {
      const { data, error } = await supabase.rpc('is_user_admin');
      if (error) return false;
      return data === true;
    } catch {
      return false;
    }
  }

  // ==================== VERIFICAÇÃO DE BAN ====================

  async checkBanStatus(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('banned_at, ban_reason')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data?.banned_at ? { banned: true, reason: data.ban_reason, bannedAt: data.banned_at } : { banned: false };
  }

  // ==================== SENHA ====================

  async resetPasswordForEmail(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
  }

  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }
}

const authService = new AuthService();
export default authService;
