-- ================================================================
-- MATAR OU MORRER — Schema Setup Completo (v5.5)
-- Execute no SQL Editor do Supabase ANTES de 02-functions.sql
-- ================================================================

-- ================================
-- 1. TABELA: admin_users + helper is_user_admin()
-- ================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
CREATE POLICY "admin_users_select" ON public.admin_users
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_users_modify_deny" ON public.admin_users;
CREATE POLICY "admin_users_modify_deny" ON public.admin_users
    FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.admin_users IS 'Tabela de administradores ativos do sistema';

CREATE OR REPLACE FUNCTION public.is_user_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM public.admin_users
        WHERE user_id = COALESCE(p_user_id, auth.uid())
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ================================
-- 2. TABELA: rooms (Salas de jogo)
-- ================================
CREATE TABLE IF NOT EXISTS public.rooms (
    id VARCHAR(6) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    master_name VARCHAR(50) NOT NULL,
    master_player_id UUID,
    is_active BOOLEAN DEFAULT true,
    match_status VARCHAR(20) DEFAULT NULL,
    match_started_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.rooms
DROP CONSTRAINT IF EXISTS rooms_match_status_check;
ALTER TABLE public.rooms
ADD CONSTRAINT rooms_match_status_check
CHECK (match_status IS NULL OR match_status IN ('in_progress'));

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_rooms_active ON public.rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON public.rooms(last_activity);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON public.rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_match_status ON public.rooms(match_status);

COMMENT ON TABLE public.rooms IS 'Salas de jogo do sistema Matar ou Morrer';
COMMENT ON COLUMN public.rooms.match_status IS 'Status da partida: NULL = sem partida ativa, in_progress = partida em andamento';
COMMENT ON COLUMN public.rooms.match_started_at IS 'Quando a partida atual começou';

-- ================================
-- 3. TABELA: players (Dados públicos dos jogadores nas salas)
-- ================================
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    actor_id VARCHAR(60) DEFAULT NULL,
    character JSONB,
    character_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'selecting',
    is_connected BOOLEAN DEFAULT true,
    user_id UUID DEFAULT NULL,
    is_alive BOOLEAN DEFAULT true,
    killed_by_player_id UUID DEFAULT NULL,
    elimination_order INTEGER DEFAULT NULL,
    counters JSONB DEFAULT '{}',
    characteristics JSONB DEFAULT '{}',
    used_items JSONB DEFAULT '[]',
    unlocked_items JSONB DEFAULT '[]',
    additional_counters JSONB DEFAULT '{}',
    exposed_cards JSONB DEFAULT '[]',
    selections JSONB DEFAULT '{}',
    app_state JSONB DEFAULT '{}',
    defense_dice_count INTEGER DEFAULT NULL,
    in_match BOOLEAN NOT NULL DEFAULT false,
    match_character_name VARCHAR(100) DEFAULT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS actor_id VARCHAR(60) DEFAULT NULL;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS defense_dice_count INTEGER DEFAULT NULL;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS exposed_cards JSONB DEFAULT '[]';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS app_state JSONB DEFAULT '{}';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS in_match BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS match_character_name VARCHAR(100) DEFAULT NULL;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE public.players
ADD CONSTRAINT players_status_check
CHECK (status IN ('selecting', 'creating', 'ready', 'playing'));

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players REPLICA IDENTITY FULL;

-- Helper de pertencimento à sala (SECURITY DEFINER evita recursão no RLS)
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_user_in_room(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_in_room(VARCHAR) TO authenticated;

-- Limpa eventuais políticas antigas/duplicadas em rooms e players antes de recriar
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('rooms', 'players')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Políticas RLS de rooms: leitura apenas para membros da sala ou admin; escrita via RPCs
CREATE POLICY "rooms_select_member_or_admin" ON public.rooms
    FOR SELECT USING (public.is_user_in_room(id) OR public.is_user_admin());

CREATE POLICY "rooms_insert_deny" ON public.rooms
    FOR INSERT WITH CHECK (false);

CREATE POLICY "rooms_update_admin_only" ON public.rooms
    FOR UPDATE USING (public.is_user_admin()) WITH CHECK (public.is_user_admin());

CREATE POLICY "rooms_delete_admin_only" ON public.rooms
    FOR DELETE USING (public.is_user_admin());

-- Políticas RLS de players: leitura apenas na própria sala; entrada exclusivamente via RPC join_room
CREATE POLICY "players_select_room_member_or_admin" ON public.players
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_user_in_room(room_id)
        OR public.is_user_admin()
    );

CREATE POLICY "players_insert_deny" ON public.players
    FOR INSERT WITH CHECK (false);

CREATE POLICY "players_update_own" ON public.players
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "players_delete_own" ON public.players
    FOR DELETE USING (auth.uid() = user_id);

-- Deduplicação preventiva antes do índice único (room_id, user_id)
DELETE FROM public.players p
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY room_id, user_id
               ORDER BY in_match DESC, is_connected DESC, last_activity DESC, joined_at DESC
           ) AS rn
    FROM public.players
    WHERE user_id IS NOT NULL
) dup
WHERE p.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_players_room_user
    ON public.players(room_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_is_connected ON public.players(is_connected);
CREATE INDEX IF NOT EXISTS idx_players_last_activity ON public.players(last_activity);
CREATE INDEX IF NOT EXISTS idx_players_room_connected ON public.players(room_id, is_connected);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_is_alive ON public.players(is_alive);
CREATE INDEX IF NOT EXISTS idx_players_room_in_match ON public.players(room_id, in_match);

COMMENT ON TABLE public.players IS 'Jogadores conectados nas salas do jogo (apenas informações públicas na mesa)';
COMMENT ON COLUMN public.players.actor_id IS 'ID público do personagem escolhido pelo jogador';
COMMENT ON COLUMN public.players.user_id IS 'ID do usuário autenticado (NULL se jogador sem conta)';
COMMENT ON COLUMN public.players.is_alive IS 'Se o jogador está vivo na partida atual';
COMMENT ON COLUMN public.players.killed_by_player_id IS 'ID do jogador que eliminou este jogador';
COMMENT ON COLUMN public.players.elimination_order IS 'Ordem de eliminação na partida atual (1 = primeiro eliminado)';

-- ================================
-- 3B. TABELA: player_private_state (Cartas secretas — acesso exclusivo do dono)
-- ================================
CREATE TABLE IF NOT EXISTS public.player_private_state (
    player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_id VARCHAR(60) DEFAULT NULL,
    selections JSONB DEFAULT '{}'::jsonb,
    used_items JSONB DEFAULT '[]'::jsonb,
    unlocked_items JSONB DEFAULT '[]'::jsonb,
    notes JSONB DEFAULT '{}'::jsonb,
    app_state JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.player_private_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_private_select_own" ON public.player_private_state;
CREATE POLICY "player_private_select_own" ON public.player_private_state
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_private_insert_own" ON public.player_private_state;
CREATE POLICY "player_private_insert_own" ON public.player_private_state
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_private_update_own" ON public.player_private_state;
CREATE POLICY "player_private_update_own" ON public.player_private_state
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_private_delete_own" ON public.player_private_state;
CREATE POLICY "player_private_delete_own" ON public.player_private_state
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_player_private_state_user_id
    ON public.player_private_state(user_id);

COMMENT ON TABLE public.player_private_state IS 'Estado privado da ficha (cartas escolhidas, itens usados/desbloqueados e anotações). Visível apenas para o próprio dono.';

-- ================================
-- 4. TABELA: combat_notifications (Combates)
-- ================================
CREATE TABLE IF NOT EXISTS public.combat_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    attacker_id UUID,
    defender_id UUID,
    attacker_name VARCHAR(50),
    defender_name VARCHAR(50),
    attack_data JSONB DEFAULT '{}',
    defender_weapon JSONB DEFAULT '{}',
    allow_counter_attack BOOLEAN DEFAULT true,
    allow_opportunity_attacks BOOLEAN DEFAULT false,
    opportunity_attacks_used JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending',
    combat_phase VARCHAR(20) DEFAULT 'weapon_selection',
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    round_data JSONB DEFAULT '[]',
    combat_group_id UUID,
    attacker_shared_roll JSONB DEFAULT NULL,
    attacker_defense_dices INTEGER DEFAULT NULL,
    defender_defense_dices INTEGER DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DELETE FROM public.combat_notifications
WHERE attacker_id NOT IN (SELECT id FROM public.players)
   OR defender_id NOT IN (SELECT id FROM public.players);

ALTER TABLE public.combat_notifications
DROP CONSTRAINT IF EXISTS fk_combat_attacker,
DROP CONSTRAINT IF EXISTS fk_combat_defender;

ALTER TABLE public.combat_notifications
ADD CONSTRAINT fk_combat_attacker
    FOREIGN KEY (attacker_id) REFERENCES public.players(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_combat_defender
    FOREIGN KEY (defender_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE public.combat_notifications
DROP CONSTRAINT IF EXISTS combat_notifications_status_check;
ALTER TABLE public.combat_notifications
ADD CONSTRAINT combat_notifications_status_check
CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE public.combat_notifications
DROP CONSTRAINT IF EXISTS combat_notifications_phase_check;
ALTER TABLE public.combat_notifications
ADD CONSTRAINT combat_notifications_phase_check
CHECK (combat_phase IN ('weapon_selection', 'rolling', 'results'));

ALTER TABLE public.combat_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_notifications REPLICA IDENTITY FULL;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'combat_notifications'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.combat_notifications', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "combat_select_room_member_or_admin" ON public.combat_notifications
    FOR SELECT USING (public.is_user_in_room(room_id) OR public.is_user_admin());

CREATE POLICY "combat_insert_deny" ON public.combat_notifications
    FOR INSERT WITH CHECK (false);

CREATE POLICY "combat_update_participants_or_admin" ON public.combat_notifications
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.user_id = auth.uid()
              AND (
                  p.id = attacker_id
                  OR p.id = defender_id
                  OR opportunity_attacks_used @> to_jsonb(p.id::text)
              )
        )
        OR public.is_user_admin()
    );

CREATE POLICY "combat_delete_admin_only" ON public.combat_notifications
    FOR DELETE USING (public.is_user_admin());

CREATE INDEX IF NOT EXISTS idx_combat_room_id ON public.combat_notifications(room_id);
CREATE INDEX IF NOT EXISTS idx_combat_attacker ON public.combat_notifications(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_defender ON public.combat_notifications(defender_id);
CREATE INDEX IF NOT EXISTS idx_combat_status ON public.combat_notifications(status);
CREATE INDEX IF NOT EXISTS idx_combat_phase ON public.combat_notifications(combat_phase);
CREATE INDEX IF NOT EXISTS idx_combat_created_at ON public.combat_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_combat_round_data ON public.combat_notifications USING GIN (round_data);
CREATE INDEX IF NOT EXISTS idx_combat_opportunity_attacks ON public.combat_notifications USING GIN (opportunity_attacks_used);
CREATE INDEX IF NOT EXISTS idx_combat_group_id ON public.combat_notifications(combat_group_id);

COMMENT ON TABLE public.combat_notifications IS 'Combates entre jogadores, incluindo sistema de espectadores e ataques de oportunidade';
COMMENT ON COLUMN public.combat_notifications.round_data IS 'Array JSON com dados de cada rodada: [{round, action_type, who_acts, opportunity_attacker_id, opportunity_attacker_name, opportunity_weapon, opportunity_target, attacker, defender, completed}]';

-- ================================
-- 5. TABELA: user_profiles (Perfis de usuário + Tema da Conta)
-- ================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    theme VARCHAR(30) DEFAULT 'classic',
    banned_at TIMESTAMPTZ DEFAULT NULL,
    ban_reason TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS theme VARCHAR(30) DEFAULT 'classic';
ALTER TABLE public.user_profiles
ALTER COLUMN theme SET DEFAULT 'classic';

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user_profiles" ON public.user_profiles;
CREATE POLICY "Public read user_profiles" ON public.user_profiles
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

COMMENT ON TABLE public.user_profiles IS 'Perfis de usuários registrados (vinculados a auth.users). Campos de banimento são protegidos por trigger em 02-functions.sql';
COMMENT ON COLUMN public.user_profiles.theme IS 'Tema de cores preferido salvo na conta do jogador (padrão: classic)';
COMMENT ON COLUMN public.user_profiles.banned_at IS 'Timestamp de quando o usuário foi banido (NULL = não banido)';
COMMENT ON COLUMN public.user_profiles.ban_reason IS 'Motivo do banimento';

-- ================================
-- 6. TABELA: user_stats (Estatísticas de usuário)
-- ================================
CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    total_matches INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_eliminations INTEGER DEFAULT 0,
    total_survival_points INTEGER DEFAULT 0,
    favorite_character VARCHAR(100),
    win_rate DECIMAL(5,2) DEFAULT 0,
    composite_score DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user_stats" ON public.user_stats;
CREATE POLICY "Public read user_stats" ON public.user_stats
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can insert user_stats" ON public.user_stats;
DROP POLICY IF EXISTS "System can update user_stats" ON public.user_stats;

COMMENT ON TABLE public.user_stats IS 'Estatísticas acumuladas de cada usuário (atualizadas exclusivamente via triggers e RPCs SECURITY DEFINER)';

CREATE INDEX IF NOT EXISTS idx_user_stats_composite ON public.user_stats(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_wins ON public.user_stats(total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_eliminations ON public.user_stats(total_eliminations DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_survival ON public.user_stats(total_survival_points DESC);

-- ================================
-- 7. TABELA: match_history (Histórico de partidas)
-- ================================
CREATE TABLE IF NOT EXISTS public.match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6),
    room_name VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    winner_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    winner_player_name VARCHAR(50),
    total_players INTEGER NOT NULL
);

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read match_history" ON public.match_history;
CREATE POLICY "Public read match_history" ON public.match_history
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated insert match_history" ON public.match_history;

CREATE INDEX IF NOT EXISTS idx_match_history_ended ON public.match_history(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_room ON public.match_history(room_id);

COMMENT ON TABLE public.match_history IS 'Histórico de partidas concluídas (gravado exclusivamente por RPCs SECURITY DEFINER)';

-- ================================
-- 8. TABELA: match_participants (Participantes de partidas)
-- ================================
CREATE TABLE IF NOT EXISTS public.match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES public.match_history(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    player_name VARCHAR(50) NOT NULL,
    character_name VARCHAR(100),
    elimination_order INTEGER,
    killed_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    killed_by_player_name VARCHAR(50),
    survival_points INTEGER DEFAULT 0,
    eliminations_made INTEGER DEFAULT 0,
    is_winner BOOLEAN DEFAULT false
);

ALTER TABLE public.match_participants ADD COLUMN IF NOT EXISTS eliminations_made INTEGER DEFAULT 0;

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read match_participants" ON public.match_participants;
CREATE POLICY "Public read match_participants" ON public.match_participants
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated insert match_participants" ON public.match_participants;

DELETE FROM public.match_participants mp
USING (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY match_id, user_id
               ORDER BY is_winner DESC, eliminations_made DESC, id ASC
           ) AS rn
    FROM public.match_participants
    WHERE user_id IS NOT NULL
) dup
WHERE mp.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_match_participants_match_user
    ON public.match_participants(match_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_killed_by_user
    ON public.match_participants(killed_by_user_id)
    WHERE killed_by_user_id IS NOT NULL;

COMMENT ON TABLE public.match_participants IS 'Participantes e resultados de cada partida (gravados exclusivamente por RPCs SECURITY DEFINER)';

-- ================================
-- 9. TABELA: app_settings (Configurações do app)
-- ================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
CREATE POLICY "Anyone can read app_settings" ON public.app_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "No direct write app_settings" ON public.app_settings;
CREATE POLICY "No direct write app_settings" ON public.app_settings
    FOR ALL USING (false) WITH CHECK (false);

INSERT INTO public.app_settings (key, value)
VALUES ('registration_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- ================================
-- 10. TABELA: admin_audit_log (Log de auditoria admin)
-- ================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_user_id UUID,
    target_room_id VARCHAR(6),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log_select" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
    FOR SELECT USING (public.is_user_admin());

DROP POLICY IF EXISTS "admin_audit_log_insert_deny" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_insert_deny" ON public.admin_audit_log
    FOR INSERT WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

COMMENT ON TABLE public.admin_audit_log IS 'Log de auditoria de todas as ações administrativas';

-- ================================
-- 11. REALTIME
-- ================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rooms') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'players') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'combat_notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_notifications;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'SCHEMA SETUP v5.5 CONCLUÍDO!' AS status;