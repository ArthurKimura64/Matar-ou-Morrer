# EXEMPLOS DE USO DO SISTEMA DE COMBATE

## Exemplo 1: Ataque Simples (Sem Revidar)

### Cenário
- Jogador A ataca Jogador B
- Não permite revidar
- Apenas 1 rodada

### Fluxo
```
1. Jogador A seleciona ataque "Espada Longa" (3 dados, LoadTime: 5)
2. Jogador A seleciona Jogador B como defensor
3. Jogador A NÃO marca "Permitir revidar"
4. Jogador A clica "Iniciar Combate"

Sistema automaticamente:
- Cria notificação
- Calcula totalRounds = 1
- Inicia fase de rolagem

5. Ambos jogadores veem janela:
   - "Rodada 1 de 1"
   - Jogador A rola seus 3 dados → [4, 5, 3] = 12
   - Jogador B rola 0 dados de defesa → [0] = 0

6. Sistema avança para fase de resultados
7. Ambos jogadores veem os dados
8. Qualquer um clica "Encerrar Combate"
```

---

## Exemplo 2: Combate com Revidar (Mesma Velocidade)

### Cenário
- Jogador A ataca Jogador B
- Permite revidar
- Ambos com LoadTime = 5
- Total de 2 rodadas

### Fluxo????
```
1. Jogador A seleciona ataque "Machado" (4 dados, LoadTime: 5)
2. Jogador A seleciona Jogador B
3. Jogador A MARCA "Permitir revidar"
4. Jogador A clica "Iniciar Combate"

5. Jogador B vê lista de suas armas:
   - Escolhe "Espada Curta" (3 dados, LoadTime: 5)
   - Clica "Confirmar Arma"

Sistema calcula:
- timeDiff = 5 - 5 = 0
- totalRounds = 2 + 0 = 2
- Sequência: [A ataca, A ataca]

RODADA 1:
- Jogador A rola 4 dados → [6, 4, 5, 3] = 18
- Jogador B rola 3 dados → [5, 5, 2] = 12
- Sistema avança automaticamente para rodada 2??

RODADA 2:
- Jogador A rola 4 dados → [3, 4, 4, 5] = 16
- Jogador B rola 3 dados → [6, 6, 1] = 13
- Sistema vai para fase de resultados

6. Tela de resultados mostra ambas rodadas
7. Qualquer um clica "Encerrar Combate"
```

---

## Exemplo 3: Atacante Mais Rápido

### Cenário
- Jogador A: LoadTime = 3 (rápido)
- Jogador B: LoadTime = 5 (lento)
- Atacante faz múltiplos ataques

### Fluxo
```
1. Jogador A: "Adaga Veloz" (2 dados, LoadTime: 3)
2. Jogador B: "Martelo Pesado" (5 dados, LoadTime: 5)

Sistema calcula:
- timeDiff = 3 - 5 = -2
- totalRounds = 2 + 2 = 4
- Sequência: [A ataca, A ataca, A ataca, A ataca]

Jogador A ataca 4 vezes seguidas!

RODADA 1: A ataca
- Jogador A rola 2 dados → [4, 5] = 9
- Jogador B rola 5 dados → [3, 4, 2, 5, 1] = 15

RODADA 2: A ataca novamente
- Jogador A rola 2 dados → [6, 6] = 12
- Jogador B rola 5 dados → [2, 3, 4, 3, 2] = 14

RODADA 3: A ataca novamente
- Jogador A rola 2 dados → [5, 4] = 9
- Jogador B rola 5 dados → [6, 5, 4, 3, 2] = 20

RODADA 4: A ataca novamente
- Jogador A rola 2 dados → [3, 3] = 6
- Jogador B rola 5 dados → [4, 4, 3, 2, 1] = 14

Resultados finais mostram todas as 4 rodadas
```

---

## Exemplo 4: Defensor Mais Rápido (Contra-ataques)

### Cenário
- Jogador A: LoadTime = 5 (lento)
- Jogador B: LoadTime = 3 (rápido)
- Defensor consegue contra-atacar

### Fluxo
```
1. Jogador A: "Martelo Pesado" (5 dados, LoadTime: 5)
2. Jogador B: "Adaga Rápida" (2 dados, LoadTime: 3)

Sistema calcula:
- timeDiff = 5 - 3 = 2
- totalRounds = 2 + 2 = 4
- Sequência: [A ataca, B contra-ataca, B contra-ataca, A ataca]

RODADA 1: A ataca (inicial)
- Jogador A rola 5 dados → [5, 4, 6, 3, 2] = 20
- Jogador B rola 2 dados → [5, 4] = 9

RODADA 2: B contra-ataca!
- Jogador A rola 5 dados → [4, 3, 3, 2, 1] = 13
- Jogador B rola 2 dados → [6, 6] = 12

RODADA 3: B contra-ataca novamente!
- Jogador A rola 5 dados → [5, 5, 4, 3, 2] = 19
- Jogador B rola 2 dados → [5, 5] = 10

RODADA 4: A ataca (final)
- Jogador A rola 5 dados → [6, 4, 3, 2, 1] = 16
- Jogador B rola 2 dados → [4, 3] = 7

Resultados mostram: A conseguiu 2 ataques, mas B conseguiu se defender e contra-atacar 2 vezes!
```

