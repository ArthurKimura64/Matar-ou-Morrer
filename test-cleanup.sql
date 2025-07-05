-- Script de teste para verificar o sistema de limpeza automática
-- Execute no editor SQL do Supabase para testar as funções

-- 1. Verificar se as funções existem
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('cleanup_inactive_players', 'cleanup_inactive_rooms', 'cleanup_inactive_data');

-- 2. Verificar a estrutura das tabelas
\d players;
\d rooms;

-- 3. Criar dados de teste
-- Inserir uma sala de teste
INSERT INTO public.rooms (id, name, master_name, is_active, created_at, last_activity)
VALUES ('TEST01', 'Sala de Teste', 'Mestre Teste', true, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours');

-- Inserir jogadores de teste (alguns inativos)
INSERT INTO public.players (id, room_id, name, is_connected, joined_at, last_activity)
VALUES 
  (gen_random_uuid(), 'TEST01', 'Jogador Ativo', true, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes'),
  (gen_random_uuid(), 'TEST01', 'Jogador Inativo 1', false, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), 'TEST01', 'Jogador Inativo 2', false, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'),
  (gen_random_uuid(), NULL, 'Jogador Sem Sala', false, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');

-- 4. Verificar dados antes da limpeza
SELECT 'ANTES DA LIMPEZA' as status;

SELECT 'Jogadores:' as tipo, COUNT(*) as total 
FROM public.players;

SELECT 'Jogadores inativos (>2h):' as tipo, COUNT(*) as total 
FROM public.players 
WHERE last_activity < (NOW() - INTERVAL '2 hours');

SELECT 'Salas:' as tipo, COUNT(*) as total 
FROM public.rooms;

SELECT 'Salas inativas (>2h):' as tipo, COUNT(*) as total 
FROM public.rooms 
WHERE last_activity < (NOW() - INTERVAL '2 hours');

-- 5. Executar limpeza de jogadores
SELECT 'EXECUTANDO LIMPEZA DE JOGADORES...' as status;
SELECT cleanup_inactive_players();

-- 6. Executar limpeza de salas
SELECT 'EXECUTANDO LIMPEZA DE SALAS...' as status;
SELECT cleanup_inactive_rooms();

-- 7. Verificar dados após a limpeza
SELECT 'APÓS A LIMPEZA' as status;

SELECT 'Jogadores restantes:' as tipo, COUNT(*) as total 
FROM public.players;

SELECT 'Salas restantes:' as tipo, COUNT(*) as total 
FROM public.rooms;

-- 8. Testar função combinada de limpeza
INSERT INTO public.rooms (id, name, master_name, is_active, created_at, last_activity)
VALUES ('TEST02', 'Outra Sala Teste', 'Outro Mestre', true, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours');

INSERT INTO public.players (id, room_id, name, is_connected, joined_at, last_activity)
VALUES 
  (gen_random_uuid(), 'TEST02', 'Teste Inativo', false, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours');

-- Executar limpeza combinada
SELECT 'EXECUTANDO LIMPEZA COMBINADA...' as status;
SELECT cleanup_inactive_data();

-- 9. Verificar resultado final
SELECT 'RESULTADO FINAL' as status;

SELECT 'Total de jogadores:' as tipo, COUNT(*) as total 
FROM public.players;

SELECT 'Total de salas:' as tipo, COUNT(*) as total 
FROM public.rooms;

-- 10. Limpar dados de teste restantes
DELETE FROM public.players WHERE name LIKE '%Teste%';
DELETE FROM public.rooms WHERE id LIKE 'TEST%';

SELECT 'DADOS DE TESTE REMOVIDOS' as status;
