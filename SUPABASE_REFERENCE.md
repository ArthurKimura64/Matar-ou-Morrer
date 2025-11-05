# Referência Rápida do Supabase

## 📋 Estrutura do Banco de Dados

### Tabela: `rooms`
Armazena as salas de jogo criadas pelos mestres.

**Campos principais:**
- `id` (VARCHAR(6)) - Código único da sala
- `name` (VARCHAR(100)) - Nome da sala
- `master_name` (VARCHAR(50)) - Nome do mestre
- `is_active` (BOOLEAN) - Se a sala está ativa
- `last_activity` (TIMESTAMP) - Última atividade na sala
- `created_at` (TIMESTAMP) - Data de criação

### Tabela: `players`
Armazena os jogadores conectados às salas.

**Campos principais:**
- `id` (UUID) - ID único do jogador
- `room_id` (VARCHAR(6)) - Sala onde está conectado
- `name` (VARCHAR(50)) - Nome do jogador
- `character` (JSONB) - Dados completos do personagem
- `character_name` (VARCHAR(100)) - Nome do personagem
- `status` (VARCHAR(20)) - Status: 'selecting', 'creating', 'ready'
- `is_connected` (BOOLEAN) - Se está conectado
- `counters` (JSONB) - Contadores (vida, esquiva, oportunidade, itens)
- `characteristics` (JSONB) - Quantidade de características
- `selections` (JSONB) - Seleções do personagem (ataques, armas, etc.)
- `used_items` (JSONB) - Array de itens usados
- `unlocked_items` (JSONB) - Array de itens desbloqueados
- `additional_counters` (JSONB) - Contadores específicos (munição, energia)
- `exposed_cards` (JSONB) - Cartas expostas na mesa
- `defense_dice_count` (INTEGER) - Número de dados de defesa
- `last_activity` (TIMESTAMP) - Última atividade

### Tabela: `combat_notifications`
Armazena os combates entre jogadores, incluindo sistema de espectadores e ataques de oportunidade.

**Campos principais:**
- `id` (UUID) - ID único do combate
- `room_id` (VARCHAR(6)) - Sala onde ocorre o combate
- `attacker_id` (UUID) - ID do atacante
- `defender_id` (UUID) - ID do defensor
- `attacker_name` (VARCHAR(50)) - Nome do atacante
- `defender_name` (VARCHAR(50)) - Nome do defensor
- `attack_data` (JSONB) - Dados do ataque inicial
- `defender_weapon` (JSONB) - Arma de contra-ataque
- `allow_counter_attack` (BOOLEAN) - Se permite contra-ataque
- `allow_opportunity_attacks` (BOOLEAN) - **Se permite ataques de oportunidade**
- `opportunity_attacks_used` (JSONB) - **Array de IDs de espectadores que já usaram ataque de oportunidade**
- `status` (VARCHAR(20)) - Status: 'pending', 'in_progress', 'completed', 'cancelled'
- `combat_phase` (VARCHAR(30)) - Fase: 'weapon_selection', 'rolling', 'results'
- `current_round` (INTEGER) - Rodada atual (0 = não iniciado)
- `total_rounds` (INTEGER) - Total de rodadas (inclui ataques de oportunidade)
- `round_data` (JSONB) - **Array com dados de cada rodada**
- `created_at` (TIMESTAMP) - Data de criação
- `updated_at` (TIMESTAMP) - Última atualização

## 🎯 Sistema de Ataques de Oportunidade

### Estrutura de `round_data` para Rodada Normal
```json
{
  "round": 1,
  "action_type": "attack" | "counter",
  "who_acts": "attacker" | "defender",
  "attacker": "Nome do Atacante",
  "attacker_roll": [6, 5, 4],
  "defender": "Nome do Defensor",
  "defender_roll": [3, 2],
  "completed": true
}
```

### Estrutura de `round_data` para Rodada de Oportunidade
```json
{
  "round": 3,
  "action_type": "opportunity",
  "who_acts": "opportunity",
  "opportunity_attacker_id": "uuid-do-espectador",
  "opportunity_attacker_name": "Nome do Espectador",
  "opportunity_weapon": {
    "Name": "Espada Longa",
    "Dices": 3,
    "Type": "Slashing"
  },
  "opportunity_target": "attacker" | "defender",
  "attacker": "Nome do Espectador",
  "attacker_roll": [6, 5, 4],
  "defender": "Nome do Alvo",
  "defender_roll": [3, 2],
  "completed": true
}
```

### Estrutura de `opportunity_attacks_used`
Array de UUIDs dos jogadores que já usaram seu ataque de oportunidade:
```json
[
  "uuid-jogador-1",
  "uuid-jogador-2"
]
```

## 🔧 Funções Úteis

### Limpeza e Manutenção

```sql
-- Limpar jogadores inativos (mais de 2 horas)
SELECT cleanup_inactive_players();

-- Limpar salas inativas (mais de 2 horas)
SELECT cleanup_inactive_rooms();

-- Limpeza completa com estatísticas
SELECT cleanup_inactive_data();

-- Limpar combates antigos (mais de 24 horas)
SELECT clean_old_combats();
```

### Estatísticas

```sql
-- Estatísticas do sistema
SELECT get_system_stats();

-- Estatísticas de combate
SELECT get_combat_stats();

-- Debug de limpeza de salas
SELECT * FROM debug_room_cleanup();
```

### Testes

```sql
-- Testar sistema de limpeza
SELECT test_cleanup_system();
```