---

## Exemplo 5: Diferença Extrema de Velocidade

### Cenário
- Jogador A: LoadTime = 1 (ultra-rápido)
- Jogador B: LoadTime = 8 (ultra-lento)
- Muitas rodadas seguidas

### Fluxo
```
Sistema calcula:
- timeDiff = 1 - 8 = -7
- totalRounds = 2 + 7 = 9 rodadas!
- Sequência: [A, A, A, A, A, A, A, A, A]

Jogador A faz 9 ataques consecutivos antes que o defensor consiga reagir adequadamente!

Este é um cenário extremo que favorece muito armas rápidas.
```

---

## Exemplo 6: Ataque Múltiplo (Vários Defensores)

### Cenário
- Jogador A ataca 3 jogadores ao mesmo tempo
- Sistema cria 3 combates separados

### Fluxo
```
1. Jogador A seleciona ataque "Explosão Mágica" (6 dados, LoadTime: 4)
2. Jogador A seleciona 3 defensores: B, C e D
3. Jogador A marca "Permitir revidar"
4. Jogador A clica "Iniciar Combate"

Sistema cria 3 notificações:
- combat_notification #1: A vs B
- combat_notification #2: A vs C  
- combat_notification #3: A vs D

Jogador A vê 3 janelas separadas (uma por vez)
Cada defensor vê apenas sua própria janela

Cada combate é resolvido independentemente!
```

---

## Exemplo 7: Teste de Sincronização

### Cenário
- Testar que ambos jogadores veem mesma tela

### Teste
```
1. Abrir 2 navegadores (Chrome e Firefox)
2. Entrar com Jogador A no Chrome
3. Entrar com Jogador B no Firefox

4. Jogador A inicia combate contra Jogador B

Verificar:
✓ Ambos veem a janela ao MESMO TEMPO
✓ Quando B escolhe arma, A vê imediatamente "Aguardando..."
✓ Quando alguém rola dados, o outro vê os dados aparecerem
✓ Avanço de rodada é simultâneo
✓ Tela de resultados aparece para ambos ao mesmo tempo
✓ Se um encerra, o modal fecha para ambos
```

---

## Exemplo 8: Cancelamento Durante Seleção

### Cenário
- Defensor demora para escolher arma
- Atacante cancela o combate

### Fluxo
```
1. Jogador A inicia combate contra B (com revidar)
2. Jogador B vê lista de armas mas NÃO escolhe ainda
3. Jogador A fica esperando e decide cancelar
4. Jogador A clica "Encerrar Combate"

Sistema:
- Marca status = 'cancelled'
- Modal fecha para AMBOS jogadores
- Combate é descartado sem resultados
```

---

## Exemplo 9: Arma Sem Dados

### Cenário
- Jogador tem arma com 0 dados (erro de configuração)

### Comportamento
```
Sistema mostra erro: "Erro: número de dados inválido"
Jogador não consegue rolar dados
Solução: Encerrar combate e corrigir personagem
```

---

## Exemplo 10: Dados com Efeitos Especiais

### Cenário
- Arma tem efeitos especiais no campo "Effects"

### Fluxo
```
1. Defensor escolhe arma "Espada Flamejante"
   - 4 dados
   - LoadTime: 4
   - Effects: "+2 de dano de fogo"

2. Sistema mostra os efeitos na lista de armas
3. Os efeitos SÃO exibidos mas NÃO são calculados automaticamente
4. Jogadores devem aplicar os efeitos manualmente na interpretação

Sistema apenas mostra os dados brutos, efeitos são para roleplay!
```

---

## Resumo de Casos de Uso

| Caso | timeDiff | Rodadas | Sequência |
|------|----------|---------|-----------|
| Sem revidar | N/A | 1 | [A] |
| Mesma velocidade | 0 | 2 | [A, A] |
| A mais rápido (-1) | -1 | 3 | [A, A, A] |
| A mais rápido (-2) | -2 | 4 | [A, A, A, A] |
| B mais rápido (+1) | +1 | 3 | [A, B, A] |
| B mais rápido (+2) | +2 | 4 | [A, B, B, A] |
| B mais rápido (+3) | +3 | 5 | [A, B, B, B, A] |

**Regra**: Primeira e última rodada SEMPRE são do atacante (quando totalRounds > 1)
