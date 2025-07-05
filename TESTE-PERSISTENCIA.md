# 🧪 Script de Teste - Sistema de Persistência de Jogadores

## ✅ Testes Manuais para Validar a Implementação

### 1. **Teste de Entrada Normal**
```
1. Abra a aplicação
2. Vá para "Jogar Online"
3. Crie uma sala ou entre em uma existente
4. ✅ Verifique se o jogador foi criado normalmente
```

### 2. **Teste de Persistência (Recarregamento)**
```
1. Entre em uma sala
2. Vá para "Seleção de Personagem"
3. Escolha um personagem (ex: Andarilho)
4. Vá para "Criação de Personagem"
5. Preencha alguns campos (nome, características)
6. Recarregue a página (F5 ou Ctrl+R)
7. ✅ Deve reconectar automaticamente na mesma sala
8. ✅ Deve voltar para a tela de "Criação de Personagem"
9. ✅ Personagem selecionado deve estar mantido
10. ✅ Campos preenchidos devem estar mantidos
```

### 3. **Teste de Reconexão (Fechar/Abrir)**
```
1. Entre em uma sala
2. Feche completamente o navegador
3. Abra o navegador novamente
4. Acesse a aplicação
5. ✅ Deve reconectar automaticamente
```

### 4. **Teste de Jogador Existente (Múltiplas Abas)**
```
1. Entre em uma sala com nome "TestPlayer"
2. Abra nova aba (Ctrl+T)
3. Acesse http://localhost:3000
4. Tente entrar na MESMA sala com MESMO nome
5. ✅ Deve criar NOVO jogador (não reconectar)
6. ✅ Deve haver 2 jogadores com mesmo nome na sala
7. ✅ Console deve mostrar: "🆕 Criando novo jogador na sala"
```

### 5. **Teste de Saída Definitiva**
```
1. Entre em uma sala
2. Clique em "Sair da Sala"
3. ✅ Console deve mostrar: "🚪 Jogador saindo da sala: [playerId]"
4. ✅ Console deve mostrar: "✅ Jogador removido da sala com sucesso"
5. ✅ Console deve mostrar: "🗑️ Dados do jogador removidos do localStorage"
6. Tente entrar novamente na mesma sala
7. ✅ Deve criar novo jogador
8. ✅ Dados antigos devem ter sido limpos
```

### 6. **Teste de Sala Inexistente**
```
1. Entre em uma sala
2. Feche a aplicação
3. Admin remove a sala pelo painel
4. Abra a aplicação novamente
5. ✅ Deve limpar dados salvos
6. ✅ Deve voltar ao lobby
```

### 7. **Teste no Console do Navegador**
```javascript
// Verificar dados salvos
console.log('Player:', localStorage.getItem('killOrDie_currentPlayer'));
console.log('Room:', localStorage.getItem('killOrDie_currentRoom'));
console.log('AppState:', localStorage.getItem('killOrDie_appState'));

// Limpar dados manualmente (se necessário)
localStorage.removeItem('killOrDie_currentPlayer');
localStorage.removeItem('killOrDie_currentRoom');
localStorage.removeItem('killOrDie_appState');

// Testar salvamento manual de estado
localStorage.setItem('killOrDie_appState', JSON.stringify({
  currentView: 'builder',
  selectedActor: { name: 'TestActor' },
  characterSelections: { test: 'data' },
  timestamp: new Date().toISOString()
}));
console.log('Estado de teste salvo, recarregue a página');
```

### 8. **DEBUG: Teste Específico de Persistência**
```
1. Entre em uma sala
2. Abra o console (F12)
3. Vá para "Seleção de Personagem"
4. Console deve mostrar: "💾 Estado da aplicação salvo: selection"
5. Escolha um personagem
6. Console deve mostrar: "💾 Estado da aplicação salvo: builder"
7. Vá para criação de personagem
8. Console deve mostrar: "💾 Estado da aplicação salvo: sheet"
9. Recarregue a página
10. Console deve mostrar: "📦 Estado da aplicação recuperado: sheet"
11. ✅ Deve voltar para a tela de criação
```

## 🔍 Logs a Observar

### Logs de Entrada Primeira Vez:
```
🔍 Verificando jogador existente: [nome] na sala: [id]
🆕 Nenhum jogador existente encontrado
🆕 Criando novo jogador na sala
✅ Novo jogador criado com sucesso
✅ Dados do jogador salvos no localStorage
```

### Logs de Reconexão:
```
📦 Dados recuperados do localStorage
🔄 Tentando reconectar jogador: [nome] na sala: [id]
🔄 Reconectando jogador: [playerId]
✅ Jogador reconectado com sucesso
🔄 Dados do jogador atualizados
```

### Logs de Jogador Existente:
```
🔍 Verificando jogador existente: [nome] na sala: [id]
✅ Jogador existente encontrado: [playerId]
🔄 Jogador existente encontrado, reconectando
✅ Jogador reconectado com sucesso
```

### Logs de Limpeza:
```
🗑️ Sala não encontrada, limpando dados salvos
🗑️ Dados do jogador removidos do localStorage
```

## ⚠️ Problemas Esperados e Soluções

### Problema: "Dados corrompidos"
**Solução**: A função `validateSavedData()` limpa automaticamente

### Problema: "Jogador não reconecta"
**Verificar**:
1. Se a sala ainda existe
2. Se o jogador ainda existe no banco
3. Logs no console para debug

### Problema: "Ainda cria jogadores duplicados"
**Verificar**:
1. Se a função `findExistingPlayer()` está funcionando
2. Se os nomes são exatamente iguais (case-sensitive)
3. Logs de verificação no console

## 📊 Métricas de Sucesso

### Antes da Implementação:
- **Recarregar página**: Novo jogador criado
- **Fechar/abrir**: Novo jogador criado
- **Mesmo nome**: Múltiplos jogadores

### Depois da Implementação:
- **Recarregar página**: ✅ Mesmo jogador reconectado
- **Fechar/abrir**: ✅ Mesmo jogador reconectado
- **Mesmo nome**: ✅ Jogador existente reutilizado

---

## 🎯 Validação Final

Execute TODOS os testes acima e confirme:
- ✅ Reconexão automática funciona
- ✅ Não há jogadores duplicados
- ✅ Dados são persistidos corretamente
- ✅ Limpeza funciona quando necessário
- ✅ Experiência do usuário é fluida

**Se todos os testes passarem, o sistema está funcionando perfeitamente!** 🎉