## 📊 Queries Úteis

### 1. Verificar combates ativos em uma sala
```sql
SELECT * FROM public.combat_notifications 
WHERE room_id = 'ABC123' 
AND status = 'in_progress';
```

### 2. Verificar se há mais de 1 combate ativo na sala
```sql
SELECT COUNT(*) as active_combats
FROM public.combat_notifications 
WHERE room_id = 'ABC123' 
AND status = 'in_progress';
```

### 3. Verificar se um jogador já usou ataque de oportunidade
```sql
SELECT 
    id,
    attacker_name,
    defender_name,
    opportunity_attacks_used @> '["uuid-do-jogador"]'::jsonb as already_used
FROM public.combat_notifications
WHERE room_id = 'ABC123';
```

### 4. Contar espectadores disponíveis para ataques de oportunidade
```sql
SELECT 
    cn.id,
    cn.attacker_name,
    cn.defender_name,
    COUNT(p.id) as total_players,
    jsonb_array_length(cn.opportunity_attacks_used) as attacks_used,
    (COUNT(p.id) - 2 - jsonb_array_length(cn.opportunity_attacks_used)) as available_spectators
FROM public.combat_notifications cn
JOIN public.players p ON p.room_id = cn.room_id AND p.is_connected = true
WHERE cn.status = 'in_progress'
AND cn.allow_opportunity_attacks = true
GROUP BY cn.id, cn.attacker_name, cn.defender_name;
```

### 5. Listar todas as rodadas de um combate
```sql
SELECT 
    id,
    current_round,
    total_rounds,
    jsonb_array_length(round_data) as rounds_completed,
    round_data
FROM public.combat_notifications
WHERE id = 'uuid-do-combate';
```

### 6. Filtrar apenas rodadas de oportunidade
```sql
SELECT 
    id,
    jsonb_array_elements(round_data) as round_info
FROM public.combat_notifications
WHERE id = 'uuid-do-combate'
AND jsonb_array_elements(round_data)->>'action_type' = 'opportunity';
```

### 7. Obter detalhes da rodada atual
```sql
SELECT 
    id,
    current_round,
    round_data -> (current_round - 1) as current_round_info
FROM public.combat_notifications
WHERE id = 'uuid-do-combate';
```

### 8. Verificar jogadores de uma sala (incluindo combatentes)
```sql
SELECT 
    p.id,
    p.name,
    p.character_name,
    p.is_connected,
    CASE 
        WHEN p.id = cn.attacker_id THEN 'Atacante'
        WHEN p.id = cn.defender_id THEN 'Defensor'
        ELSE 'Espectador'
    END as role,
    cn.opportunity_attacks_used @> jsonb_build_array(p.id::text) as used_opportunity_attack
FROM public.players p
LEFT JOIN public.combat_notifications cn ON cn.room_id = p.room_id AND cn.status = 'in_progress'
WHERE p.room_id = 'ABC123'
AND p.is_connected = true;
```

## 🔒 Segurança (RLS)

Todas as tabelas têm Row Level Security (RLS) habilitado com políticas de acesso público:
- **SELECT**: Qualquer um pode ler
- **INSERT**: Qualquer um pode criar
- **UPDATE**: Qualquer um pode atualizar
- **DELETE**: Qualquer um pode deletar

⚠️ **Nota**: Para produção, considere implementar autenticação e políticas mais restritivas!

## 🔄 Realtime

As seguintes tabelas têm Realtime habilitado:
- `public.rooms`
- `public.players`
- `public.combat_notifications`

Para assinar mudanças no frontend:
```javascript
// Exemplo de subscrição a combates
const subscription = supabase
  .channel('combat-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'combat_notifications',
    filter: `room_id=eq.${roomId}`
  }, (payload) => {
    console.log('Combat updated:', payload);
  })
  .subscribe();
```

## 📝 Índices Criados

**Tabela `players`:**
- `idx_players_room_id` - Busca por sala
- `idx_players_connected` - Filtro de conectados
- `idx_players_status` - Filtro por status
- `idx_players_counters` (GIN) - Busca em contadores
- `idx_players_characteristics` (GIN) - Busca em características
- `idx_players_selections` (GIN) - Busca em seleções
- `idx_players_app_state` (GIN) - Busca em estado da aplicação
- `idx_players_unlocked_items` (GIN) - Busca em itens desbloqueados

**Tabela `rooms`:**
- `idx_rooms_active` - Filtro de salas ativas

**Tabela `combat_notifications`:**
- `idx_combat_room_id` - Busca por sala
- `idx_combat_status` - Filtro por status
- `idx_combat_attacker` - Busca por atacante
- `idx_combat_defender` - Busca por defensor
- `idx_combat_created_at` - Ordenação por data
- `idx_combat_round_data` (GIN) - Busca em dados de rodadas
- `idx_combat_opportunity_attacks` (GIN) - Busca em ataques de oportunidade

## 🕐 Limpeza Automática

O sistema inclui funções para limpeza automática de dados antigos:

- **Jogadores**: Removidos após 2 horas de inatividade
- **Salas**: Removidas após 2 horas sem jogadores ou inativas
- **Combates**: Removidos após 24 horas

Para agendar limpeza automática, use `pg_cron` (se disponível no Supabase):
```sql
SELECT cron.schedule(
  'cleanup-inactive-data', 
  '*/30 * * * *', 
  'SELECT cleanup_inactive_data();'
);
```
