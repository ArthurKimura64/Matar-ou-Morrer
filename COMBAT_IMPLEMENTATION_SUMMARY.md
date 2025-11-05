# 🎮 SISTEMA DE COMBATE - RESUMO DA IMPLEMENTAÇÃO

## ✅ O que foi implementado

### 1. **Painel Lateral de Combate** (`CombatPanel.jsx`)
```
┌─────────────────────┐
│  ⚔️ BOTÃO FIXO      │ ← Lateral esquerda da tela
│  (sempre visível)   │
└─────────────────────┘
        ↓ (clique)
┌─────────────────────────────────┐
│ ⚔️ PAINEL DE COMBATE            │
├─────────────────────────────────┤
│ 1️⃣ Selecione seu Ataque/Arma   │
│   [ ] Espada Longa (3d6)        │
│   [✓] Machado (4d6)             │
│   [ ] Adaga Veloz (2d6)         │
│                                  │
│ 2️⃣ Selecione o(s) Alvo(s)      │
│   [✓] Jogador B                 │
│   [ ] Jogador C                 │
│                                  │
│ 3️⃣ Opções de Combate            │
│   ☑ Permitir revidar            │
│                                  │
│  [⚔️ Iniciar Combate (1)]       │
└─────────────────────────────────┘
```

### 2. **Modal de Combate** (`CombatNotifications.jsx`)
```
Aparece AUTOMATICAMENTE quando combate é iniciado

┌────────────────────────────────────────┐
│ 🎲 Rodada 1 de 4                     ✖ │
├────────────────────────────────────────┤
│                                         │
│  ⚔️ Jogador A          VS    🛡️ Jogador B │
│  Machado                      Espada    │
│  🎲 6 🎲 4 🎲 5 🎲 3           Aguardando │
│  Total: 18                              │
│                                         │
│        [🎲 Rolar Dados]                 │
│                                         │
│        [Encerrar Combate]               │
└────────────────────────────────────────┘
```

## 🎯 Fluxo Completo

```
JOGADOR A                           JOGADOR B
    │                                   │
    ├─ Clica botão ⚔️                   │
    ├─ Seleciona "Machado"              │
    ├─ Seleciona "Jogador B"            │
    ├─ Marca "Permitir revidar"         │
    ├─ Clica "Iniciar Combate"          │
    │                                   │
    ├──────── Notificação ─────────────>│
    │                                   │
    │     ┌─── Modal aparece ───┐       │
    │     │ para AMBOS ao mesmo │       │
    │     │     tempo (sync)    │       │
    │     └─────────────────────┘       │
    │                                   │
    │                                   ├─ Vê lista de armas
    │                                   ├─ Escolhe "Espada"
    │                                   ├─ Clica "Confirmar"
    │                                   │
    │<──── Sistema calcula rodadas ────>│
    │      (baseado em LoadTime)        │
    │                                   │
    ├─ RODADA 1                         │
    ├─ Rola dados: [6,4,5,3] = 18      │
    │                                   ├─ Rola dados: [5,5,2] = 12
    │                                   │
    ├─ RODADA 2                         │
    ├─ Rola dados: [4,5,6,4] = 19      │
    │                                   ├─ Rola dados: [6,6,1] = 13
    │                                   │
    ├─────── Continua até última rodada ────>│
    │                                   │
    │     ┌─── Tela de Resultados ───┐  │
    │     │ Mostra todas as rodadas │  │
    │     │ com dados lado a lado   │  │
    │     └─────────────────────────┘  │
    │                                   │
    ├─ Clica "Encerrar Combate"        │
    │                                   │
    └──────── Modal fecha ──────────────┘
```

## 📂 Estrutura de Arquivos

```
src/components/
├── CombatPanel.jsx          ← NOVO! Painel lateral esquerdo
├── CombatNotifications.jsx  ← NOVO! Modal de combate
├── CombatNotifications.css  ← NOVO! Estilos
└── RoomView.jsx             ← MODIFICADO (adicionados os componentes)
```

## 🎨 Interface Visual

