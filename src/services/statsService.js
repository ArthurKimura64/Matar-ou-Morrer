import { supabase } from '../config/supabaseClient';

const CACHE_TTL_MS = 30000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export const statsService = {
  async getGlobalStats(forceRefresh = false) {
    const cacheKey = 'global_stats';
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) return { success: true, data: cached };
    }

    try {
      const { data, error } = await supabase.rpc('get_global_stats');
      if (error) throw error;
      setCached(cacheKey, data);
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar estatísticas globais:', error);
      return { success: false, error: error.message };
    }
  },

  async searchPlayers(query, limit = 15) {
    const clean = String(query || '').trim();
    if (clean.length < 2) {
      return { success: true, players: [] };
    }

    try {
      const { data, error } = await supabase.rpc('search_public_players', {
        p_query: clean,
        p_limit: limit
      });
      if (error) throw error;
      return { success: true, players: Array.isArray(data) ? data : [] };
    } catch (error) {
      console.error('Erro ao buscar jogadores:', error);
      return { success: false, players: [], error: error.message };
    }
  },

  async getPlayerPublicStats(userId, forceRefresh = false) {
    if (!userId) return { success: false, error: 'ID de jogador inválido' };

    const cacheKey = `player_stats_${userId}`;
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) return { success: true, data: cached };
    }

    try {
      const { data, error } = await supabase.rpc('get_player_public_stats', {
        p_user_id: userId
      });
      if (error) throw error;
      if (!data || data.success === false) {
        return { success: false, error: data?.error || 'Jogador não encontrado' };
      }

      setCached(cacheKey, data);
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar estatísticas do jogador:', error);
      return { success: false, error: error.message };
    }
  },

  clearCache() {
    cache.clear();
  }
};