import { supabase } from '../config/supabaseClient';

const LEADERBOARD_CACHE_TTL_MS = 30000;

class AuthService {
  constructor() {
    this.leaderboardCache = new Map();
  }

  _getCached(key) {
    const entry = this.leaderboardCache.get(key);
    if (!entry) return { hit: false, data: null };
    if (Date.now() - entry.timestamp > LEADERBOARD_CACHE_TTL_MS) {
      this.leaderboardCache.delete(key);
      return { hit: false, data: null };
    }
    return { hit: true, data: entry.data };
  }

  _setCached(key, data) {
    this.leaderboardCache.set(key, { data, timestamp: Date.now() });
  }

  clearLeaderboardCache() {
    this.leaderboardCache.clear();
  }

  // ==================== AUTENTICAÇÃO ====================

  async signUpWithEmail(email, password, displayName) {
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
    this.clearLeaderboardCache();
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
    if (error) return true;
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
    this.clearLeaderboardCache();
    return data;
  }

  async updateTheme(userId, themeId) {
    const { error: rpcError } = await supabase.rpc('update_user_theme', {
      p_theme: themeId
    });

    if (rpcError) {
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

  // ==================== RANKING (COM CACHE DE 30s) ====================

  async getLeaderboard(type = 'composite', limit = 50, forceRefresh = false) {
    const cacheKey = `lb_${type}_${limit}`;
    if (!forceRefresh) {
      const cached = this._getCached(cacheKey);
      if (cached.hit) return cached.data;
    }

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
        profile:user_profiles!inner(display_name, avatar_url)
      `)
      .is('profile.banned_at', null)
      .gt('total_matches', 0)
      .order(orderColumn, { ascending: false })
      .limit(limit);
    if (error) throw error;

    const result = data || [];
    this._setCached(cacheKey, result);
    return result;
  }

  async getUserRankPosition(userId, type = 'composite', forceRefresh = false) {
    const cacheKey = `rank_${userId}_${type}`;
    if (!forceRefresh) {
      const cached = this._getCached(cacheKey);
      if (cached.hit) return cached.data;
    }

    const orderColumn = {
      composite: 'composite_score',
      wins: 'total_wins',
      eliminations: 'total_eliminations',
      survival: 'total_survival_points'
    }[type] || 'composite_score';

    const { data: userStats, error: userError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError || !userStats || userStats.total_matches === 0) {
      this._setCached(cacheKey, null);
      return null;
    }

    const { count, error: countError } = await supabase
      .from('user_stats')
      .select('user_id, profile:user_profiles!inner(id)', { count: 'exact', head: true })
      .is('profile.banned_at', null)
      .gt('total_matches', 0)
      .gt(orderColumn, userStats[orderColumn] || 0);
    if (countError) return null;

    const result = { position: (count || 0) + 1, stats: userStats };
    this._setCached(cacheKey, result);
    return result;
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