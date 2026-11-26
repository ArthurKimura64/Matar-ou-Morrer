-- ================================================================
-- MATAR OU MORRER — Todas as Funções e Triggers (v5.6)
-- Execute no SQL Editor do Supabase DEPOIS de 01-setup.sql
-- ================================================================

DROP FUNCTION IF EXISTS public.record_match_result(VARCHAR, VARCHAR, TIMESTAMPTZ, UUID, VARCHAR, INTEGER, JSONB);

-- ================================
-- SEÇÃO 1: TRIGGER FUNCTIONS & TRIGGERS
-- ================================

CREATE OR REPLACE FUNCTION public.update_player_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_player_activity_trigger ON public.players;
CREATE TRIGGER update_player_activity_trigger
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.update_player_activity();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_registration_open TEXT;
    v_created_by_admin BOOLEAN;
BEGIN
    SELECT value INTO v_registration_open
    FROM public.app_settings
    WHERE key = 'registration_open';

    -- Apenas a API administrativa (service_role) consegue definir app_metadata
    v_created_by_admin := COALESCE((NEW.raw_app_meta_data ->> 'created_by_admin')::BOOLEAN, false);

    IF COALESCE(v_registration_open, 'true') != 'true' AND NOT v_created_by_admin THEN
        RAISE EXCEPTION 'Novos cadastros estão desativados no momento.';
    END IF;

    INSERT INTO public.user_profiles (id, display_name, avatar_url, theme, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
        COALESCE(NEW.raw_user_meta_data ->> 'theme', 'classic'),
        NOW(),
        NOW()
    );

    INSERT INTO public.user_stats (user_id, updated_at)
    VALUES (NEW.id, NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_user_profile_ban_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_user_admin() THEN
        IF NEW.banned_at IS DISTINCT FROM OLD.banned_at
           OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason THEN
            RAISE EXCEPTION 'Sem permissão para alterar status de banimento';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_user_profile_ban ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_ban
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_user_profile_ban_fields();

CREATE OR REPLACE FUNCTION public.protect_player_match_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.allow_match_field_update', true) IS DISTINCT FROM 'true'
       AND auth.uid() IS NOT NULL
       AND NOT public.is_user_admin() THEN
        IF TG_OP = 'INSERT' THEN
            IF COALESCE(NEW.in_match, false) = true
               OR NEW.match_character_name IS NOT NULL
               OR COALESCE(NEW.is_alive, true) = false
               OR NEW.elimination_order IS NOT NULL
               OR NEW.killed_by_player_id IS NOT NULL THEN
                RAISE EXCEPTION 'Sem permissão para definir campos de partida diretamente';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.in_match IS DISTINCT FROM OLD.in_match
               OR NEW.match_character_name IS DISTINCT FROM OLD.match_character_name
               OR NEW.is_alive IS DISTINCT FROM OLD.is_alive
               OR NEW.elimination_order IS DISTINCT FROM OLD.elimination_order
               OR NEW.killed_by_player_id IS DISTINCT FROM OLD.killed_by_player_id THEN
                RAISE EXCEPTION 'Sem permissão para alterar campos de partida diretamente';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_player_match_fields ON public.players;
CREATE TRIGGER trg_protect_player_match_fields
    BEFORE INSERT OR UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_player_match_fields();

CREATE OR REPLACE FUNCTION public.handle_room_master_succession()
RETURNS TRIGGER AS $$
DECLARE
    v_room RECORD;
    v_next_master RECORD;
    v_target_room_id VARCHAR(6);
BEGIN
    v_target_room_id := COALESCE(OLD.room_id, NEW.room_id);
    IF v_target_room_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = v_target_room_id AND is_active = true;
    IF v_room IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF (TG_OP = 'DELETE' AND OLD.id = v_room.master_player_id)
       OR (TG_OP = 'UPDATE' AND NEW.id = v_room.master_player_id AND NEW.is_connected = false)
       OR (v_room.master_player_id IS NULL)
       OR NOT EXISTS (
           SELECT 1 FROM public.players
           WHERE id = v_room.master_player_id AND room_id = v_target_room_id AND is_connected = true
       )
    THEN
        SELECT id, name INTO v_next_master
        FROM public.players
        WHERE room_id = v_target_room_id
          AND is_connected = true
          AND (TG_OP != 'DELETE' OR id != OLD.id)
        ORDER BY joined_at ASC
        LIMIT 1;

        IF v_next_master.id IS NOT NULL THEN
            UPDATE public.rooms
            SET master_player_id = v_next_master.id,
                master_name = v_next_master.name,
                last_activity = NOW()
            WHERE id = v_target_room_id;
        ELSE
            UPDATE public.rooms
            SET master_player_id = NULL,
                last_activity = NOW()
            WHERE id = v_target_room_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_room_master_succession ON public.players;
CREATE TRIGGER trg_room_master_succession
    AFTER INSERT OR DELETE OR UPDATE OF is_connected ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_room_master_succession();

-- ================================
-- SEÇÃO 2: UTILITY & PROFILE FUNCTIONS
-- ================================

CREATE OR REPLACE FUNCTION public.is_user_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM public.admin_users
        WHERE user_id = COALESCE(p_user_id, auth.uid())
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_user_in_room(p_room_id VARCHAR(6))
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.players
        WHERE room_id = p_room_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.update_user_theme(p_theme VARCHAR(30))
RETURNS JSON AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    UPDATE public.user_profiles
    SET theme = p_theme,
        updated_at = NOW()
    WHERE id = auth.uid();

    RETURN json_build_object('success', true, 'theme', p_theme);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_players_brief_stats(p_user_ids UUID[])
RETURNS JSON AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    RETURN COALESCE((
        SELECT json_agg(json_build_object(
            'user_id', up.id,
            'display_name', up.display_name,
            'avatar_url', up.avatar_url,
            'created_at', up.created_at,
            'total_matches', COALESCE(us.total_matches, 0),
            'total_wins', COALESCE(us.total_wins, 0),
            'total_eliminations', COALESCE(us.total_eliminations, 0),
            'total_survival_points', COALESCE(us.total_survival_points, 0),
            'win_rate', COALESCE(us.win_rate, 0),
            'composite_score', COALESCE(us.composite_score, 0),
            'favorite_character', us.favorite_character
        ))
        FROM public.user_profiles up
        LEFT JOIN public.user_stats us ON us.user_id = up.id
        WHERE up.id = ANY(p_user_ids)
    ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Score = [(Win Rate% * 4) + (Med. Elim * 45) + (Med. Sobrev * 20)] * Vol + (Vitorias * 15)
CREATE OR REPLACE FUNCTION public.calculate_composite_score(
    p_wins INTEGER,
    p_eliminations INTEGER,
    p_survival_points INTEGER,
    p_matches INTEGER
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_win_rate DECIMAL(6,2);
    v_avg_eliminations DECIMAL(10,4);
    v_avg_survival DECIMAL(10,4);
    v_volume_factor DECIMAL(5,4);
    v_performance_base DECIMAL(10,4);
BEGIN
    IF COALESCE(p_matches, 0) <= 0 THEN
        RETURN 0;
    END IF;

    v_win_rate := (p_wins::DECIMAL / p_matches::DECIMAL) * 100.0;
    v_avg_eliminations := p_eliminations::DECIMAL / p_matches::DECIMAL;
    v_avg_survival := p_survival_points::DECIMAL / p_matches::DECIMAL;
    v_volume_factor := LEAST(p_matches::DECIMAL / 10.0, 1.0);

    v_performance_base := (v_win_rate * 4.0)
                        + (v_avg_eliminations * 45.0)
                        + (v_avg_survival * 20.0);

    RETURN ROUND((v_performance_base * v_volume_factor) + (p_wins * 15.0), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public._recalculate_player_stats(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.user_stats (user_id, updated_at)
    VALUES (p_user_id, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.user_stats us SET
        total_matches = sub.total_matches,
        total_wins = sub.total_wins,
        total_eliminations = sub.total_eliminations,
        total_survival_points = sub.total_survival_points,
        win_rate = CASE WHEN sub.total_matches > 0
            THEN ROUND((sub.total_wins::DECIMAL / sub.total_matches) * 100, 2)
            ELSE 0 END,
        composite_score = public.calculate_composite_score(
            sub.total_wins,
            sub.total_eliminations,
            sub.total_survival_points,
            sub.total_matches
        ),
        favorite_character = sub.fav_char,
        updated_at = NOW()
    FROM (
        SELECT
            COUNT(*)::INTEGER AS total_matches,
            COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS total_wins,
            COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
            COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS total_survival_points,
            (
                SELECT mp2.character_name
                FROM public.match_participants mp2
                WHERE mp2.user_id = p_user_id
                  AND mp2.character_name IS NOT NULL
                  AND mp2.character_name <> ''
                GROUP BY mp2.character_name
                ORDER BY COUNT(*) DESC
                LIMIT 1
            ) AS fav_char
        FROM public.match_participants mp
        WHERE mp.user_id = p_user_id
    ) sub
    WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public._trg_fn_sync_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.user_id IS NOT NULL THEN
            PERFORM public._recalculate_player_stats(OLD.user_id);
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            PERFORM public._recalculate_player_stats(OLD.user_id);
        END IF;
        IF NEW.user_id IS NOT NULL THEN
            PERFORM public._recalculate_player_stats(NEW.user_id);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.user_id IS NOT NULL THEN
            PERFORM public._recalculate_player_stats(NEW.user_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_user_stats_on_match_change ON public.match_participants;
CREATE TRIGGER trg_sync_user_stats_on_match_change
    AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
    FOR EACH ROW
    EXECUTE FUNCTION public._trg_fn_sync_user_stats();

ALTER TABLE public.match_participants
    ENABLE TRIGGER trg_sync_user_stats_on_match_change;

CREATE OR REPLACE FUNCTION public.get_app_setting(p_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT value FROM public.app_settings WHERE key = p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 3: CLEANUP & SYSTEM FUNCTIONS
-- ================================

DROP FUNCTION IF EXISTS public.cleanup_inactive_players();
CREATE OR REPLACE FUNCTION public.cleanup_inactive_players()
RETURNS void AS $$
BEGIN
    DELETE FROM public.players p
    WHERE (
        (p.is_connected = false AND p.last_activity < NOW() - INTERVAL '5 minutes')
        OR (p.last_activity < NOW() - INTERVAL '30 minutes' AND p.status = 'selecting')
        OR (p.last_activity < NOW() - INTERVAL '2 hours')
    )
    AND NOT (
        (p.in_match = true OR p.elimination_order IS NOT NULL)
        AND EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = p.room_id AND r.match_status = 'in_progress'
        )
    );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.cleanup_inactive_rooms();
CREATE OR REPLACE FUNCTION public.cleanup_inactive_rooms()
RETURNS void AS $$
DECLARE
    v_room RECORD;
BEGIN
    FOR v_room IN
        SELECT r.id
        FROM public.rooms r
        WHERE r.is_active = true
        AND r.last_activity < NOW() - INTERVAL '1 hour'
        AND NOT EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.room_id = r.id
            AND p.is_connected = true
            AND p.last_activity > NOW() - INTERVAL '30 minutes'
        )
    LOOP
        DELETE FROM public.players WHERE room_id = v_room.id;
        UPDATE public.rooms SET is_active = false WHERE id = v_room.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.clean_old_combats()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.combat_notifications
    WHERE created_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.cleanup_inactive_data();
CREATE OR REPLACE FUNCTION public.cleanup_inactive_data()
RETURNS JSON AS $$
DECLARE
    v_players_before INTEGER;
    v_players_after INTEGER;
    v_rooms_before INTEGER;
    v_rooms_after INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT COUNT(*) INTO v_players_before FROM public.players;
    SELECT COUNT(*) INTO v_rooms_before FROM public.rooms WHERE is_active = true;

    PERFORM public.cleanup_inactive_players();
    PERFORM public.cleanup_inactive_rooms();
    PERFORM public.clean_old_combats();

    SELECT COUNT(*) INTO v_players_after FROM public.players;
    SELECT COUNT(*) INTO v_rooms_after FROM public.rooms WHERE is_active = true;

    RETURN json_build_object(
        'success', true,
        'players_deleted', GREATEST(v_players_before - v_players_after, 0),
        'rooms_deleted', GREATEST(v_rooms_before - v_rooms_after, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.get_system_stats();
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'timestamp', NOW(),
        'active_rooms', (SELECT COUNT(*) FROM public.rooms WHERE is_active = true),
        'total_rooms', (SELECT COUNT(*) FROM public.rooms),
        'connected_players', (SELECT COUNT(*) FROM public.players WHERE is_connected = true),
        'total_players', (SELECT COUNT(*) FROM public.players),
        'players_selecting', (SELECT COUNT(*) FROM public.players WHERE status = 'selecting' AND is_connected = true),
        'players_ready', (SELECT COUNT(*) FROM public.players WHERE status = 'ready' AND is_connected = true),
        'inactive_players', (SELECT COUNT(*) FROM public.players WHERE last_activity < NOW() - INTERVAL '10 minutes'),
        'inactive_rooms', (SELECT COUNT(*) FROM public.rooms WHERE is_active = true AND last_activity < NOW() - INTERVAL '30 minutes')
    );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_combat_stats();
CREATE OR REPLACE FUNCTION public.get_combat_stats()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'timestamp', NOW(),
        'total_combats', (SELECT COUNT(*) FROM public.combat_notifications),
        'active_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'in_progress'),
        'pending_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'pending'),
        'completed_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'completed'),
        'combats_with_opportunity_attacks', (
            SELECT COUNT(*)
            FROM public.combat_notifications
            WHERE allow_opportunity_attacks = true
            AND jsonb_array_length(opportunity_attacks_used) > 0
        ),
        'total_opportunity_attacks', (
            SELECT COALESCE(SUM(jsonb_array_length(opportunity_attacks_used)), 0)::INTEGER
            FROM public.combat_notifications
        ),
        'combats_by_room', (
            SELECT COALESCE(json_object_agg(room_id, combat_count), '{}'::json)
            FROM (
                SELECT room_id, COUNT(*) AS combat_count
                FROM public.combat_notifications
                GROUP BY room_id
            ) subquery
        )
    );
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.test_cleanup_system();
CREATE OR REPLACE FUNCTION public.test_cleanup_system()
RETURNS JSON AS $$
DECLARE
    v_stats JSON;
    v_combat_stats JSON;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    v_stats := public.get_system_stats();
    v_combat_stats := public.get_combat_stats();

    RETURN json_build_object(
        'test_passed', true,
        'checked_at', NOW(),
        'system_stats', v_stats,
        'combat_stats', v_combat_stats
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.debug_room_cleanup();
CREATE OR REPLACE FUNCTION public.debug_room_cleanup()
RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN COALESCE((
        SELECT json_agg(json_build_object(
            'room_id', r.id,
            'room_name', r.name,
            'is_active', r.is_active,
            'match_status', r.match_status,
            'time_since_created', (NOW() - r.created_at)::TEXT,
            'time_since_activity', (NOW() - r.last_activity)::TEXT,
            'players_count', (SELECT COUNT(*) FROM public.players p WHERE p.room_id = r.id),
            'connected_players_count', (SELECT COUNT(*) FROM public.players p WHERE p.room_id = r.id AND p.is_connected = true),
            'should_be_deleted', (
                r.is_active = true
                AND r.last_activity < NOW() - INTERVAL '1 hour'
                AND NOT EXISTS (
                    SELECT 1 FROM public.players p
                    WHERE p.room_id = r.id
                    AND p.is_connected = true
                    AND p.last_activity > NOW() - INTERVAL '30 minutes'
                )
            ),
            'deletion_reason', CASE
                WHEN r.is_active = false THEN 'Já inativa'
                WHEN r.last_activity < NOW() - INTERVAL '1 hour' THEN 'Inativa há > 1h sem jogadores ativos'
                ELSE 'Sala saudável'
            END
        ) ORDER BY r.created_at DESC)
        FROM public.rooms r
    ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 4: ROOM CREATION, JOIN & MATCH LIFECYCLE
-- ================================

CREATE OR REPLACE FUNCTION public.create_room_with_host(
    p_room_name VARCHAR(100),
    p_master_name VARCHAR(50)
) RETURNS JSON AS $$
DECLARE
    v_room_id VARCHAR(6);
    v_clean_room_name VARCHAR(100);
    v_clean_master_name VARCHAR(50);
    v_room RECORD;
    v_player RECORD;
    v_attempts INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND banned_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Sua conta está banida e não pode criar salas';
    END IF;

    v_clean_room_name := TRIM(COALESCE(p_room_name, ''));
    v_clean_master_name := TRIM(COALESCE(p_master_name, ''));

    IF LENGTH(v_clean_room_name) < 1 OR LENGTH(v_clean_master_name) < 2 THEN
        RAISE EXCEPTION 'Nome da sala e nome do anfitrião são obrigatórios';
    END IF;

    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Não foi possível gerar um código de sala disponível. Tente novamente.';
        END IF;

        v_room_id := LPAD(FLOOR(100000 + RANDOM() * 900000)::TEXT, 6, '0');

        BEGIN
            INSERT INTO public.rooms (id, name, master_name, is_active, created_at, last_activity)
            VALUES (v_room_id, v_clean_room_name, v_clean_master_name, true, NOW(), NOW());
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    INSERT INTO public.players (
        room_id, name, status, is_connected, user_id, joined_at, last_activity
    ) VALUES (
        v_room_id, v_clean_master_name, 'selecting', true, auth.uid(), NOW(), NOW()
    ) RETURNING * INTO v_player;

    UPDATE public.rooms
    SET master_player_id = v_player.id,
        last_activity = NOW()
    WHERE id = v_room_id
    RETURNING * INTO v_room;

    RETURN json_build_object(
        'success', true,
        'room', row_to_json(v_room),
        'player', row_to_json(v_player)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.join_room(
    p_room_id VARCHAR(6),
    p_player_name VARCHAR(50)
) RETURNS JSON AS $$
DECLARE
    v_clean_room_id VARCHAR(6);
    v_clean_name VARCHAR(50);
    v_room RECORD;
    v_existing RECORD;
    v_player RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND banned_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Sua conta está banida e não pode entrar em salas';
    END IF;

    v_clean_room_id := TRIM(COALESCE(p_room_id, ''));
    v_clean_name := TRIM(COALESCE(p_player_name, ''));

    IF v_clean_room_id !~ '^\d{6}$' THEN
        RAISE EXCEPTION 'Código da sala inválido (deve conter 6 dígitos)';
    END IF;

    IF LENGTH(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Nome do jogador deve ter pelo menos 2 caracteres';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = v_clean_room_id
      AND is_active = true
    FOR SHARE;

    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada ou inativa';
    END IF;

    SELECT * INTO v_existing
    FROM public.players
    WHERE room_id = v_clean_room_id
      AND user_id = auth.uid()
    ORDER BY joined_at DESC
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        UPDATE public.players
        SET is_connected = true,
            last_activity = NOW()
        WHERE id = v_existing.id
        RETURNING * INTO v_player;
    ELSE
        INSERT INTO public.players (
            room_id, name, status, is_connected, user_id, joined_at, last_activity
        ) VALUES (
            v_clean_room_id, v_clean_name, 'selecting', true, auth.uid(), NOW(), NOW()
        ) RETURNING * INTO v_player;
    END IF;

    UPDATE public.rooms
    SET last_activity = NOW()
    WHERE id = v_clean_room_id;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = v_clean_room_id;

    RETURN json_build_object(
        'success', true,
        'room', row_to_json(v_room),
        'player', row_to_json(v_player),
        'reconnected', (v_existing.id IS NOT NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.start_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_connected_count INTEGER;
    v_ready_count INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id
          AND user_id = auth.uid()
          AND is_connected = true
    ) THEN
        RAISE EXCEPTION 'Apenas jogadores conectados na sala podem iniciar a partida';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    IF v_room.match_status IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe uma partida ativa nesta sala';
    END IF;

    SELECT COUNT(*) INTO v_connected_count
    FROM public.players
    WHERE room_id = p_room_id
      AND is_connected = true;

    SELECT COUNT(*) INTO v_ready_count
    FROM public.players
    WHERE room_id = p_room_id
      AND status IN ('ready', 'playing')
      AND is_connected = true;

    IF v_connected_count < 2 THEN
        RAISE EXCEPTION 'Necessários ao menos 2 jogadores na sala para iniciar';
    END IF;

    IF v_ready_count < v_connected_count THEN
        RAISE EXCEPTION 'Todos os jogadores conectados precisam estar prontos para iniciar a partida';
    END IF;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    DELETE FROM public.players
    WHERE room_id = p_room_id
      AND is_connected = false;

    UPDATE public.rooms SET
        match_status = 'in_progress',
        match_started_at = NOW(),
        last_activity = NOW()
    WHERE id = p_room_id;

    UPDATE public.players SET
        in_match = (is_connected = true AND status IN ('ready', 'playing')),
        match_character_name = CASE
            WHEN is_connected = true AND status IN ('ready', 'playing') THEN character_name
            ELSE NULL
        END,
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL,
        exposed_cards = '[]'::jsonb,
        last_activity = NOW()
    WHERE room_id = p_room_id;

    DELETE FROM public.combat_notifications
    WHERE room_id = p_room_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.end_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_match_id UUID;
    v_total INTEGER;
    v_alive_count INTEGER;
    v_winner RECORD;
    v_winner_user_id UUID;
    v_player RECORD;
    v_participant_user_id UUID;
    v_is_winner BOOLEAN;
    v_survival_points INTEGER;
    v_eliminations_made INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id
          AND user_id = auth.uid()
          AND is_connected = true
    ) THEN
        RAISE EXCEPTION 'Apenas jogadores conectados na sala podem encerrar a partida';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    IF v_room.match_status != 'in_progress' THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    SELECT COUNT(*) INTO v_alive_count
    FROM public.players
    WHERE room_id = p_room_id
      AND in_match = true
      AND is_alive = true;

    IF v_alive_count > 1 THEN
        RAISE EXCEPTION 'A partida só pode ser encerrada quando restar apenas 1 sobrevivente (restam %)', v_alive_count;
    END IF;

    IF v_alive_count = 0 THEN
        RAISE EXCEPTION 'Não há sobreviventes restantes. O anfitrião pode cancelar a partida.';
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM public.players
    WHERE room_id = p_room_id
      AND in_match = true;

    SELECT p.id, p.name, p.user_id, COALESCE(p.match_character_name, p.character_name) AS character_name
    INTO v_winner
    FROM public.players p
    WHERE p.room_id = p_room_id
      AND p.in_match = true
      AND p.is_alive = true
    LIMIT 1;

    IF v_winner.id IS NULL OR v_winner.user_id IS NULL OR v_winner.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Apenas o último sobrevivente pode declarar vitória';
    END IF;

    v_winner_user_id := v_winner.user_id;

    INSERT INTO public.match_history (
        room_id, room_name, started_at, ended_at,
        winner_user_id, winner_player_name, total_players
    ) VALUES (
        p_room_id,
        v_room.name,
        COALESCE(v_room.match_started_at, v_room.created_at),
        NOW(),
        v_winner_user_id,
        v_winner.name,
        v_total
    ) RETURNING id INTO v_match_id;

    FOR v_player IN
        SELECT p.*
        FROM public.players p
        WHERE p.room_id = p_room_id
          AND p.in_match = true
    LOOP
        v_is_winner := (v_player.id = v_winner.id);

        IF v_is_winner THEN
            v_survival_points := GREATEST(v_total - 1, 0);
        ELSE
            v_survival_points := COALESCE(v_player.elimination_order - 1, 0);
        END IF;

        SELECT COUNT(*) INTO v_eliminations_made
        FROM public.players
        WHERE room_id = p_room_id
          AND in_match = true
          AND killed_by_player_id = v_player.id;

        v_participant_user_id := v_player.user_id;
        IF v_participant_user_id IS NULL THEN
            SELECT id INTO v_participant_user_id
            FROM public.user_profiles
            WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_player.name))
            LIMIT 1;
        END IF;

        -- O trigger trg_sync_user_stats_on_match_change recalcula user_stats automaticamente
        INSERT INTO public.match_participants (
            match_id, user_id, player_name, character_name,
            elimination_order, killed_by_user_id, killed_by_player_name,
            survival_points, eliminations_made, is_winner
        ) VALUES (
            v_match_id,
            v_participant_user_id,
            v_player.name,
            COALESCE(v_player.match_character_name, v_player.character_name),
            CASE WHEN v_is_winner THEN NULL ELSE v_player.elimination_order END,
            CASE WHEN v_player.killed_by_player_id IS NOT NULL THEN
                (SELECT user_id FROM public.players WHERE id = v_player.killed_by_player_id)
            ELSE NULL END,
            CASE WHEN v_player.killed_by_player_id IS NOT NULL THEN
                (SELECT name FROM public.players WHERE id = v_player.killed_by_player_id)
            ELSE NULL END,
            v_survival_points,
            v_eliminations_made,
            v_is_winner
        );
    END LOOP;

    DELETE FROM public.combat_notifications
    WHERE room_id = p_room_id;

    UPDATE public.rooms SET
        match_status = NULL,
        match_started_at = NULL,
        last_activity = NOW()
    WHERE id = p_room_id;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    DELETE FROM public.players
    WHERE room_id = p_room_id
      AND is_connected = false;

    UPDATE public.players SET
        in_match = false,
        match_character_name = NULL,
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL,
        last_activity = NOW()
    WHERE room_id = p_room_id;

    RETURN json_build_object(
        'success', true,
        'match_id', v_match_id,
        'winner', v_winner.name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.declare_elimination(
    p_player_id UUID,
    p_killer_player_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_player RECORD;
    v_elimination_order INTEGER;
    v_room_lock BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT * INTO v_player
    FROM public.players
    WHERE id = p_player_id
      AND is_connected = true;

    IF v_player IS NULL THEN
        RAISE EXCEPTION 'Jogador não encontrado ou desconectado';
    END IF;

    IF v_player.user_id IS NOT NULL AND v_player.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Você só pode declarar sua própria eliminação';
    END IF;

    IF COALESCE(v_player.in_match, false) = false THEN
        RAISE EXCEPTION 'Você não está participando da partida atual';
    END IF;

    IF v_player.is_alive = false THEN
        RAISE EXCEPTION 'Jogador já foi eliminado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.rooms
        WHERE id = v_player.room_id
          AND match_status = 'in_progress'
    ) THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    IF p_killer_player_id IS NOT NULL THEN
        IF p_killer_player_id = p_player_id THEN
            RAISE EXCEPTION 'Você não pode declarar a si mesmo como eliminador';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE id = p_killer_player_id
              AND room_id = v_player.room_id
              AND in_match = true
        ) THEN
            RAISE EXCEPTION 'Eliminador inválido ou fora da partida atual';
        END IF;
    END IF;

    v_room_lock := hashtext(v_player.room_id::text);
    PERFORM pg_advisory_xact_lock(v_room_lock);

    SELECT COUNT(*) INTO v_elimination_order
    FROM public.players
    WHERE room_id = v_player.room_id
      AND in_match = true
      AND is_alive = false
      AND elimination_order IS NOT NULL;

    v_elimination_order := v_elimination_order + 1;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    UPDATE public.players SET
        is_alive = false,
        killed_by_player_id = p_killer_player_id,
        elimination_order = v_elimination_order,
        last_activity = NOW()
    WHERE id = p_player_id;

    RETURN json_build_object(
        'success', true,
        'elimination_order', v_elimination_order
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.master_eliminate_player(
    p_room_id VARCHAR(6),
    p_player_id UUID,
    p_killer_player_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_target RECORD;
    v_elimination_order INTEGER;
    v_room_lock BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    IF v_room.match_status != 'in_progress' THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE id = v_room.master_player_id
          AND room_id = p_room_id
          AND user_id = auth.uid()
    ) AND NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Apenas o anfitrião da sala pode eliminar outro jogador';
    END IF;

    SELECT * INTO v_target
    FROM public.players
    WHERE id = p_player_id
      AND room_id = p_room_id;

    IF v_target IS NULL THEN
        RAISE EXCEPTION 'Jogador não encontrado nesta sala';
    END IF;

    IF v_target.user_id = auth.uid() THEN
        RAISE EXCEPTION 'Use o botão "Fui Eliminado" para declarar sua própria eliminação';
    END IF;

    IF COALESCE(v_target.in_match, false) = false THEN
        RAISE EXCEPTION 'Este jogador não está participando da partida atual';
    END IF;

    IF v_target.is_alive = false THEN
        RAISE EXCEPTION 'Este jogador já foi eliminado';
    END IF;

    IF p_killer_player_id IS NOT NULL THEN
        IF p_killer_player_id = p_player_id THEN
            RAISE EXCEPTION 'O jogador não pode ser o próprio eliminador';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE id = p_killer_player_id
              AND room_id = p_room_id
              AND in_match = true
        ) THEN
            RAISE EXCEPTION 'Eliminador inválido ou fora da partida atual';
        END IF;
    END IF;

    v_room_lock := hashtext(p_room_id::text);
    PERFORM pg_advisory_xact_lock(v_room_lock);

    SELECT COUNT(*) INTO v_elimination_order
    FROM public.players
    WHERE room_id = p_room_id
      AND in_match = true
      AND is_alive = false
      AND elimination_order IS NOT NULL;

    v_elimination_order := v_elimination_order + 1;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    UPDATE public.players
    SET is_alive = false,
        killed_by_player_id = p_killer_player_id,
        elimination_order = v_elimination_order,
        last_activity = NOW()
    WHERE id = p_player_id;

    UPDATE public.combat_notifications
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE room_id = p_room_id
      AND status IN ('pending', 'in_progress')
      AND (attacker_id = p_player_id OR defender_id = p_player_id);

    RETURN json_build_object(
        'success', true,
        'player_name', v_target.name,
        'elimination_order', v_elimination_order
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.master_cancel_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    IF v_room.match_status IS NULL THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE id = v_room.master_player_id
          AND room_id = p_room_id
          AND user_id = auth.uid()
    ) AND NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Apenas o anfitrião da sala pode cancelar a partida';
    END IF;

    DELETE FROM public.combat_notifications
    WHERE room_id = p_room_id;

    UPDATE public.rooms SET
        match_status = NULL,
        match_started_at = NULL,
        last_activity = NOW()
    WHERE id = p_room_id;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    DELETE FROM public.players
    WHERE room_id = p_room_id
      AND is_connected = false;

    UPDATE public.players SET
        in_match = false,
        match_character_name = NULL,
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL,
        last_activity = NOW()
    WHERE room_id = p_room_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 5: ATOMIC COMBAT FUNCTIONS (BLINDADAS — v5.6)
-- ================================

CREATE OR REPLACE FUNCTION public.start_combat(
    p_room_id VARCHAR(6),
    p_attacker_id UUID,
    p_defender_ids UUID[],
    p_attack_data JSONB,
    p_allow_counter_attack BOOLEAN DEFAULT true,
    p_allow_opportunity_attacks BOOLEAN DEFAULT true
) RETURNS JSON AS $$
DECLARE
    v_attacker RECORD;
    v_defender RECORD;
    v_defender_id UUID;
    v_group_id UUID;
    v_lock_key BIGINT;
    v_created_ids UUID[] := '{}';
    v_new_id UUID;
    v_is_single_attack BOOLEAN;
    v_initial_status VARCHAR(20);
    v_initial_phase VARCHAR(20);
    v_initial_round INTEGER;
    v_initial_total_rounds INTEGER;
    v_initial_round_data JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    SELECT * INTO v_attacker
    FROM public.players
    WHERE id = p_attacker_id
      AND room_id = p_room_id
      AND is_connected = true
      AND in_match = true
      AND is_alive = true;

    IF v_attacker IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Atacante inválido, fora da partida ou desconectado');
    END IF;

    IF v_attacker.user_id IS NOT NULL AND v_attacker.user_id != auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Você só pode iniciar combate com o seu próprio jogador');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.rooms
        WHERE id = p_room_id AND match_status = 'in_progress'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Inicie uma partida antes de iniciar combates');
    END IF;

    IF p_defender_ids IS NULL OR array_length(p_defender_ids, 1) IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Selecione pelo menos um defensor');
    END IF;

    v_lock_key := hashtext('combat_' || p_room_id::text);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    IF EXISTS (
        SELECT 1 FROM public.combat_notifications
        WHERE room_id = p_room_id
          AND status IN ('pending', 'in_progress')
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Já existe um combate ativo na sala');
    END IF;

    IF array_length(p_defender_ids, 1) > 1 THEN
        v_group_id := gen_random_uuid();
    ELSE
        v_group_id := NULL;
    END IF;

    -- Se for Ataque Único, todos os defensores já entram direto na fase de rolagem
    v_is_single_attack := NOT COALESCE(p_allow_counter_attack, true);
    IF v_is_single_attack THEN
        v_initial_status := 'in_progress';
        v_initial_phase := 'rolling';
        v_initial_round := 1;
        v_initial_total_rounds := 1;
        v_initial_round_data := jsonb_build_array(
            jsonb_build_object(
                'round', 1,
                'who_acts', 'attacker',
                'action_type', 'attack',
                'attacker', jsonb_build_object('rolled', false, 'roll', '[]'::jsonb, 'total', 0),
                'defender', jsonb_build_object('rolled', false, 'roll', '[]'::jsonb, 'total', 0),
                'completed', false
            )
        );
    ELSE
        v_initial_status := 'pending';
        v_initial_phase := 'weapon_selection';
        v_initial_round := 0;
        v_initial_total_rounds := 0;
        v_initial_round_data := '[]'::jsonb;
    END IF;

    FOREACH v_defender_id IN ARRAY p_defender_ids
    LOOP
        IF v_defender_id = p_attacker_id THEN
            CONTINUE;
        END IF;

        SELECT id, name INTO v_defender
        FROM public.players
        WHERE id = v_defender_id
          AND room_id = p_room_id
          AND is_connected = true
          AND in_match = true
          AND is_alive = true;

        IF v_defender.id IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.combat_notifications (
            room_id, attacker_id, defender_id,
            attacker_name, defender_name, attack_data,
            allow_counter_attack, allow_opportunity_attacks,
            opportunity_attacks_used, status, combat_phase,
            current_round, total_rounds, round_data,
            combat_group_id, attacker_shared_roll
        ) VALUES (
            p_room_id, v_attacker.id, v_defender.id,
            v_attacker.name, v_defender.name, COALESCE(p_attack_data, '{}'::jsonb),
            COALESCE(p_allow_counter_attack, true), COALESCE(p_allow_opportunity_attacks, true),
            '[]'::jsonb, v_initial_status, v_initial_phase,
            v_initial_round, v_initial_total_rounds, v_initial_round_data,
            v_group_id, NULL
        ) RETURNING id INTO v_new_id;

        v_created_ids := array_append(v_created_ids, v_new_id);
    END LOOP;

    IF array_length(v_created_ids, 1) IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Nenhum defensor válido encontrado');
    END IF;

    RETURN json_build_object(
        'success', true,
        'combat_ids', v_created_ids,
        'combat_group_id', v_group_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.confirm_defense_weapon(
    p_combat_id UUID,
    p_defender_weapon JSONB DEFAULT NULL,
    p_round_data JSONB DEFAULT '[]'::jsonb,
    p_total_rounds INTEGER DEFAULT 1
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_round_data JSONB;
    v_round0 JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    SELECT * INTO v_combat
    FROM public.combat_notifications
    WHERE id = p_combat_id
    FOR UPDATE;

    IF v_combat IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Combate não encontrado');
    END IF;

    IF v_combat.status IN ('completed', 'cancelled') THEN
        RETURN json_build_object('success', false, 'error', 'Combate já encerrado');
    END IF;

    IF v_combat.combat_phase != 'weapon_selection' THEN
        RETURN json_build_object('success', false, 'error', 'Arma de defesa já foi confirmada');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = v_combat.defender_id
          AND p.user_id = auth.uid()
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Apenas o defensor pode confirmar sua arma');
    END IF;

    v_round_data := COALESCE(p_round_data, '[]'::jsonb);

    -- Preserva automaticamente o ataque compartilhado caso o atacante já tenha rolado
    IF v_combat.attacker_shared_roll IS NOT NULL
       AND COALESCE((v_combat.attacker_shared_roll->>'rolled')::boolean, false) = true
       AND jsonb_array_length(v_round_data) > 0
       AND (v_round_data->0->>'action_type') = 'attack' THEN
        v_round0 := jsonb_set(v_round_data->0, '{attacker}', v_combat.attacker_shared_roll);
        v_round_data := jsonb_set(v_round_data, '{0}', v_round0);
    END IF;

    UPDATE public.combat_notifications
    SET defender_weapon = p_defender_weapon,
        round_data = v_round_data,
        total_rounds = GREATEST(COALESCE(p_total_rounds, 1), 1),
        current_round = 1,
        combat_phase = 'rolling',
        status = 'in_progress',
        updated_at = NOW()
    WHERE id = p_combat_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_combat_group_phase(
    p_combat_group_id UUID,
    p_action TEXT
) RETURNS JSON AS $$
DECLARE
    v_active_count INTEGER := 0;
    v_is_participant BOOLEAN;
    v_has_more_rounds BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    IF p_combat_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Grupo de combate inválido');
    END IF;

    PERFORM id
    FROM public.combat_notifications
    WHERE combat_group_id = p_combat_group_id
      AND status IN ('pending', 'in_progress')
    ORDER BY id ASC
    FOR UPDATE;

    GET DIAGNOSTICS v_active_count = ROW_COUNT;

    IF v_active_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Nenhum combate ativo encontrado neste grupo');
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.combat_notifications cn
        JOIN public.players p ON (p.id = cn.attacker_id OR p.id = cn.defender_id)
        WHERE cn.combat_group_id = p_combat_group_id
          AND cn.status IN ('pending', 'in_progress')
          AND p.user_id = auth.uid()
    ) INTO v_is_participant;

    IF NOT v_is_participant AND NOT public.is_user_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Apenas participantes do combate podem executar esta ação');
    END IF;

    IF p_action = 'advance_round_1' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.combat_notifications
            WHERE combat_group_id = p_combat_group_id
              AND status IN ('pending', 'in_progress')
              AND total_rounds > 1
        ) INTO v_has_more_rounds;

        IF NOT v_has_more_rounds THEN
            UPDATE public.combat_notifications
            SET combat_phase = 'results',
                updated_at = NOW()
            WHERE combat_group_id = p_combat_group_id
              AND status IN ('pending', 'in_progress');
        ELSE
            UPDATE public.combat_notifications
            SET current_round = 2,
                updated_at = NOW()
            WHERE combat_group_id = p_combat_group_id
              AND status IN ('pending', 'in_progress')
              AND current_round = 1
              AND total_rounds > 1;
        END IF;

    ELSIF p_action = 'show_results' THEN
        UPDATE public.combat_notifications
        SET combat_phase = 'results',
            updated_at = NOW()
        WHERE combat_group_id = p_combat_group_id
          AND status IN ('pending', 'in_progress');

    ELSIF p_action = 'cancel_all' THEN
        UPDATE public.combat_notifications
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE combat_group_id = p_combat_group_id
          AND status IN ('pending', 'in_progress');
    ELSE
        RETURN json_build_object('success', false, 'error', 'Ação de grupo inválida');
    END IF;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_opportunity_attack(
    p_combat_id UUID,
    p_player_id UUID,
    p_player_name TEXT,
    p_weapon JSONB,
    p_target TEXT
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_round_data JSONB;
    v_new_round JSONB;
    v_opp_used JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    SELECT * INTO v_combat
    FROM public.combat_notifications
    WHERE id = p_combat_id
    FOR UPDATE;

    IF v_combat IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Combate não encontrado');
    END IF;

    IF v_combat.status IN ('completed', 'cancelled') THEN
        RETURN json_build_object('success', false, 'error', 'Combate já encerrado');
    END IF;

    IF v_combat.combat_phase != 'rolling' THEN
        RETURN json_build_object('success', false, 'error', 'Combate não está na fase de rolagem');
    END IF;

    IF NOT COALESCE(v_combat.allow_opportunity_attacks, false) THEN
        RETURN json_build_object('success', false, 'error', 'Ataques de oportunidade não permitidos neste combate');
    END IF;

    IF p_player_id = v_combat.attacker_id OR p_player_id = v_combat.defender_id THEN
        RETURN json_build_object('success', false, 'error', 'Participantes do combate não podem dar ataque de oportunidade');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = p_player_id
          AND p.room_id = v_combat.room_id
          AND p.is_connected = true
          AND p.in_match = true
          AND p.is_alive = true
          AND p.user_id = auth.uid()
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Apenas jogadores vivos na partida podem dar ataque de oportunidade');
    END IF;

    IF v_combat.opportunity_attacks_used @> to_jsonb(p_player_id::text)::jsonb THEN
        RETURN json_build_object('success', false, 'error', 'Você já usou seu ataque de oportunidade');
    END IF;

    v_new_round := jsonb_build_object(
        'round', jsonb_array_length(v_combat.round_data) + 1,
        'who_acts', 'opportunity',
        'action_type', 'opportunity',
        'opportunity_attacker_id', p_player_id,
        'opportunity_attacker_name', p_player_name,
        'opportunity_weapon', p_weapon,
        'opportunity_target', p_target,
        'attacker', jsonb_build_object('rolled', false, 'roll', '[]'::jsonb, 'total', 0),
        'defender', jsonb_build_object('rolled', false, 'roll', '[]'::jsonb, 'total', 0),
        'completed', false
    );

    v_round_data := v_combat.round_data || jsonb_build_array(v_new_round);
    v_opp_used := v_combat.opportunity_attacks_used || to_jsonb(ARRAY[p_player_id::text]);

    UPDATE public.combat_notifications
    SET round_data = v_round_data,
        total_rounds = jsonb_array_length(v_round_data),
        opportunity_attacks_used = v_opp_used,
        updated_at = NOW()
    WHERE id = p_combat_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.update_combat_roll(UUID, INTEGER, BOOLEAN, JSONB, INTEGER);
CREATE OR REPLACE FUNCTION public.update_combat_roll(
    p_combat_id UUID,
    p_round_index INTEGER,
    p_is_attacker BOOLEAN,
    p_roll JSONB,
    p_total INTEGER,
    p_allow_adjust BOOLEAN DEFAULT false
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_round JSONB;
    v_side TEXT;
    v_round_data JSONB;
    v_expected_player_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    SELECT * INTO v_combat
    FROM public.combat_notifications
    WHERE id = p_combat_id
    FOR UPDATE;

    IF v_combat IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Combate não encontrado');
    END IF;

    IF p_round_index < 0 OR p_round_index >= jsonb_array_length(v_combat.round_data) THEN
        RETURN json_build_object('success', false, 'error', 'Índice de rodada inválido');
    END IF;

    v_round := v_combat.round_data->p_round_index;

    IF (v_round->>'action_type') = 'opportunity' THEN
        IF p_is_attacker THEN
            v_expected_player_id := (v_round->>'opportunity_attacker_id')::UUID;
        ELSIF (v_round->>'opportunity_target') = 'attacker' THEN
            v_expected_player_id := v_combat.attacker_id;
        ELSE
            v_expected_player_id := v_combat.defender_id;
        END IF;
    ELSE
        v_expected_player_id := CASE WHEN p_is_attacker THEN v_combat.attacker_id ELSE v_combat.defender_id END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = v_expected_player_id
          AND p.user_id = auth.uid()
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Você não tem permissão para rolar por este jogador');
    END IF;

    v_side := CASE WHEN p_is_attacker THEN 'attacker' ELSE 'defender' END;

    IF NOT COALESCE(p_allow_adjust, false) AND COALESCE((v_round->v_side->>'rolled')::boolean, false) = true THEN
        RETURN json_build_object('success', false, 'error', 'Já rolou nesta rodada');
    END IF;

    v_round := jsonb_set(v_round, ARRAY[v_side],
        jsonb_build_object('rolled', true, 'roll', p_roll, 'total', p_total)
    );

    IF COALESCE((v_round->'attacker'->>'rolled')::boolean, false) = true
       AND COALESCE((v_round->'defender'->>'rolled')::boolean, false) = true THEN
        v_round := jsonb_set(v_round, '{completed}', 'true'::jsonb);
    END IF;

    v_round_data := jsonb_set(v_combat.round_data, ARRAY[p_round_index::text], v_round);

    UPDATE public.combat_notifications
    SET round_data = v_round_data,
        updated_at = NOW()
    WHERE id = p_combat_id;

    RETURN json_build_object('success', true, 'round', v_round);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_combat_group_shared_roll(
    p_combat_group_id UUID,
    p_roll JSONB,
    p_total INTEGER,
    p_allow_adjust BOOLEAN DEFAULT false
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_shared_roll JSONB;
    v_round JSONB;
    v_round_data JSONB;
    v_updated_count INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado');
    END IF;

    IF p_combat_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Grupo de combate inválido');
    END IF;

    v_shared_roll := jsonb_build_object('rolled', true, 'roll', p_roll, 'total', p_total);

    FOR v_combat IN
        SELECT *
        FROM public.combat_notifications
        WHERE combat_group_id = p_combat_group_id
          AND status IN ('pending', 'in_progress')
        ORDER BY id ASC
        FOR UPDATE
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = v_combat.attacker_id
              AND p.user_id = auth.uid()
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Apenas o atacante pode registrar o ataque compartilhado');
        END IF;

        IF NOT COALESCE(p_allow_adjust, false)
           AND COALESCE((v_combat.attacker_shared_roll->>'rolled')::boolean, false) = true THEN
            RETURN json_build_object('success', false, 'error', 'Ataque compartilhado já foi rolado');
        END IF;

        IF v_combat.combat_phase = 'rolling'
           AND jsonb_array_length(v_combat.round_data) > 0
           AND (v_combat.round_data->0->>'action_type') = 'attack' THEN
            v_round := v_combat.round_data->0;
            v_round := jsonb_set(v_round, '{attacker}', v_shared_roll);

            IF COALESCE((v_round->'defender'->>'rolled')::boolean, false) = true THEN
                v_round := jsonb_set(v_round, '{completed}', 'true'::jsonb);
            END IF;

            v_round_data := jsonb_set(v_combat.round_data, '{0}', v_round);

            UPDATE public.combat_notifications
            SET attacker_shared_roll = v_shared_roll,
                round_data = v_round_data,
                updated_at = NOW()
            WHERE id = v_combat.id;
        ELSE
            UPDATE public.combat_notifications
            SET attacker_shared_roll = v_shared_roll,
                updated_at = NOW()
            WHERE id = v_combat.id;
        END IF;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    IF v_updated_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Nenhum combate ativo encontrado neste grupo');
    END IF;

    RETURN json_build_object('success', true, 'updated', v_updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 6: ADMIN HELPER
-- ================================

CREATE OR REPLACE FUNCTION public._admin_log(
    p_action TEXT,
    p_target_user_id UUID DEFAULT NULL,
    p_target_room_id VARCHAR(6) DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_room_id, details)
    VALUES (auth.uid(), p_action, p_target_user_id, p_target_room_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 7: ADMIN — USER MANAGEMENT
-- ================================

CREATE OR REPLACE FUNCTION public.admin_ban_user(
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Violação das regras'
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Não é possível banir a si mesmo';
    END IF;

    IF public.is_user_admin(p_user_id) THEN
        RAISE EXCEPTION 'Não é possível banir outro administrador';
    END IF;

    UPDATE public.user_profiles
    SET banned_at = NOW(),
        ban_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    UPDATE public.players
    SET is_connected = false
    WHERE user_id = p_user_id;

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
        win_rate = 0,
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

CREATE OR REPLACE FUNCTION public.admin_recalculate_user_stats(
    p_user_id UUID
) RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    PERFORM public._recalculate_player_stats(p_user_id);
    PERFORM public._admin_log('recalculate_stats', p_user_id);

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- SEÇÃO 8: ADMIN — ROOM MANAGEMENT
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

CREATE OR REPLACE FUNCTION public.admin_set_room_master(
    p_room_id VARCHAR(6),
    p_player_id UUID
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

    UPDATE public.rooms
    SET master_player_id = p_player_id,
        master_name = v_player_name,
        last_activity = NOW()
    WHERE id = p_room_id;

    PERFORM public._admin_log('change_master', NULL, p_room_id,
        jsonb_build_object('new_master_id', p_player_id, 'new_master_name', v_player_name));

    RETURN json_build_object('success', true, 'new_master_name', v_player_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_clear_room_combats(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    DELETE FROM public.combat_notifications WHERE room_id = p_room_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    PERFORM public._admin_log('clear_combats', NULL, p_room_id,
        jsonb_build_object('combats_removed', v_deleted));

    RETURN json_build_object('success', true, 'combats_removed', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

    DELETE FROM public.combat_notifications WHERE room_id = p_room_id;

    UPDATE public.rooms
    SET match_status = NULL,
        match_started_at = NULL
    WHERE id = p_room_id;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    DELETE FROM public.players
    WHERE room_id = p_room_id
      AND is_connected = false;

    UPDATE public.players
    SET status = CASE WHEN (actor_id IS NOT NULL OR character IS NOT NULL) THEN 'ready' ELSE 'selecting' END,
        in_match = false,
        match_character_name = NULL,
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL
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

DROP FUNCTION IF EXISTS public.master_kick_player(VARCHAR, UUID);
CREATE OR REPLACE FUNCTION public.master_kick_player(
    p_room_id VARCHAR(6),
    p_player_id UUID
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE id = v_room.master_player_id
          AND room_id = p_room_id
          AND user_id = auth.uid()
    ) AND NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Apenas o anfitrião da sala pode expulsar jogadores';
    END IF;

    DELETE FROM public.players
    WHERE id = p_player_id AND room_id = p_room_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 9: ADMIN — MATCH CRUD & SYNC
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

    -- ON DELETE CASCADE remove match_participants e dispara o trigger de recálculo
    DELETE FROM public.match_history WHERE id = p_match_id;

    PERFORM public._admin_log('delete_match', NULL, NULL,
        jsonb_build_object('match_id', p_match_id, 'room_name', v_room_name));

    RETURN json_build_object('success', true, 'room_name', v_room_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_delete_match_participant(
    p_match_id UUID,
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    v_display_name TEXT;
    v_remaining INTEGER;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;

    DELETE FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Participação não encontrada para este jogador';
    END IF;

    UPDATE public.match_history
    SET winner_user_id = CASE WHEN winner_user_id = p_user_id THEN NULL ELSE winner_user_id END,
        winner_player_name = CASE WHEN winner_user_id = p_user_id THEN NULL ELSE winner_player_name END
    WHERE id = p_match_id;

    SELECT COUNT(*) INTO v_remaining
    FROM public.match_participants WHERE match_id = p_match_id;

    IF v_remaining = 0 THEN
        DELETE FROM public.match_history WHERE id = p_match_id;
    END IF;

    PERFORM public._admin_log('delete_match_participant', p_user_id, NULL,
        jsonb_build_object('match_id', p_match_id, 'display_name', v_display_name));

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION public.admin_create_match(
    p_user_id UUID,
    p_room_name TEXT DEFAULT 'Partida Manual',
    p_character_name TEXT DEFAULT NULL,
    p_is_winner BOOLEAN DEFAULT false,
    p_elimination_order INTEGER DEFAULT NULL,
    p_killed_by TEXT DEFAULT NULL,
    p_survival_points INTEGER DEFAULT 0,
    p_eliminations INTEGER DEFAULT 0,
    p_total_players INTEGER DEFAULT 2,
    p_ended_at TIMESTAMPTZ DEFAULT NOW(),
    p_match_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_match_id UUID;
    v_display_name TEXT;
    v_killed_by_name TEXT;
    v_killed_by_user_id UUID := NULL;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    v_killed_by_name := CASE
        WHEN COALESCE(p_is_winner, false) THEN NULL
        ELSE NULLIF(TRIM(COALESCE(p_killed_by, '')), '')
    END;

    IF v_killed_by_name IS NOT NULL THEN
        SELECT id INTO v_killed_by_user_id
        FROM public.user_profiles
        WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_killed_by_name))
        LIMIT 1;
    END IF;

    IF p_match_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.match_history WHERE id = p_match_id) THEN
        v_match_id := p_match_id;
        UPDATE public.match_history SET
            total_players = GREATEST(total_players, COALESCE(p_total_players, 2)),
            winner_user_id = CASE WHEN p_is_winner THEN p_user_id ELSE winner_user_id END,
            winner_player_name = CASE WHEN p_is_winner THEN v_display_name ELSE winner_player_name END
        WHERE id = v_match_id;
    ELSE
        INSERT INTO public.match_history (
            room_id, room_name, started_at, ended_at,
            winner_user_id, winner_player_name, total_players
        ) VALUES (
            'MANUAL',
            COALESCE(NULLIF(TRIM(p_room_name), ''), 'Partida Manual'),
            COALESCE(p_ended_at, NOW()) - INTERVAL '15 minutes',
            COALESCE(p_ended_at, NOW()),
            CASE WHEN p_is_winner THEN p_user_id ELSE NULL END,
            CASE WHEN p_is_winner THEN v_display_name ELSE NULL END,
            GREATEST(COALESCE(p_total_players, 2), 1)
        ) RETURNING id INTO v_match_id;
    END IF;

    INSERT INTO public.match_participants (
        match_id, user_id, player_name, character_name,
        elimination_order, survival_points, eliminations_made,
        is_winner, killed_by_user_id, killed_by_player_name
    ) VALUES (
        v_match_id, p_user_id, v_display_name,
        NULLIF(TRIM(COALESCE(p_character_name, '')), ''),
        CASE WHEN p_is_winner THEN NULL ELSE p_elimination_order END,
        COALESCE(p_survival_points, 0),
        COALESCE(p_eliminations, 0),
        COALESCE(p_is_winner, false),
        v_killed_by_user_id,
        v_killed_by_name
    );

    PERFORM public._admin_log('create_match', p_user_id, NULL,
        jsonb_build_object('match_id', v_match_id, 'room_name', p_room_name, 'display_name', v_display_name));

    RETURN json_build_object('success', true, 'match_id', v_match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.admin_update_match_participant(
    p_match_id UUID,
    p_user_id UUID,
    p_room_name TEXT DEFAULT NULL,
    p_character_name TEXT DEFAULT NULL,
    p_is_winner BOOLEAN DEFAULT false,
    p_elimination_order INTEGER DEFAULT NULL,
    p_killed_by TEXT DEFAULT NULL,
    p_survival_points INTEGER DEFAULT 0,
    p_eliminations INTEGER DEFAULT 0,
    p_total_players INTEGER DEFAULT NULL,
    p_ended_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_display_name TEXT;
    v_killed_by_name TEXT;
    v_killed_by_user_id UUID := NULL;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;

    v_killed_by_name := CASE
        WHEN COALESCE(p_is_winner, false) THEN NULL
        ELSE NULLIF(TRIM(COALESCE(p_killed_by, '')), '')
    END;

    IF v_killed_by_name IS NOT NULL THEN
        SELECT id INTO v_killed_by_user_id
        FROM public.user_profiles
        WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_killed_by_name))
        LIMIT 1;
    END IF;

    UPDATE public.match_participants SET
        character_name = NULLIF(TRIM(COALESCE(p_character_name, '')), ''),
        is_winner = COALESCE(p_is_winner, false),
        elimination_order = CASE WHEN p_is_winner THEN NULL ELSE p_elimination_order END,
        killed_by_user_id = v_killed_by_user_id,
        killed_by_player_name = v_killed_by_name,
        survival_points = COALESCE(p_survival_points, 0),
        eliminations_made = COALESCE(p_eliminations, 0)
    WHERE match_id = p_match_id AND user_id = p_user_id;

    UPDATE public.match_history SET
        room_name = COALESCE(NULLIF(TRIM(p_room_name), ''), room_name),
        total_players = COALESCE(p_total_players, total_players),
        ended_at = COALESCE(p_ended_at, ended_at),
        winner_user_id = CASE
            WHEN p_is_winner THEN p_user_id
            WHEN winner_user_id = p_user_id AND NOT p_is_winner THEN NULL
            ELSE winner_user_id
        END,
        winner_player_name = CASE
            WHEN p_is_winner THEN COALESCE(v_display_name, winner_player_name)
            WHEN winner_user_id = p_user_id AND NOT p_is_winner THEN NULL
            ELSE winner_player_name
        END
    WHERE id = p_match_id;

    PERFORM public._admin_log('update_match', p_user_id, NULL,
        jsonb_build_object('match_id', p_match_id, 'display_name', v_display_name));

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_save_full_match(
    p_match_id UUID,
    p_room_name TEXT,
    p_total_players INTEGER,
    p_ended_at TIMESTAMPTZ,
    p_participants JSONB
) RETURNS JSON AS $$
DECLARE
    v_part JSONB;
    v_winner_user_id UUID := NULL;
    v_winner_name TEXT := NULL;
    v_part_user_id UUID;
    v_part_name TEXT;
    v_killed_by_name TEXT;
    v_killed_by_user_id UUID;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.match_history WHERE id = p_match_id) THEN
        RAISE EXCEPTION 'Partida não encontrada';
    END IF;

    DELETE FROM public.match_participants WHERE match_id = p_match_id;

    FOR v_part IN SELECT * FROM jsonb_array_elements(p_participants)
    LOOP
        v_part_user_id := NULLIF(TRIM(COALESCE(v_part ->> 'user_id', '')), '')::UUID;
        v_part_name := COALESCE(NULLIF(TRIM(v_part ->> 'player_name'), ''), 'Jogador');
        v_killed_by_name := NULLIF(TRIM(COALESCE(v_part ->> 'killed_by_player_name', '')), '');
        v_killed_by_user_id := NULLIF(TRIM(COALESCE(v_part ->> 'killed_by_user_id', '')), '')::UUID;

        IF v_part_user_id IS NOT NULL AND v_part_name = 'Jogador' THEN
            SELECT display_name INTO v_part_name FROM public.user_profiles WHERE id = v_part_user_id;
        END IF;

        IF v_killed_by_user_id IS NULL AND v_killed_by_name IS NOT NULL THEN
            SELECT id INTO v_killed_by_user_id
            FROM public.user_profiles
            WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_killed_by_name))
            LIMIT 1;
        END IF;

        IF COALESCE((v_part ->> 'is_winner')::BOOLEAN, false) THEN
            v_winner_user_id := v_part_user_id;
            v_winner_name := v_part_name;
        END IF;

        INSERT INTO public.match_participants (
            match_id, user_id, player_name, character_name,
            elimination_order, survival_points, eliminations_made,
            is_winner, killed_by_user_id, killed_by_player_name
        ) VALUES (
            p_match_id,
            v_part_user_id,
            v_part_name,
            NULLIF(TRIM(COALESCE(v_part ->> 'character_name', '')), ''),
            NULLIF(TRIM(COALESCE(v_part ->> 'elimination_order', '')), '')::INTEGER,
            COALESCE((v_part ->> 'survival_points')::INTEGER, 0),
            COALESCE((v_part ->> 'eliminations_made')::INTEGER, 0),
            COALESCE((v_part ->> 'is_winner')::BOOLEAN, false),
            CASE WHEN COALESCE((v_part ->> 'is_winner')::BOOLEAN, false) THEN NULL ELSE v_killed_by_user_id END,
            CASE WHEN COALESCE((v_part ->> 'is_winner')::BOOLEAN, false) THEN NULL ELSE v_killed_by_name END
        );
    END LOOP;

    UPDATE public.match_history SET
        room_name = COALESCE(NULLIF(TRIM(p_room_name), ''), room_name),
        total_players = GREATEST(COALESCE(p_total_players, total_players), jsonb_array_length(p_participants)),
        ended_at = COALESCE(p_ended_at, ended_at),
        winner_user_id = v_winner_user_id,
        winner_player_name = COALESCE(v_winner_name, winner_player_name)
    WHERE id = p_match_id;

    PERFORM public._admin_log('edit_full_match', NULL, NULL,
        jsonb_build_object('match_id', p_match_id, 'room_name', p_room_name));

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_repair_and_link_matches()
RETURNS JSON AS $$
DECLARE
    v_linked_participants INTEGER := 0;
    v_created_winners INTEGER := 0;
    v_uid UUID;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    UPDATE public.match_history mh
    SET winner_user_id = up.id
    FROM public.user_profiles up
    WHERE mh.winner_user_id IS NULL
      AND mh.winner_player_name IS NOT NULL
      AND LOWER(TRIM(mh.winner_player_name)) = LOWER(TRIM(up.display_name));

    INSERT INTO public.match_participants (
        match_id, user_id, player_name, survival_points, eliminations_made, is_winner
    )
    SELECT
        mh.id,
        mh.winner_user_id,
        COALESCE(mh.winner_player_name, 'Vencedor'),
        GREATEST(COALESCE(mh.total_players, 2) - 1, 0),
        0,
        true
    FROM public.match_history mh
    WHERE mh.winner_player_name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.match_participants mp WHERE mp.match_id = mh.id
      );
    GET DIAGNOSTICS v_created_winners = ROW_COUNT;

    UPDATE public.match_participants mp
    SET user_id = up.id
    FROM public.user_profiles up
    WHERE mp.user_id IS NULL
      AND LOWER(TRIM(mp.player_name)) = LOWER(TRIM(up.display_name));
    GET DIAGNOSTICS v_linked_participants = ROW_COUNT;

    UPDATE public.match_participants mp
    SET killed_by_user_id = up.id
    FROM public.user_profiles up
    WHERE mp.killed_by_user_id IS NULL
      AND mp.killed_by_player_name IS NOT NULL
      AND LOWER(TRIM(mp.killed_by_player_name)) = LOWER(TRIM(up.display_name));

    FOR v_uid IN SELECT id FROM public.user_profiles
    LOOP
        PERFORM public._recalculate_player_stats(v_uid);
    END LOOP;

    PERFORM public._admin_log('repair_matches', NULL, NULL,
        jsonb_build_object('linked_participants', v_linked_participants, 'created_winners', v_created_winners));

    RETURN json_build_object(
        'success', true,
        'linked_participants', v_linked_participants,
        'created_winners', v_created_winners
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_merge_matches(
    p_match_ids UUID[]
) RETURNS JSON AS $$
DECLARE
    v_primary_id UUID;
    v_secondary_id UUID;
    v_winner_user_id UUID;
    v_winner_player_name TEXT;
    v_max_total INTEGER;
    v_affected_count INTEGER := 0;
    v_merged_count INTEGER := 0;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    IF array_length(p_match_ids, 1) < 2 THEN
        RAISE EXCEPTION 'Precisa de pelo menos 2 partidas para fazer merge';
    END IF;

    IF (SELECT COUNT(*) FROM public.match_history WHERE id = ANY(p_match_ids))
        != array_length(p_match_ids, 1) THEN
        RAISE EXCEPTION 'Uma ou mais partidas não encontradas';
    END IF;

    SELECT id INTO v_primary_id
    FROM public.match_history
    WHERE id = ANY(p_match_ids) AND winner_user_id IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 1;

    IF v_primary_id IS NULL THEN
        v_primary_id := p_match_ids[1];
    END IF;

    SELECT winner_user_id, winner_player_name
    INTO v_winner_user_id, v_winner_player_name
    FROM public.match_history
    WHERE id = ANY(p_match_ids) AND winner_user_id IS NOT NULL
    LIMIT 1;

    SELECT COUNT(DISTINCT mp.user_id) INTO v_affected_count
    FROM public.match_participants mp
    WHERE mp.match_id = ANY(p_match_ids)
      AND mp.user_id IS NOT NULL;

    FOR v_secondary_id IN
        SELECT unnest(p_match_ids) EXCEPT SELECT v_primary_id
    LOOP
        UPDATE public.match_participants
        SET match_id = v_primary_id
        WHERE match_id = v_secondary_id
        AND NOT EXISTS (
            SELECT 1 FROM public.match_participants existing
            WHERE existing.match_id = v_primary_id
            AND existing.user_id = public.match_participants.user_id
            AND existing.user_id IS NOT NULL
        );

        DELETE FROM public.match_participants WHERE match_id = v_secondary_id;
        DELETE FROM public.match_history WHERE id = v_secondary_id;
        v_merged_count := v_merged_count + 1;
    END LOOP;

    SELECT GREATEST(
        (SELECT COUNT(*) FROM public.match_participants WHERE match_id = v_primary_id),
        (SELECT total_players FROM public.match_history WHERE id = v_primary_id)
    ) INTO v_max_total;

    UPDATE public.match_history SET
        winner_user_id = COALESCE(v_winner_user_id, winner_user_id),
        winner_player_name = COALESCE(v_winner_player_name, winner_player_name),
        total_players = v_max_total
    WHERE id = v_primary_id;

    PERFORM public._admin_log('merge_matches', NULL, NULL,
        jsonb_build_object(
            'primary_match_id', v_primary_id,
            'merged_count', v_merged_count
        ));

    RETURN json_build_object(
        'success', true,
        'primary_match_id', v_primary_id,
        'merged_count', v_merged_count,
        'affected_users', v_affected_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.admin_auto_merge_matches();
DROP FUNCTION IF EXISTS public.admin_auto_merge_matches(BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_auto_merge_matches(
    p_dry_run BOOLEAN DEFAULT true
) RETURNS JSON AS $$
DECLARE
    v_group RECORD;
    v_primary_id UUID;
    v_secondary_id UUID;
    v_winner_user_id UUID;
    v_winner_player_name TEXT;
    v_best_room_id VARCHAR(6);
    v_best_started_at TIMESTAMPTZ;
    v_max_total INTEGER;
    v_affected_users UUID[] := '{}';
    v_groups_merged INTEGER := 0;
    v_total_removed INTEGER := 0;
    v_preview JSONB := '[]'::JSONB;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    FOR v_group IN
        SELECT
            mh.room_name,
            mh.ended_at,
            COUNT(*) AS match_count,
            ARRAY_AGG(mh.id ORDER BY
                (CASE WHEN mh.winner_user_id IS NOT NULL THEN 4 ELSE 0 END)
                + (CASE WHEN mh.room_id IS NOT NULL THEN 2 ELSE 0 END)
                + (CASE WHEN mh.started_at IS NOT NULL THEN 1 ELSE 0 END)
                + (CASE WHEN mh.winner_player_name IS NOT NULL THEN 1 ELSE 0 END)
                DESC,
                mh.total_players DESC
            ) AS match_ids
        FROM public.match_history mh
        GROUP BY mh.room_name, mh.ended_at
        HAVING COUNT(*) > 1
    LOOP
        v_primary_id := v_group.match_ids[1];

        IF p_dry_run THEN
            v_preview := v_preview || jsonb_build_object(
                'room_name', v_group.room_name,
                'ended_at', v_group.ended_at,
                'duplicates', v_group.match_count,
                'primary_id', v_primary_id,
                'will_remove', v_group.match_count - 1,
                'all_ids', ARRAY_TO_JSON(v_group.match_ids)
            );
        ELSE
            SELECT winner_user_id, winner_player_name
            INTO v_winner_user_id, v_winner_player_name
            FROM public.match_history
            WHERE id = ANY(v_group.match_ids) AND winner_user_id IS NOT NULL
            LIMIT 1;

            SELECT room_id INTO v_best_room_id
            FROM public.match_history
            WHERE id = ANY(v_group.match_ids) AND room_id IS NOT NULL
            LIMIT 1;

            SELECT started_at INTO v_best_started_at
            FROM public.match_history
            WHERE id = ANY(v_group.match_ids) AND started_at IS NOT NULL
            LIMIT 1;

            v_affected_users := v_affected_users || ARRAY(
                SELECT DISTINCT mp.user_id
                FROM public.match_participants mp
                WHERE mp.match_id = ANY(v_group.match_ids)
                AND mp.user_id IS NOT NULL
            );

            FOR v_secondary_id IN
                SELECT unnest(v_group.match_ids[2:])
            LOOP
                UPDATE public.match_participants
                SET match_id = v_primary_id
                WHERE match_id = v_secondary_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.match_participants existing
                    WHERE existing.match_id = v_primary_id
                    AND existing.user_id = public.match_participants.user_id
                    AND existing.user_id IS NOT NULL
                );

                DELETE FROM public.match_participants WHERE match_id = v_secondary_id;
                DELETE FROM public.match_history WHERE id = v_secondary_id;
                v_total_removed := v_total_removed + 1;
            END LOOP;

            SELECT GREATEST(
                (SELECT COUNT(*) FROM public.match_participants WHERE match_id = v_primary_id),
                (SELECT total_players FROM public.match_history WHERE id = v_primary_id)
            ) INTO v_max_total;

            UPDATE public.match_history SET
                winner_user_id = COALESCE(v_winner_user_id, winner_user_id),
                winner_player_name = COALESCE(v_winner_player_name, winner_player_name),
                room_id = COALESCE(v_best_room_id, room_id),
                started_at = COALESCE(v_best_started_at, started_at),
                total_players = v_max_total
            WHERE id = v_primary_id;

            v_groups_merged := v_groups_merged + 1;
        END IF;
    END LOOP;

    IF NOT p_dry_run AND array_length(v_affected_users, 1) > 0 THEN
        v_affected_users := ARRAY(SELECT DISTINCT unnest(v_affected_users));

        PERFORM public._admin_log('auto_merge_matches', NULL, NULL,
            jsonb_build_object(
                'groups_merged', v_groups_merged,
                'entries_removed', v_total_removed,
                'affected_users', array_length(v_affected_users, 1)
            ));
    END IF;

    IF p_dry_run THEN
        RETURN json_build_object(
            'success', true,
            'dry_run', true,
            'groups_found', jsonb_array_length(v_preview),
            'preview', v_preview
        );
    ELSE
        RETURN json_build_object(
            'success', true,
            'dry_run', false,
            'groups_merged', v_groups_merged,
            'entries_removed', v_total_removed,
            'affected_users', COALESCE(array_length(v_affected_users, 1), 0)
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 10: ADMIN — DASHBOARD & QUERIES
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

    IF p_include_inactive THEN
        SELECT COUNT(*) INTO v_total FROM public.rooms;
    ELSE
        SELECT COUNT(*) INTO v_total FROM public.rooms WHERE is_active = true;
    END IF;

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

CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_banned_only BOOLEAN DEFAULT false,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_users JSON;
    v_total INTEGER;
    v_escaped_search TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    v_escaped_search := CASE
        WHEN p_search IS NULL OR TRIM(p_search) = '' THEN NULL
        ELSE REPLACE(REPLACE(REPLACE(TRIM(p_search), '\', '\\'), '%', '\%'), '_', '\_')
    END;

    SELECT COUNT(*) INTO v_total
    FROM public.user_profiles up
    WHERE (v_escaped_search IS NULL OR up.display_name ILIKE '%' || v_escaped_search || '%' ESCAPE '\')
      AND (NOT p_banned_only OR up.banned_at IS NOT NULL);

    SELECT json_agg(user_data ORDER BY user_data.created_at DESC) INTO v_users
    FROM (
        SELECT
            up.id,
            up.display_name,
            up.avatar_url,
            up.theme,
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
        WHERE (v_escaped_search IS NULL OR up.display_name ILIKE '%' || v_escaped_search || '%' ESCAPE '\')
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

    SELECT COUNT(*) INTO v_total
    FROM public.match_history mh
    WHERE p_room_id IS NULL OR mh.room_id = p_room_id;

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
            COALESCE((
                SELECT json_agg(json_build_object(
                    'id', mp.id,
                    'user_id', mp.user_id,
                    'account_name', up.display_name,
                    'player_name', mp.player_name,
                    'character_name', mp.character_name,
                    'elimination_order', mp.elimination_order,
                    'survival_points', COALESCE(mp.survival_points, 0),
                    'eliminations_made', COALESCE(mp.eliminations_made, 0),
                    'is_winner', COALESCE(mp.is_winner, false),
                    'killed_by_user_id', mp.killed_by_user_id,
                    'killed_by_player_name', mp.killed_by_player_name
                ) ORDER BY mp.is_winner DESC, mp.elimination_order ASC NULLS LAST)
                FROM public.match_participants mp
                LEFT JOIN public.user_profiles up ON up.id = mp.user_id
                WHERE mp.match_id = mh.id
            ), '[]'::json) AS participants
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

CREATE OR REPLACE FUNCTION public.admin_get_dashboard()
RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN json_build_object(
        'timestamp', NOW(),
        'total_rooms', (SELECT COUNT(*) FROM public.rooms),
        'active_rooms', (SELECT COUNT(*) FROM public.rooms WHERE is_active = true),
        'rooms_in_match', (SELECT COUNT(*) FROM public.rooms WHERE match_status IS NOT NULL),
        'total_players', (SELECT COUNT(*) FROM public.players),
        'connected_players', (SELECT COUNT(*) FROM public.players WHERE is_connected = true),
        'total_users', (SELECT COUNT(*) FROM public.user_profiles),
        'banned_users', (SELECT COUNT(*) FROM public.user_profiles WHERE banned_at IS NOT NULL),
        'total_matches', (SELECT COUNT(*) FROM public.match_history),
        'matches_today', (SELECT COUNT(*) FROM public.match_history WHERE ended_at >= CURRENT_DATE),
        'matches_this_week', (SELECT COUNT(*) FROM public.match_history WHERE ended_at >= CURRENT_DATE - INTERVAL '7 days'),
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

    SELECT json_build_object(
        'id', up.id,
        'display_name', up.display_name,
        'avatar_url', up.avatar_url,
        'theme', COALESCE(up.theme, 'classic'),
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
            mp.killed_by_player_name,
            COALESCE(mp.eliminations_made, 0) AS eliminations_made
        FROM public.match_participants mp
        JOIN public.match_history mh ON mh.id = mp.match_id
        WHERE mp.user_id = p_user_id
        ORDER BY mh.ended_at DESC
        LIMIT 100
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

    PERFORM public._admin_log('update_setting', NULL, NULL,
        jsonb_build_object('key', p_key, 'value', p_value));

    RETURN json_build_object('success', true, 'key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 10B: AUTO-ENCERRAMENTO E MANUTENÇÃO AGENDADA
-- ================================

CREATE OR REPLACE FUNCTION public.auto_end_stale_matches()
RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_match_id UUID;
    v_total INTEGER;
    v_winner RECORD;
    v_winner_user_id UUID;
    v_player RECORD;
    v_participant_user_id UUID;
    v_is_winner BOOLEAN;
    v_survival_points INTEGER;
    v_eliminations_made INTEGER;
    v_ended_count INTEGER := 0;
BEGIN
    IF current_setting('app.is_scheduled_job', true) IS DISTINCT FROM 'true'
       AND NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    PERFORM set_config('app.allow_match_field_update', 'true', true);

    FOR v_room IN
        SELECT r.*
        FROM public.rooms r
        WHERE r.match_status = 'in_progress'
        AND r.last_activity < NOW() - INTERVAL '2 hours'
    LOOP
        SELECT COUNT(*) INTO v_total
        FROM public.players
        WHERE room_id = v_room.id
          AND in_match = true;

        IF v_total = 0 THEN
            UPDATE public.rooms SET
                match_status = NULL,
                match_started_at = NULL,
                last_activity = NOW()
            WHERE id = v_room.id;

            DELETE FROM public.players
            WHERE room_id = v_room.id
              AND is_connected = false;

            UPDATE public.players SET
                in_match = false,
                match_character_name = NULL,
                is_alive = true,
                killed_by_player_id = NULL,
                elimination_order = NULL,
                last_activity = NOW()
            WHERE room_id = v_room.id;

            v_ended_count := v_ended_count + 1;
            CONTINUE;
        END IF;

        SELECT p.id, p.name, p.user_id, COALESCE(p.match_character_name, p.character_name) AS character_name
        INTO v_winner
        FROM public.players p
        WHERE p.room_id = v_room.id
          AND p.in_match = true
          AND p.is_alive = true
        ORDER BY p.is_connected DESC, p.last_activity DESC
        LIMIT 1;

        v_winner_user_id := v_winner.user_id;
        IF v_winner_user_id IS NULL AND v_winner.name IS NOT NULL THEN
            SELECT id INTO v_winner_user_id
            FROM public.user_profiles
            WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_winner.name))
            LIMIT 1;
        END IF;

        INSERT INTO public.match_history (
            room_id, room_name, started_at, ended_at,
            winner_user_id, winner_player_name, total_players
        ) VALUES (
            v_room.id,
            v_room.name,
            COALESCE(v_room.match_started_at, v_room.created_at),
            NOW(),
            v_winner_user_id,
            v_winner.name,
            v_total
        ) RETURNING id INTO v_match_id;

        FOR v_player IN
            SELECT p.*
            FROM public.players p
            WHERE p.room_id = v_room.id
              AND p.in_match = true
        LOOP
            v_is_winner := (v_winner.id IS NOT NULL AND v_player.id = v_winner.id);

            IF v_is_winner THEN
                v_survival_points := GREATEST(v_total - 1, 0);
            ELSE
                v_survival_points := COALESCE(v_player.elimination_order - 1, 0);
            END IF;

            SELECT COUNT(*) INTO v_eliminations_made
            FROM public.players
            WHERE room_id = v_room.id
              AND in_match = true
              AND killed_by_player_id = v_player.id;

            v_participant_user_id := v_player.user_id;
            IF v_participant_user_id IS NULL THEN
                SELECT id INTO v_participant_user_id
                FROM public.user_profiles
                WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(v_player.name))
                LIMIT 1;
            END IF;

            INSERT INTO public.match_participants (
                match_id, user_id, player_name, character_name,
                elimination_order, killed_by_user_id, killed_by_player_name,
                survival_points, eliminations_made, is_winner
            ) VALUES (
                v_match_id,
                v_participant_user_id,
                v_player.name,
                COALESCE(v_player.match_character_name, v_player.character_name),
                CASE WHEN v_is_winner THEN NULL ELSE v_player.elimination_order END,
                CASE WHEN v_player.killed_by_player_id IS NOT NULL THEN
                    (SELECT user_id FROM public.players WHERE id = v_player.killed_by_player_id)
                ELSE NULL END,
                CASE WHEN v_player.killed_by_player_id IS NOT NULL THEN
                    (SELECT name FROM public.players WHERE id = v_player.killed_by_player_id)
                ELSE NULL END,
                v_survival_points,
                v_eliminations_made,
                v_is_winner
            );
        END LOOP;

        DELETE FROM public.combat_notifications
        WHERE room_id = v_room.id;

        UPDATE public.rooms SET
            match_status = NULL,
            match_started_at = NULL,
            last_activity = NOW()
        WHERE id = v_room.id;

        DELETE FROM public.players
        WHERE room_id = v_room.id
          AND is_connected = false;

        UPDATE public.players SET
            in_match = false,
            match_character_name = NULL,
            is_alive = true,
            killed_by_player_id = NULL,
            elimination_order = NULL,
            last_activity = NOW()
        WHERE room_id = v_room.id;

        v_ended_count := v_ended_count + 1;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'matches_ended', v_ended_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public._run_scheduled_maintenance()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.is_scheduled_job', 'true', true);
    PERFORM public.auto_end_stale_matches();
    PERFORM public.cleanup_inactive_players();
    PERFORM public.cleanup_inactive_rooms();
    PERFORM public.clean_old_combats();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 11: ESTATÍSTICAS PÚBLICAS (GLOBAL E POR JOGADOR)
-- ================================

CREATE OR REPLACE FUNCTION public.get_global_stats()
RETURNS JSON AS $$
DECLARE
    v_total_participations INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT COUNT(*) INTO v_total_participations
    FROM public.match_participants
    WHERE character_name IS NOT NULL AND TRIM(character_name) <> '';

    RETURN json_build_object(
        'overview', json_build_object(
            'total_matches', (SELECT COUNT(*) FROM public.match_history),
            'total_registered_players', (SELECT COUNT(*) FROM public.user_profiles),
            'active_players', (SELECT COUNT(*) FROM public.user_stats WHERE total_matches > 0),
            'total_eliminations', (SELECT COALESCE(SUM(COALESCE(eliminations_made, 0)), 0)::INTEGER FROM public.match_participants),
            'avg_players_per_match', (SELECT COALESCE(ROUND(AVG(total_players)::DECIMAL, 1), 0) FROM public.match_history),
            'avg_duration_minutes', (
                SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0)::DECIMAL, 1), 0)
                FROM public.match_history
                WHERE started_at IS NOT NULL
                  AND ended_at > started_at
                  AND EXTRACT(EPOCH FROM (ended_at - started_at)) BETWEEN 60 AND 14400
            )
        ),
        'records', json_build_object(
            'best_single_match_eliminations', (
                SELECT json_build_object(
                    'player_name', COALESCE(up.display_name, mp.player_name),
                    'user_id', mp.user_id,
                    'character_name', mp.character_name,
                    'eliminations', mp.eliminations_made,
                    'ended_at', mh.ended_at
                )
                FROM public.match_participants mp
                JOIN public.match_history mh ON mh.id = mp.match_id
                LEFT JOIN public.user_profiles up ON up.id = mp.user_id
                WHERE COALESCE(mp.eliminations_made, 0) > 0
                ORDER BY mp.eliminations_made DESC, mh.ended_at DESC
                LIMIT 1
            ),
            'biggest_match', (
                SELECT json_build_object(
                    'room_name', mh.room_name,
                    'total_players', mh.total_players,
                    'winner_player_name', mh.winner_player_name,
                    'ended_at', mh.ended_at
                )
                FROM public.match_history mh
                ORDER BY mh.total_players DESC, mh.ended_at DESC
                LIMIT 1
            )
        ),
        'character_meta', COALESCE((
            SELECT json_agg(row_to_json(char_stats) ORDER BY char_stats.times_picked DESC, char_stats.win_rate DESC)
            FROM (
                SELECT
                    TRIM(mp.character_name) AS character_name,
                    COUNT(*)::INTEGER AS times_picked,
                    COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS wins,
                    CASE WHEN COUNT(*) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE mp.is_winner = true)::DECIMAL / COUNT(*)) * 100, 1)
                        ELSE 0 END AS win_rate,
                    CASE WHEN v_total_participations > 0
                        THEN ROUND((COUNT(*)::DECIMAL / v_total_participations) * 100, 1)
                        ELSE 0 END AS pick_rate,
                    COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
                    ROUND(AVG(COALESCE(mp.eliminations_made, 0))::DECIMAL, 2) AS avg_eliminations,
                    ROUND(AVG(COALESCE(mp.survival_points, 0))::DECIMAL, 2) AS avg_survival_points
                FROM public.match_participants mp
                WHERE mp.character_name IS NOT NULL AND TRIM(mp.character_name) <> ''
                GROUP BY TRIM(mp.character_name)
            ) char_stats
        ), '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.search_public_players(
    p_query TEXT,
    p_limit INTEGER DEFAULT 15
) RETURNS JSON AS $$
DECLARE
    v_clean_query TEXT;
    v_escaped_query TEXT;
    v_safe_limit INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    v_clean_query := TRIM(COALESCE(p_query, ''));
    IF LENGTH(REGEXP_REPLACE(v_clean_query, '[%_\\]', '', 'g')) < 2 THEN
        RETURN '[]'::json;
    END IF;

    v_escaped_query := REPLACE(REPLACE(REPLACE(v_clean_query, '\', '\\'), '%', '\%'), '_', '\_');
    v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 30);

    RETURN COALESCE((
        SELECT json_agg(row_to_json(found_players) ORDER BY found_players.composite_score DESC, found_players.display_name ASC)
        FROM (
            SELECT
                up.id AS user_id,
                up.display_name,
                up.avatar_url,
                COALESCE(us.total_matches, 0) AS total_matches,
                COALESCE(us.total_wins, 0) AS total_wins,
                COALESCE(us.total_eliminations, 0) AS total_eliminations,
                COALESCE(us.win_rate, 0) AS win_rate,
                COALESCE(us.composite_score, 0) AS composite_score,
                us.favorite_character
            FROM public.user_profiles up
            LEFT JOIN public.user_stats us ON us.user_id = up.id
            WHERE up.display_name ILIKE '%' || v_escaped_query || '%' ESCAPE '\'
              AND up.banned_at IS NULL
            ORDER BY COALESCE(us.composite_score, 0) DESC, up.display_name ASC
            LIMIT v_safe_limit
        ) found_players
    ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_player_public_stats(
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    v_profile JSON;
    v_stats RECORD;
    v_rank_position INTEGER;
    v_best_elims INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    SELECT json_build_object(
        'user_id', up.id,
        'display_name', up.display_name,
        'avatar_url', up.avatar_url,
        'created_at', up.created_at
    ) INTO v_profile
    FROM public.user_profiles up
    WHERE up.id = p_user_id
      AND up.banned_at IS NULL;

    IF v_profile IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Jogador não encontrado');
    END IF;

    SELECT
        COALESCE(us.total_matches, 0) AS total_matches,
        COALESCE(us.total_wins, 0) AS total_wins,
        COALESCE(us.total_eliminations, 0) AS total_eliminations,
        COALESCE(us.total_survival_points, 0) AS total_survival_points,
        COALESCE(us.win_rate, 0) AS win_rate,
        COALESCE(us.composite_score, 0) AS composite_score,
        us.favorite_character
    INTO v_stats
    FROM public.user_stats us
    WHERE us.user_id = p_user_id;

    IF COALESCE(v_stats.total_matches, 0) > 0 THEN
        SELECT (COUNT(*) + 1)::INTEGER INTO v_rank_position
        FROM public.user_stats us2
        JOIN public.user_profiles up2 ON up2.id = us2.user_id
        WHERE up2.banned_at IS NULL
          AND us2.total_matches > 0
          AND us2.composite_score > COALESCE(v_stats.composite_score, 0);
    ELSE
        v_rank_position := NULL;
    END IF;

    SELECT COALESCE(MAX(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER INTO v_best_elims
    FROM public.match_participants mp
    WHERE mp.user_id = p_user_id;

    RETURN json_build_object(
        'success', true,
        'profile', v_profile,
        'summary', json_build_object(
            'rank_position', v_rank_position,
            'total_matches', COALESCE(v_stats.total_matches, 0),
            'total_wins', COALESCE(v_stats.total_wins, 0),
            'total_eliminations', COALESCE(v_stats.total_eliminations, 0),
            'total_survival_points', COALESCE(v_stats.total_survival_points, 0),
            'win_rate', COALESCE(v_stats.win_rate, 0),
            'composite_score', COALESCE(v_stats.composite_score, 0),
            'favorite_character', v_stats.favorite_character,
            'avg_eliminations', CASE WHEN COALESCE(v_stats.total_matches, 0) > 0
                THEN ROUND((v_stats.total_eliminations::DECIMAL / v_stats.total_matches), 2)
                ELSE 0 END,
            'avg_survival_points', CASE WHEN COALESCE(v_stats.total_matches, 0) > 0
                THEN ROUND((v_stats.total_survival_points::DECIMAL / v_stats.total_matches), 2)
                ELSE 0 END,
            'best_match_eliminations', v_best_elims
        ),
        'characters', COALESCE((
            SELECT json_agg(row_to_json(c_row) ORDER BY c_row.matches DESC, c_row.wins DESC)
            FROM (
                SELECT
                    TRIM(mp.character_name) AS character_name,
                    COUNT(*)::INTEGER AS matches,
                    COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS wins,
                    CASE WHEN COUNT(*) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE mp.is_winner = true)::DECIMAL / COUNT(*)) * 100, 1)
                        ELSE 0 END AS win_rate,
                    COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS eliminations,
                    ROUND(AVG(COALESCE(mp.eliminations_made, 0))::DECIMAL, 2) AS avg_eliminations,
                    COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS survival_points
                FROM public.match_participants mp
                WHERE mp.user_id = p_user_id
                  AND mp.character_name IS NOT NULL
                  AND TRIM(mp.character_name) <> ''
                GROUP BY TRIM(mp.character_name)
            ) c_row
        ), '[]'::json),
        'rivalries', json_build_object(
            'nemesis', (
                SELECT json_build_object(
                    'user_id', mp.killed_by_user_id,
                    'name', COALESCE(up.display_name, mp.killed_by_player_name),
                    'times', COUNT(*)::INTEGER
                )
                FROM public.match_participants mp
                LEFT JOIN public.user_profiles up ON up.id = mp.killed_by_user_id
                WHERE mp.user_id = p_user_id
                  AND mp.killed_by_user_id IS DISTINCT FROM p_user_id
                  AND (mp.killed_by_user_id IS NOT NULL OR (mp.killed_by_player_name IS NOT NULL AND TRIM(mp.killed_by_player_name) <> ''))
                GROUP BY mp.killed_by_user_id, COALESCE(up.display_name, mp.killed_by_player_name)
                ORDER BY COUNT(*) DESC
                LIMIT 1
            ),
            'favorite_victim', (
                SELECT json_build_object(
                    'user_id', mp.user_id,
                    'name', COALESCE(up.display_name, mp.player_name),
                    'times', COUNT(*)::INTEGER
                )
                FROM public.match_participants mp
                LEFT JOIN public.user_profiles up ON up.id = mp.user_id
                WHERE mp.killed_by_user_id = p_user_id
                  AND mp.user_id IS DISTINCT FROM p_user_id
                GROUP BY mp.user_id, COALESCE(up.display_name, mp.player_name)
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
        ),
        'recent_matches', COALESCE((
            SELECT json_agg(row_to_json(rm_row) ORDER BY rm_row.ended_at DESC)
            FROM (
                SELECT
                    mh.id AS match_id,
                    mh.room_name,
                    mh.ended_at,
                    mh.total_players,
                    mh.winner_player_name,
                    mp.character_name,
                    COALESCE(mp.is_winner, false) AS is_winner,
                    mp.elimination_order,
                    COALESCE(mp.eliminations_made, 0) AS eliminations_made,
                    COALESCE(mp.survival_points, 0) AS survival_points,
                    mp.killed_by_player_name
                FROM public.match_participants mp
                JOIN public.match_history mh ON mh.id = mp.match_id
                WHERE mp.user_id = p_user_id
                ORDER BY mh.ended_at DESC
                LIMIT 20
            ) rm_row
        ), '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ================================
-- SEÇÃO 12: GRANTS, REVOKES, SEARCH_PATH, CRON & INITIAL SYNC
-- ================================

DO $$
DECLARE
    v_func RECORD;
BEGIN
    -- 1. Funções estritamente internas: ninguém chama direto via API
    FOR v_func IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              '_admin_log',
              '_recalculate_player_stats',
              '_run_scheduled_maintenance',
              'cleanup_inactive_players',
              'cleanup_inactive_rooms',
              'clean_old_combats',
              'get_system_stats',
              'get_combat_stats'
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
            v_func.proname, v_func.args
        );
    END LOOP;

    -- 2. RPCs de jogo e admin: bloqueia PUBLIC/anon, libera apenas authenticated
    FOR v_func IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (
              p.proname IN (
                  'create_room_with_host',
                  'join_room',
                  'start_match',
                  'end_match',
                  'declare_elimination',
                  'master_eliminate_player',
                  'master_cancel_match',
                  'update_user_theme',
                  'get_players_brief_stats',
                  'start_combat',
                  'confirm_defense_weapon',
                  'update_combat_group_phase',
                  'add_opportunity_attack',
                  'update_combat_roll',
                  'update_combat_group_shared_roll',
                  'master_kick_player',
                  'get_global_stats',
                  'search_public_players',
                  'get_player_public_stats',
                  'cleanup_inactive_data',
                  'auto_end_stale_matches',
                  'test_cleanup_system',
                  'debug_room_cleanup',
                  'is_user_admin',
                  'is_user_in_room'
              )
              OR p.proname LIKE 'admin\_%' ESCAPE '\'
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
            v_func.proname, v_func.args
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
            v_func.proname, v_func.args
        );
    END LOOP;

    -- 3. Hardening automático: define search_path seguro em todas as funções SECURITY DEFINER
    FOR v_func IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
            v_func.proname, v_func.args
        );
    END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_app_setting(TEXT) TO anon, authenticated;

-- Agendamento automático de manutenção via pg_cron (a cada 15 minutos, se ativo)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'kod_scheduled_maintenance';

        PERFORM cron.schedule(
            'kod_scheduled_maintenance',
            '*/15 * * * *',
            'SELECT public._run_scheduled_maintenance();'
        );
    END IF;
END $$;

-- Sincronizar estatísticas de todas as contas com o histórico atual
DO $$
DECLARE
    v_uid UUID;
BEGIN
    FOR v_uid IN SELECT id FROM public.user_profiles
    LOOP
        PERFORM public._recalculate_player_stats(v_uid);
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

SELECT 'TODAS AS FUNÇÕES E TRIGGERS v5.6 INSTALADAS!' AS status;