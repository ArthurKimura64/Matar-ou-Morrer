-- ================================================================
-- MATAR OU MORRER — Schema Setup (Tabelas, Índices, Políticas, Triggers)
-- Execute no SQL Editor do Supabase ANTES de supabase-functions.sql
-- Pré-requisito: supabase-security-migration.sql já executado
-- ================================================================

-- ================================
-- 1. TABELA: rooms (Salas de jogo)
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

-- Políticas de rooms
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
CREATE POLICY "Anyone can view rooms" ON public.rooms
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
CREATE POLICY "Anyone can create rooms" ON public.rooms
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
CREATE POLICY "Anyone can update rooms" ON public.rooms
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete rooms" ON public.rooms;
CREATE POLICY "Anyone can delete rooms" ON public.rooms
    FOR DELETE USING (true);

-- Índices de rooms
CREATE INDEX IF NOT EXISTS idx_rooms_active ON public.rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON public.rooms(last_activity);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON public.rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_match_status ON public.rooms(match_status);

COMMENT ON TABLE public.rooms IS 'Salas de jogo do sistema Matar ou Morrer';
COMMENT ON COLUMN public.rooms.match_status IS 'Status da partida: NULL = sem partida ativa, in_progress = partida em andamento';
COMMENT ON COLUMN public.rooms.match_started_at IS 'Quando a partida atual começou';

-- ================================
-- 2. TABELA: players (Jogadores nas salas)
-- ================================
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
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
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.players
DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE public.players
ADD CONSTRAINT players_status_check
CHECK (status IN ('selecting', 'ready', 'playing'));

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players REPLICA IDENTITY FULL;

-- Políticas de players
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
CREATE POLICY "Anyone can view players" ON public.players
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert players" ON public.players;
CREATE POLICY "Anyone can insert players" ON public.players
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update players" ON public.players;
CREATE POLICY "Anyone can update players" ON public.players
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete players" ON public.players;
CREATE POLICY "Anyone can delete players" ON public.players
    FOR DELETE USING (true);

-- Índices de players
CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_is_connected ON public.players(is_connected);
CREATE INDEX IF NOT EXISTS idx_players_last_activity ON public.players(last_activity);
CREATE INDEX IF NOT EXISTS idx_players_room_connected ON public.players(room_id, is_connected);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_is_alive ON public.players(is_alive);

COMMENT ON TABLE public.players IS 'Jogadores conectados nas salas do jogo';
COMMENT ON COLUMN public.players.user_id IS 'ID do usuário autenticado (NULL se jogador sem conta)';
COMMENT ON COLUMN public.players.is_alive IS 'Se o jogador está vivo na partida atual';
COMMENT ON COLUMN public.players.killed_by_player_id IS 'ID do jogador que eliminou este jogador';
COMMENT ON COLUMN public.players.elimination_order IS 'Ordem de eliminação na partida atual (1 = primeiro eliminado)';

-- ================================
-- 3. TABELA: combat_notifications (Combates)
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
    combat_group_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- Políticas de combat_notifications
DROP POLICY IF EXISTS "Players can view combat notifications in their room" ON public.combat_notifications;
CREATE POLICY "Players can view combat notifications in their room"
ON public.combat_notifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Players can create combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can create combat notifications"
ON public.combat_notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update their combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can update their combat notifications"
ON public.combat_notifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Players can delete their combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can delete their combat notifications"
ON public.combat_notifications FOR DELETE USING (true);

-- Índices de combat_notifications
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
-- 4. TABELA: user_profiles (Perfis de usuário)
-- ================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    banned_at TIMESTAMPTZ DEFAULT NULL,
    ban_reason TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user_profiles" ON public.user_profiles;
CREATE POLICY "Public read user_profiles" ON public.user_profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

COMMENT ON TABLE public.user_profiles IS 'Perfis de usuários registrados (vinculados a auth.users)';
COMMENT ON COLUMN public.user_profiles.banned_at IS 'Timestamp de quando o usuário foi banido (NULL = não banido)';
COMMENT ON COLUMN public.user_profiles.ban_reason IS 'Motivo do banimento';

-- ================================
-- 5. TABELA: user_stats (Estatísticas de usuário)
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
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert user_stats" ON public.user_stats;
CREATE POLICY "System can insert user_stats" ON public.user_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can update user_stats" ON public.user_stats;
CREATE POLICY "System can update user_stats" ON public.user_stats
    FOR UPDATE USING (true);

COMMENT ON TABLE public.user_stats IS 'Estatísticas acumuladas de cada usuário';

-- Índices de user_stats
CREATE INDEX IF NOT EXISTS idx_user_stats_composite ON public.user_stats(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_wins ON public.user_stats(total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_eliminations ON public.user_stats(total_eliminations DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_survival ON public.user_stats(total_survival_points DESC);

-- ================================
-- 6. TABELA: match_history (Histórico de partidas)
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
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert match_history" ON public.match_history;
CREATE POLICY "Authenticated insert match_history" ON public.match_history
    FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_match_history_ended ON public.match_history(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_room ON public.match_history(room_id);

COMMENT ON TABLE public.match_history IS 'Histórico de partidas concluídas';

-- ================================
-- 7. TABELA: match_participants (Participantes de partidas)
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

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read match_participants" ON public.match_participants;
CREATE POLICY "Public read match_participants" ON public.match_participants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert match_participants" ON public.match_participants;
CREATE POLICY "Authenticated insert match_participants" ON public.match_participants
    FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);

COMMENT ON TABLE public.match_participants IS 'Participantes e resultados de cada partida';

-- ================================
-- 8. TABELA: app_settings (Configurações do app)
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

-- Seed: cadastro aberto por padrão
INSERT INTO public.app_settings (key, value)
VALUES ('registration_open', 'true')
ON CONFLICT (key) DO NOTHING;

-- ================================
-- 9. TABELA: admin_users (Administradores)
-- ================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
CREATE POLICY "admin_users_select" ON public.admin_users
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_users_modify_deny" ON public.admin_users;
CREATE POLICY "admin_users_modify_deny" ON public.admin_users
    FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.admin_users IS 'Tabela de administradores ativos do sistema';

-- ================================
-- 10. TABELA: admin_audit_log (Log de auditoria admin)
-- ================================
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
-- 10. REALTIME — Habilitar para tabelas que precisam de tempo real
-- ================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'combat_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_notifications;
    END IF;
END $$;

SELECT 'SCHEMA SETUP CONCLUÍDO!' as status;
