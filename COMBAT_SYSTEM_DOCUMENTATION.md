# DOCUMENTAÇÃO DO SISTEMA DE COMBATE

## Visão Geral

Sistema de combate completo para o jogo "Matar ou Morrer", implementado com React + Supabase com sincronização em tempo real.

## Arquitetura

### Componentes
- **CombatNotifications.jsx**: Componente principal que gerencia o fluxo de combate (modal)
- **CombatNotifications.css**: Estilos do sistema de combate
- **CombatPanel.jsx**: Painel lateral para iniciar novos combates

### Banco de Dados
- **Tabela**: `combat_notifications`
- **Sincronização**: Supabase Realtime
- **Campos principais**:
  - `combat_phase`: `weapon_selection`, `rolling`, `results`
  - `status`: `pending`, `in_progress`, `completed`, `cancelled`
  - `round_data`: Array JSON com dados de cada rodada

## Fluxo de Combate

### 1. Início (weapon_selection)
```
Atacante → Escolhe ataque e defensores → Clica "Iniciar Combate"
                ↓
Sistema cria notificação com combat_phase: 'weapon_selection'
                ↓
SE allow_counter_attack = true:
    Defensor vê lista de armas → Escolhe uma → Clica "Confirmar Arma"
    OU
    Defensor clica "❌ Não Retaliar" (sem escolher arma)
    ↓
    Sistema calcula rodadas baseado em LoadTime (ou apenas 1 se não retaliar)
    ↓
Avança para combat_phase: 'rolling'
```

### 2. Cálculo de Rodadas
```javascript
timeDiff = attackerLoadTime - defenderLoadTime

// PADRÃO DAS RODADAS:
// 1. Primeira rodada: SEMPRE Atacante
// 2. Rodadas extras baseadas em |timeDiff|:
//    - Se timeDiff < 0: Atacante ataca |timeDiff| vezes
//    - Se timeDiff > 0: Defensor ataca timeDiff vezes
// 3. Penúltima: SEMPRE Defensor
// 4. Última: SEMPRE Atacante

totalRounds = 1 + |timeDiff| + 1 + 1 = 3 + |timeDiff|

// SE Defensor escolher "Não Retaliar":
//   totalRounds = 1 (apenas primeira rodada do atacante)
```

**Exemplo 1**: LoadTimes iguais (Load 5 vs 5, timeDiff=0)
- totalRounds = 3
- Sequência: [A, D, A]
- Rodada 1: Atacante ataca
- Rodada 2: Defensor ataca (penúltima)
- Rodada 3: Atacante ataca (final)

**Exemplo 2**: Atacante LoadTime=3, Defensor LoadTime=5 (timeDiff=-2)
- totalRounds = 5
- Sequência: [A, A, A, D, A]
- Rodada 1: Atacante ataca
- Rodadas 2-3: Atacante ataca (2 extras)
- Rodada 4: Defensor ataca (penúltima)
- Rodada 5: Atacante ataca (final)

**Exemplo 3**: Atacante LoadTime=5, Defensor LoadTime=3 (timeDiff=+2)
- totalRounds = 5
- Sequência: [A, D, D, D, A]
- Rodada 1: Atacante ataca
- Rodadas 2-3: Defensor ataca (2 extras)
- Rodada 4: Defensor ataca (penúltima)
- Rodada 5: Atacante ataca (final)

**Exemplo 4**: Atacante LoadTime=2, Defensor LoadTime=6 (timeDiff=-4)
- totalRounds = 7
- Sequência: [A, A, A, A, A, D, A]
- Rodada 1: Atacante ataca
- Rodadas 2-5: Atacante ataca (4 extras)
- Rodada 6: Defensor ataca (penúltima)
- Rodada 7: Atacante ataca (final)

**Exemplo 5**: Defensor escolhe "Não Retaliar"
- totalRounds = 1
- Sequência: [A]

### 3. Sistema de Dados (Ataque vs Defesa)
```
REGRA FUNDAMENTAL:
- Quem ATACA usa dados da ARMA
- Quem DEFENDE usa dados de DEFESA (NumberOfDefenseDices)

RODADA TIPO "attack":
    Atacante rola → Dados da arma (attack_data.Dices)
    Defensor rola → Dados de defesa (actorData.NumberOfDefenseDices)

RODADA TIPO "counter":
    Defensor rola → Dados da arma (defender_weapon.Dices)
    Atacante rola → Dados de defesa (actorData.NumberOfDefenseDices)
```

### 4. Rolagem de Dados (rolling)
```
PARA CADA RODADA:
    Sistema mostra "Rodada X de Y"
    ↓
    ORDEM SEQUENCIAL (atacante sempre rola primeiro):
    ↓
    1. Atacante rola dados (clica "Rolar Dados")
       ↓
       Sistema determina quantidade de dados:
           - SE action_type = "attack":
               * Atacante rola: attack_data.Dices (dados da arma)
           - SE action_type = "counter":
               * Atacante rola: NumberOfDefenseDices (dados de defesa)
       ↓
       ANIMAÇÃO: 10 frames × 100ms com números aleatórios
       ↓
       Resultado salvo em round_data.attacker
    ↓
    2. Defensor pode rolar (botão liberado apenas após atacante rolar)
       ↓
       Sistema determina quantidade de dados:
           - SE action_type = "attack":
               * Defensor rola: NumberOfDefenseDices (dados de defesa)
           - SE action_type = "counter":
               * Defensor rola: defender_weapon.Dices (dados da arma)
       ↓
       ANIMAÇÃO: 10 frames × 100ms com números aleatórios
       ↓
       Resultado salvo em round_data.defender
    ↓
    QUANDO AMBOS ROLARAM:
        Aparece botão "➡️ Avançar Rodada" (ou "✅ Ver Resultados" se última rodada)
        ↓
        Qualquer jogador pode clicar para avançar
        ↓
        SE é última rodada:
            Avança para combat_phase: 'results'
        SENÃO:
            Avança para próxima rodada (current_round++)
```

