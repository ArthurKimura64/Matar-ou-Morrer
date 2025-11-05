# Guia de Migração do Supabase

Este guia ajuda você a atualizar seu banco de dados Supabase existente para suportar todas as novas funcionalidades, especialmente o **Sistema de Ataques de Oportunidade**.

## 🎯 Objetivo

Atualizar a tabela `combat_notifications` para incluir:
- Campo `allow_opportunity_attacks` (permitir ataques de oportunidade)
- Campo `opportunity_attacks_used` (rastrear quem já usou)
- Índices GIN para melhor performance em queries JSON

## 📋 Pré-requisitos

- Acesso ao SQL Editor do Supabase
- Backup do banco de dados (recomendado)

## 🔄 Opção 1: Executar Setup Completo (Recomendado)

Se você está começando do zero ou quer garantir que tudo está correto:

1. Abra o **SQL Editor** no Supabase Dashboard
2. Cole todo o conteúdo de `supabase-setup.sql`
3. Clique em **Run**
4. Aguarde a execução (pode levar alguns segundos)

✅ **Vantagem**: Garante que todas as tabelas, colunas, índices e funções estão corretas.

⚠️ **Nota**: O script usa `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`, então é seguro executar em bancos existentes sem perder dados.

## 🔧 Opção 2: Migração Incremental (Apenas Novos Campos)

Se você já tem o banco configurado e quer apenas adicionar os campos novos:

### Passo 1: Adicionar campo `opportunity_attacks_used`

```sql
-- Adicionar coluna opportunity_attacks_used se não existir
ALTER TABLE public.combat_notifications 
ADD COLUMN IF NOT EXISTS opportunity_attacks_used JSONB DEFAULT '[]';
```

### Passo 2: Remover coluna antiga (se existir)

```sql
-- Remover coluna opportunity_attacks antiga (se existir)
ALTER TABLE public.combat_notifications 
DROP COLUMN IF EXISTS opportunity_attacks;
```

### Passo 3: Criar índices GIN para melhor performance

```sql
-- Criar índices GIN para busca eficiente em campos JSONB
CREATE INDEX IF NOT EXISTS idx_combat_round_data 
ON public.combat_notifications USING GIN (round_data);

CREATE INDEX IF NOT EXISTS idx_combat_opportunity_attacks 
ON public.combat_notifications USING GIN (opportunity_attacks_used);
```

### Passo 4: Atualizar comentários (opcional, mas recomendado)

```sql
-- Atualizar comentário da coluna
COMMENT ON COLUMN public.combat_notifications.opportunity_attacks_used IS 
'Array de IDs de jogadores (espectadores) que já usaram seu ataque de oportunidade neste combate';
```

### Passo 5: Criar funções de estatísticas

```sql
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

COMMENT ON FUNCTION get_combat_stats() IS 'Retorna estatísticas detalhadas sobre os combates';
```

## ✅ Verificação Pós-Migração

Após executar a migração, verifique se tudo está correto:

### 1. Verificar estrutura da tabela

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'combat_notifications' 
AND table_schema = 'public'
ORDER BY ordinal_position;
```

**Campos esperados:**
- `id` - uuid
- `room_id` - character varying(6)
- `attacker_id` - uuid
- `defender_id` - uuid
- `attacker_name` - character varying(50)
- `defender_name` - character varying(50)
- `attack_data` - jsonb
- `defender_weapon` - jsonb
- `allow_counter_attack` - boolean (default: true)
- `allow_opportunity_attacks` - boolean (default: true)
- `opportunity_attacks_used` - jsonb (default: '[]')
- `status` - character varying(20) (default: 'pending')
- `combat_phase` - character varying(30) (default: 'weapon_selection')
- `current_round` - integer (default: 0)
- `total_rounds` - integer (default: 0)
- `round_data` - jsonb (default: '[]')
- `created_at` - timestamp with time zone
- `updated_at` - timestamp with time zone

### 2. Verificar índices

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'combat_notifications'
AND schemaname = 'public';
```

**Índices esperados:**
- `combat_notifications_pkey` (PRIMARY KEY)
- `idx_combat_room_id`
- `idx_combat_status`
- `idx_combat_attacker`
- `idx_combat_defender`
- `idx_combat_created_at`
- `idx_combat_round_data` (GIN)
- `idx_combat_opportunity_attacks` (GIN)

