# 📊 Sistema de Status Detalhado dos Jogadores

## Visão Geral

Este sistema permite acompanhar em tempo real o progresso e status de todos os jogadores na sala, incluindo contadores, características e itens usados.

## 🎯 Funcionalidades

### 1. **Contadores em Tempo Real**
- **❤️ Vida**: Valor atual/máximo (ex: 15/20)
- **🔵 Esquiva**: Pontos de esquiva atuais/máximos
- **⚡ Oportunidade**: Ataques de oportunidade disponíveis
- **📦 Itens**: Itens de exploração disponíveis
- **🔮 Mana**: Pontos de mana para magias
- **⚡ Energia**: Energia para habilidades especiais
- **🎯 Foco**: Pontos de concentração
- **🔫 Munição**: Munição disponível para armas
- **🛡️ Blindagem**: Pontos de blindagem temporária
- **💚 HP Temp**: Pontos de vida temporários
- **🔹🔸🔺 Contadores Customizados**: Para mecânicas específicas do personagem

### 2. **Características do Personagem**
- **🗡️ Ataques**: Quantidade de ataques disponíveis
- **⚔️ Armas**: Armas equipadas
- **🛡️ Passivas**: Habilidades passivas
- **🔧 Dispositivos**: Dispositivos tecnológicos
- **✨ Poderes**: Poderes especiais
- **🌟 Especiais**: Habilidades especiais ativas
- **💫 Esp. Passivas**: Habilidades especiais passivas
- **🧪 Consumíveis**: Itens consumíveis disponíveis
- **🎒 Equipamentos**: Equipamentos carregados
- **🔧 Modificações**: Modificações de equipamento

### 3. **Itens Usados**
- **🔴 Contador**: Mostra quantos itens foram usados
- **Tempo Real**: Atualiza instantaneamente para todos

## 🗄️ Estrutura do Banco de Dados

### Novas Colunas na Tabela `players`:

```sql
-- Contadores com valores atuais e máximos (expandido)
counters JSONB DEFAULT '{
  "vida": 20, "vida_max": 20,
  "esquiva": 0, "esquiva_max": 0,
  "oport": 0, "oport_max": 0,
  "item": 0, "item_max": 0,
  "mana": 0, "mana_max": 0,
  "energia": 0, "energia_max": 0,
  "foco": 0, "foco_max": 0,
  "municao": 0, "municao_max": 0,
  "blindagem": 0, "blindagem_max": 0,
  "temp_hp": 0, "temp_hp_max": 0,
  "custom1": 0, "custom1_max": 0,
  "custom2": 0, "custom2_max": 0,
  "custom3": 0, "custom3_max": 0
}'

-- Quantidade de cada tipo de característica (expandido)
characteristics JSONB DEFAULT '{
  "attacks": 0, "weapons": 0, "passives": 0,
  "devices": 0, "powers": 0, "specials": 0, "passiveSpecials": 0,
  "consumables": 0, "equipment": 0, "modifications": 0
}'

-- Lista de IDs de itens usados
used_items JSONB DEFAULT '[]'

-- Labels personalizados para contadores customizados
counter_labels JSONB DEFAULT '{
  "custom1": "Contador 1",
  "custom2": "Contador 2", 
  "custom3": "Contador 3"
}'
```

## 🛠️ Como Usar

### 1. **Executar Script SQL Completo**
```sql
-- No SQL Editor do Supabase, execute:
-- supabase-complete-setup.sql
-- (Inclui tudo: tabelas, status, contadores e características)
```

### 2. **Visualização na Interface**

**No Lobby:**
- Lista completa com todos os detalhes dos jogadores prontos

**Durante Criação/Ficha:**
- Lista compacta e minimizável
- Botão ▼/▲ para expandir/colapsar

### 3. **Sincronização Automática**

**Contadores:**
- Atualizam automaticamente quando alterados na ficha
- Valores máximos são registrados automaticamente

**Características:**
- Calculadas automaticamente na criação do personagem
- Sincronizadas em tempo real

## 🎨 Interface Visual

### Status Cards:
```
┌─────────────────────────┐
│ 👤 Nome do Jogador      │
│ ⚙️ Criando personagem   │
│                         │
│ 📊 Contadores:          │
│ ❤️ Vida    � Mana      │
│ 15/20      8/10         │
│ 🔫 Munição �️ Blindagem │
│ 24/30      5/5          │
│                         │
│ 🎯 Características:     │
│ Ataques    Poderes      │
│    3          2         │
│ Equipamentos Consumíveis│
│    5          3         │
│                         │
│ 🔴 2 item(ns) usado(s)  │
└─────────────────────────┘
```

## 🔄 Atualizações em Tempo Real

### Eventos Sincronizados:
- ✅ Mudança de contadores na ficha
- ✅ Criação/finalização de personagem
- ✅ Uso de itens/habilidades
- ✅ Entrada/saída de jogadores

### Performance:
- Usa Supabase Realtime para atualizações instantâneas
- Sincronização eficiente apenas quando necessário

## 🚀 Benefícios

1. **👥 Coordenação**: Mestres e jogadores veem o status de todos
2. **⚡ Tempo Real**: Atualizações instantâneas
3. **📊 Completo**: Todos os dados importantes visíveis
4. **🎮 Jogabilidade**: Facilita decisões táticas
5. **📱 Responsivo**: Funciona em desktop e mobile

## 🔧 Manutenção

### Logs de Debug:
- Console mostra sincronizações em tempo real
- Fácil identificação de problemas de conexão

### Recuperação:
- Botão 🔄 para forçar atualização manual
- Reconexão automática do Realtime

## 📋 Checklist de Implementação

- ✅ Script SQL completo (`supabase-complete-setup.sql`) executado
- ✅ Componente `PlayerDetailedStatus` criado
- ✅ `RoomService` atualizado com novos métodos
- ✅ `CharacterSheet` sincroniza contadores
- ✅ Interface visual implementada
- ✅ Sistema de tempo real funcionando

Este sistema transforma a experiência de jogo em grupo, permitindo coordenação eficiente e acompanhamento completo do estado de todos os jogadores!
