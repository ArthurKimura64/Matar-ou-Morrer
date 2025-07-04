# Deploy no Vercel - Configuração Detalhada

## 1. Preparação do Repositório

Certifique-se de que todos os arquivos estão commitados:

```bash
git add .
git commit -m "Implementa sistema de salas multiplayer"
git push origin main
```

## 2. Configuração no Vercel

### 2.1 Criar projeto no Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "New Project"
3. Conecte seu repositório GitHub
4. Selecione o repositório "Matar-ou-Morrer"

### 2.2 Configurar variáveis de ambiente

**IMPORTANTE**: Configure essas variáveis ANTES do primeiro deploy:

1. Na página de configuração do projeto no Vercel
2. Vá em "Environment Variables"
3. Adicione:

```
REACT_APP_SUPABASE_URL = https://seu-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.3 Configurações de Build

O Vercel detectará automaticamente que é um projeto React. As configurações padrão funcionam:

- **Framework Preset**: Create React App
- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Install Command**: `npm install`

## 3. Configuração do Supabase

### 3.1 Criar projeto no Supabase

1. Acesse [app.supabase.com](https://app.supabase.com)
2. Clique em "New Project"
3. Escolha uma organização
4. Preencha:
   - **Name**: matar-ou-morrer
   - **Database Password**: (gere uma senha forte)
   - **Region**: South America (São Paulo) - se disponível

### 3.2 Configurar banco de dados

1. Aguarde a criação do projeto (2-3 minutos)
2. Vá em **SQL Editor**
3. Copie e cole o conteúdo do arquivo `supabase-setup.sql`
4. Clique em "Run" para executar

### 3.3 Obter credenciais

1. Vá em **Settings** > **API**
2. Copie:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Project API Key (anon/public)**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## 4. Deploy e Teste

### 4.1 Primeiro deploy

1. No Vercel, clique em "Deploy"
2. Aguarde o build completar (2-3 minutos)
3. Acesse a URL fornecida

### 4.2 Teste das funcionalidades

1. **Teste Solo**: 
   - Clique em "Modo Solo"
   - Verifique se a criação de personagem funciona

2. **Teste Multiplayer**:
   - Abra duas abas/navegadores
   - Em uma, crie uma sala
   - Na outra, entre na sala usando o ID
   - Verifique se os jogadores aparecem em tempo real

### 4.3 Resolução de problemas

**Erro 500 / Erro de conexão**:
```bash
# Verifique as variáveis no Vercel
1. Vá em Project Settings
2. Environment Variables
3. Certifique-se que as URLs estão corretas
4. Redeploy após qualquer mudança
```

**Realtime não funciona**:
```sql
-- Execute novamente no Supabase SQL Editor
SELECT * FROM auth.users; -- Deve retornar vazio (sem erro)
SELECT * FROM public.rooms; -- Deve funcionar
SELECT * FROM public.players; -- Deve funcionar
```

## 5. Domínio Personalizado (Opcional)

1. No Vercel, vá em **Domains**
2. Adicione seu domínio personalizado
3. Configure DNS conforme instruções

## 6. Monitoramento

### 6.1 Logs do Vercel
- **Functions**: Veja erros de servidor
- **Analytics**: Monitor de tráfego
- **Speed Insights**: Performance

### 6.2 Logs do Supabase
- **Database**: Queries em tempo real
- **API**: Requisições e erros
- **Auth**: (se implementar no futuro)

## 7. Limites e Escalabilidade

### Vercel (Free Tier):
- ✅ 100GB bandwidth/mês
- ✅ Builds ilimitados
- ✅ Edge Functions
- ❌ Serverless Functions: 10s timeout

### Supabase (Free Tier):
- ✅ 500MB database
- ✅ 2GB bandwidth/mês
- ✅ 50K requests/mês
- ✅ Realtime unlimited

**Para uso pessoal/amigos**: Mais que suficiente!
**Para uso comercial**: Considere upgrades quando necessário.

## 8. Atualizações Futuras

Para adicionar novas funcionalidades:

```bash
# 1. Desenvolva localmente
npm start

# 2. Teste completamente
npm run build

# 3. Commit e push
git add .
git commit -m "Nova funcionalidade"
git push origin main

# 4. Vercel faz deploy automático
```

## 9. Backup e Segurança

### 9.1 Backup do banco (Supabase)
```sql
-- Exportar dados das salas ativas
SELECT * FROM public.rooms WHERE is_active = true;
-- Pode fazer via Dashboard > Database > Backups
```

### 9.2 Segurança básica
- ✅ RLS (Row Level Security) ativado
- ✅ Políticas públicas (apropriado para o uso caso)
- ⚠️ Para produção: implementar autenticação

---

## 🎯 Checklist Final

- [ ] Repositório no GitHub atualizado
- [ ] Projeto criado no Supabase
- [ ] SQL executado no Supabase
- [ ] Credenciais copiadas
- [ ] Projeto criado no Vercel
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy realizado com sucesso
- [ ] Teste de funcionalidades completo

**Resultado**: Aplicação multiplayer funcionando 100% gratuita! 🚀
