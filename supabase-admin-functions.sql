-- ================================================================
-- FUNÇÕES ADMINISTRATIVAS — Execute no SQL Editor do Supabase
-- Pré-requisito: supabase-security-migration.sql já executado
-- ================================================================

-- ================================
-- 0. ALTERAÇÕES DE SCHEMA
-- ================================

-- Tabela de configurações do app
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Todos podem LER configurações (ex: registration_open)
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
CREATE POLICY "Anyone can read app_settings" ON public.app_settings
    FOR SELECT USING (true);

-- Somente admin pode alterar via RPC (sem INSERT/UPDATE direto)
DROP POLICY IF EXISTS "No direct write app_settings" ON public.app_settings;
CREATE POLICY "No direct write app_settings" ON public.app_settings
    FOR ALL USING (false) WITH CHECK (false);

-- Inserir valor padrão: cadastro aberto
INSERT INTO public.app_settings (key, value)
VALUES ('registration_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- Colunas de ban em user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.user_profiles.banned_at IS 'Timestamp de quando o usuário foi banido (NULL = não banido)';
COMMENT ON COLUMN public.user_profiles.ban_reason IS 'Motivo do banimento';

-- Tabela de auditoria de ações administrativas
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_user_id UUID NOT NULL REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_user_id UUID,
    target_room_id VARCHAR(6),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler o log
DROP POLICY IF EXISTS "admin_audit_log_select" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
    FOR SELECT USING (public.is_user_admin());

-- Ninguém insere diretamente (apenas via SECURITY DEFINER)
DROP POLICY IF EXISTS "admin_audit_log_insert_deny" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_insert_deny" ON public.admin_audit_log
    FOR INSERT WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

COMMENT ON TABLE public.admin_audit_log IS 'Log de auditoria de todas as ações administrativas';

-- Adicionar coluna match_status nas rooms se não existir
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS match_status VARCHAR(20) DEFAULT NULL;

-- ================================
-- 1. HELPER: registrar ação no audit log
-- ================================
CREATE OR REPLACE FUNCTION public._admin_log(
    p_action TEXT,
    p_target_user_id UUID DEFAULT NULL,
    p_target_room_id VARCHAR(6) DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_room_id, details)
    VALUES (auth.uid(), p_action, p_target_user_id, p_target_room_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 2. BANIR USUÁRIO
-- ================================
CREATE OR REPLACE FUNCTION public.admin_ban_user(
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Violação das regras'
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Não permitir banir a si mesmo
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Não é possível banir a si mesmo';
    END IF;

    -- Não permitir banir outro admin
    IF public.is_user_admin(p_user_id) THEN
        RAISE EXCEPTION 'Não é possível banir outro administrador';
    END IF;

    -- Atualizar user_profiles com ban
    UPDATE public.user_profiles
    SET banned_at = NOW(),
        ban_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    -- Desconectar jogadores deste usuário de todas as salas
    UPDATE public.players
    SET is_connected = false
    WHERE user_id = p_user_id;

    -- Registrar no audit log
    PERFORM public._admin_log('ban_user', p_user_id, NULL, 
        jsonb_build_object('reason', p_reason));

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'banned_at', NOW(),
        'reason', p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 3. DESBANIR USUÁRIO
-- ================================
CREATE OR REPLACE FUNCTION public.admin_unban_user(
    p_user_id UUID
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    UPDATE public.user_profiles
    SET banned_at = NULL,
        ban_reason = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    PERFORM public._admin_log('unban_user', p_user_id);

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'unbanned_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 4. KICK ADMIN — expulsar jogador de qualquer sala
-- ================================
CREATE OR REPLACE FUNCTION public.admin_kick_from_room(
    p_player_id UUID,
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_player_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT name INTO v_player_name
    FROM public.players
    WHERE id = p_player_id AND room_id = p_room_id;

    IF v_player_name IS NULL THEN
        RAISE EXCEPTION 'Jogador não encontrado nesta sala';
    END IF;

    DELETE FROM public.players
    WHERE id = p_player_id AND room_id = p_room_id;

    PERFORM public._admin_log('kick_player', NULL, p_room_id,
        jsonb_build_object('player_id', p_player_id, 'player_name', v_player_name));

    RETURN json_build_object(
        'success', true,
        'player_name', v_player_name,
        'room_id', p_room_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 5. FORÇAR FIM DE PARTIDA
-- ================================
CREATE OR REPLACE FUNCTION public.admin_force_end_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT name INTO v_room_name
    FROM public.rooms
    WHERE id = p_room_id;

    IF v_room_name IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    -- Resetar status da partida
    UPDATE public.rooms
    SET match_status = NULL
    WHERE id = p_room_id;

    -- Resetar status dos jogadores na sala
    UPDATE public.players
    SET status = 'ready'
    WHERE room_id = p_room_id;

    PERFORM public._admin_log('force_end_match', NULL, p_room_id,
        jsonb_build_object('room_name', v_room_name));

    RETURN json_build_object(
        'success', true,
        'room_id', p_room_id,
        'room_name', v_room_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 6. DELETAR SALA
-- ================================
CREATE OR REPLACE FUNCTION public.admin_delete_room(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room_name TEXT;
    v_player_count INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT name INTO v_room_name
    FROM public.rooms
    WHERE id = p_room_id;

    IF v_room_name IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    SELECT COUNT(*) INTO v_player_count
    FROM public.players
    WHERE room_id = p_room_id;

    -- Jogadores são removidos automaticamente (ON DELETE CASCADE)
    DELETE FROM public.rooms
    WHERE id = p_room_id;

    PERFORM public._admin_log('delete_room', NULL, p_room_id,
        jsonb_build_object('room_name', v_room_name, 'players_removed', v_player_count));

    RETURN json_build_object(
        'success', true,
        'room_id', p_room_id,
        'room_name', v_room_name,
        'players_removed', v_player_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 7. RESETAR ESTATÍSTICAS DE USUÁRIO
-- ================================
CREATE OR REPLACE FUNCTION public.admin_reset_user_stats(
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    v_display_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles
    WHERE id = p_user_id;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    UPDATE public.user_stats
    SET total_matches = 0,
        total_wins = 0,
        total_eliminations = 0,
        total_survival_points = 0,
        composite_score = 0,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    PERFORM public._admin_log('reset_stats', p_user_id, NULL,
        jsonb_build_object('display_name', v_display_name));

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'display_name', v_display_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 8. LISTAR SALAS (com detalhes)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_list_rooms(
    p_include_inactive BOOLEAN DEFAULT false,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_rooms JSON;
    v_total INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Contar total
    IF p_include_inactive THEN
        SELECT COUNT(*) INTO v_total FROM public.rooms;
    ELSE
        SELECT COUNT(*) INTO v_total FROM public.rooms WHERE is_active = true;
    END IF;

    -- Buscar salas com contagem de jogadores
    SELECT json_agg(room_data ORDER BY room_data.created_at DESC) INTO v_rooms
    FROM (
        SELECT 
            r.id,
            r.name,
            r.master_name,
            r.is_active,
            r.match_status,
            r.created_at,
            r.last_activity,
            (SELECT COUNT(*) FROM public.players p WHERE p.room_id = r.id) AS total_players,
            (SELECT COUNT(*) FROM public.players p WHERE p.room_id = r.id AND p.is_connected = true) AS connected_players
        FROM public.rooms r
        WHERE p_include_inactive OR r.is_active = true
        ORDER BY r.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) room_data;

    RETURN json_build_object(
        'success', true,
        'total', v_total,
        'rooms', COALESCE(v_rooms, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 9. LISTAR USUÁRIOS (com stats e status de ban)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_banned_only BOOLEAN DEFAULT false,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_users JSON;
    v_total INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Contar total com filtros
    SELECT COUNT(*) INTO v_total
    FROM public.user_profiles up
    WHERE (p_search IS NULL OR up.display_name ILIKE '%' || p_search || '%')
      AND (NOT p_banned_only OR up.banned_at IS NOT NULL);

    -- Buscar usuários com stats
    SELECT json_agg(user_data ORDER BY user_data.created_at DESC) INTO v_users
    FROM (
        SELECT 
            up.id,
            up.display_name,
            up.avatar_url,
            up.created_at,
            up.updated_at,
            up.banned_at,
            up.ban_reason,
            COALESCE(us.total_matches, 0) AS total_matches,
            COALESCE(us.total_wins, 0) AS total_wins,
            COALESCE(us.total_eliminations, 0) AS total_eliminations,
            COALESCE(us.total_survival_points, 0) AS total_survival_points,
            COALESCE(us.composite_score, 0) AS composite_score,
            (SELECT EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = up.id AND au.is_active = true)) AS is_admin
        FROM public.user_profiles up
        LEFT JOIN public.user_stats us ON us.user_id = up.id
        WHERE (p_search IS NULL OR up.display_name ILIKE '%' || p_search || '%')
          AND (NOT p_banned_only OR up.banned_at IS NOT NULL)
        ORDER BY up.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) user_data;

    RETURN json_build_object(
        'success', true,
        'total', v_total,
        'users', COALESCE(v_users, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 10. HISTÓRICO DE PARTIDAS (admin view)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_get_match_history(
    p_room_id VARCHAR(6) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_matches JSON;
    v_total INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Contar total
    SELECT COUNT(*) INTO v_total
    FROM public.match_history mh
    WHERE p_room_id IS NULL OR mh.room_id = p_room_id;

    -- Buscar partidas com participantes
    SELECT json_agg(match_data ORDER BY match_data.ended_at DESC) INTO v_matches
    FROM (
        SELECT 
            mh.id,
            mh.room_id,
            mh.room_name,
            mh.started_at,
            mh.ended_at,
            mh.winner_user_id,
            mh.winner_player_name,
            mh.total_players,
            (
                SELECT json_agg(json_build_object(
                    'user_id', mp.user_id,
                    'player_name', mp.player_name,
                    'character_name', mp.character_name,
                    'elimination_order', mp.elimination_order,
                    'survival_points', mp.survival_points,
                    'is_winner', mp.is_winner,
                    'killed_by_player_name', mp.killed_by_player_name
                ) ORDER BY mp.elimination_order ASC NULLS LAST)
                FROM public.match_participants mp
                WHERE mp.match_id = mh.id
            ) AS participants
        FROM public.match_history mh
        WHERE p_room_id IS NULL OR mh.room_id = p_room_id
        ORDER BY mh.ended_at DESC
        LIMIT p_limit OFFSET p_offset
    ) match_data;

    RETURN json_build_object(
        'success', true,
        'total', v_total,
        'matches', COALESCE(v_matches, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 11. DASHBOARD — estatísticas resumidas para admin
-- ================================
CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN json_build_object(
        'timestamp', NOW(),
        -- Salas
        'total_rooms', (SELECT COUNT(*) FROM public.rooms),
        'active_rooms', (SELECT COUNT(*) FROM public.rooms WHERE is_active = true),
        'rooms_in_match', (SELECT COUNT(*) FROM public.rooms WHERE match_status IS NOT NULL),
        -- Jogadores
        'total_players', (SELECT COUNT(*) FROM public.players),
        'connected_players', (SELECT COUNT(*) FROM public.players WHERE is_connected = true),
        -- Usuários
        'total_users', (SELECT COUNT(*) FROM public.user_profiles),
        'banned_users', (SELECT COUNT(*) FROM public.user_profiles WHERE banned_at IS NOT NULL),
        -- Partidas
        'total_matches', (SELECT COUNT(*) FROM public.match_history),
        'matches_today', (SELECT COUNT(*) FROM public.match_history WHERE ended_at >= CURRENT_DATE),
        'matches_this_week', (SELECT COUNT(*) FROM public.match_history WHERE ended_at >= CURRENT_DATE - INTERVAL '7 days'),
        -- Top jogadores
        'top_players', (
            SELECT COALESCE(json_agg(json_build_object(
                'display_name', tp.display_name,
                'composite_score', tp.composite_score,
                'total_wins', tp.total_wins
            )), '[]'::json)
            FROM (
                SELECT up.display_name, us.composite_score, us.total_wins
                FROM public.user_stats us
                JOIN public.user_profiles up ON up.id = us.user_id
                WHERE us.composite_score > 0
                ORDER BY us.composite_score DESC
                LIMIT 5
            ) tp
        ),
        -- Atividade recente
        'recent_matches', (
            SELECT json_agg(json_build_object(
                'id', mh.id,
                'room_name', mh.room_name,
                'winner_player_name', mh.winner_player_name,
                'total_players', mh.total_players,
                'ended_at', mh.ended_at
            ) ORDER BY mh.ended_at DESC)
            FROM (SELECT * FROM public.match_history ORDER BY ended_at DESC LIMIT 5) mh
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 12. LISTAR AUDIT LOG
-- ================================
CREATE OR REPLACE FUNCTION public.admin_get_audit_log(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_logs JSON;
    v_total INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT COUNT(*) INTO v_total FROM public.admin_audit_log;

    SELECT json_agg(log_data ORDER BY log_data.created_at DESC) INTO v_logs
    FROM (
        SELECT 
            al.id,
            al.action,
            al.target_user_id,
            al.target_room_id,
            al.details,
            al.created_at,
            up.display_name AS admin_name
        FROM public.admin_audit_log al
        LEFT JOIN public.user_profiles up ON up.id = al.admin_user_id
        ORDER BY al.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) log_data;

    RETURN json_build_object(
        'success', true,
        'total', v_total,
        'logs', COALESCE(v_logs, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 13. DETALHES DE UM USUÁRIO (perfil + stats + partidas recentes)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_get_user_details(
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    v_profile JSON;
    v_stats JSON;
    v_matches JSON;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Perfil
    SELECT json_build_object(
        'id', up.id,
        'display_name', up.display_name,
        'avatar_url', up.avatar_url,
        'created_at', up.created_at,
        'updated_at', up.updated_at,
        'banned_at', up.banned_at,
        'ban_reason', up.ban_reason,
        'is_admin', EXISTS(SELECT 1 FROM public.admin_users au WHERE au.user_id = up.id AND au.is_active = true)
    ) INTO v_profile
    FROM public.user_profiles up
    WHERE up.id = p_user_id;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    -- Stats
    SELECT json_build_object(
        'total_matches', COALESCE(us.total_matches, 0),
        'total_wins', COALESCE(us.total_wins, 0),
        'total_eliminations', COALESCE(us.total_eliminations, 0),
        'total_survival_points', COALESCE(us.total_survival_points, 0),
        'favorite_character', us.favorite_character,
        'win_rate', COALESCE(us.win_rate, 0),
        'composite_score', COALESCE(us.composite_score, 0)
    ) INTO v_stats
    FROM public.user_stats us
    WHERE us.user_id = p_user_id;

    -- Partidas recentes (últimas 20)
    SELECT COALESCE(json_agg(match_data ORDER BY match_data.ended_at DESC), '[]'::json) INTO v_matches
    FROM (
        SELECT
            mh.id AS match_id,
            mh.room_name,
            mh.ended_at,
            mh.winner_player_name,
            mh.total_players,
            mp.player_name,
            mp.character_name,
            mp.elimination_order,
            mp.survival_points,
            mp.is_winner,
            mp.killed_by_player_name
        FROM public.match_participants mp
        JOIN public.match_history mh ON mh.id = mp.match_id
        WHERE mp.user_id = p_user_id
        ORDER BY mh.ended_at DESC
        LIMIT 20
    ) match_data;

    RETURN json_build_object(
        'success', true,
        'profile', v_profile,
        'stats', COALESCE(v_stats, json_build_object(
            'total_matches', 0, 'total_wins', 0, 'total_eliminations', 0,
            'total_survival_points', 0, 'favorite_character', NULL,
            'win_rate', 0, 'composite_score', 0
        )),
        'matches', v_matches
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 14. ATUALIZAR STATS DE USUÁRIO (edição manual pelo admin)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_update_user_stats(
    p_user_id UUID,
    p_total_matches INTEGER DEFAULT NULL,
    p_total_wins INTEGER DEFAULT NULL,
    p_total_eliminations INTEGER DEFAULT NULL,
    p_total_survival_points INTEGER DEFAULT NULL,
    p_composite_score DECIMAL DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_display_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;
    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    -- Inserir stats se não existir
    INSERT INTO public.user_stats (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.user_stats
    SET total_matches = COALESCE(p_total_matches, total_matches),
        total_wins = COALESCE(p_total_wins, total_wins),
        total_eliminations = COALESCE(p_total_eliminations, total_eliminations),
        total_survival_points = COALESCE(p_total_survival_points, total_survival_points),
        composite_score = COALESCE(p_composite_score, composite_score),
        win_rate = CASE
            WHEN COALESCE(p_total_matches, total_matches) > 0
            THEN ROUND((COALESCE(p_total_wins, total_wins)::DECIMAL / COALESCE(p_total_matches, total_matches)) * 100, 2)
            ELSE 0
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    PERFORM public._admin_log('update_stats', p_user_id, NULL,
        jsonb_build_object('display_name', v_display_name));

    RETURN json_build_object('success', true, 'display_name', v_display_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 15. ATUALIZAR PERFIL DE USUÁRIO (nome de exibição)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
    p_user_id UUID,
    p_display_name TEXT DEFAULT NULL
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    UPDATE public.user_profiles
    SET display_name = COALESCE(p_display_name, display_name),
        updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM public._admin_log('update_profile', p_user_id, NULL,
        jsonb_build_object('new_display_name', p_display_name));

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 16. DELETAR PARTIDA DO HISTÓRICO
-- ================================
CREATE OR REPLACE FUNCTION public.admin_delete_match(
    p_match_id UUID
) RETURNS JSON AS $$
DECLARE
    v_room_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT room_name INTO v_room_name
    FROM public.match_history WHERE id = p_match_id;

    IF v_room_name IS NULL THEN
        RAISE EXCEPTION 'Partida não encontrada';
    END IF;

    -- Deletar participantes (cascade) e a partida
    DELETE FROM public.match_history WHERE id = p_match_id;

    PERFORM public._admin_log('delete_match', NULL, NULL,
        jsonb_build_object('match_id', p_match_id, 'room_name', v_room_name));

    RETURN json_build_object('success', true, 'room_name', v_room_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 17. DETALHE DA SALA (jogadores dentro)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_get_room_detail(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room JSON;
    v_players JSON;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT json_build_object(
        'id', r.id,
        'name', r.name,
        'master_name', r.master_name,
        'is_active', r.is_active,
        'match_status', r.match_status,
        'created_at', r.created_at,
        'last_activity', r.last_activity
    ) INTO v_room
    FROM public.rooms r WHERE r.id = p_room_id;

    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    SELECT COALESCE(json_agg(json_build_object(
        'id', p.id,
        'name', p.name,
        'user_id', p.user_id,
        'character_name', p.character_name,
        'status', p.status,
        'is_connected', p.is_connected,
        'joined_at', p.joined_at,
        'last_activity', p.last_activity,
        'display_name', up.display_name,
        'banned_at', up.banned_at
    ) ORDER BY p.joined_at), '[]'::json) INTO v_players
    FROM public.players p
    LEFT JOIN public.user_profiles up ON up.id = p.user_id
    WHERE p.room_id = p_room_id;

    RETURN json_build_object(
        'success', true,
        'room', v_room,
        'players', v_players
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 18. OBTER CONFIGURAÇÃO PÚBLICA (anon + authenticated)
-- ================================
CREATE OR REPLACE FUNCTION public.get_app_setting(p_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT value FROM public.app_settings WHERE key = p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 19. ATUALIZAR CONFIGURAÇÃO (admin only)
-- ================================
CREATE OR REPLACE FUNCTION public.admin_update_setting(
    p_key TEXT,
    p_value TEXT
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    INSERT INTO public.app_settings (key, value, updated_at)
    VALUES (p_key, p_value, NOW())
    ON CONFLICT (key) DO UPDATE SET value = p_value, updated_at = NOW();

    RETURN json_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- GRANTS
-- ================================
-- Permitir que authenticated users chamem as funções (a verificação de admin é interna)
GRANT EXECUTE ON FUNCTION public.admin_ban_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kick_from_room TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_end_match TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_room TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_rooms TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_match_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_match TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_room_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_setting TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_setting TO authenticated;
