-- ============================================================
-- Migration: Server-side match lifecycle functions
-- Resolves: match stuck in 'in_progress', ranking not updating,
--           admin showing empty player data
-- Root cause: RLS policies block client-side multi-row updates
-- ============================================================

-- ============================================================
-- 1. start_match(p_room_id) — SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_match(
    p_room_id VARCHAR(6)
) RETURNS JSON AS $$
DECLARE
    v_room RECORD;
    v_ready_count INTEGER;
BEGIN
    -- Verificar que o chamador é jogador conectado na sala
    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id
        AND user_id = auth.uid()
        AND is_connected = true
    ) THEN
        RAISE EXCEPTION 'Apenas jogadores conectados na sala podem iniciar a partida';
    END IF;

    -- Buscar sala
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    -- Verificar que não há partida ativa
    IF v_room.match_status IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe uma partida ativa nesta sala';
    END IF;

    -- Contar jogadores prontos e conectados
    SELECT COUNT(*) INTO v_ready_count
    FROM public.players
    WHERE room_id = p_room_id
    AND status = 'ready'
    AND is_connected = true;

    IF v_ready_count < 2 THEN
        RAISE EXCEPTION 'Necessários ao menos 2 jogadores prontos para iniciar';
    END IF;

    -- Iniciar partida: atualizar sala
    UPDATE public.rooms SET
        match_status = 'in_progress',
        match_started_at = NOW(),
        last_activity = NOW()
    WHERE id = p_room_id;

    -- Resetar jogadores prontos e conectados
    UPDATE public.players SET
        is_alive = true,
        killed_by_player_id = NULL,
        elimination_order = NULL,
        last_activity = NOW()
    WHERE room_id = p_room_id
    AND status = 'ready'
    AND is_connected = true;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. end_match(p_room_id) — SECURITY DEFINER
--    Registers stats + resets match atomically
-- ============================================================
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
    IF NOT EXISTS (
        SELECT 1 FROM public.players
        WHERE room_id = p_room_id
        AND user_id = auth.uid()
        AND is_connected = true
    ) THEN
        RAISE EXCEPTION 'Apenas jogadores conectados na sala podem encerrar a partida';
    END IF;

    -- Buscar sala
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    -- Verificar que há partida ativa
    IF v_room.match_status != 'in_progress' THEN
        RAISE EXCEPTION 'Não há partida ativa nesta sala';
    END IF;

    -- Contar total de jogadores participantes (conectados e prontos)
    SELECT COUNT(*) INTO v_total
    FROM public.players
    WHERE room_id = p_room_id
    AND is_connected = true
    AND status = 'ready';

    -- Determinar vencedor: último jogador vivo
    SELECT p.id, p.name, p.user_id, p.character_name
    INTO v_winner
    FROM public.players p
    WHERE p.room_id = p_room_id
    AND p.is_connected = true
    AND p.status = 'ready'
    AND p.is_alive = true
    ORDER BY p.last_activity DESC
    LIMIT 1;

    -- ====== REGISTRAR RESULTADO DA PARTIDA ======

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
    FOR v_player IN
        SELECT p.*
        FROM public.players p
        WHERE p.room_id = p_room_id
        AND p.is_connected = true
        AND p.status = 'ready'
    LOOP
        v_is_winner := (v_player.id = v_winner.id);

        -- Survival points calculados server-side
        IF v_is_winner THEN
            v_survival_points := GREATEST(v_total - 1, 0);
        ELSE
            v_survival_points := COALESCE(v_player.elimination_order - 1, 0);
        END IF;

        -- Contar eliminações feitas por este jogador
        SELECT COUNT(*) INTO v_eliminations_made
        FROM public.players
        WHERE room_id = p_room_id
        AND killed_by_player_id = v_player.id;

        -- Inserir participante
        INSERT INTO public.match_participants (
            match_id, user_id, player_name, character_name,
            elimination_order, killed_by_user_id, killed_by_player_name,
            survival_points, is_winner
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
            v_is_winner
        );

        -- Atualizar user_stats se o participante tem conta
        IF v_player.user_id IS NOT NULL THEN
            -- Garantir que user_stats existe (INSERT ON CONFLICT para segurança)
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

    -- ====== RESETAR ESTADO DA PARTIDA ======

    -- Encerrar partida na sala
    UPDATE public.rooms SET
        match_status = NULL,
        match_started_at = NULL,
        last_activity = NOW()
    WHERE id = p_room_id;

    -- Resetar TODOS os jogadores da sala
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

-- ============================================================
-- 3. Grant execute permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.start_match(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_match(VARCHAR) TO authenticated;
