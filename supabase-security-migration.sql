-- ================================================================
-- MIGRAÇÃO DE SEGURANÇA — Execute no SQL Editor do Supabase
-- ================================================================
-- Este arquivo troca as políticas "USING (true)" por políticas
-- restritivas baseadas em auth.uid().  Antes de rodar:
--   1. Certifique-se de que todos os jogadores já logam via Supabase Auth
--      (ou usam signInAnonymously).
--   2. Faça backup do banco se necessário.
-- ================================================================

-- ================================
-- 0. TABELA DE ADMINISTRADORES
-- ================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver a tabela de admins
DROP POLICY IF EXISTS "Only admins can read admin_users" ON public.admin_users;
CREATE POLICY "Only admins can read admin_users" ON public.admin_users
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM public.admin_users WHERE is_active = true)
    );

-- Função auxiliar: verificar se o usuário atual é admin
CREATE OR REPLACE FUNCTION public.is_user_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = COALESCE(p_user_id, auth.uid())
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON TABLE public.admin_users IS 'Tabela de administradores do sistema';
COMMENT ON FUNCTION public.is_user_admin IS 'Verifica se o usuário é administrador ativo';

-- ================================
-- 1. POLÍTICAS RLS — ROOMS
-- ================================

-- Remover políticas antigas permissivas
DROP POLICY IF EXISTS "Allow public read access on rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow public insert access on rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow public update access on rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow public delete access on rooms" ON public.rooms;

-- SELECT: qualquer pessoa pode ver salas ativas (necessário para o lobby)
CREATE POLICY "rooms_select_active" ON public.rooms
    FOR SELECT USING (true);

-- INSERT: apenas usuários autenticados podem criar salas
CREATE POLICY "rooms_insert_authenticated" ON public.rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: apenas o mestre da sala pode atualizar (verificado via player.user_id)
-- OU admins (para limpeza)
CREATE POLICY "rooms_update_master_or_admin" ON public.rooms
    FOR UPDATE USING (
        -- O mestre da sala: existe um player nesta sala cujo user_id = auth.uid()
        -- e cujo id = master_player_id
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = public.rooms.master_player_id
            AND p.user_id = auth.uid()
        )
        OR public.is_user_admin()
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = public.rooms.master_player_id
            AND p.user_id = auth.uid()
        )
        OR public.is_user_admin()
    );

-- DELETE: ninguém deleta salas diretamente (cleanup via SECURITY DEFINER functions)
CREATE POLICY "rooms_delete_admin_only" ON public.rooms
    FOR DELETE USING (public.is_user_admin());

-- ================================
-- 2. POLÍTICAS RLS — PLAYERS
-- ================================

DROP POLICY IF EXISTS "Allow public read access on players" ON public.players;
DROP POLICY IF EXISTS "Allow public insert access on players" ON public.players;
DROP POLICY IF EXISTS "Allow public update access on players" ON public.players;
DROP POLICY IF EXISTS "Allow public delete access on players" ON public.players;

-- SELECT: qualquer pessoa autenticada pode ver jogadores (necessário para realtime)
CREATE POLICY "players_select_authenticated" ON public.players
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: autenticados podem criar jogador, forçando user_id = auth.uid()
CREATE POLICY "players_insert_own" ON public.players
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (user_id IS NULL OR user_id = auth.uid())
    );

-- UPDATE: apenas o próprio jogador pode atualizar seus dados
CREATE POLICY "players_update_own" ON public.players
    FOR UPDATE USING (
        user_id = auth.uid()
    ) WITH CHECK (
        user_id = auth.uid()
    );

-- DELETE: apenas o próprio jogador pode se remover (sair da sala)
CREATE POLICY "players_delete_own" ON public.players
    FOR DELETE USING (
        user_id = auth.uid()
    );

