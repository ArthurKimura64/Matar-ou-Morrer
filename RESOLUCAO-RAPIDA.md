# 🚨 Resolução Rápida de Problemas

## Problemas Comuns e Soluções

### 1. ❌ Error 42710: "policy already exists"

**Erro**:
```
42710: policy "Allow public read access on rooms" for table "rooms" already exists
```

**Solução**:
```sql
-- Execute no SQL Editor do Supabase:
-- Copie e cole o conteúdo do arquivo: supabase-fix-policies.sql
```

**Ou manualmente**:
```sql
DROP POLICY IF EXISTS "Allow public read access on rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow public insert access on rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow public update access on rooms" ON public.rooms;
-- ... (repita para players)
```

### 2. ❌ "Sala não encontrada"

**Sintomas**: Jogador tenta entrar na sala mas recebe erro

**Verificações**:
1. **ID correto**: Certifique-se que é um código de 6 dígitos
2. **Sala ativa**: Execute no Supabase:
   ```sql
   SELECT * FROM public.rooms WHERE id = '123456' AND is_active = true;
   ```
3. **Permissões**: Execute:
   ```sql
   SELECT * FROM public.rooms LIMIT 1;
   -- Não deve dar erro de permissão
   ```

### 3. ❌ "Jogadores não aparecem em tempo real"

**Sintomas**: Novos jogadores não aparecem para os outros

**Debug**:
1. **Console do navegador** (F12):
   ```
   ✅ Deve aparecer: "Status da subscription: SUBSCRIBED"
   ❌ Se aparecer: "CLOSED" ou erro → problema de Realtime
   ```

2. **Verificar Realtime**:
   ```sql
   SELECT schemaname, tablename 
   FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime';
   -- Deve mostrar: rooms e players
   ```

3. **Forçar refresh**: Clique no botão 🔄 na interface

### 4. ❌ "Cannot read properties of undefined"

**Sintomas**: Erro JavaScript no console

**Verificações**:
1. **Variáveis de ambiente**:
   ```env
   REACT_APP_SUPABASE_URL=https://seu-projeto.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=eyJ...
   ```

2. **Build limpo**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

### 5. ❌ Deploy no Vercel falha

**Sintomas**: Build falha no Vercel

**Verificações**:
1. **Variáveis no Vercel**: Configuradas em Project Settings
2. **Build local**: `npm run build` deve funcionar
3. **Logs do Vercel**: Verificar erros específicos

### 6. ❌ "Subscription failed"

**Sintomas**: WebSocket não conecta

**Soluções**:
1. **Rede**: Testar em outra rede (alguns firewalls bloqueiam)
2. **URL**: Verificar se termina com `.supabase.co`
3. **Chave**: Verificar se está correta

### 7. ❌ Error 42703: "column 'status' does not exist"

**Erro**:
```
42703: column "status" of relation "public.players" does not exist
```

**Causa**: Banco de dados criado com versão antiga que não tinha as colunas de status.

**Solução Rápida**:
```sql
-- Execute no SQL Editor do Supabase:
-- Copie e cole o conteúdo do arquivo: supabase-fix-status-column.sql
```

**Ou execute este comando**:
```sql
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'selecting';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS character_name VARCHAR(100);
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE public.players ADD CONSTRAINT players_status_check CHECK (status IN ('selecting', 'creating', 'ready'));
```

**Verificação**:
```sql
SELECT status, character_name FROM public.players LIMIT 1;
-- Deve funcionar sem erro
```

## 🔧 Scripts de Diagnóstico

### Teste Completo do Banco:
```sql
-- 1. Testar tabelas
SELECT 'Tabela rooms OK' as status, COUNT(*) as total FROM public.rooms;
SELECT 'Tabela players OK' as status, COUNT(*) as total FROM public.players;

-- 2. Testar Realtime
SELECT 'Realtime:' as status, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('rooms', 'players');

-- 3. Testar políticas
SELECT 'Políticas rooms:' as status, COUNT(*) as total 
FROM pg_policies 
WHERE tablename = 'rooms';

SELECT 'Políticas players:' as status, COUNT(*) as total 
FROM pg_policies 
WHERE tablename = 'players';
```

### Teste de Inserção:
```sql
-- Teste manual (substitua os valores)
INSERT INTO public.rooms (id, name, master_name) 
VALUES ('999999', 'Teste', 'Admin');

INSERT INTO public.players (room_id, name) 
VALUES ('999999', 'Jogador Teste');

-- Verificar se funcionou
SELECT * FROM public.rooms WHERE id = '999999';
SELECT * FROM public.players WHERE room_id = '999999';

-- Limpar teste
DELETE FROM public.players WHERE room_id = '999999';
DELETE FROM public.rooms WHERE id = '999999';
```

## 📞 Ordem de Verificação

1. ✅ **Variáveis de ambiente** configuradas
2. ✅ **Tabelas criadas** no Supabase
3. ✅ **Políticas aplicadas** sem erro
4. ✅ **Realtime habilitado** nas tabelas
5. ✅ **Build local** funciona (`npm run build`)
6. ✅ **Console logs** mostram conexão OK
7. ✅ **Teste com 2 abas** - sincronização em tempo real

---

**🎯 Resultado esperado**: Todos os jogadores veem outros jogadores em tempo real!
