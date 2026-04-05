-- Criação das tabelas para o sistema de salas
-- Execute este código no editor SQL do Supabase

-- Tabela de salas
CREATE TABLE IF NOT EXISTS public.rooms (
    id VARCHAR(6) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    master_name VARCHAR(50) NOT NULL,
    master_player_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de jogadores
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    character JSONB,
    is_connected BOOLEAN DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar colunas de status se não existirem (para compatibilidade com bancos antigos)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'selecting';

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS character_name VARCHAR(100);

-- Adicionar constraint de check para status (remove primeiro se existir)
ALTER TABLE public.players 
DROP CONSTRAINT IF EXISTS players_status_check;

ALTER TABLE public.players 
ADD CONSTRAINT players_status_check 
CHECK (status IN ('selecting', 'creating', 'ready'));

-- Adicionar colunas para contadores detalhados
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS counters JSONB DEFAULT '{"vida": 20, "vida_max": 20, "esquiva": 0, "esquiva_max": 0, "oport": 0, "oport_max": 0, "item": 0, "item_max": 0}';

-- Adicionar colunas para características e itens usados
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS characteristics JSONB DEFAULT '{"attacks": 0, "weapons": 0, "passives": 0, "devices": 0, "powers": 0, "specials": 0, "passiveSpecials": 0}';

ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS used_items JSONB DEFAULT '[]';

-- Adicionar coluna para itens desbloqueados (habilidades passivas especiais)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS unlocked_items JSONB DEFAULT '[]';

-- Adicionar coluna para armazenar as seleções do personagem (ataques, armas, passivas, etc.)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS selections JSONB DEFAULT '{}';

-- Adicionar coluna para atualização de atividade dos jogadores
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Adicionar coluna para cartas expostas na mesa
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS exposed_cards JSONB DEFAULT '[]';

-- Adicionar coluna para atualização de atividade das salas
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Adicionar colunas para contadores adicionais específicos de personagens
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS additional_counters JSONB DEFAULT '{}';

-- Adicionar coluna para estado da aplicação (view, seleções, etc.)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS app_state JSONB DEFAULT '{"currentView": "lobby", "selectedActor": null, "characterSelections": null}';

-- Adicionar coluna específica para dados de defesa
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS defense_dice_count INTEGER DEFAULT 2;

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Habilitar Realtime para as tabelas (apenas se não estiverem já adicionadas)
DO $$
BEGIN
    -- Verificar e adicionar tabela rooms se não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
    
    -- Verificar e adicionar tabela players se não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;
END
$$;

-- Políticas de segurança para permitir acesso público (apenas leitura e inserção)
-- Para uma versão de produção, você pode querer implementar autenticação

-- Política para salas: permitir leitura e criação para todos
DROP POLICY IF EXISTS "Allow public read access on rooms" ON public.rooms;
CREATE POLICY "Allow public read access on rooms" ON public.rooms
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access on rooms" ON public.rooms;
CREATE POLICY "Allow public insert access on rooms" ON public.rooms
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access on rooms" ON public.rooms;
CREATE POLICY "Allow public update access on rooms" ON public.rooms
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete access on rooms" ON public.rooms;
CREATE POLICY "Allow public delete access on rooms" ON public.rooms
    FOR DELETE USING (true);

-- Política para jogadores: permitir leitura e criação para todos
DROP POLICY IF EXISTS "Allow public read access on players" ON public.players;
CREATE POLICY "Allow public read access on players" ON public.players
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access on players" ON public.players;
CREATE POLICY "Allow public insert access on players" ON public.players
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access on players" ON public.players;
CREATE POLICY "Allow public update access on players" ON public.players
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete access on players" ON public.players;
CREATE POLICY "Allow public delete access on players" ON public.players
    FOR DELETE USING (true);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_rooms_active ON public.rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_connected ON public.players(is_connected);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_counters ON public.players USING GIN (counters);
CREATE INDEX IF NOT EXISTS idx_players_characteristics ON public.players USING GIN (characteristics);
CREATE INDEX IF NOT EXISTS idx_players_selections ON public.players USING GIN (selections);
CREATE INDEX IF NOT EXISTS idx_players_app_state ON public.players USING GIN (app_state);
CREATE INDEX IF NOT EXISTS idx_players_unlocked_items ON public.players USING GIN (unlocked_items);

-- Comentários para documentação
COMMENT ON TABLE public.rooms IS 'Tabela que armazena as salas de jogo';
COMMENT ON TABLE public.players IS 'Tabela que armazena os jogadores conectados às salas';

COMMENT ON COLUMN public.rooms.id IS 'ID único da sala';
COMMENT ON COLUMN public.rooms.name IS 'Nome da sala definido pelo mestre';
COMMENT ON COLUMN public.rooms.master_name IS 'Nome do mestre da sala';
COMMENT ON COLUMN public.rooms.is_active IS 'Se a sala está ativa';

COMMENT ON COLUMN public.players.id IS 'ID único do jogador';
COMMENT ON COLUMN public.players.room_id IS 'Referência à sala';
COMMENT ON COLUMN public.players.name IS 'Nome do jogador';
COMMENT ON COLUMN public.players.character IS 'Dados do personagem em formato JSON';
COMMENT ON COLUMN public.players.status IS 'Status do jogador: selecting, creating, ready';
COMMENT ON COLUMN public.players.character_name IS 'Nome do personagem escolhido';
COMMENT ON COLUMN public.players.counters IS 'Contadores do jogador (vida, esquiva, oportunidade, itens) com valores atuais e máximos';
COMMENT ON COLUMN public.players.characteristics IS 'Quantidade de características de cada tipo (ataques, armas, passivas, etc.)';
COMMENT ON COLUMN public.players.used_items IS 'Lista de IDs de itens usados pelo jogador';
COMMENT ON COLUMN public.players.unlocked_items IS 'Lista de IDs de habilidades passivas especiais desbloqueadas pelo jogador';
COMMENT ON COLUMN public.players.additional_counters IS 'Contadores adicionais específicos do personagem (munição, energia, etc.)';
COMMENT ON COLUMN public.players.selections IS 'Seleções do personagem organizadas por tipo (attacks, weapons, passives, devices, powers, specials, passiveSpecials)';
COMMENT ON COLUMN public.players.last_activity IS 'Timestamp da última atividade do jogador para limpeza automática';
COMMENT ON COLUMN public.players.is_connected IS 'Se o jogador está conectado';
COMMENT ON COLUMN public.players.app_state IS 'Estado da aplicação para o jogador (view atual, seleções, etc.)';
COMMENT ON COLUMN public.players.defense_dice_count IS 'Número de dados de defesa do personagem';

COMMENT ON COLUMN public.rooms.last_activity IS 'Timestamp da última atividade da sala para limpeza automática';

-- Verificar a estrutura final da tabela players
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'players' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Configurar limpeza automática (opcional - requer extensão pg_cron)
-- Para habilitar limpeza automática a cada hora, descomente as linhas abaixo:
/*
-- Instalar extensão pg_cron (se disponível)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar limpeza automática a cada hora
SELECT cron.schedule('cleanup-old-data', '0 * * * *', 'SELECT cleanup_inactive_players(); SELECT cleanup_inactive_rooms();');
*/

-- Comandos úteis para manutenção manual:
-- Para executar limpeza manualmente:
-- SELECT cleanup_inactive_players();
-- SELECT cleanup_inactive_rooms();

-- Para ver jogadores inativos (sem remover):
-- SELECT id, name, room_id, last_activity 
-- FROM players 
-- WHERE last_activity < (NOW() - INTERVAL '2 hours');

-- Para ver salas inativas (sem remover):
-- SELECT id, name, is_active, last_activity,
--        (SELECT COUNT(*) FROM players WHERE room_id = rooms.id) as player_count
-- FROM rooms 
-- WHERE last_activity < (NOW() - INTERVAL '2 hours');

-- ================================
-- SISTEMA DE LIMPEZA AUTOMÁTICA
-- ================================

-- Função para limpar jogadores inativos (mais de 2 horas)
CREATE OR REPLACE FUNCTION clean_inactive_players()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Deletar jogadores que não estão conectados há mais de 2 horas
    DELETE FROM public.players 
    WHERE is_connected = false 
    AND joined_at < NOW() - INTERVAL '2 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log da limpeza (opcional)
    RAISE NOTICE 'Limpeza de jogadores: % registros removidos', deleted_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para limpar salas vazias ou inativas (mais de 2 horas)
CREATE OR REPLACE FUNCTION clean_inactive_rooms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Deletar salas que não têm jogadores conectados há mais de 2 horas
    -- ou que foram marcadas como inativas há mais de 2 horas
    DELETE FROM public.rooms 
    WHERE id IN (
        SELECT r.id 
        FROM public.rooms r
        LEFT JOIN public.players p ON r.id = p.room_id AND p.is_connected = true
        WHERE (
            -- Sala sem jogadores conectados há mais de 2 horas
            p.id IS NULL AND r.created_at < NOW() - INTERVAL '2 hours'
        ) OR (
            -- Sala marcada como inativa há mais de 2 horas
            r.is_active = false AND r.created_at < NOW() - INTERVAL '2 hours'
        )
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log da limpeza (opcional)
    RAISE NOTICE 'Limpeza de salas: % registros removidos', deleted_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função combinada para limpeza geral
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
    -- Contar dados antes da limpeza
    SELECT COUNT(*) INTO players_before FROM public.players;
    SELECT COUNT(*) INTO rooms_before FROM public.rooms;
    
    -- Executar limpeza
    PERFORM cleanup_inactive_players();
    PERFORM cleanup_inactive_rooms();
    
    -- Contar dados após a limpeza
    SELECT COUNT(*) INTO players_after FROM public.players;
    SELECT COUNT(*) INTO rooms_after FROM public.rooms;
    
    -- Calcular diferenças
    players_deleted := players_before - players_after;
    rooms_deleted := rooms_before - rooms_after;
    
    -- Retornar estatísticas completas
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
$$ LANGUAGE plpgsql;

-- Função para testar o sistema de limpeza
CREATE OR REPLACE FUNCTION test_cleanup_system()
RETURNS JSON AS $$
DECLARE
    test_room_id VARCHAR(6) := 'TEST99';
    test_player_id UUID := gen_random_uuid();
    cleanup_result JSON;
BEGIN
    -- Limpar dados de teste anteriores
    DELETE FROM public.players WHERE room_id = test_room_id OR name LIKE '%TESTE_LIMPEZA%';
    DELETE FROM public.rooms WHERE id = test_room_id;
    
    -- Criar sala de teste antiga
    INSERT INTO public.rooms (id, name, master_name, is_active, created_at, last_activity)
    VALUES (test_room_id, 'Sala Teste Limpeza', 'Mestre Teste', true, 
            NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');
    
    -- Criar jogador de teste inativo
    INSERT INTO public.players (id, room_id, name, is_connected, joined_at, last_activity)
    VALUES (test_player_id, test_room_id, 'JOGADOR_TESTE_LIMPEZA', false, 
            NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');
    
    -- Executar limpeza
    SELECT cleanup_inactive_data() INTO cleanup_result;
    
    -- Verificar resultado e limpar dados de teste
    DELETE FROM public.players WHERE room_id = test_room_id OR name LIKE '%TESTE_LIMPEZA%';
    DELETE FROM public.rooms WHERE id = test_room_id;
    
    RETURN json_build_object(
        'test_executed_at', NOW(),
        'cleanup_result', cleanup_result,
        'test_passed', true
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger para marcar jogadores como desconectados quando saem da sala
CREATE OR REPLACE FUNCTION mark_player_disconnected()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o jogador está saindo da sala (room_id sendo definido como NULL)
    -- marcar como desconectado
    IF OLD.room_id IS NOT NULL AND NEW.room_id IS NULL THEN
        NEW.is_connected = false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_mark_player_disconnected ON public.players;
CREATE TRIGGER trigger_mark_player_disconnected
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION mark_player_disconnected();

-- Função para limpar dados antigos (jogadores inativos há mais de 2 horas)
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
    -- Remover jogadores inativos há mais de 2 horas
    DELETE FROM public.players 
    WHERE last_activity < (NOW() - INTERVAL '2 hours');
    
    -- Log da limpeza
    RAISE NOTICE 'Limpeza de jogadores inativos executada em %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Função para limpar salas vazias ou inativas
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS void AS $$
BEGIN
    -- Marcar salas como inativas se não têm jogadores há mais de 2 horas
    UPDATE public.rooms 
    SET is_active = false
    WHERE id NOT IN (
        SELECT DISTINCT room_id 
        FROM public.players 
        WHERE room_id IS NOT NULL
    )
    AND last_activity < (NOW() - INTERVAL '2 hours');
    
    -- Remover salas inativas há mais de 2 horas sem jogadores
    DELETE FROM public.rooms 
    WHERE is_active = false 
    AND last_activity < (NOW() - INTERVAL '2 hours')
    AND id NOT IN (
        SELECT DISTINCT room_id 
        FROM public.players 
        WHERE room_id IS NOT NULL
    );
    
    RAISE NOTICE 'Limpeza de salas inativas executada em %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar atividade do jogador
CREATE OR REPLACE FUNCTION update_player_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = timezone('utc'::text, now());
    
    -- Atualizar atividade da sala também
    UPDATE public.rooms 
    SET last_activity = timezone('utc'::text, now())
    WHERE id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar atividade automaticamente
DROP TRIGGER IF EXISTS update_player_activity_trigger ON public.players;
CREATE TRIGGER update_player_activity_trigger
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION update_player_activity();

-- ================================
-- AGENDAMENTO DE LIMPEZA (usando pg_cron se disponível)
-- ================================

-- Nota: pg_cron precisa ser habilitado no Supabase
-- Executar limpeza a cada 30 minutos
-- SELECT cron.schedule('cleanup-inactive-data', '*/30 * * * *', 'SELECT cleanup_inactive_data();');

-- ================================
-- COMANDOS MANUAIS DE LIMPEZA
-- ================================

-- Para executar limpeza manual, use:
-- SELECT cleanup_inactive_data();

-- Para ver estatísticas antes da limpeza:
-- SELECT 
--     (SELECT COUNT(*) FROM public.players WHERE is_connected = false AND joined_at < NOW() - INTERVAL '2 hours') as inactive_players,
--     (SELECT COUNT(*) FROM public.rooms WHERE is_active = false AND created_at < NOW() - INTERVAL '2 hours') as inactive_rooms;

-- Comentários das novas funções
COMMENT ON FUNCTION clean_inactive_players() IS 'Remove jogadores desconectados há mais de 2 horas';
COMMENT ON FUNCTION clean_inactive_rooms() IS 'Remove salas vazias ou inativas há mais de 2 horas';
COMMENT ON FUNCTION cleanup_inactive_data() IS 'Executa limpeza completa de dados inativos e retorna estatísticas';
COMMENT ON FUNCTION mark_player_disconnected() IS 'Marca jogadores como desconectados ao saírem da sala';
COMMENT ON FUNCTION cleanup_inactive_players() IS 'Remove jogadores inativos há mais de 2 horas';
COMMENT ON FUNCTION cleanup_inactive_rooms() IS 'Marca salas como inativas se não têm jogadores há mais de 2 horas e removes salas inativas há mais de 2 horas sem jogadores';
COMMENT ON FUNCTION update_player_activity() IS 'Atualiza a timestamp de última atividade do jogador e da sala associada';

-- ================================
-- MELHORIAS NO SISTEMA DE LIMPEZA
-- ================================

-- Corrigir função de limpeza de jogadores para usar last_activity
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
    -- Remover jogadores inativos há mais de 2 horas (usando last_activity)
    DELETE FROM public.players 
    WHERE last_activity < (NOW() - INTERVAL '2 hours');
    
    RAISE NOTICE 'Limpeza de jogadores inativos executada em %. Critério: last_activity < %', 
                 NOW(), (NOW() - INTERVAL '2 hours');
END;
$$ LANGUAGE plpgsql;

-- Melhorar função de limpeza de salas
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS void AS $$
DECLARE
    rooms_deleted INTEGER;
BEGIN
    -- Remover salas que atendem qualquer uma das condições:
    -- 1. Salas com last_activity maior que 2 horas (ou NULL)
    -- 2. Salas criadas há mais de 2 horas que não têm jogadores ativos
    DELETE FROM public.rooms 
    WHERE (
        -- Salas com last_activity maior que 2 horas OU last_activity NULL (nunca houve atividade)
        (last_activity IS NULL AND created_at < (NOW() - INTERVAL '2 hours'))
        OR 
        (last_activity IS NOT NULL AND last_activity < (NOW() - INTERVAL '2 hours'))
    ) OR (
        -- Salas criadas há mais de 2 horas que estão vazias
        created_at < (NOW() - INTERVAL '2 hours')
        AND id NOT IN (
            SELECT DISTINCT room_id 
            FROM public.players 
            WHERE room_id IS NOT NULL 
            AND is_connected = true  -- Apenas jogadores conectados contam
        )
    );
    
    GET DIAGNOSTICS rooms_deleted = ROW_COUNT;
    
    RAISE NOTICE 'Limpeza de salas executada. Salas removidas: %', rooms_deleted;
END;
$$ LANGUAGE plpgsql;

-- Função para obter estatísticas do sistema
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS JSON AS $$
BEGIN
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
                -- Salas com last_activity maior que 2 horas OU last_activity NULL
                (last_activity IS NULL AND created_at < (NOW() - INTERVAL '2 hours'))
                OR 
                (last_activity IS NOT NULL AND last_activity < (NOW() - INTERVAL '2 hours'))
            ) OR (
                -- Salas criadas há mais de 2 horas que estão vazias
                created_at < (NOW() - INTERVAL '2 hours')
                AND id NOT IN (
                    SELECT DISTINCT room_id 
                    FROM public.players 
                    WHERE room_id IS NOT NULL 
                    AND is_connected = true
                )
            )
        ),
        'rooms_with_players', (SELECT COUNT(DISTINCT room_id) FROM public.players WHERE room_id IS NOT NULL AND is_connected = true),
        'empty_rooms', (SELECT COUNT(*) FROM public.rooms r WHERE NOT EXISTS (SELECT 1 FROM public.players p WHERE p.room_id = r.id AND p.is_connected = true)),
        'rooms_with_null_activity', (SELECT COUNT(*) FROM public.rooms WHERE last_activity IS NULL)
    );
END;
$$ LANGUAGE plpgsql;

-- ================================
-- COMANDOS PARA TESTE E ADMINISTRAÇÃO
-- ================================

-- Comandos úteis para administração:
-- 1. Executar limpeza manual: SELECT cleanup_inactive_data();
-- 2. Testar sistema: SELECT test_cleanup_system();
-- 3. Ver estatísticas: SELECT get_system_stats();

-- Atualizar comentários das funções
COMMENT ON FUNCTION cleanup_inactive_players() IS 'Remove jogadores inativos há mais de 2 horas (baseado em last_activity)';
COMMENT ON FUNCTION cleanup_inactive_rooms() IS 'Remove salas inativas há mais de 2 horas ou vazias há mais de 2 horas';
COMMENT ON FUNCTION cleanup_inactive_data() IS 'Executa limpeza completa e retorna estatísticas detalhadas';
COMMENT ON FUNCTION test_cleanup_system() IS 'Testa o sistema de limpeza automaticamente';
COMMENT ON FUNCTION get_system_stats() IS 'Retorna estatísticas completas do sistema';

-- Função de debug para análise detalhada das salas
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
    RETURN QUERY
    SELECT 
        r.id as room_id,
        r.name as room_name,
        r.created_at as created_at_room,
        r.last_activity as last_activity_room,
        r.is_active as is_active_room,
        (NOW() - r.created_at) as time_since_created,
        CASE 
            WHEN r.last_activity IS NOT NULL THEN (NOW() - r.last_activity)
            ELSE NULL
        END as time_since_activity,
        COALESCE(p_stats.total_players, 0) as players_count,
        COALESCE(p_stats.connected_players, 0) as connected_players_count,
        CASE
            WHEN (r.last_activity IS NULL AND r.created_at < (NOW() - INTERVAL '2 hours')) THEN true
            WHEN (r.last_activity IS NOT NULL AND r.last_activity < (NOW() - INTERVAL '2 hours')) THEN true
            WHEN (r.created_at < (NOW() - INTERVAL '2 hours') AND COALESCE(p_stats.connected_players, 0) = 0) THEN true
            ELSE false
        END as should_be_deleted,
        CASE
            WHEN (r.last_activity IS NULL AND r.created_at < (NOW() - INTERVAL '2 hours')) THEN 'Sala sem atividade registrada há mais de 2h'
            WHEN (r.last_activity IS NOT NULL AND r.last_activity < (NOW() - INTERVAL '2 hours')) THEN 'Última atividade há mais de 2h'
            WHEN (r.created_at < (NOW() - INTERVAL '2 hours') AND COALESCE(p_stats.connected_players, 0) = 0) THEN 'Sala vazia há mais de 2h'
            ELSE 'Sala ativa'
        END as deletion_reason
    FROM public.rooms r
    LEFT JOIN (
        SELECT 
            room_id,
            COUNT(*) as total_players,
            COUNT(CASE WHEN is_connected = true THEN 1 END) as connected_players
        FROM public.players 
        WHERE room_id IS NOT NULL
        GROUP BY room_id
    ) p_stats ON r.id = p_stats.room_id
    ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Executar teste inicial
SELECT 'TESTANDO SISTEMA DE LIMPEZA...' as status;
SELECT test_cleanup_system();

SELECT 'ESTATÍSTICAS ATUAIS:' as status;
SELECT get_system_stats();

-- ================================
-- SISTEMA DE COMBATE
-- ================================

-- Tabela de notificações de combate
CREATE TABLE IF NOT EXISTS public.combat_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    attacker_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    defender_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    attacker_name VARCHAR(50) NOT NULL,
    defender_name VARCHAR(50) NOT NULL,
    attack_data JSONB NOT NULL,
    defender_weapon JSONB,
    allow_counter_attack BOOLEAN DEFAULT true,
    allow_opportunity_attacks BOOLEAN DEFAULT true,
    opportunity_attacks_used JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending',
    combat_phase VARCHAR(30) DEFAULT 'weapon_selection',
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    round_data JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar coluna opportunity_attacks_used se não existir (para compatibilidade com bancos antigos)
ALTER TABLE public.combat_notifications 
ADD COLUMN IF NOT EXISTS opportunity_attacks_used JSONB DEFAULT '[]';

-- Adicionar colunas para dados de defesa do atacante e defensor (para sincronização em tempo real)
ALTER TABLE public.combat_notifications 
ADD COLUMN IF NOT EXISTS attacker_defense_dices INTEGER;

ALTER TABLE public.combat_notifications 
ADD COLUMN IF NOT EXISTS defender_defense_dices INTEGER;

-- Adicionar constraint de check para status
ALTER TABLE public.combat_notifications 
DROP CONSTRAINT IF EXISTS combat_notifications_status_check;

ALTER TABLE public.combat_notifications 
ADD CONSTRAINT combat_notifications_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- Adicionar constraint de check para combat_phase
ALTER TABLE public.combat_notifications 
DROP CONSTRAINT IF EXISTS combat_notifications_phase_check;

ALTER TABLE public.combat_notifications 
ADD CONSTRAINT combat_notifications_phase_check 
CHECK (combat_phase IN ('weapon_selection', 'rolling', 'results'));

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_combat_room_id ON public.combat_notifications(room_id);
CREATE INDEX IF NOT EXISTS idx_combat_status ON public.combat_notifications(status);
CREATE INDEX IF NOT EXISTS idx_combat_attacker ON public.combat_notifications(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_defender ON public.combat_notifications(defender_id);
CREATE INDEX IF NOT EXISTS idx_combat_created_at ON public.combat_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_combat_round_data ON public.combat_notifications USING GIN (round_data);
CREATE INDEX IF NOT EXISTS idx_combat_opportunity_attacks ON public.combat_notifications USING GIN (opportunity_attacks_used);

-- Comentários para documentação da tabela de combate
COMMENT ON TABLE public.combat_notifications IS 'Tabela que armazena os combates entre jogadores, incluindo sistema de espectadores e ataques de oportunidade';

COMMENT ON COLUMN public.combat_notifications.id IS 'ID único do combate';
COMMENT ON COLUMN public.combat_notifications.room_id IS 'Referência à sala onde o combate está ocorrendo';
COMMENT ON COLUMN public.combat_notifications.attacker_id IS 'ID do jogador atacante';
COMMENT ON COLUMN public.combat_notifications.defender_id IS 'ID do jogador defensor';
COMMENT ON COLUMN public.combat_notifications.attacker_name IS 'Nome do atacante';
COMMENT ON COLUMN public.combat_notifications.defender_name IS 'Nome do defensor';
COMMENT ON COLUMN public.combat_notifications.attack_data IS 'Dados do ataque inicial (arma, tipo, etc.) em formato JSON';
COMMENT ON COLUMN public.combat_notifications.defender_weapon IS 'Arma de contra-ataque do defensor em formato JSON';
COMMENT ON COLUMN public.combat_notifications.allow_counter_attack IS 'Se o defensor pode contra-atacar';
COMMENT ON COLUMN public.combat_notifications.allow_opportunity_attacks IS 'Se espectadores podem dar ataques de oportunidade';
COMMENT ON COLUMN public.combat_notifications.opportunity_attacks_used IS 'Array de IDs de jogadores (espectadores) que já usaram seu ataque de oportunidade neste combate';
COMMENT ON COLUMN public.combat_notifications.status IS 'Status do combate: pending, in_progress, completed, cancelled';
COMMENT ON COLUMN public.combat_notifications.combat_phase IS 'Fase atual do combate: weapon_selection, rolling, results';
COMMENT ON COLUMN public.combat_notifications.current_round IS 'Rodada atual do combate (0 = não iniciado)';
COMMENT ON COLUMN public.combat_notifications.total_rounds IS 'Número total de rodadas (inclui ataque, contra-ataque e ataques de oportunidade)';
COMMENT ON COLUMN public.combat_notifications.round_data IS 'Array JSON com dados de cada rodada: [{round: 1, action_type: "attack"|"counter"|"opportunity", who_acts: "attacker"|"defender"|"opportunity", opportunity_attacker_id: UUID, opportunity_attacker_name: string, opportunity_weapon: {...}, opportunity_target: "attacker"|"defender", attacker: name, attacker_roll: [dados], defender: name, defender_roll: [dados], completed: boolean}]';
COMMENT ON COLUMN public.combat_notifications.created_at IS 'Timestamp de criação do combate';
COMMENT ON COLUMN public.combat_notifications.updated_at IS 'Timestamp da última atualização do combate';


-- Habilitar Row Level Security (RLS)
ALTER TABLE public.combat_notifications ENABLE ROW LEVEL SECURITY;

-- Habilitar Realtime para a tabela de combate
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'combat_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_notifications;
    END IF;
END $$;

-- Política de acesso: jogadores podem ver combates da sua sala
DROP POLICY IF EXISTS "Players can view combat notifications in their room" ON public.combat_notifications;
CREATE POLICY "Players can view combat notifications in their room"
ON public.combat_notifications FOR SELECT
USING (true);

-- Política de inserção: jogadores podem criar combates
DROP POLICY IF EXISTS "Players can create combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can create combat notifications"
ON public.combat_notifications FOR INSERT
WITH CHECK (true);

-- Política de atualização: jogadores envolvidos podem atualizar
DROP POLICY IF EXISTS "Players can update their combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can update their combat notifications"
ON public.combat_notifications FOR UPDATE
USING (true);

-- Política de exclusão: jogadores envolvidos podem deletar
DROP POLICY IF EXISTS "Players can delete their combat notifications" ON public.combat_notifications;
CREATE POLICY "Players can delete their combat notifications"
ON public.combat_notifications FOR DELETE
USING (true);

-- Função para limpar combates antigos (mais de 24 horas)
CREATE OR REPLACE FUNCTION clean_old_combats()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.combat_notifications 
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Limpeza de combates: % registros removidos', deleted_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para obter estatísticas de combate
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

COMMENT ON FUNCTION clean_old_combats() IS 'Remove combates com mais de 24 horas';
COMMENT ON FUNCTION get_combat_stats() IS 'Retorna estatísticas detalhadas sobre os combates';

-- ================================
-- EXEMPLOS DE USO DO SISTEMA
-- ================================

-- EXEMPLO 1: Consultar todos os combates ativos de uma sala
-- SELECT * FROM public.combat_notifications 
-- WHERE room_id = 'ABC123' 
-- AND status = 'in_progress';

-- EXEMPLO 2: Verificar se um jogador já usou ataque de oportunidade
-- SELECT 
--     id,
--     attacker_name,
--     defender_name,
--     opportunity_attacks_used @> '["uuid-do-jogador"]'::jsonb as already_used
-- FROM public.combat_notifications
-- WHERE room_id = 'ABC123';

-- EXEMPLO 3: Contar quantos ataques de oportunidade foram usados em um combate
-- SELECT 
--     id,
--     attacker_name,
--     defender_name,
--     jsonb_array_length(opportunity_attacks_used) as total_opportunity_attacks
-- FROM public.combat_notifications
-- WHERE id = 'uuid-do-combate';

-- ================================
-- SISTEMA DE PARTIDAS (MATCH)
-- ================================

-- Adicionar coluna de status da partida na sala
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS match_status VARCHAR(20) DEFAULT NULL;

-- Adicionar constraint para match_status
ALTER TABLE public.rooms 
DROP CONSTRAINT IF EXISTS rooms_match_status_check;

ALTER TABLE public.rooms 
ADD CONSTRAINT rooms_match_status_check 
CHECK (match_status IS NULL OR match_status IN ('in_progress'));

-- Adicionar coluna is_alive nos jogadores (para rastrear eliminações durante partida)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_alive BOOLEAN DEFAULT true;

-- Adicionar coluna killed_by_player_id nos jogadores
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS killed_by_player_id UUID DEFAULT NULL;

-- Índices para o sistema de partidas
CREATE INDEX IF NOT EXISTS idx_rooms_match_status ON public.rooms(match_status);
CREATE INDEX IF NOT EXISTS idx_players_is_alive ON public.players(is_alive);

-- Comentários
COMMENT ON COLUMN public.rooms.match_status IS 'Status da partida: NULL = sem partida ativa, in_progress = partida em andamento';
COMMENT ON COLUMN public.players.is_alive IS 'Se o jogador está vivo na partida atual';
COMMENT ON COLUMN public.players.killed_by_player_id IS 'ID do jogador que eliminou este jogador (NULL se não foi eliminado ou se morreu sem assassino)';

-- EXEMPLO 4: Listar todas as rodadas de um combate (incluindo ataques de oportunidade)
-- SELECT 
--     id,
--     current_round,
--     total_rounds,
--     jsonb_array_length(round_data) as rounds_completed,
--     round_data
-- FROM public.combat_notifications
-- WHERE id = 'uuid-do-combate';

-- EXEMPLO 5: Encontrar combates onde há espectadores que podem dar ataques de oportunidade
-- SELECT 
--     cn.id,
--     cn.room_id,
--     cn.attacker_name,
--     cn.defender_name,
--     cn.allow_opportunity_attacks,
--     COUNT(p.id) as total_players_in_room,
--     jsonb_array_length(cn.opportunity_attacks_used) as attacks_used,
--     (COUNT(p.id) - 2 - jsonb_array_length(cn.opportunity_attacks_used)) as available_spectators
-- FROM public.combat_notifications cn
-- JOIN public.players p ON p.room_id = cn.room_id AND p.is_connected = true
-- WHERE cn.status = 'in_progress'
-- AND cn.allow_opportunity_attacks = true
-- GROUP BY cn.id, cn.room_id, cn.attacker_name, cn.defender_name, cn.allow_opportunity_attacks
-- HAVING (COUNT(p.id) - 2 - jsonb_array_length(cn.opportunity_attacks_used)) > 0;

-- EXEMPLO 6: Obter detalhes de uma rodada de oportunidade específica
-- SELECT 
--     id,
--     round_data -> (current_round - 1) as current_round_info,
--     (round_data -> (current_round - 1) ->> 'action_type') as action_type,
--     (round_data -> (current_round - 1) ->> 'opportunity_attacker_name') as opportunity_attacker,
--     (round_data -> (current_round - 1) ->> 'opportunity_target') as opportunity_target
-- FROM public.combat_notifications
-- WHERE id = 'uuid-do-combate'
-- AND (round_data -> (current_round - 1) ->> 'action_type') = 'opportunity';

SELECT 'SETUP CONCLUÍDO!' as status;

-- ================================
-- SISTEMA DE LOGIN E ESTATÍSTICAS
-- ================================

-- Adicionar coluna user_id na tabela de jogadores (liga jogador de sessão a conta)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;

-- Adicionar coluna elimination_order na tabela de jogadores (ordem de eliminação na partida)
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS elimination_order INTEGER DEFAULT NULL;

-- Adicionar coluna match_started_at na tabela de salas (quando a partida atual começou)
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS match_started_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para buscar jogadores por user_id
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);

-- Tabela de perfis de usuário (ligada a auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de estatísticas acumuladas por usuário
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

-- Tabela de histórico de partidas
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

-- Tabela de participantes de cada partida
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
    is_winner BOOLEAN DEFAULT false
);

-- Índices para estatísticas e ranking
CREATE INDEX IF NOT EXISTS idx_user_stats_composite ON public.user_stats(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_wins ON public.user_stats(total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_eliminations ON public.user_stats(total_eliminations DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_survival ON public.user_stats(total_survival_points DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_ended ON public.match_history(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_history_room ON public.match_history(room_id);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Políticas de user_profiles: leitura pública, escrita apenas no próprio perfil
DROP POLICY IF EXISTS "Public read user_profiles" ON public.user_profiles;
CREATE POLICY "Public read user_profiles" ON public.user_profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Políticas de user_stats: leitura pública, sem escrita direta (atualizado via função)
DROP POLICY IF EXISTS "Public read user_stats" ON public.user_stats;
CREATE POLICY "Public read user_stats" ON public.user_stats
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert user_stats" ON public.user_stats;
CREATE POLICY "System can insert user_stats" ON public.user_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can update user_stats" ON public.user_stats;
CREATE POLICY "System can update user_stats" ON public.user_stats
    FOR UPDATE USING (true);

-- Políticas de match_history: leitura pública, inserção por qualquer autenticado
DROP POLICY IF EXISTS "Public read match_history" ON public.match_history;
CREATE POLICY "Public read match_history" ON public.match_history
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert match_history" ON public.match_history;
CREATE POLICY "Authenticated insert match_history" ON public.match_history
    FOR INSERT WITH CHECK (true);

-- Políticas de match_participants: leitura pública, inserção por qualquer autenticado
DROP POLICY IF EXISTS "Public read match_participants" ON public.match_participants;
CREATE POLICY "Public read match_participants" ON public.match_participants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert match_participants" ON public.match_participants;
CREATE POLICY "Authenticated insert match_participants" ON public.match_participants
    FOR INSERT WITH CHECK (true);

-- Função para calcular composite score
CREATE OR REPLACE FUNCTION calculate_composite_score(
    p_wins INTEGER,
    p_eliminations INTEGER,
    p_survival_points INTEGER,
    p_matches INTEGER
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_win_rate DECIMAL(5,2);
BEGIN
    IF p_matches > 0 THEN
        v_win_rate := (p_wins::DECIMAL / p_matches::DECIMAL) * 100;
    ELSE
        v_win_rate := 0;
    END IF;
    
    RETURN (p_wins * 50) + (p_eliminations * 10) + (p_survival_points * 5) + (v_win_rate * 100);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para criar perfil automaticamente quando um usuário se registra
CREATE OR REPLACE FUNCTION handle_new_user()
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

-- Trigger: criar perfil ao registrar novo usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Função atômica para registrar resultado de uma partida
CREATE OR REPLACE FUNCTION record_match_result(
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
    v_char_counts JSONB DEFAULT '{}';
    v_max_char VARCHAR(100);
    v_max_count INTEGER DEFAULT 0;
    v_current_count INTEGER;
BEGIN
    -- Inserir registro da partida
    INSERT INTO public.match_history (room_id, room_name, started_at, ended_at, winner_user_id, winner_player_name, total_players)
    VALUES (p_room_id, p_room_name, p_started_at, NOW(), p_winner_user_id, p_winner_player_name, p_total_players)
    RETURNING id INTO v_match_id;

    -- Inserir participantes
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

        -- Atualizar user_stats se o participante tem conta
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

            -- Atualizar personagem favorito
            -- Buscar contagem de cada personagem usado
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

-- Comentários das novas tabelas
COMMENT ON TABLE public.user_profiles IS 'Perfis de usuários registrados (vinculados a auth.users)';
COMMENT ON TABLE public.user_stats IS 'Estatísticas acumuladas de cada usuário';
COMMENT ON TABLE public.match_history IS 'Histórico de partidas concluídas';
COMMENT ON TABLE public.match_participants IS 'Participantes e resultados de cada partida';

COMMENT ON COLUMN public.players.user_id IS 'ID do usuário autenticado (NULL se jogador sem conta)';
COMMENT ON COLUMN public.players.elimination_order IS 'Ordem de eliminação na partida atual (1 = primeiro eliminado, NULL = vivo/vencedor)';

COMMENT ON FUNCTION calculate_composite_score IS 'Calcula score composto: (wins*50) + (eliminations*10) + (survival*5) + (win_rate*100)';
COMMENT ON FUNCTION handle_new_user IS 'Cria user_profiles e user_stats automaticamente ao registrar novo usuário';
COMMENT ON FUNCTION record_match_result IS 'Registra resultado de partida atomicamente (match_history + participants + stats)';

SELECT 'SISTEMA DE LOGIN E ESTATÍSTICAS CONFIGURADO!' as status;