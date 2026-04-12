-- ================================================================
-- MATAR OU MORRER — Todas as Funções e Triggers
-- Execute no SQL Editor do Supabase DEPOIS de supabase-setup.sql
-- Pré-requisito: supabase-security-migration.sql já executado
-- ================================================================

-- ================================
-- SEÇÃO 1: TRIGGER FUNCTIONS
-- ================================

-- Marcar jogador como desconectado quando deletado
CREATE OR REPLACE FUNCTION public.mark_player_disconnected()
RETURNS TRIGGER AS $$
BEGIN
    OLD.is_connected := false;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Atualizar last_activity automaticamente em updates
CREATE OR REPLACE FUNCTION public.update_player_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar perfil e stats automaticamente quando usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name, avatar_url, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
        NOW(),
        NOW()
    );

    INSERT INTO public.user_stats (user_id, updated_at)
    VALUES (NEW.id, NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- TRIGGERS
-- ================================
DROP TRIGGER IF EXISTS trigger_mark_player_disconnected ON public.players;
CREATE TRIGGER trigger_mark_player_disconnected
    BEFORE DELETE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION mark_player_disconnected();

DROP TRIGGER IF EXISTS update_player_activity_trigger ON public.players;
CREATE TRIGGER update_player_activity_trigger
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION update_player_activity();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ================================
-- SEÇÃO 2: UTILITY FUNCTIONS
-- ================================

-- Verificar se o usuário é administrador
-- Versão unificada: sem parâmetro usa auth.uid(), com parâmetro usa o valor fornecido
-- Precisa dropar políticas dependentes primeiro para poder recriar a função
DROP POLICY IF EXISTS "rooms_update_master_or_admin" ON public.rooms;
DROP POLICY IF EXISTS "rooms_delete_admin_only" ON public.rooms;
DROP POLICY IF EXISTS "admin_audit_log_select" ON public.admin_audit_log;

DROP FUNCTION IF EXISTS public.is_user_admin();
DROP FUNCTION IF EXISTS public.is_user_admin(UUID);

CREATE FUNCTION public.is_user_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM public.admin_users
        WHERE user_id = COALESCE(p_user_id, auth.uid())
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Recriar políticas dependentes
CREATE POLICY "rooms_update_master_or_admin" ON public.rooms
    FOR UPDATE USING (true);
CREATE POLICY "rooms_delete_admin_only" ON public.rooms
    FOR DELETE USING (public.is_user_admin());
CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
    FOR SELECT USING (public.is_user_admin());

-- Calcular composite score para ranking
CREATE OR REPLACE FUNCTION public.calculate_composite_score(
    p_wins INTEGER,
    p_eliminations INTEGER,
    p_survival_points INTEGER,
    p_matches INTEGER
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_win_rate DECIMAL(5,2);
    v_volume_factor DECIMAL(5,2);
BEGIN
    IF p_matches > 0 THEN
        v_win_rate := (p_wins::DECIMAL / p_matches::DECIMAL) * 100;
        -- Fator de volume: win rate atinge peso total após 20 partidas (progressivo)
        v_volume_factor := LEAST(p_matches::DECIMAL / 20.0, 1.0);
    ELSE
        v_win_rate := 0;
        v_volume_factor := 0;
    END IF;

    -- Fórmula balanceada: vitórias acumuladas dominam, win rate cresce com volume
    RETURN (p_wins * 40) + (p_eliminations * 8) + (p_survival_points * 4) + (v_win_rate * v_volume_factor * 15);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Obter configuração pública (anon + authenticated)
CREATE OR REPLACE FUNCTION public.get_app_setting(p_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT value FROM public.app_settings WHERE key = p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 3: CLEANUP & SYSTEM FUNCTIONS
-- ================================

-- Limpar jogadores inativos/desconectados
DROP FUNCTION IF EXISTS cleanup_inactive_players();
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
    DELETE FROM public.players
    WHERE (
        is_connected = false
        AND last_activity < NOW() - INTERVAL '5 minutes'
    ) OR (
        last_activity < NOW() - INTERVAL '30 minutes'
        AND status = 'selecting'
    ) OR (
        last_activity < NOW() - INTERVAL '2 hours'
    );
END;
$$ LANGUAGE plpgsql;

-- Limpar salas inativas
DROP FUNCTION IF EXISTS cleanup_inactive_rooms();
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
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

-- Limpar tudo (invocada periodicamente)
DROP FUNCTION IF EXISTS cleanup_inactive_data();
CREATE OR REPLACE FUNCTION cleanup_inactive_data()
RETURNS void AS $$
BEGIN
    PERFORM cleanup_inactive_players();
    PERFORM cleanup_inactive_rooms();
END;
$$ LANGUAGE plpgsql;

-- Limpar combates antigos (mais de 24 horas)
CREATE OR REPLACE FUNCTION clean_old_combats()
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

-- Estatísticas do sistema
DROP FUNCTION IF EXISTS get_system_stats();
CREATE OR REPLACE FUNCTION get_system_stats()
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

-- Debug de limpeza de salas
DROP FUNCTION IF EXISTS debug_room_cleanup();
CREATE OR REPLACE FUNCTION debug_room_cleanup()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'rooms_to_cleanup', (
            SELECT json_agg(json_build_object(
                'id', r.id,
                'name', r.name,
                'last_activity', r.last_activity,
                'age_minutes', EXTRACT(EPOCH FROM (NOW() - r.last_activity)) / 60,
                'connected_players', (
                    SELECT COUNT(*) FROM public.players p
                    WHERE p.room_id = r.id AND p.is_connected = true
                ),
                'active_players', (
                    SELECT COUNT(*) FROM public.players p
                    WHERE p.room_id = r.id
                    AND p.is_connected = true
                    AND p.last_activity > NOW() - INTERVAL '30 minutes'
                )
            ))
            FROM public.rooms r
            WHERE r.is_active = true
            AND r.last_activity < NOW() - INTERVAL '1 hour'
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Estatísticas de combate
DROP FUNCTION IF EXISTS get_combat_stats();
CREATE OR REPLACE FUNCTION get_combat_stats()
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
            SELECT SUM(jsonb_array_length(opportunity_attacks_used))::INTEGER
            FROM public.combat_notifications
        ),
        'combats_by_room', (
            SELECT json_object_agg(room_id, combat_count)
            FROM (
                SELECT room_id, COUNT(*) as combat_count
                FROM public.combat_notifications
                GROUP BY room_id
            ) subquery
        )
    );
END;
$$ LANGUAGE plpgsql;

-- ================================
-- SEÇÃO 4: MATCH LIFECYCLE (start, end, elimination)
-- ================================

-- Iniciar partida
CREATE OR REPLACE FUNCTION public.start_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_ready_count INTEGER;
BEGIN
    -- Verificar que o chamador é jogador conectado na sala
    IF auth.uid() IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE room_id = p_room_id
            AND user_id = auth.uid()
            AND is_connected = true
        ) THEN
            RAISE EXCEPTION 'Apenas jogadores conectados na sala podem iniciar a partida';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE room_id = p_room_id
            AND is_connected = true
        ) THEN
            RAISE EXCEPTION 'Apenas jogadores conectados na sala podem iniciar a partida';
        END IF;
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    IF v_room.match_status IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe uma partida ativa nesta sala';
    END IF;

    SELECT COUNT(*) INTO v_ready_count
    FROM public.players
    WHERE room_id = p_room_id
    AND status = 'ready'
    AND is_connected = true;

    IF v_ready_count < 2 THEN
        RAISE EXCEPTION 'Necessários ao menos 2 jogadores prontos para iniciar';
    END IF;

    UPDATE public.rooms SET
        match_status = 'in_progress',
        match_started_at = NOW(),
        last_activity = NOW()
    WHERE id = p_room_id;

    UPDATE public.players SET
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL,
        last_activity = NOW()
    WHERE room_id = p_room_id
    AND status = 'ready'
    AND is_connected = true;

    DELETE FROM public.combat_notifications
    WHERE room_id = p_room_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Encerrar partida (registra stats + reseta estado)
