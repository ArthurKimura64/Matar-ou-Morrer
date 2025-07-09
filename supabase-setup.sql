-- Criação das tabelas para o sistema de salas
-- Execute este código no editor SQL do Supabase

-- Tabela de salas
CREATE TABLE IF NOT EXISTS public.rooms (
    id VARCHAR(6) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    master_name VARCHAR(50) NOT NULL,
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
    FOR UPDATE USING (true);

-- Política para jogadores: permitir leitura e criação para todos
DROP POLICY IF EXISTS "Allow public read access on players" ON public.players;
CREATE POLICY "Allow public read access on players" ON public.players
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access on players" ON public.players;
CREATE POLICY "Allow public insert access on players" ON public.players
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access on players" ON public.players;
CREATE POLICY "Allow public update access on players" ON public.players
    FOR UPDATE USING (true);

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

SELECT 'SETUP CONCLUÍDO!' as status;
