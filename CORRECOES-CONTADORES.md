# Correções nos Contadores Adicionais

## Problemas Corrigidos

### 1. Sistema Geral para Qualquer Personagem
**Problema:** Os contadores estavam limitados a características específicas hard-coded, não funcionariam para novos personagens.

**Solução:** Criou-se um **algoritmo geral** que:
- Processa **qualquer** `SpecialCharacteristic` do tipo 'counter'
- Mapeia ícones por palavras-chave (aura→🌑, escudo→🛡️, força→⚡, etc.)
- Gera labels automaticamente dos IDs ou localização
- Funciona para **todos os personagens atuais e futuros**

### 2. Valores Iniciais Corretos
**Problema:** Contadores começavam em 0 (exceto vida).

**Solução:** Agora todos os contadores começam em seus **valores máximos/iniciais**:
- **Vida:** sempre 20 (exceto vida que é especial)
- **Esquiva, Oportunidade, Itens:** começam no valor máximo baseado no personagem
- **Contadores Especiais:** começam no `InitialValue` definido ou no valor máximo

### 3. Algoritmo de Mapeamento Inteligente
**Sistema de Ícones por Palavras-chave:**
- 🌑 aura, negro, caos
- 🛡️ escudo, proteção, defesa  
- ⚡ força, poder, energia
- 🌙 transformação, mudança, evolução
- 🔴 vermelho, sangue
- 🔵 azul, gelo
- 🟢 verde, natureza
- 🟡 dourado, luz
- ✨ mana, magia
- ❤️ vida, cura
- 🎲 destino, sorte
- 📊 padrão

### 4. Labels Automáticos
- Prioridade: `localization[spec.Title]` → `spec.Title` → ID limpo
- Limpeza automática: `SpecialCustom.EclipseKnight1` → `Eclipse Knight`

## Como Funciona Agora

```javascript
// Para QUALQUER personagem:
1. Sistema encontra SpecialCharacteristics do tipo 'counter'
2. Aplica algoritmo de ícones baseado em palavras-chave
3. Define valores iniciais corretos (InitialValue ou max)
4. Gera interface automaticamente
5. Sincroniza em tempo real
```

## Contadores Existentes no Jogo

**Atualmente definidos em GameEconomyData.json:**
- Aura Negra 🌑 (`SpecialCustom.Caos1`)
- Força Telecinética ⚡ (`SpecialCustom.Destroul1`) 
- Escudo 🛡️ (`SpecialCustom.Protetor1`)
- Escudo 🛡️ (`SpecialCustom.PortadorDasEntidades1`)
- Pontos de Transformação 🌙 (`SpecialCustom.EclipseKnight1`)
- Escudo Vermelho 🔴 (`SpecialCustom.Vinteum1`)

**Para futuros personagens:** O sistema automaticamente detectará e configurará qualquer nova `SpecialCharacteristic` do tipo 'counter'.

## Arquivos Modificados

1. `src/utils/AdditionalCountersConfig.js`
   - Removidos contadores inventados
   - Implementada lógica baseada em SpecialCharacteristics reais
   - Adicionados ícones apropriados

2. `src/components/AdditionalCounters.jsx`
   - Corrigido para usar limites máximos corretos
   - Garantido que apenas `current` é alterado

3. `src/components/CharacterSheet.jsx`
   - Removido aumento automático de valores máximos
   - Corrigidas dependências do useEffect
   - Valores máximos agora são fixos

4. `src/components/PlayerDetailedStatus.jsx`
   - Atualizados ícones e labels para características reais
   - Corrigida formatação de contadores com max

5. `src/components/SpecialCharacteristics.jsx`
   - Ajustado valor máximo padrão para 10 (mais realista)

## Como Funciona Agora

1. **Inicialização:** Quando um personagem é selecionado, o sistema verifica suas `SpecialCharacteristics`
2. **Filtragem:** Apenas características do tipo 'counter' geram contadores adicionais
3. **Configuração:** Cada contador tem valores fixos baseados nas definições do jogo
4. **Atualização:** Apenas o valor `current` pode ser alterado, o `max` permanece fixo
5. **Sincronização:** Todos os contadores são sincronizados em tempo real via Supabase

## Resultado

- ✅ Apenas contadores que existem no jogo são mostrados
- ✅ Valores máximos permanecem fixos
- ✅ Interface mais limpa e precisa
- ✅ Compatibilidade total com as regras do jogo
- ✅ Sincronização em tempo real funcionando corretamente