### 5. Resultados (results)
- Mostra histórico completo de todas as rodadas
- Exibe dados de ambos jogadores lado a lado
- **NÃO calcula vencedor** - apenas exibe dados
- Botão "Encerrar Combate" marca `status: 'cancelled'`

## Estrutura de Dados

### round_data
```json
[
  {
    "round": 1,
    "who_acts": "attacker",
    "action_type": "attack",
    "attacker": {
      "rolled": true,
      "roll": [3, 5, 2, 4],
      "total": 14
    },
    "defender": {
      "rolled": true,
      "roll": [4, 4],
      "total": 8
    },
    "completed": true
  }
]
```

## Sincronização em Tempo Real

### Subscription Supabase
```javascript
supabase
  .channel(`combat_room_${roomId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'combat_notifications',
    filter: `room_id=eq.${roomId}`
  }, (payload) => {
    // Atualiza estado local automaticamente
  })
  .subscribe();
```

### Garantia de Sincronização
- Ambos jogadores veem a MESMA janela ao MESMO tempo
- Atualizações em tempo real via Supabase Realtime
- Estado sempre consistente entre atacante e defensor

## Funções Principais

### loadCombat()
Busca combate ativo do banco onde o jogador está envolvido.

### getPlayerWeapons()
Retorna array de armas disponíveis do jogador:
- Busca em `selections.attacks`
- Busca em `selections.weapons`

### calculateRounds(attackerLoadTime, defenderLoadTime)
Calcula número total de rodadas e sequência de ações baseado na diferença de LoadTime.

### selectWeaponForDefense()
Defensor escolhe arma, sistema calcula rodadas e inicia fase de rolagem.

### rollDice()
Executa animação de dados (10 frames de 100ms) e salva resultado no banco.

### endCombat()
Marca combate como `cancelled` e fecha janela.

## Interface do Usuário

### Cores
- **Atacante**: Vermelho (#dc3545)
- **Defensor**: Azul (#0d6efd)
- **Dados**: Brancos (#ffffff) com texto preto
- **Destaque**: Amarelo (#ffc107)
- **Sucesso**: Verde (#28a745)
- **Fundo**: Preto semi-transparente (rgba(0,0,0,0.9))

### Ícones
- ⚔️ Ataque
- 🛡️ Defesa
- 🎲 Dados
- ⏱️ Tempo de carga
- ✖ Fechar

### Animações
- **fadeIn**: Entrada do modal (0.3s)
- **slideIn**: Deslizamento do modal (0.3s)
- **bounce**: Animação dos dados (0.1s)
- **pulse**: Pulsação do botão de rolar (2s loop)

## Integração

### Props do CombatNotifications
```javascript
<CombatNotifications
  currentPlayer={{ id: UUID, name: string }}
  currentPlayerData={{ character: { selections: {...} } }}
  roomId={string}
  gameData={object}
  localization={object}
/>
```

### Props do CombatPanel
```javascript
<CombatPanel
  currentPlayer={{ id: UUID, name: string }}
  currentPlayerData={{ character: { selections: {...} } }}
  players={array}
  roomId={string}
  gameData={object}
  localization={object}
/>
```

### Onde usar
- **CombatPanel**: Adicionar ao `RoomView.jsx` como sidebar lateral esquerda
- **CombatNotifications**: Adicionar ao `RoomView.jsx` para monitorar e exibir combates ativos

## Problemas Evitados

✅ **Sincronização**: Ambos jogadores veem mesma tela em tempo real  
✅ **Sem .single()**: Usa `.limit(1)` e acessa `data[0]`  
✅ **Sem cálculo de vencedor**: Apenas mostra dados  
✅ **Encerramento manual**: Usuário controla quando fechar  
✅ **Modal persistente**: Não fecha entre fases  
✅ **Botão encerrar**: Disponível em todas as fases  

## Testes Recomendados

1. **Teste básico**: Ataque sem revidar (1 rodada)
2. **Teste com revidar**: Ataques com mesma velocidade (2 rodadas)
3. **Teste atacante rápido**: LoadTime menor que defensor (2+ rodadas atacante)
4. **Teste defensor rápido**: LoadTime maior que defensor (2+ rodadas com contra-ataques)
5. **Teste sincronização**: Abrir em 2 navegadores diferentes
6. **Teste encerramento**: Verificar fechamento em qualquer fase

## Manutenção

### Adicionar novas funcionalidades
- Editar `CombatNotifications.jsx`
- Seguir estrutura de fases existente
- Manter sincronização em tempo real

### Estilização
- Editar `CombatNotifications.css`
- Manter paleta de cores consistente
- Testar responsividade (mobile)

### Banco de Dados
- Modificar tabela `combat_notifications` com cuidado
- Manter compatibilidade com campos existentes
- Sempre testar sincronização após mudanças

## Suporte

Para problemas ou dúvidas:
1. Verificar console do navegador
2. Verificar logs do Supabase
3. Testar sincronização em tempo real
4. Verificar estrutura de `round_data`