-- ================================
-- 3. FUNÇÃO SECURITY DEFINER PARA KICKS DO MESTRE
-- ================================
-- O mestre precisa poder atualizar/remover outros jogadores (kick),
-- mas RLS não permite. Usamos uma função SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.master_kick_player(
    p_room_id VARCHAR(6),
    p_player_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_master_player_id UUID;
    v_master_user_id UUID;
BEGIN
    -- Verificar se quem está chamando é o mestre da sala
    SELECT r.master_player_id INTO v_master_player_id
    FROM public.rooms r
    WHERE r.id = p_room_id;

    IF v_master_player_id IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada';
    END IF;

    SELECT p.user_id INTO v_master_user_id
    FROM public.players p
    WHERE p.id = v_master_player_id;

    IF v_master_user_id IS NULL OR v_master_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Apenas o mestre da sala pode expulsar jogadores';
    END IF;

    -- Expulsar o jogador (soft-delete)
    DELETE FROM public.players WHERE id = p_player_id AND room_id = p_room_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.master_kick_player IS 'Permite ao mestre da sala expulsar um jogador (SECURITY DEFINER)';

-- ================================
-- 4. POLÍTICAS RLS — COMBAT_NOTIFICATIONS
-- ================================

DROP POLICY IF EXISTS "Players can view combat notifications in their room" ON public.combat_notifications;
DROP POLICY IF EXISTS "Players can create combat notifications" ON public.combat_notifications;
DROP POLICY IF EXISTS "Players can update their combat notifications" ON public.combat_notifications;
DROP POLICY IF EXISTS "Players can delete their combat notifications" ON public.combat_notifications;

-- SELECT: jogadores autenticados podem ver combates
CREATE POLICY "combat_select_authenticated" ON public.combat_notifications
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: autenticados podem criar combates (atacante deve ser um player do auth.uid())
CREATE POLICY "combat_insert_own_attack" ON public.combat_notifications
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = combat_notifications.attacker_id
            AND p.user_id = auth.uid()
        )
    );

-- UPDATE: apenas combatentes envolvidos (atacante ou defensor pertence ao auth.uid())
CREATE POLICY "combat_update_combatants" ON public.combat_notifications
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE (p.id = combat_notifications.attacker_id OR p.id = combat_notifications.defender_id)
            AND p.user_id = auth.uid()
        )
    );

-- DELETE: ninguém deleta combates diretamente
CREATE POLICY "combat_delete_deny" ON public.combat_notifications
    FOR DELETE USING (false);

-- ================================
-- 5. POLÍTICAS RLS — USER_STATS (blindar contra escrita direta)
-- ================================

-- Remover política permissiva de UPDATE
DROP POLICY IF EXISTS "System can update user_stats" ON public.user_stats;

-- user_stats só pode ser atualizado via record_match_result (SECURITY DEFINER)
-- Nenhuma política de UPDATE = nenhum cliente pode atualizar diretamente
-- (as funções SECURITY DEFINER bypassam RLS)

-- ================================
-- 6. POLÍTICAS RLS — MATCH_HISTORY e MATCH_PARTICIPANTS
-- ================================

-- Remover políticas permissivas de INSERT
DROP POLICY IF EXISTS "Authenticated insert match_history" ON public.match_history;
DROP POLICY IF EXISTS "Authenticated insert match_participants" ON public.match_participants;

-- Nenhuma política de INSERT = clientes não podem inserir diretamente
-- Tudo via record_match_result (SECURITY DEFINER)

-- ================================
-- 7. PROTEGER FUNÇÕES DE ADMIN/CLEANUP
-- ================================

-- Funções de limpeza: apenas admins ou SECURITY DEFINER (para cron jobs)
CREATE OR REPLACE FUNCTION cleanup_inactive_data()
RETURNS JSON AS $$
DECLARE
    players_before INTEGER;
    rooms_before INTEGER;
    players_after INTEGER;
    rooms_after INTEGER;
    players_deleted INTEGER;
    rooms_deleted INTEGER;