### 3. Testar estatísticas

```sql
SELECT get_combat_stats();
```

**Resultado esperado:**
```json
{
  "timestamp": "2025-11-05T...",
  "total_combats": 0,
  "active_combats": 0,
  "pending_combats": 0,
  "completed_combats": 0,
  "combats_with_opportunity_attacks": 0,
  "total_opportunity_attacks": 0,
  "combats_by_room": null
}
```

### 4. Testar query de verificação

```sql
-- Teste básico: criar combate de teste e verificar campos
INSERT INTO public.combat_notifications (
    room_id,
    attacker_id,
    defender_id,
    attacker_name,
    defender_name,
    attack_data,
    allow_opportunity_attacks,
    opportunity_attacks_used
) VALUES (
    'TEST99',
    gen_random_uuid(),
    gen_random_uuid(),
    'Atacante Teste',
    'Defensor Teste',
    '{"weapon": "Espada"}'::jsonb,
    true,
    '[]'::jsonb
) RETURNING *;

-- Verificar se foi criado corretamente
SELECT 
    id,
    allow_opportunity_attacks,
    opportunity_attacks_used,
    jsonb_array_length(opportunity_attacks_used) as total_used
FROM public.combat_notifications
WHERE room_id = 'TEST99';

-- Limpar teste
DELETE FROM public.combat_notifications WHERE room_id = 'TEST99';
```

## 🔄 Atualizar Combates Existentes (Opcional)

Se você tem combates existentes que não têm o campo `opportunity_attacks_used`, você pode atualizá-los:

```sql
-- Atualizar combates existentes sem o campo
UPDATE public.combat_notifications
SET opportunity_attacks_used = '[]'::jsonb
WHERE opportunity_attacks_used IS NULL;

-- Verificar quantos foram atualizados
SELECT COUNT(*) 
FROM public.combat_notifications 
WHERE opportunity_attacks_used IS NOT NULL;
```

## 🐛 Troubleshooting

### Erro: "column already exists"

Se você receber erro de coluna já existente:

```sql
-- Verificar se a coluna existe
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'combat_notifications' 
AND column_name = 'opportunity_attacks_used';

-- Se existir mas com nome diferente (ex: opportunity_attacks), renomear:
ALTER TABLE public.combat_notifications 
RENAME COLUMN opportunity_attacks TO opportunity_attacks_used;
```

### Erro: "index already exists"

Se você receber erro de índice já existente:

```sql
-- Listar índices existentes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'combat_notifications';

-- Remover índice antigo se necessário
DROP INDEX IF EXISTS idx_combat_opportunity_attacks;

-- Recriar com a configuração correta
CREATE INDEX idx_combat_opportunity_attacks 
ON public.combat_notifications USING GIN (opportunity_attacks_used);
```

### Erro: "function already exists"

Se você receber erro de função já existente:

```sql
-- Remover função antiga
DROP FUNCTION IF EXISTS get_combat_stats();

-- Recriar com a nova definição
-- (executar o código da função do Passo 5)
```

## 📊 Monitoramento Pós-Migração

Após a migração, monitore o sistema:

```sql
-- Ver estatísticas gerais
SELECT get_system_stats();

-- Ver estatísticas de combate
SELECT get_combat_stats();

-- Ver combates ativos com ataques de oportunidade
SELECT 
    id,
    room_id,
    attacker_name,
    defender_name,
    allow_opportunity_attacks,
    jsonb_array_length(opportunity_attacks_used) as attacks_used,
    current_round,
    total_rounds
FROM public.combat_notifications
WHERE status = 'in_progress'
AND allow_opportunity_attacks = true;
```

## ✨ Conclusão

Após seguir este guia, seu banco de dados estará atualizado e pronto para usar o **Sistema de Ataques de Oportunidade**!

### Próximos Passos:

1. ✅ Testar criação de combate com `allow_opportunity_attacks = true`
2. ✅ Testar adicionar IDs ao array `opportunity_attacks_used`
3. ✅ Testar queries de verificação de espectadores disponíveis
4. ✅ Monitorar performance das queries com índices GIN

Para mais informações, consulte:
- `OPPORTUNITY_ATTACK_SYSTEM.md` - Documentação do sistema
- `SUPABASE_REFERENCE.md` - Referência rápida de queries
- `supabase-setup.sql` - Script completo de configuração
