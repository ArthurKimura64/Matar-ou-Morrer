# GUIA RÁPIDO - SISTEMA DE COMBATE

## 🚀 Início Rápido (5 minutos)

### 1. Configurar Banco de Dados

Acesse o Supabase Dashboard e execute:

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

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE combat_notifications;
```

### 2. Verificar Integração

O componente já foi integrado! Verifique em:
- ✅ `src/components/CombatNotifications.jsx` - Sistema de combate
- ✅ `src/components/CombatNotifications.css` - Estilos do combate
- ✅ `src/components/CombatPanel.jsx` - Painel lateral para iniciar combates
- ✅ `src/components/RoomView.jsx` (linhas ~446-454) - Integração

### 3. Testar

```bash
npm start
```

1. Entre em uma sala
2. Crie 2 personagens (em 2 navegadores)
3. Clique no botão **⚔️** na lateral esquerda para abrir o painel de combate
4. Selecione um ataque, escolha um alvo e clique "Iniciar Combate"
5. Veja a mágica acontecer! ✨

---

## 📖 Como Usar

### Para Iniciar Combate

1. Clique no botão **⚔️** na lateral esquerda da tela
2. No painel que abrir:
   - **Passo 1**: Selecione um ataque ou arma da sua lista
   - **Passo 2**: Selecione um ou mais alvos (jogadores)
   - **Passo 3**: Marque "Permitir revidar" se quiser que o defensor possa contra-atacar
3. Clique em **"⚔️ Iniciar Combate"**
4. Uma janela de combate aparecerá para ambos os jogadores!

### Para Defender

Se você for atacado:
1. Uma janela aparece automaticamente
2. Se pode revidar: escolha uma arma e confirme
3. Role os dados quando for sua vez
4. Veja os resultados no final

### Para Encerrar

Clique em "Encerrar Combate" a qualquer momento.

---

## 🎯 Conceitos Principais

### LoadTime determina a velocidade
- **LoadTime menor** = mais rápido = mais ataques
- **LoadTime maior** = mais lento = menos ataques

### Fórmula
```
Diferença = LoadTime(Atacante) - LoadTime(Defensor)
Rodadas = 2 + |Diferença|
```

### Exemplos Rápidos

| Atacante | Defensor | Rodadas | Quem age |
|----------|----------|---------|----------|
| Load: 5  | Load: 5  | 2       | A, A |
| Load: 3  | Load: 5  | 4       | A, A, A, A |
| Load: 5  | Load: 3  | 4       | A, D, D, A |

**A** = Atacante ataca  
**D** = Defensor contra-ataca

---

## 🐛 Problemas Comuns

### Modal não aparece
- ✓ Verificar se tabela foi criada no Supabase
- ✓ Verificar se Realtime está habilitado
- ✓ Verificar console do navegador

### Não sincroniza entre jogadores
- ✓ Verificar conexão com internet
- ✓ Verificar se ambos estão na mesma sala
- ✓ Limpar cache do navegador

### Erro ao rolar dados
- ✓ Verificar se arma tem campo "Dices"
- ✓ Verificar se "Dices" é um número válido
- ✓ Verificar logs do Supabase

---

## 📊 Fluxo Visual

```
INÍCIO
  ↓
ATACANTE ESCOLHE ATAQUE E DEFENSOR
  ↓
MARCAR "PERMITIR REVIDAR"? ──→ NÃO → 1 RODADA → ROLAR DADOS → RESULTADOS
  ↓
 SIM
  ↓
DEFENSOR ESCOLHE ARMA
  ↓
SISTEMA CALCULA RODADAS
  ↓
PARA CADA RODADA:
  - Jogador X rola dados
  - Jogador Y rola dados
  - Avança para próxima
  ↓
RESULTADOS: MOSTRA TODAS AS RODADAS
  ↓
ENCERRAR COMBATE
```

---

## 🎨 Personalização

### Cores
Edite `CombatNotifications.css`:
- `.attacker-name`: cor do atacante
- `.defender-name`: cor do defensor
- `.die`: cor dos dados

### Animações
Edite `CombatNotifications.jsx`:
- Linha ~285: Velocidade da animação (100ms)
- Linha ~283: Número de frames (10)

### Regras
Edite `calculateRounds()` em `CombatNotifications.jsx`:
- Linha ~160: Fórmula de cálculo de rodadas
- Linha ~165: Sequência de ações

---

## 📞 Suporte

### Arquivos de Ajuda
- `COMBAT_SYSTEM_DOCUMENTATION.md` - Documentação completa
- `COMBAT_EXAMPLES.md` - 10 exemplos práticos
- `COMBAT_SYSTEM_CHECKLIST.md` - Checklist de verificação

### Logs Úteis
```javascript
// No console do navegador
console.log('Combate atual:', combat);
console.log('Rodada:', combat.current_round);
console.log('Dados:', combat.round_data);
```

### Tabela do Supabase
```sql
-- Ver todos os combates ativos
SELECT * FROM combat_notifications 
WHERE status IN ('pending', 'in_progress');

-- Limpar combates antigos
DELETE FROM combat_notifications 
WHERE status = 'cancelled' 
AND created_at < NOW() - INTERVAL '1 day';
```

---

## ✅ Checklist Pré-Uso

Antes de usar em produção:

- [ ] Tabela criada no Supabase
- [ ] Realtime habilitado
- [ ] Build sem erros
- [ ] Testado em 2 navegadores
- [ ] Sincronização funcionando
- [ ] Performance aceitável

---

## 🎉 Pronto!

Agora você tem um sistema de combate completo e funcional!

**Boa sorte e bons combates!** ⚔️🛡️

---

**Versão**: 1.0.0  
**Atualizado**: 2 de novembro de 2025