BEGIN
    -- Verificar permissão: admin ou chamada interna (cron)
    IF auth.uid() IS NOT NULL AND NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores podem executar limpeza';
    END IF;

    SELECT COUNT(*) INTO players_before FROM public.players;
    SELECT COUNT(*) INTO rooms_before FROM public.rooms;
    
    PERFORM cleanup_inactive_players();
    PERFORM cleanup_inactive_rooms();
    
    SELECT COUNT(*) INTO players_after FROM public.players;
    SELECT COUNT(*) INTO rooms_after FROM public.rooms;
    
    players_deleted := players_before - players_after;
    rooms_deleted := rooms_before - rooms_after;
    
    RETURN json_build_object(
        'cleaned_at', NOW(),
        'players_before', players_before,
        'players_after', players_after,
        'players_deleted', players_deleted,
        'rooms_before', rooms_before,
        'rooms_after', rooms_after,
        'rooms_deleted', rooms_deleted,
        'success', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_system_stats: apenas admins
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN json_build_object(
        'timestamp', NOW(),
        'total_players', (SELECT COUNT(*) FROM public.players),
        'connected_players', (SELECT COUNT(*) FROM public.players WHERE is_connected = true),
        'inactive_players_2h', (SELECT COUNT(*) FROM public.players WHERE last_activity < NOW() - INTERVAL '2 hours'),
        'total_rooms', (SELECT COUNT(*) FROM public.rooms),
        'active_rooms', (SELECT COUNT(*) FROM public.rooms WHERE is_active = true),
        'inactive_rooms_2h', (
            SELECT COUNT(*) FROM public.rooms 
            WHERE (
                (last_activity IS NULL AND created_at < (NOW() - INTERVAL '2 hours'))
                OR 
                (last_activity IS NOT NULL AND last_activity < (NOW() - INTERVAL '2 hours'))
            )
        ),
        'rooms_with_players', (SELECT COUNT(DISTINCT room_id) FROM public.players WHERE room_id IS NOT NULL AND is_connected = true),
        'empty_rooms', (SELECT COUNT(*) FROM public.rooms r WHERE NOT EXISTS (SELECT 1 FROM public.players p WHERE p.room_id = r.id AND p.is_connected = true)),
        'rooms_with_null_activity', (SELECT COUNT(*) FROM public.rooms WHERE last_activity IS NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_combat_stats: apenas admins
CREATE OR REPLACE FUNCTION get_combat_stats()
RETURNS JSON AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN json_build_object(
        'timestamp', NOW(),
        'total_combats', (SELECT COUNT(*) FROM public.combat_notifications),
        'active_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'in_progress'),
        'pending_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'pending'),
        'completed_combats', (SELECT COUNT(*) FROM public.combat_notifications WHERE status = 'completed'),
        'combats_with_opportunity_attacks', (
            SELECT COUNT(*) FROM public.combat_notifications 
            WHERE allow_opportunity_attacks = true AND jsonb_array_length(opportunity_attacks_used) > 0
        ),
        'total_opportunity_attacks', (
            SELECT COALESCE(SUM(jsonb_array_length(opportunity_attacks_used)), 0)::INTEGER FROM public.combat_notifications
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- test_cleanup_system: apenas admins
CREATE OR REPLACE FUNCTION test_cleanup_system()
RETURNS JSON AS $$
DECLARE
    test_room_id VARCHAR(6) := 'TEST99';
    test_player_id UUID := gen_random_uuid();
    cleanup_result JSON;
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    DELETE FROM public.players WHERE room_id = test_room_id OR name LIKE '%TESTE_LIMPEZA%';
    DELETE FROM public.rooms WHERE id = test_room_id;
    
    INSERT INTO public.rooms (id, name, master_name, is_active, created_at, last_activity)
    VALUES (test_room_id, 'Sala Teste Limpeza', 'Mestre Teste', true, 
            NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');
    
    INSERT INTO public.players (id, room_id, name, is_connected, joined_at, last_activity)
    VALUES (test_player_id, test_room_id, 'JOGADOR_TESTE_LIMPEZA', false, 
            NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');
    
    SELECT cleanup_inactive_data() INTO cleanup_result;
    
    DELETE FROM public.players WHERE room_id = test_room_id OR name LIKE '%TESTE_LIMPEZA%';
    DELETE FROM public.rooms WHERE id = test_room_id;
    
    RETURN json_build_object(
        'test_executed_at', NOW(),
        'cleanup_result', cleanup_result,
        'test_passed', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- debug_room_cleanup: apenas admins
CREATE OR REPLACE FUNCTION debug_room_cleanup()
RETURNS TABLE(
    room_id VARCHAR(6),
    room_name VARCHAR(100),
    created_at_room TIMESTAMP WITH TIME ZONE,
    last_activity_room TIMESTAMP WITH TIME ZONE,
    is_active_room BOOLEAN,
    time_since_created INTERVAL,
    time_since_activity INTERVAL,
    players_count BIGINT,
    connected_players_count BIGINT,
    should_be_deleted BOOLEAN,
    deletion_reason TEXT
) AS $$
BEGIN
    IF NOT public.is_user_admin() THEN
        RAISE EXCEPTION 'Não autorizado: apenas administradores';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.created_at,
        r.last_activity,
        r.is_active,
        (NOW() - r.created_at),
        CASE WHEN r.last_activity IS NOT NULL THEN (NOW() - r.last_activity) ELSE NULL END,
        COALESCE(p_stats.total_players, 0),
        COALESCE(p_stats.connected_players, 0),
        CASE
            WHEN (r.last_activity IS NULL AND r.created_at < (NOW() - INTERVAL '2 hours')) THEN true
            WHEN (r.last_activity IS NOT NULL AND r.last_activity < (NOW() - INTERVAL '2 hours')) THEN true
            WHEN (r.created_at < (NOW() - INTERVAL '2 hours') AND COALESCE(p_stats.connected_players, 0) = 0) THEN true
            ELSE false
        END,
        CASE
            WHEN (r.last_activity IS NULL AND r.created_at < (NOW() - INTERVAL '2 hours')) THEN 'Sala sem atividade registrada há mais de 2h'
            WHEN (r.last_activity IS NOT NULL AND r.last_activity < (NOW() - INTERVAL '2 hours')) THEN 'Última atividade há mais de 2h'
            WHEN (r.created_at < (NOW() - INTERVAL '2 hours') AND COALESCE(p_stats.connected_players, 0) = 0) THEN 'Sala vazia há mais de 2h'
            ELSE 'Sala ativa'
        END
    FROM public.rooms r
    LEFT JOIN (
        SELECT 
            p.room_id,
            COUNT(*) as total_players,
            COUNT(CASE WHEN p.is_connected = true THEN 1 END) as connected_players
        FROM public.players p
        WHERE p.room_id IS NOT NULL
        GROUP BY p.room_id
    ) p_stats ON r.id = p_stats.room_id
    ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 8. BLINDAR record_match_result (PRIORIDADE: anti-manipulação de ranking)
-- ================================

-- A função agora IGNORA dados de participantes do cliente.
-- Em vez disso, lê o estado atual dos jogadores diretamente do banco.
-- Apenas o mestre da sala pode chamar.

CREATE OR REPLACE FUNCTION record_match_result(
    p_room_id VARCHAR(6),
    p_room_name VARCHAR(100),
    p_started_at TIMESTAMPTZ,
    p_winner_user_id UUID DEFAULT NULL,
    p_winner_player_name VARCHAR(50) DEFAULT NULL,
    p_total_players INTEGER DEFAULT NULL,
    p_participants JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_room RECORD;
    v_player RECORD;
    v_total INTEGER;
    v_eliminated INTEGER;
    v_winner_id UUID;
    v_winner_name VARCHAR(50);
    v_winner_user UUID;
    v_survival_points INTEGER;
    v_eliminations_made INTEGER;
    v_is_winner BOOLEAN;
    v_max_char VARCHAR(100);
BEGIN
    -- 1. Verificar que quem chama é o mestre da sala
    SELECT r.*, p.user_id as master_user_id
    INTO v_room
    FROM public.rooms r
    JOIN public.players p ON p.id = r.master_player_id
    WHERE r.id = p_room_id;

    IF v_room IS NULL THEN
        RAISE EXCEPTION 'Sala não encontrada: %', p_room_id;
    END IF;

    IF v_room.master_user_id IS NULL OR v_room.master_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Apenas o mestre da sala pode registrar resultados de partida';
    END IF;

    -- 2. Contar total de jogadores conectados e prontos na sala
    SELECT COUNT(*) INTO v_total
    FROM public.players
    WHERE room_id = p_room_id AND is_connected = true AND status = 'ready';

    IF v_total < 2 THEN
        RAISE EXCEPTION 'Partida requer ao menos 2 jogadores';
    END IF;

    -- 3. Determinar o vencedor: último jogador vivo
    SELECT p.id, p.name, p.user_id
    INTO v_winner_id, v_winner_name, v_winner_user
    FROM public.players p
    WHERE p.room_id = p_room_id
    AND p.is_connected = true
    AND p.status = 'ready'
    AND p.is_alive = true
    LIMIT 1;

    -- 4. Inserir registro da partida
    INSERT INTO public.match_history (
        room_id, room_name, started_at, ended_at,
        winner_user_id, winner_player_name, total_players
    ) VALUES (
        p_room_id,
        COALESCE(p_room_name, v_room.name),
        COALESCE(p_started_at, v_room.match_started_at, v_room.created_at),
        NOW(),
        v_winner_user,
        v_winner_name,
        v_total
    ) RETURNING id INTO v_match_id;

    -- 5. Inserir participantes a partir do estado real do banco
    FOR v_player IN
        SELECT p.*
        FROM public.players p
        WHERE p.room_id = p_room_id
        AND p.is_connected = true
        AND p.status = 'ready'
    LOOP
        v_is_winner := (v_player.id = v_winner_id);

        -- Survival points calculados server-side:
        -- Vencedor = total - 1; Eliminados = (elimination_order - 1) se tiver, senão 0
        IF v_is_winner THEN
            v_survival_points := v_total - 1;
        ELSE
            v_survival_points := COALESCE(v_player.elimination_order - 1, 0);
        END IF;

        -- Contar eliminações feitas por este jogador (quantos players têm killed_by_player_id = este)
        SELECT COUNT(*) INTO v_eliminations_made
        FROM public.players
        WHERE room_id = p_room_id
        AND killed_by_player_id = v_player.id;

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

        -- 6. Atualizar user_stats se o participante tem conta
        IF v_player.user_id IS NOT NULL THEN
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

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_match_result IS 'Registra resultado de partida de forma segura — lê estado dos jogadores do banco, não do cliente. Apenas o mestre pode chamar.';

-- ================================
-- 9. HABILITAR REALTIME PARA admin_users
-- ================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'admin_users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_users;
    END IF;
END $$;

-- ================================
-- 10. ÍNDICE PARA user_id EM PLAYERS (se não existir)
-- ================================
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);

-- ================================
-- INSTRUÇÕES PÓS-MIGRAÇÃO
-- ================================
-- 1. Insira seu user_id na tabela admin_users:
--    INSERT INTO public.admin_users (user_id) VALUES ('SEU-USER-ID-AQUI');
--
-- 2. No Dashboard do Supabase, vá em Settings → API → Rate Limits
--    e configure limites razoáveis (ex: 100 req/min por usuário).
--
-- 3. Certifique-se de que Authentication → Settings tem
--    "Enable anonymous sign-ins" habilitado se quiser permitir
--    jogadores sem conta (com auth anônimo).

SELECT 'MIGRAÇÃO DE SEGURANÇA CONCLUÍDA!' as status;
