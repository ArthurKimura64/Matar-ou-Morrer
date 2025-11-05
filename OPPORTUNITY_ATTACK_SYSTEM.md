# Sistema de Ataques de Oportunidade

## Visão Geral

O sistema de ataques de oportunidade permite que **espectadores** de um combate participem dando **um único ataque** contra um dos combatentes (atacante ou defensor).

## Características Principais

### 1. **Toggle de Habilitação**
- Ao criar um combate, há um checkbox "Permitir ataques de oportunidade"
- **Ativado por padrão**
- Se desativado, espectadores não podem dar ataques de oportunidade

### 2. **Limitação por Espectador**
- Cada espectador pode dar **apenas 1 ataque de oportunidade por combate**
- Rastreado no banco de dados no array `opportunity_attacks_used`
- Uma vez usado, o botão desaparece para aquele espectador

### 3. **Modal de Seleção**
Quando um espectador clica em "⚡ Dar Ataque de Oportunidade", abre um modal com:
- **Seleção de Alvo**: Botões para escolher entre atacante ou defensor
- **Seleção de Arma**: Lista de todas as armas disponíveis do espectador
- **Confirmação**: Adiciona a rodada de oportunidade ao combate

### 4. **Rodada de Oportunidade**
Uma rodada de oportunidade é criada com:
- `action_type: 'opportunity'`
- `who_acts: 'opportunity'`
- `opportunity_attacker_id`: ID do espectador atacando
- `opportunity_attacker_name`: Nome do espectador
- `opportunity_weapon`: Arma escolhida (objeto completo)
- `opportunity_target`: 'attacker' ou 'defender'

### 5. **Visualização durante Rodada de Oportunidade**
- **Jogador Esquerda**: Espectador atacando (ícone ⚡)
- **Jogador Direita**: Alvo escolhido (ícone 🛡️)
- Exibe corretamente os nomes e armas de cada um

### 6. **Rolagem de Dados**
Durante uma rodada de oportunidade:
- **Espectador atacando**: Vê botão "Rolar" para atacar com sua arma escolhida
- **Alvo**: Vê botão "Rolar" para defender com seus dados de defesa
- **Outros jogadores**: Veem "Aguardando..." ou "Espectador"

### 7. **Fluxo de Combate**
1. Combate normal acontece entre atacante e defensor
2. Espectadores assistem e podem clicar em "⚡ Dar Ataque de Oportunidade"
3. Espectador escolhe arma e alvo no modal
4. Nova rodada é inserida no `round_data`
5. `total_rounds` é incrementado
6. Combate continua com a rodada de oportunidade
7. Após completar, combate avança normalmente

## Estrutura de Dados

### Campos na Tabela `combat_notifications`
```javascript
{
  allow_opportunity_attacks: boolean,      // Se ataques de oportunidade são permitidos
  opportunity_attacks_used: [playerId, ...] // Array de IDs de jogadores que já usaram
}
```

### Estrutura de Rodada de Oportunidade
```javascript
{
  round: number,
  action_type: 'opportunity',
  who_acts: 'opportunity',
  opportunity_attacker_id: string,
  opportunity_attacker_name: string,
  opportunity_weapon: {
    Name: string,
    Dices: number,
    Type: string
  },
  opportunity_target: 'attacker' | 'defender',
  attacker: null,              // Preenchido após rolagem
  attacker_roll: [],
  defender: null,              // Preenchido após rolagem  
  defender_roll: [],
  completed: false
}
```

## Lógica Implementada

### Estados React
```javascript
const [allowOpportunityAttacks, setAllowOpportunityAttacks] = useState(true);
const [showOpportunityAttack, setShowOpportunityAttack] = useState(false);
const [opportunityWeapon, setOpportunityWeapon] = useState(null);
const [opportunityTarget, setOpportunityTarget] = useState(null);
```

### Detecção de Rodada de Oportunidade
```javascript
const isOpportunityRound = roundInfo?.action_type === 'opportunity';
```

### Condições de Botão para Espectador Atacando
```javascript
// leftPlayer (espectador atacando)
isOpportunityRound && currentPlayer.id === roundInfo.opportunity_attacker_id
```

### Condições de Botão para Alvo
```javascript
// rightPlayer (alvo)
isOpportunityRound && (
  (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
  (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id)
)
```

### Rolagem de Dados em Rodadas de Oportunidade
```javascript
if (isOpportunityRound) {
  const isOpportunityAttacker = currentPlayer.id === roundInfo.opportunity_attacker_id;
  const isTargetPlayer = 
    (roundInfo.opportunity_target === 'attacker' && currentPlayer.id === combat.attacker_id) ||
    (roundInfo.opportunity_target === 'defender' && currentPlayer.id === combat.defender_id);

  if (isOpportunityAttacker) {
    // Usar opportunity_weapon.Dices para ataque
    roll = [...]; // Dados de ataque do espectador
    updatedRound.attacker = currentPlayer.name;
    updatedRound.attacker_roll = roll;
  } else if (isTargetPlayer) {
    // Usar getCurrentDefenseDices() para defesa
    roll = [...]; // Dados de defesa do alvo
    updatedRound.defender = currentPlayer.name;
    updatedRound.defender_roll = roll;
  }
}
```

## Testagem Recomendada

1. **Criar combate com ataques de oportunidade habilitados**
2. **Verificar que espectadores veem botão "⚡ Dar Ataque de Oportunidade"**
3. **Espectador clica e escolhe arma e alvo**
4. **Verificar que rodada de oportunidade é adicionada**
5. **Espectador e alvo rolam dados**
6. **Verificar que combate avança normalmente**
7. **Verificar que espectador não pode dar outro ataque de oportunidade**
8. **Testar com combate sem ataques de oportunidade habilitados**

## Melhorias Futuras

- [ ] Notificações visuais quando um ataque de oportunidade é adicionado
- [ ] Log/histórico de ataques de oportunidade no combate
- [ ] Estatísticas de ataques de oportunidade no resultado final
- [ ] Animação especial para rodadas de oportunidade
- [ ] Som/efeito especial ao dar ataque de oportunidade
