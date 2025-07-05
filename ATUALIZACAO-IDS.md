# Atualização: IDs de Sala com 6 Dígitos

## 🎯 O que mudou?

Os IDs das salas agora são **códigos simples de 6 dígitos** ao invés de UUIDs longos:

**Antes**: `f47ac10b-58cc-4372-a567-0e02b2c3d479`  
**Agora**: `123456`

## 🔄 Como atualizar

### 1. Se você ainda NÃO configurou o Supabase

✅ **Situação ideal!** Apenas execute o arquivo `supabase-setup.sql` normalmente.

### 2. Se você JÁ configurou o Supabase

⚠️ **Atenção**: Esta migração apagará todas as salas existentes.

1. **Backup opcional** (se tiver dados importantes):
   ```sql
   -- No SQL Editor do Supabase
   SELECT * FROM public.rooms;
   SELECT * FROM public.players;
   ```

2. **Execute a migração**:
   - No Supabase, vá em **SQL Editor**
   - Execute o conteúdo do arquivo `supabase-migration.sql`

3. **Verifique se funcionou**:
   ```sql
   -- Deve retornar as tabelas vazias
   SELECT * FROM public.rooms;
   SELECT * FROM public.players;
   ```

### 3. Atualizar o código

1. **Pull das mudanças**:
   ```bash
   git pull origin main
   npm install  # Não há novas dependências
   ```

2. **Testar localmente**:
   ```bash
   npm start
   ```

3. **Deploy no Vercel**:
   - O deploy é automático após o push
   - Não precisa alterar variáveis de ambiente

## 🎮 Como usar os novos IDs

### Para o Mestre:
1. Crie uma sala normalmente
2. Compartilhe o código de **6 dígitos** (ex: `123456`)
3. Muito mais fácil de compartilhar por voz/chat!

### Para os Jogadores:
1. Digite apenas os **6 dígitos** do código
2. Não precisa mais copiar/colar UUIDs longos
3. Interface valida automaticamente o formato

## 🔧 Melhorias incluídas

- ✅ **IDs mais amigáveis**: 6 dígitos fáceis de compartilhar
- ✅ **Validação automática**: Só aceita números de 6 dígitos
- ✅ **Detecção de conflitos**: Sistema gera novo ID se houver duplicata
- ✅ **Interface aprimorada**: Placeholder e instruções claras
- ✅ **Compatibilidade total**: Todas as funcionalidades preservadas

## 🐛 Resolução de problemas

### "Erro ao criar sala":
- Verifique se executou a migração corretamente
- Confirme que as tabelas foram recriadas
- Teste no console: `SELECT * FROM public.rooms;`

### "Sala não encontrada":
- IDs antigos (UUIDs) não funcionam mais
- Todos precisam usar os novos códigos de 6 dígitos
- Recrie as salas se necessário

### "Políticas de segurança":
```sql
-- Execute se houver problemas de permissão
GRANT ALL ON public.rooms TO anon, authenticated;
GRANT ALL ON public.players TO anon, authenticated;
```

## 📊 Estatísticas

- **Possibilidades**: 900.000 códigos únicos (100000-999999)
- **Probabilidade de conflito**: 0.0001% com poucos usuários
- **Tempo de vida**: Salas inativas são limpas automaticamente
- **Performance**: Consultas mais rápidas com VARCHAR(6)

---

**Resultado**: Sistema muito mais amigável para compartilhar salas! 🎯