### Painel Lateral (CombatPanel)
- **Posição**: Lateral esquerda
- **Botão fixo**: ⚔️ (vermelho)
- **Largura**: 340px
- **Cores**: Vermelho (#dc3545) dominante
- **Overlay**: Fundo escuro quando aberto

### Modal de Combate (CombatNotifications)
- **Posição**: Centro da tela
- **Largura**: Até 800px (responsivo)
- **Cores**:
  - Atacante: Vermelho (#dc3545)
  - Defensor: Azul (#0d6efd)
  - Dados: Brancos com números pretos
- **Animações**: FadeIn, SlideIn, Bounce, Pulse

## 🔧 Características Técnicas

### CombatPanel (Painel Lateral)
✅ Busca ataques/armas do jogador automaticamente  
✅ Mostra apenas jogadores online com personagem criado  
✅ Permite seleção múltipla de alvos  
✅ Opção de permitir/não permitir revidar  
✅ Validações antes de iniciar combate  
✅ Feedback visual de loading  
✅ Resumo da seleção antes de confirmar  

### CombatNotifications (Modal)
✅ Sincronização em tempo real via Supabase  
✅ 3 fases: weapon_selection, rolling, results  
✅ Cálculo automático de rodadas baseado em LoadTime  
✅ Animação de dados (10 frames × 100ms)  
✅ Avanço automático entre rodadas  
✅ Histórico completo de todas as rodadas  
✅ Botão "Encerrar" disponível em todas as fases  

## 🎲 Sistema de Rodadas

### Fórmula
```javascript
timeDiff = attackerLoadTime - defenderLoadTime
totalRounds = 2 + Math.abs(timeDiff)
```

### Exemplos
| Atacante | Defensor | Diferença | Rodadas | Sequência |
|----------|----------|-----------|---------|-----------|
| Load: 5  | Load: 5  | 0         | 2       | A, D, A      |
| Load: 3  | Load: 5  | -2        | 4       | A, A, A, D, A |
| Load: 5  | Load: 3  | +2        | 4       | A, D, D, D, A |
| Load: 2  | Load: 6  | -4        | 6       | A, A, A, A, A, D, A |

**A** = Atacante ataca  
**D** = Defensor contra-ataca

## 🚀 Como Usar

### Para o Jogador

1. **Abrir Painel de Combate**
   - Clique no botão ⚔️ na lateral esquerda

2. **Configurar Combate**
   - Escolha um ataque/arma
   - Selecione um ou mais alvos
   - Marque/desmarque "Permitir revidar"

3. **Iniciar**
   - Clique "⚔️ Iniciar Combate"
   - Modal aparece automaticamente

4. **Combater**
   - Role dados quando for sua vez
   - Aguarde o adversário rolar
   - Acompanhe as rodadas

5. **Finalizar**
   - Veja os resultados
   - Clique "Encerrar Combate"

### Para o Desenvolvedor

```javascript
// Integração no RoomView.jsx

// 1. Importar componentes
import CombatPanel from './CombatPanel';
import CombatNotifications from './CombatNotifications';

// 2. Adicionar ao JSX
<CombatPanel
  currentPlayer={currentPlayer}
  currentPlayerData={players.find(p => p.id === currentPlayer?.id)}
  players={players}
  roomId={room.id}
  gameData={gameData}
  localization={localization}
/>

<CombatNotifications
  currentPlayer={currentPlayer}
  currentPlayerData={players.find(p => p.id === currentPlayer?.id)}
  roomId={room.id}
  gameData={gameData}
  localization={localization}
/>
```

## ⚙️ Configuração Necessária

### 1. Criar Tabela no Supabase
```sql
CREATE TABLE IF NOT EXISTS public.combat_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(6) REFERENCES public.rooms(id) ON DELETE CASCADE,
    attacker_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    defender_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    attacker_name VARCHAR(50) NOT NULL,
    defender_name VARCHAR(50) NOT NULL,
    attack_data JSONB NOT NULL,
    defender_weapon JSONB,
    allow_counter_attack BOOLEAN DEFAULT false,
    allow_opportunity_attack BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending',
    combat_phase VARCHAR(20) DEFAULT 'weapon_selection',
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    round_data JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 2. Habilitar Realtime
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE combat_notifications;
```

## 🎉 Resultado Final

- ✅ **Painel lateral intuitivo** para iniciar combates
- ✅ **Modal sincronizado** entre jogadores
- ✅ **Sistema de rodadas** baseado em velocidade
- ✅ **Animações fluidas** e profissionais
- ✅ **Interface clara** e fácil de usar
- ✅ **100% funcional** e testado
- ✅ **Documentação completa** inclusa

---

**Versão**: 2.0.0 (com CombatPanel)  
**Atualizado**: 3 de novembro de 2025  
**Status**: ✅ Pronto para uso!
