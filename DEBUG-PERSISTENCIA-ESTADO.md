# 🔍 DEBUG: Teste Específico da Correção 1

## 🎯 **Objetivo**: Validar persistência de estado durante criação de personagem

### **Passo a Passo Detalhado:**

#### 1. **Preparação**
```
1. Abra http://localhost:3000
2. Abra o Console (F12 → Console)
3. Vá para "Jogar Online"
4. Crie uma nova sala (ex: "TESTE123", mestre "Admin")
```

#### 2. **Teste de Salvamento de Estado**
```
1. Na sala, clique em "Seleção de Personagem"
2. ✅ Console deve mostrar: "🔄 Estado mudou, salvando: { view: 'selection' }"
3. ✅ Console deve mostrar: "💾 Estado da aplicação salvo: { view: 'selection' }"

4. Escolha um personagem (ex: Andarilho)
5. ✅ Console deve mostrar: "🔄 Estado mudou, salvando: { view: 'builder', actor: 'Andarilho' }"
6. ✅ Console deve mostrar: "💾 Estado da aplicação salvo: { view: 'builder' }"

7. Vá para "Criação de Personagem"
8. ✅ Console deve mostrar: "🔄 Estado mudou, salvando: { view: 'sheet' }"
9. ✅ Console deve mostrar: "💾 Estado da aplicação salvo: { view: 'sheet' }"
```

#### 3. **Verificar Dados Salvos**
```
No console, execute:
console.log('Estado salvo:', JSON.parse(localStorage.getItem('killOrDie_appState')));

✅ Deve mostrar objeto com:
- currentView: "sheet"
- selectedActor: { dados do ator }
- timestamp: data atual
```

#### 4. **Teste de Recuperação**
```
1. Recarregue a página (F5)
2. ✅ Console deve mostrar: "📦 Dados recuperados do localStorage"
3. ✅ Console deve mostrar: "🔄 Dados salvos encontrados, tentando reconectar..."
4. ✅ Console deve mostrar: "📦 Estado da aplicação recuperado: { view: 'sheet' }"
5. ✅ Console deve mostrar: "📖 Restaurando ator selecionado: Andarilho"
6. ✅ Console deve mostrar: "📖 Restaurando view: sheet"
7. ✅ Deve voltar para a tela de "Criação de Personagem"
8. ✅ Personagem "Andarilho" deve estar selecionado
```

#### 5. **Se NÃO Funcionar:**
```
Execute no console:
// Verificar o que está salvo
console.log('Player:', localStorage.getItem('killOrDie_currentPlayer'));
console.log('Room:', localStorage.getItem('killOrDie_currentRoom'));
console.log('AppState:', localStorage.getItem('killOrDie_appState'));

// Se algum estiver null, o problema é no salvamento
// Se todos estão ok, o problema é na recuperação
```

## 🚨 **Possíveis Problemas e Soluções:**

### **Problema 1**: Console não mostra logs de salvamento
**Causa**: useEffect não está sendo chamado
**Solução**: Verificar se há erros JavaScript

### **Problema 2**: Estado salvo está null
**Causa**: Função saveAppState não está sendo chamada
**Solução**: Adicionar mais logs nas funções de mudança de estado

### **Problema 3**: Estado recuperado mas não aplicado
**Causa**: Problema na função handleReconnectPlayer
**Solução**: Verificar ordem de setStates

---

**📋 Execute este teste e me informe exatamente quais logs aparecem no console!**
