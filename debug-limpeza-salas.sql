-- TESTE ESPECÍFICO PARA LIMPEZA DE SALAS
-- Execute este SQL no painel admin ou diretamente no Supabase

-- 1. Ver estatísticas atuais
SELECT 'ESTATÍSTICAS ATUAIS:' as status;
SELECT get_system_stats();

-- 2. Ver salas que deveriam ser removidas
SELECT 'SALAS QUE DEVERIAM SER REMOVIDAS:' as status;
SELECT 
    id, 
    name, 
    created_at,
    last_activity,
    is_active,
    (NOW() - last_activity) as tempo_inativo,
    (NOW() - created_at) as tempo_existencia,
    (SELECT COUNT(*) FROM public.players WHERE room_id = r.id) as jogadores_na_sala
FROM public.rooms r
WHERE (
    last_activity < (NOW() - INTERVAL '2 hours')
) OR (
    created_at < (NOW() - INTERVAL '2 hours')
    AND id NOT IN (
        SELECT DISTINCT room_id 
        FROM public.players 
        WHERE room_id IS NOT NULL
    )
);

-- 3. Ver todas as salas e seus jogadores
SELECT 'TODAS AS SALAS:' as status;
SELECT 
    r.id, 
    r.name, 
    r.created_at,
    r.last_activity,
    r.is_active,
    COUNT(p.id) as jogadores_count
FROM public.rooms r
LEFT JOIN public.players p ON r.id = p.room_id
GROUP BY r.id, r.name, r.created_at, r.last_activity, r.is_active
ORDER BY r.created_at DESC;

-- 4. Testar a limpeza (sem executar, apenas simulação)
SELECT 'SIMULAÇÃO DE LIMPEZA:' as status;
SELECT COUNT(*) as salas_que_seriam_removidas
FROM public.rooms 
WHERE (
    last_activity < (NOW() - INTERVAL '2 hours')
) OR (
    created_at < (NOW() - INTERVAL '2 hours')
    AND id NOT IN (
        SELECT DISTINCT room_id 
        FROM public.players 
        WHERE room_id IS NOT NULL
    )
);