CREATE OR REPLACE FUNCTION public.end_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_match_id UUID;
    v_total INTEGER;
    v_winner RECORD;
    v_player RECORD;
    v_is_winner BOOLEAN;
    v_survival_points INTEGER;
    v_eliminations_made INTEGER;
    v_max_char VARCHAR(100);
BEGIN
    -- Verificar que o chamador é jogador conectado na sala
    IF auth.uid() IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE room_id = p_room_id
            AND user_id = auth.uid()
            AND is_connected = true
        ) THEN
            RAISE EXCEPTION 'Apenas jogadores conectados na sala podem encerrar a partida';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM public.players
            WHERE room_id = p_room_id
            AND is_connected = true
        ) THEN
            RAISE EXCEPTION 'Apenas jogadores conectados na sala podem encerrar a partida';
        END IF;
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    IF v_room.match_status != 'in_progress' THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    -- Contar participantes: jogadores prontos OU eliminados durante a partida
    -- (eliminados que voltaram ao lobby têm status='selecting' mas elimination_order IS NOT NULL)
    SELECT COUNT(*) INTO v_total
    FROM public.players
    WHERE room_id = p_room_id
    AND is_connected = true
    AND (status = 'ready' OR elimination_order IS NOT NULL);

    -- Determinar vencedor: último jogador vivo
    SELECT p.id, p.name, p.user_id, p.character_name
    INTO v_winner
    FROM public.players p
    WHERE p.room_id = p_room_id
    AND p.is_connected = true
    AND p.is_alive = true
    ORDER BY p.last_activity DESC
    LIMIT 1;

    -- Validar que o chamador é o último sobrevivente (anti-trapaça)
    IF auth.uid() IS NOT NULL AND v_winner.user_id IS NOT NULL THEN
        IF v_winner.user_id != auth.uid() THEN
            RAISE EXCEPTION 'Apenas o último sobrevivente pode declarar vitória';
        END IF;
    END IF;

    -- Inserir match_history
    INSERT INTO public.match_history (
        room_id, room_name, started_at, ended_at,
        winner_user_id, winner_player_name, total_players
    ) VALUES (
        p_room_id,
        v_room.name,
        COALESCE(v_room.match_started_at, v_room.created_at),
        NOW(),
        v_winner.user_id,
        v_winner.name,
        v_total
    ) RETURNING id INTO v_match_id;

    -- Inserir participantes e atualizar stats
    -- Inclui jogadores ready E eliminados que voltaram ao lobby (elimination_order NOT NULL)
    FOR v_player IN
        SELECT p.*
        FROM public.players p
        WHERE p.room_id = p_room_id
        AND p.is_connected = true
        AND (p.status = 'ready' OR p.elimination_order IS NOT NULL)
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
        AND killed_by_player_id = v_player.id;

        INSERT INTO public.match_participants (
            match_id, user_id, player_name, character_name,
            elimination_order, killed_by_user_id, killed_by_player_name,
            survival_points, eliminations_made, is_winner
        ) VALUES (
            v_match_id,
            v_player.user_id,
            v_player.name,
            v_player.character_name,
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

        -- Atualizar user_stats se o participante tem conta
        IF v_player.user_id IS NOT NULL THEN
            INSERT INTO public.user_stats (user_id, updated_at)
            VALUES (v_player.user_id, NOW())
            ON CONFLICT (user_id) DO NOTHING;

            UPDATE public.user_stats SET
                total_matches = total_matches + 1,
                total_wins = total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
                total_eliminations = total_eliminations + v_eliminations_made,
                total_survival_points = total_survival_points + v_survival_points,
                win_rate = CASE
                    WHEN (total_matches + 1) > 0
                    THEN ((total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END)::DECIMAL / (total_matches + 1)::DECIMAL) * 100
                    ELSE 0
                END,
                composite_score = calculate_composite_score(
                    total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
                    total_eliminations + v_eliminations_made,
                    total_survival_points + v_survival_points,
                    total_matches + 1
                ),
                updated_at = NOW()
            WHERE user_id = v_player.user_id;

            -- Atualizar personagem favorito
            SELECT mp.character_name INTO v_max_char
            FROM public.match_participants mp
            WHERE mp.user_id = v_player.user_id AND mp.character_name IS NOT NULL
            GROUP BY mp.character_name
            ORDER BY COUNT(*) DESC
            LIMIT 1;

            IF v_max_char IS NOT NULL THEN
                UPDATE public.user_stats SET favorite_character = v_max_char
                WHERE user_id = v_player.user_id;
            END IF;
        END IF;
    END LOOP;

    -- Limpar combates da sala
    DELETE FROM public.combat_notifications
    WHERE room_id = p_room_id;

    -- Encerrar partida na sala
    UPDATE public.rooms SET
        match_status = NULL,
        match_started_at = NULL,
        last_activity = NOW()
    WHERE id = p_room_id;

    -- Resetar jogadores
    UPDATE public.players SET
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

-- Declarar eliminação (com advisory lock para evitar duplicate elimination_order)
CREATE OR REPLACE FUNCTION public.declare_elimination(
    p_player_id UUID,
    p_killer_player_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_player RECORD;
    v_elimination_order INTEGER;
    v_room_lock BIGINT;
BEGIN
    SELECT * INTO v_player
    FROM public.players
    WHERE id = p_player_id
    AND is_connected = true;

    IF v_player IS NULL THEN
        RAISE EXCEPTION 'Jogador não encontrado ou desconectado';
    END IF;

    IF auth.uid() IS NOT NULL AND v_player.user_id IS NOT NULL THEN
        IF v_player.user_id != auth.uid() THEN
            RAISE EXCEPTION 'Você só pode declarar sua própria eliminação';
        END IF;
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

    v_room_lock := hashtext(v_player.room_id::text);
    PERFORM pg_advisory_xact_lock(v_room_lock);

    SELECT COUNT(*) INTO v_elimination_order
    FROM public.players
    WHERE room_id = v_player.room_id
    AND is_alive = false
    AND elimination_order IS NOT NULL;

    v_elimination_order := v_elimination_order + 1;

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

-- Registrar resultado de partida (client-side fallback)
DROP FUNCTION IF EXISTS public.record_match_result(VARCHAR, VARCHAR, TIMESTAMPTZ, UUID, VARCHAR, INTEGER, JSONB);
CREATE OR REPLACE FUNCTION public.record_match_result(
    p_room_id VARCHAR(6),
    p_room_name VARCHAR(100),
    p_started_at TIMESTAMPTZ,
    p_winner_user_id UUID,
    p_winner_player_name VARCHAR(50),
    p_total_players INTEGER,
    p_participants JSONB
) RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_participant JSONB;
    v_user_id UUID;
    v_max_char VARCHAR(100);
BEGIN
    INSERT INTO public.match_history (room_id, room_name, started_at, ended_at, winner_user_id, winner_player_name, total_players)
    VALUES (p_room_id, p_room_name, p_started_at, NOW(), p_winner_user_id, p_winner_player_name, p_total_players)
    RETURNING id INTO v_match_id;

    FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
    LOOP
        INSERT INTO public.match_participants (
            match_id, user_id, player_name, character_name,
            elimination_order, killed_by_user_id, killed_by_player_name,
            survival_points, is_winner
        ) VALUES (
            v_match_id,
            NULLIF(v_participant ->> 'user_id', '')::UUID,
            v_participant ->> 'player_name',
            v_participant ->> 'character_name',
            (v_participant ->> 'elimination_order')::INTEGER,
            NULLIF(v_participant ->> 'killed_by_user_id', '')::UUID,
            v_participant ->> 'killed_by_player_name',
            COALESCE((v_participant ->> 'survival_points')::INTEGER, 0),
            COALESCE((v_participant ->> 'is_winner')::BOOLEAN, false)
        );

        v_user_id := NULLIF(v_participant ->> 'user_id', '')::UUID;
        IF v_user_id IS NOT NULL THEN
            UPDATE public.user_stats SET
                total_matches = total_matches + 1,
                total_wins = total_wins + CASE WHEN (v_participant ->> 'is_winner')::BOOLEAN THEN 1 ELSE 0 END,
                total_eliminations = total_eliminations + COALESCE((v_participant ->> 'eliminations_made')::INTEGER, 0),
                total_survival_points = total_survival_points + COALESCE((v_participant ->> 'survival_points')::INTEGER, 0),
                win_rate = CASE
                    WHEN (total_matches + 1) > 0
                    THEN ((total_wins + CASE WHEN (v_participant ->> 'is_winner')::BOOLEAN THEN 1 ELSE 0 END)::DECIMAL / (total_matches + 1)::DECIMAL) * 100
                    ELSE 0
                END,
                composite_score = calculate_composite_score(
                    total_wins + CASE WHEN (v_participant ->> 'is_winner')::BOOLEAN THEN 1 ELSE 0 END,
                    total_eliminations + COALESCE((v_participant ->> 'eliminations_made')::INTEGER, 0),
                    total_survival_points + COALESCE((v_participant ->> 'survival_points')::INTEGER, 0),
                    total_matches + 1
                ),
                updated_at = NOW()
            WHERE user_id = v_user_id;

            SELECT COALESCE(
                (SELECT mp.character_name
                 FROM public.match_participants mp
                 WHERE mp.user_id = v_user_id AND mp.character_name IS NOT NULL
                 GROUP BY mp.character_name
                 ORDER BY COUNT(*) DESC
                 LIMIT 1),
                v_participant ->> 'character_name'
            ) INTO v_max_char;

            IF v_max_char IS NOT NULL THEN
                UPDATE public.user_stats SET favorite_character = v_max_char WHERE user_id = v_user_id;
            END IF;
        END IF;
    END LOOP;

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 5: ATOMIC COMBAT FUNCTIONS
-- ================================

-- Adicionar ataque de oportunidade (atomic, com lock)
CREATE OR REPLACE FUNCTION public.add_opportunity_attack(
    p_combat_id UUID,
    p_player_id UUID,
    p_player_name TEXT,
    p_weapon JSONB,
    p_target TEXT  -- 'attacker' or 'defender'
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_round_data JSONB;
    v_new_round JSONB;
    v_opp_used JSONB;
BEGIN
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

-- Atualizar roll de uma rodada específica (atomic, com lock)
CREATE OR REPLACE FUNCTION public.update_combat_roll(
    p_combat_id UUID,
    p_round_index INTEGER,      -- 0-based index
    p_is_attacker BOOLEAN,      -- true = attacker side, false = defender side
    p_roll JSONB,               -- array of dice values e.g. [3, 5, 2]
    p_total INTEGER
) RETURNS JSON AS $$
DECLARE
    v_combat RECORD;
    v_round JSONB;
    v_side TEXT;
    v_round_data JSONB;
BEGIN
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
    v_side := CASE WHEN p_is_attacker THEN 'attacker' ELSE 'defender' END;

    IF (v_round->v_side->>'rolled')::boolean = true THEN
        RETURN json_build_object('success', false, 'error', 'Já rolou nesta rodada');
    END IF;

    v_round := jsonb_set(v_round, ARRAY[v_side],
        jsonb_build_object('rolled', true, 'roll', p_roll, 'total', p_total)
    );

    IF (v_round->'attacker'->>'rolled')::boolean = true AND (v_round->'defender'->>'rolled')::boolean = true THEN
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

-- ================================
-- SEÇÃO 6: ADMIN HELPER
-- ================================

-- Registrar ação no audit log
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
-- SEÇÃO 7: ADMIN — USER MANAGEMENT
-- ================================

-- Banir usuário
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

-- Desbanir usuário
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

-- Resetar estatísticas de usuário
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

-- Atualizar stats de usuário (edição manual)
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

-- Atualizar perfil de usuário (nome de exibição)
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

-- Kick jogador de sala
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

-- Forçar fim de partida
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

    UPDATE public.rooms
    SET match_status = NULL
    WHERE id = p_room_id;

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

-- Deletar sala
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

-- ================================
-- SEÇÃO 9: ADMIN — MATCH CRUD
-- ================================

-- Deletar partida do histórico
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

    DELETE FROM public.match_history WHERE id = p_match_id;

    PERFORM public._admin_log('delete_match', NULL, NULL,
        jsonb_build_object('match_id', p_match_id, 'room_name', v_room_name));

    RETURN json_build_object('success', true, 'room_name', v_room_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar partida manualmente (com suporte a adicionar participante em partida existente)
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.admin_create_match(UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER, UUID);
CREATE OR REPLACE FUNCTION public.admin_create_match(
    p_user_id UUID,
    p_room_name TEXT DEFAULT 'Partida Manual',
    p_character_name TEXT DEFAULT NULL,
    p_is_winner BOOLEAN DEFAULT false,
    p_elimination_order INTEGER DEFAULT NULL,
    p_survival_points INTEGER DEFAULT 0,
    p_killed_by TEXT DEFAULT NULL,
    p_total_players INTEGER DEFAULT 2,
    p_ended_at TIMESTAMPTZ DEFAULT NOW(),
    p_eliminations INTEGER DEFAULT 0,
    p_match_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_match_id UUID;
    v_display_name TEXT;
    v_is_new_match BOOLEAN := false;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado';
    END IF;

    -- Se p_match_id fornecido, adicionar participante à partida existente
    IF p_match_id IS NOT NULL THEN
        -- Validar que a partida existe
        IF NOT EXISTS (SELECT 1 FROM public.match_history WHERE id = p_match_id) THEN
            RAISE EXCEPTION 'Partida não encontrada: %', p_match_id;
        END IF;

        -- Verificar se o jogador já está nessa partida
        IF EXISTS (
            SELECT 1 FROM public.match_participants
            WHERE match_id = p_match_id AND user_id = p_user_id
        ) THEN
            RAISE EXCEPTION 'Jogador já é participante desta partida';
        END IF;

        v_match_id := p_match_id;

        -- Atualizar dados da partida existente se necessário
        UPDATE public.match_history SET
            total_players = GREATEST(total_players, p_total_players),
            winner_user_id = CASE WHEN p_is_winner THEN p_user_id ELSE winner_user_id END,
            winner_player_name = CASE WHEN p_is_winner THEN v_display_name ELSE winner_player_name END
        WHERE id = v_match_id;
    ELSE
        -- Criar nova partida
        v_is_new_match := true;
        INSERT INTO public.match_history (room_name, ended_at, winner_user_id, winner_player_name, total_players)
        VALUES (
            p_room_name,
            p_ended_at,
            CASE WHEN p_is_winner THEN p_user_id ELSE NULL END,
            CASE WHEN p_is_winner THEN v_display_name ELSE NULL END,
            p_total_players
        )
        RETURNING id INTO v_match_id;
    END IF;

    INSERT INTO public.match_participants (
        match_id, user_id, player_name, character_name,
        elimination_order, survival_points, is_winner, killed_by_player_name,
        eliminations_made
    )
    VALUES (
        v_match_id, p_user_id, v_display_name, p_character_name,
        p_elimination_order, p_survival_points, p_is_winner, NULLIF(p_killed_by, ''),
        COALESCE(p_eliminations, 0)
    );

    -- Recalcular stats do jogador a partir de todas as match_participants
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
        composite_score = calculate_composite_score(sub.total_wins, sub.total_eliminations, sub.total_survival_points, sub.total_matches),
        favorite_character = sub.fav_char,
        updated_at = NOW()
    FROM (
        SELECT
            COUNT(*)::INTEGER AS total_matches,
            COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS total_wins,
            COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
            COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS total_survival_points,
            (
                SELECT mp2.character_name FROM public.match_participants mp2
                WHERE mp2.user_id = p_user_id AND mp2.character_name IS NOT NULL
                GROUP BY mp2.character_name ORDER BY COUNT(*) DESC LIMIT 1
            ) AS fav_char
        FROM public.match_participants mp
        WHERE mp.user_id = p_user_id
    ) sub
    WHERE us.user_id = p_user_id;

    PERFORM public._admin_log('create_match', p_user_id, NULL,
        jsonb_build_object('match_id', v_match_id, 'room_name', p_room_name, 'display_name', v_display_name));

    RETURN json_build_object('success', true, 'match_id', v_match_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Merge de partidas duplicadas em uma só
-- Recebe array de match_history IDs e consolida tudo no primeiro que tiver vencedor (ou o primeiro da lista)
CREATE OR REPLACE FUNCTION public.admin_merge_matches(
    p_match_ids UUID[]
) RETURNS JSON AS $$
DECLARE
    v_primary_id UUID;
    v_secondary_id UUID;
    v_winner_user_id UUID;
    v_winner_player_name TEXT;
    v_max_total INTEGER;
    v_affected_users UUID[];
    v_user_id UUID;
    v_merged_count INTEGER := 0;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    IF array_length(p_match_ids, 1) < 2 THEN
        RAISE EXCEPTION 'Precisa de pelo menos 2 partidas para fazer merge';
    END IF;

    -- Validar que todas as partidas existem
    IF (SELECT COUNT(*) FROM public.match_history WHERE id = ANY(p_match_ids))
        != array_length(p_match_ids, 1) THEN
        RAISE EXCEPTION 'Uma ou mais partidas não encontradas';
    END IF;

    -- Escolher a partida primária: preferir a que tem vencedor, senão a primeira
    SELECT id INTO v_primary_id
    FROM public.match_history
    WHERE id = ANY(p_match_ids) AND winner_user_id IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 1;

    IF v_primary_id IS NULL THEN
        v_primary_id := p_match_ids[1];
    END IF;

    -- Coletar info do vencedor (de qualquer uma das partidas)
    SELECT winner_user_id, winner_player_name
    INTO v_winner_user_id, v_winner_player_name
    FROM public.match_history
    WHERE id = ANY(p_match_ids) AND winner_user_id IS NOT NULL
    LIMIT 1;

    -- Coletar todos os user_ids afetados (para recalcular stats depois)
    SELECT ARRAY(
        SELECT DISTINCT mp.user_id
        FROM public.match_participants mp
        WHERE mp.match_id = ANY(p_match_ids)
        AND mp.user_id IS NOT NULL
    ) INTO v_affected_users;

    -- Mover todos os participantes das partidas secundárias para a primária
    -- Evitar duplicatas (mesmo user_id na mesma partida)
    FOR v_secondary_id IN
        SELECT unnest(p_match_ids) EXCEPT SELECT v_primary_id
    LOOP
        -- Mover participantes que não existem na primária
        UPDATE public.match_participants
        SET match_id = v_primary_id
        WHERE match_id = v_secondary_id
        AND NOT EXISTS (
            SELECT 1 FROM public.match_participants existing
            WHERE existing.match_id = v_primary_id
            AND existing.user_id = public.match_participants.user_id
            AND existing.user_id IS NOT NULL
        );

        -- Deletar participantes duplicados que ficaram para trás
        DELETE FROM public.match_participants
        WHERE match_id = v_secondary_id;

        -- Deletar a partida secundária
        DELETE FROM public.match_history
        WHERE id = v_secondary_id;

        v_merged_count := v_merged_count + 1;
    END LOOP;

    -- Obter o maior total_players entre os participantes reais
    SELECT GREATEST(
        (SELECT COUNT(*) FROM public.match_participants WHERE match_id = v_primary_id),
        (SELECT total_players FROM public.match_history WHERE id = v_primary_id)
    ) INTO v_max_total;

    -- Atualizar a partida primária com dados consolidados
    UPDATE public.match_history SET
        winner_user_id = COALESCE(v_winner_user_id, winner_user_id),
        winner_player_name = COALESCE(v_winner_player_name, winner_player_name),
        total_players = v_max_total
    WHERE id = v_primary_id;

    -- Recalcular stats de todos os jogadores afetados
    FOREACH v_user_id IN ARRAY v_affected_users
    LOOP
        UPDATE public.user_stats us SET
            total_matches = sub.total_matches,
            total_wins = sub.total_wins,
            total_eliminations = sub.total_eliminations,
            total_survival_points = sub.total_survival_points,
            win_rate = CASE WHEN sub.total_matches > 0
                THEN ROUND((sub.total_wins::DECIMAL / sub.total_matches) * 100, 2)
                ELSE 0 END,
            composite_score = calculate_composite_score(sub.total_wins, sub.total_eliminations, sub.total_survival_points, sub.total_matches),
            favorite_character = sub.fav_char,
            updated_at = NOW()
        FROM (
            SELECT
                COUNT(*)::INTEGER AS total_matches,
                COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS total_wins,
                COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
                COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS total_survival_points,
                (
                    SELECT mp2.character_name FROM public.match_participants mp2
                    WHERE mp2.user_id = v_user_id AND mp2.character_name IS NOT NULL
                    GROUP BY mp2.character_name ORDER BY COUNT(*) DESC LIMIT 1
                ) AS fav_char
            FROM public.match_participants mp
            WHERE mp.user_id = v_user_id
        ) sub
        WHERE us.user_id = v_user_id;
    END LOOP;

    PERFORM public._admin_log('merge_matches', NULL, NULL,
        jsonb_build_object(
            'primary_match_id', v_primary_id,
            'merged_count', v_merged_count,
            'match_ids', p_match_ids::TEXT,
            'affected_users', v_affected_users::TEXT
        ));

    RETURN json_build_object(
        'success', true,
        'primary_match_id', v_primary_id,
        'merged_count', v_merged_count,
        'affected_users', array_length(v_affected_users, 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-merge: detecta partidas duplicadas e consolida automaticamente
-- Critério: mesmo room_name + mesmo ended_at = mesma partida
-- Escolhe como primária a que tem mais informações preenchidas (winner, room_id, started_at, etc.)
-- Modo dry_run=true apenas retorna o que seria feito sem executar
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
    v_user_id UUID;
    v_groups_merged INTEGER := 0;
    v_total_removed INTEGER := 0;
    v_preview JSONB := '[]'::JSONB;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    -- Encontrar grupos de partidas duplicadas (mesmo room_name + ended_at)
    FOR v_group IN
        SELECT
            mh.room_name,
            mh.ended_at,
            COUNT(*) AS match_count,
            ARRAY_AGG(mh.id ORDER BY
                -- Pontuar: quanto mais campos preenchidos, maior a prioridade
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
        -- Primário = primeiro do array (mais completo pela ordenação)
        v_primary_id := v_group.match_ids[1];

        IF p_dry_run THEN
            -- Apenas montar preview
            v_preview := v_preview || jsonb_build_object(
                'room_name', v_group.room_name,
                'ended_at', v_group.ended_at,
                'duplicates', v_group.match_count,
                'primary_id', v_primary_id,
                'will_remove', v_group.match_count - 1,
                'all_ids', ARRAY_TO_JSON(v_group.match_ids)
            );
        ELSE
            -- Coletar melhor winner, room_id, started_at de qualquer uma do grupo
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

            -- Coletar users afetados
            v_affected_users := v_affected_users || ARRAY(
                SELECT DISTINCT mp.user_id
                FROM public.match_participants mp
                WHERE mp.match_id = ANY(v_group.match_ids)
                AND mp.user_id IS NOT NULL
            );

            -- Mover participantes das secundárias para a primária
            FOR v_secondary_id IN
                SELECT unnest(v_group.match_ids[2:])
            LOOP
                -- Mover participantes que não existem na primária
                UPDATE public.match_participants
                SET match_id = v_primary_id
                WHERE match_id = v_secondary_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.match_participants existing
                    WHERE existing.match_id = v_primary_id
                    AND existing.user_id = public.match_participants.user_id
                    AND existing.user_id IS NOT NULL
                );

                -- Deletar participantes que eram duplicatas
                DELETE FROM public.match_participants
                WHERE match_id = v_secondary_id;

                -- Deletar a partida secundária
                DELETE FROM public.match_history
                WHERE id = v_secondary_id;

                v_total_removed := v_total_removed + 1;
            END LOOP;

            -- Consolidar a primária com os melhores dados
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

    -- Se executou de verdade, recalcular stats dos afetados
    IF NOT p_dry_run AND array_length(v_affected_users, 1) > 0 THEN
        -- Deduplica a lista de users
        v_affected_users := ARRAY(SELECT DISTINCT unnest(v_affected_users));

        FOREACH v_user_id IN ARRAY v_affected_users
        LOOP
            UPDATE public.user_stats us SET
                total_matches = sub.total_matches,
                total_wins = sub.total_wins,
                total_eliminations = sub.total_eliminations,
                total_survival_points = sub.total_survival_points,
                win_rate = CASE WHEN sub.total_matches > 0
                    THEN ROUND((sub.total_wins::DECIMAL / sub.total_matches) * 100, 2)
                    ELSE 0 END,
                composite_score = calculate_composite_score(sub.total_wins, sub.total_eliminations, sub.total_survival_points, sub.total_matches),
                favorite_character = sub.fav_char,
                updated_at = NOW()
            FROM (
                SELECT
                    COUNT(*)::INTEGER AS total_matches,
                    COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS total_wins,
                    COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
                    COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS total_survival_points,
                    (
                        SELECT mp2.character_name FROM public.match_participants mp2
                        WHERE mp2.user_id = v_user_id AND mp2.character_name IS NOT NULL
                        GROUP BY mp2.character_name ORDER BY COUNT(*) DESC LIMIT 1
                    ) AS fav_char
                FROM public.match_participants mp
                WHERE mp.user_id = v_user_id
            ) sub
            WHERE us.user_id = v_user_id;
        END LOOP;

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

-- Atualizar participação em partida
DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.admin_update_match_participant(UUID, UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, TIMESTAMPTZ, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_update_match_participant(
    p_match_id UUID,
    p_user_id UUID,
    p_room_name TEXT DEFAULT NULL,
    p_character_name TEXT DEFAULT NULL,
    p_is_winner BOOLEAN DEFAULT NULL,
    p_elimination_order INTEGER DEFAULT NULL,
    p_survival_points INTEGER DEFAULT NULL,
    p_killed_by TEXT DEFAULT NULL,
    p_total_players INTEGER DEFAULT NULL,
    p_ended_at TIMESTAMPTZ DEFAULT NULL,
    p_eliminations INTEGER DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_participant_id UUID;
    v_display_name TEXT;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    SELECT mp.id INTO v_participant_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id;

    IF v_participant_id IS NULL THEN
        RAISE EXCEPTION 'Participação não encontrada';
    END IF;

    SELECT display_name INTO v_display_name
    FROM public.user_profiles WHERE id = p_user_id;

    UPDATE public.match_history
    SET room_name = COALESCE(p_room_name, room_name),
        total_players = COALESCE(p_total_players, total_players),
        ended_at = COALESCE(p_ended_at, ended_at),
        winner_user_id = CASE
            WHEN p_is_winner = true THEN p_user_id
            WHEN p_is_winner = false AND winner_user_id = p_user_id THEN NULL
            ELSE winner_user_id
        END,
        winner_player_name = CASE
            WHEN p_is_winner = true THEN v_display_name
            WHEN p_is_winner = false AND winner_user_id = p_user_id THEN NULL
            ELSE winner_player_name
        END
    WHERE id = p_match_id;

    UPDATE public.match_participants
    SET character_name = COALESCE(p_character_name, character_name),
        elimination_order = p_elimination_order,
        survival_points = COALESCE(p_survival_points, survival_points),
        is_winner = COALESCE(p_is_winner, is_winner),
        killed_by_player_name = CASE
            WHEN p_killed_by IS NOT NULL THEN NULLIF(p_killed_by, '')
            ELSE killed_by_player_name
        END,
        eliminations_made = COALESCE(p_eliminations, eliminations_made)
    WHERE id = v_participant_id;

    -- Recalcular stats do jogador a partir de todas as match_participants
    UPDATE public.user_stats us SET
        total_matches = sub.total_matches,
        total_wins = sub.total_wins,
        total_eliminations = sub.total_eliminations,
        total_survival_points = sub.total_survival_points,
        win_rate = CASE WHEN sub.total_matches > 0
            THEN ROUND((sub.total_wins::DECIMAL / sub.total_matches) * 100, 2)
            ELSE 0 END,
        composite_score = calculate_composite_score(sub.total_wins, sub.total_eliminations, sub.total_survival_points, sub.total_matches),
        favorite_character = sub.fav_char,
        updated_at = NOW()
    FROM (
        SELECT
            COUNT(*)::INTEGER AS total_matches,
            COUNT(*) FILTER (WHERE mp.is_winner = true)::INTEGER AS total_wins,
            COALESCE(SUM(COALESCE(mp.eliminations_made, 0)), 0)::INTEGER AS total_eliminations,
            COALESCE(SUM(COALESCE(mp.survival_points, 0)), 0)::INTEGER AS total_survival_points,
            (
                SELECT mp2.character_name FROM public.match_participants mp2
                WHERE mp2.user_id = p_user_id AND mp2.character_name IS NOT NULL
                GROUP BY mp2.character_name ORDER BY COUNT(*) DESC LIMIT 1
            ) AS fav_char
        FROM public.match_participants mp
        WHERE mp.user_id = p_user_id
    ) sub
    WHERE us.user_id = p_user_id;

    PERFORM public._admin_log('update_match', p_user_id, NULL,
        jsonb_build_object('match_id', p_match_id, 'display_name', v_display_name));

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- SEÇÃO 10: ADMIN — DASHBOARD & QUERIES
-- ================================

-- Listar salas
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

-- Listar usuários
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

    SELECT COUNT(*) INTO v_total
    FROM public.user_profiles up
    WHERE (p_search IS NULL OR up.display_name ILIKE '%' || p_search || '%')
      AND (NOT p_banned_only OR up.banned_at IS NOT NULL);

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

-- Histórico de partidas (admin view)
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

-- Dashboard admin
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

-- Audit log
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

-- Detalhes de usuário
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

-- Detalhe de sala
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

-- Atualizar configuração (admin only)
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
-- SEÇÃO 10B: AUTO-ENCERRAMENTO DE PARTIDAS INATIVAS
-- ================================

-- Encerra automaticamente partidas in_progress sem atividade por mais de 2 horas.
-- Registra histórico completo (match_history, match_participants, user_stats).
-- O último jogador vivo é considerado vencedor. Se nenhum vivo, sem vencedor.
-- Deve ser chamada via pg_cron: SELECT cron.schedule('auto-end-stale', '*/10 * * * *', 'SELECT public.auto_end_stale_matches()');
CREATE OR REPLACE FUNCTION public.auto_end_stale_matches()
RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_match_id UUID;
    v_total INTEGER;
    v_winner RECORD;
    v_player RECORD;
    v_is_winner BOOLEAN;
    v_survival_points INTEGER;
    v_eliminations_made INTEGER;
    v_max_char VARCHAR(100);
    v_ended_count INTEGER := 0;
BEGIN
    FOR v_room IN
        SELECT r.*
        FROM public.rooms r
        WHERE r.match_status = 'in_progress'
        AND r.last_activity < NOW() - INTERVAL '2 hours'
    LOOP
        -- Contar participantes
        SELECT COUNT(*) INTO v_total
        FROM public.players
        WHERE room_id = v_room.id
        AND is_connected = true
        AND (status = 'ready' OR elimination_order IS NOT NULL);

        -- Se nenhum participante, apenas resetar a sala
        IF v_total = 0 THEN
            UPDATE public.rooms SET
                match_status = NULL,
                match_started_at = NULL,
                last_activity = NOW()
            WHERE id = v_room.id;

            v_ended_count := v_ended_count + 1;
            CONTINUE;
        END IF;

        -- Determinar vencedor: último jogador vivo (pode não existir se todos desconectaram)
        SELECT p.id, p.name, p.user_id, p.character_name
        INTO v_winner
        FROM public.players p
        WHERE p.room_id = v_room.id
        AND p.is_connected = true
        AND p.is_alive = true
        ORDER BY p.last_activity DESC
        LIMIT 1;

        -- Inserir match_history
        INSERT INTO public.match_history (
            room_id, room_name, started_at, ended_at,
            winner_user_id, winner_player_name, total_players
        ) VALUES (
            v_room.id,
            v_room.name,
            COALESCE(v_room.match_started_at, v_room.created_at),
            NOW(),
            v_winner.user_id,
            v_winner.name,
            v_total
        ) RETURNING id INTO v_match_id;

        -- Inserir participantes e atualizar stats
        FOR v_player IN
            SELECT p.*
            FROM public.players p
            WHERE p.room_id = v_room.id
            AND p.is_connected = true
            AND (p.status = 'ready' OR p.elimination_order IS NOT NULL)
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
            AND killed_by_player_id = v_player.id;

            INSERT INTO public.match_participants (
                match_id, user_id, player_name, character_name,
                elimination_order, killed_by_user_id, killed_by_player_name,
                survival_points, eliminations_made, is_winner
            ) VALUES (
                v_match_id,
                v_player.user_id,
                v_player.name,
                v_player.character_name,
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

            -- Atualizar user_stats se o participante tem conta
            IF v_player.user_id IS NOT NULL THEN
                INSERT INTO public.user_stats (user_id, updated_at)
                VALUES (v_player.user_id, NOW())
                ON CONFLICT (user_id) DO NOTHING;

                UPDATE public.user_stats SET
                    total_matches = total_matches + 1,
                    total_wins = total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
                    total_eliminations = total_eliminations + v_eliminations_made,
                    total_survival_points = total_survival_points + v_survival_points,
                    win_rate = CASE
                        WHEN (total_matches + 1) > 0
                        THEN ((total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END)::DECIMAL / (total_matches + 1)::DECIMAL) * 100
                        ELSE 0
                    END,
                    composite_score = calculate_composite_score(
                        total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
                        total_eliminations + v_eliminations_made,
                        total_survival_points + v_survival_points,
                        total_matches + 1
                    ),
                    updated_at = NOW()
                WHERE user_id = v_player.user_id;

                -- Atualizar personagem favorito
                SELECT mp.character_name INTO v_max_char
                FROM public.match_participants mp
                WHERE mp.user_id = v_player.user_id AND mp.character_name IS NOT NULL
                GROUP BY mp.character_name
                ORDER BY COUNT(*) DESC
                LIMIT 1;

                IF v_max_char IS NOT NULL THEN
                    UPDATE public.user_stats SET favorite_character = v_max_char
                    WHERE user_id = v_player.user_id;
                END IF;
            END IF;
        END LOOP;

        -- Limpar combates da sala
        DELETE FROM public.combat_notifications
        WHERE room_id = v_room.id;

        -- Encerrar partida na sala
        UPDATE public.rooms SET
            match_status = NULL,
            match_started_at = NULL,
            last_activity = NOW()
        WHERE id = v_room.id;

        -- Resetar jogadores
        UPDATE public.players SET
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

-- ================================
-- SEÇÃO 11: GRANTS
-- ================================

-- Match lifecycle
GRANT EXECUTE ON FUNCTION public.start_match(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_match(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.end_match(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_match(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.declare_elimination(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_elimination(UUID, UUID) TO anon;

-- Combat atomic operations
GRANT EXECUTE ON FUNCTION public.add_opportunity_attack(UUID, UUID, TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.add_opportunity_attack(UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_combat_roll(UUID, INTEGER, BOOLEAN, JSONB, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.update_combat_roll(UUID, INTEGER, BOOLEAN, JSONB, INTEGER) TO authenticated;

-- Admin functions
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
GRANT EXECUTE ON FUNCTION public.admin_create_match TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_matches TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_auto_merge_matches(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_match_participant TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_setting TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_setting TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;

-- Auto-end (chamada via pg_cron, mas precisa de grant para o role que o cron usa)
GRANT EXECUTE ON FUNCTION public.auto_end_stale_matches() TO authenticated;

SELECT 'TODAS AS FUNÇÕES INSTALADAS!' as status;

-- ================================
-- MIGRAÇÃO: Adicionar coluna eliminations_made em match_participants
-- Execute esta query UMA VEZ no SQL Editor do Supabase
-- ================================
-- ALTER TABLE public.match_participants
--     ADD COLUMN IF NOT EXISTS eliminations_made INTEGER DEFAULT 0;

-- ================================
-- MIGRAÇÃO: Recalcular composite_score de todos os jogadores
-- Execute esta query UMA VEZ após atualizar calculate_composite_score
-- ================================
-- UPDATE public.user_stats SET
--     composite_score = calculate_composite_score(total_wins, total_eliminations, total_survival_points, total_matches),
--     updated_at = NOW()
-- WHERE total_matches > 0;

-- ================================
-- CRON: Agendar auto-encerramento de partidas inativas (2h)
-- Execute UMA VEZ no SQL Editor do Supabase (requer extensão pg_cron habilitada)
-- ================================
-- SELECT cron.schedule(
--     'auto-end-stale-matches',
--     '*/10 * * * *',
--     $$SELECT public.auto_end_stale_matches()$$
-- );
