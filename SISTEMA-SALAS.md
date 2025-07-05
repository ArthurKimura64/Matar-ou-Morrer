# Sistema de Salas - Guia de Configuração

## Visão Geral

O sistema de salas permite que múltiplos jogadores se conectem para criar personagens juntos em tempo real. A implementação utiliza:

- **Frontend**: React com hooks para gerenciamento de estado
- **Backend**: Supabase (gratuito) para banco de dados e realtime
- **Hospedagem**: Vercel (compatível com 100% das funcionalidades)

## 🚀 Configuração Rápida

### 1. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie uma conta gratuita
3. Crie um novo projeto
4. Anote a **URL do projeto** e a **chave anon/public**

### 2. Configurar banco de dados

1. No painel do Supabase, vá em **SQL Editor**
2. Copie e execute o conteúdo do arquivo `supabase-setup.sql`
3. Isso criará as tabelas `rooms` e `players` com:
   - Políticas de segurança necessárias
   - Sistema de limpeza automática integrado
   - Funções de teste e monitoramento
   - Triggers para atualização automática de atividade

**✅ Após executar o SQL, você verá:**
- Tabelas criadas com sucesso
- Teste automático do sistema de limpeza
- Estatísticas iniciais do sistema

**⚠️ Se receber erro de "policy already exists":**
- Use o arquivo `supabase-fix-policies.sql` primeiro
- Depois execute o `supabase-setup.sql` normalmente

### 3. Configurar variáveis de ambiente

1. Copie o arquivo `.env.example` para `.env.local`
```bash
cp .env.example .env.local
```

2. Edite o `.env.local` com suas credenciais:
```env
REACT_APP_SUPABASE_URL=https://sua-url-do-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

### 4. Instalar dependências e executar

```bash
npm install
npm start
```

## 🌐 Deploy no Vercel

### 1. Conectar repositório

1. Acesse [vercel.com](https://vercel.com)
2. Conecte seu repositório GitHub
3. Configure as variáveis de ambiente no painel do Vercel:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`

### 2. Deploy automático

O Vercel fará o deploy automaticamente a cada push no repositório.

## 📋 Como Usar o Sistema de Salas

### Para o Mestre (criador da sala):

1. Na tela inicial, escolha "Modo Multiplayer"
2. Clique em "Criar Sala"
3. Digite o nome da sala e seu nome
4. Compartilhe o **código de 6 dígitos** da sala com os jogadores
5. Aguarde os jogadores se conectarem
6. Todos podem criar seus personagens simultaneamente

### Para os Jogadores:

1. Na tela inicial, escolha "Modo Multiplayer"
2. Clique em "Entrar em Sala"
3. Digite o código de 6 dígitos fornecido pelo mestre
4. Digite seu nome
5. Crie seu personagem normalmente

## 🔧 Funcionalidades do Sistema

### ✅ Implementadas:

- ✅ Criação e entrada em salas
- ✅ Visualização de jogadores conectados em tempo real
- ✅ Sincronização de personagens criados
- ✅ Interface responsiva
- ✅ Código de sala simples (6 dígitos)
- ✅ Desconexão automática ao sair
- ✅ **Sistema de limpeza automática integrado**
- ✅ **Painel de administração com estatísticas**
- ✅ **Monitoramento de atividade dos jogadores**

## 🧹 Sistema de Limpeza Automática

O sistema inclui limpeza automática para manter o banco organizado:

### Como funciona:
- **Jogadores inativos**: Removidos automaticamente após 2 horas de inatividade
- **Salas vazias**: Marcadas como inativas e removidas se ficarem vazias por 2+ horas
- **Execução automática**: A cada 10 minutos em salas ativas
- **Monitoramento**: Painel de administração com estatísticas em tempo real

### Comandos para teste (SQL Editor do Supabase):
```sql
-- Ver estatísticas do sistema
SELECT get_system_stats();

-- Executar limpeza manual
SELECT cleanup_inactive_data();

-- Testar sistema de limpeza
SELECT test_cleanup_system();
```

### Painel de Administração:
1. **Via React**: Acesse `http://localhost:3000?admin=true`
2. **Via HTML**: Acesse `http://localhost:3000/admin.html`
3. Veja estatísticas em tempo real
4. Execute limpeza manual quando necessário
5. Monitore jogadores e salas inativos

### Configuração das Credenciais:
- **Automática**: As credenciais são herdadas do `.env.local` da aplicação React
- **Manual**: Crie `public/env-config.json` com suas credenciais (use `env-config.json.example` como modelo)

**⚠️ Nota:** O painel de administração está disponível em páginas separadas para manter a interface principal limpa.

### 🚀 Possíveis melhorias futuras:

- 🔄 Chat entre jogadores
- 🔄 Sistema de turnos
- 🔄 Compartilhamento de dados do mestre
- 🔄 Histórico de salas
- 🔄 Autenticação de usuários

## 💡 Arquitetura Técnica

### Componentes Criados:

- `RoomLobby`: Interface para criar/entrar em salas
- `RoomView`: Visualização da sala com jogadores conectados
- `RoomService`: Serviço para comunicação com Supabase

### Fluxo de Dados:

1. **Criação de Sala**: 
   - Cria registro na tabela `rooms`
   - Adiciona mestre como primeiro jogador na tabela `players`

2. **Entrada na Sala**:
   - Adiciona jogador na tabela `players` 
   - Subscription para mudanças em tempo real

3. **Criação de Personagem**:
   - Atualiza campo `character` na tabela `players`
   - Outros jogadores veem a atualização instantaneamente

### Realtime:

Utiliza o sistema de **subscriptions** do Supabase que funciona via WebSockets, proporcionando:
- Atualizações instantâneas quando jogadores entram/saem
- Sincronização automática de personagens criados
- Zero configuração adicional necessária

## 🆓 Limites Gratuitos

### Supabase (Tier Gratuito):
- 500MB de banco de dados
- 2GB de transferência/mês
- 50.000 requisições/mês
- Realtime unlimited

### Vercel (Tier Gratuito):
- 100GB de bandwidth/mês
- Builds unlimited
- Domínios personalizados
- Edge Functions

Para uma aplicação de RPG com amigos, esses limites são mais do que suficientes!

## 🔒 Segurança

O sistema atual permite acesso público às salas (sem autenticação) para simplicidade. Para versões de produção, considere:

1. **Autenticação**: Implementar login via Supabase Auth
2. **Permissões**: Apenas mestres podem modificar certas configurações
3. **Rate Limiting**: Limitar criação de salas por IP/usuário
4. **Moderação**: Sistema para reportar salas inadequadas

## 🐛 Troubleshooting

### Erro de conexão com Supabase:
- Verifique se as variáveis de ambiente estão corretas
- Confirme se o SQL foi executado corretamente
- Teste a conexão no console do navegador

### Realtime não funciona:
- Verifique se as políticas RLS estão ativas
- Confirme se o plano do Supabase suporta realtime
- Teste com múltiplas abas do navegador

### Deploy no Vercel falha:
- Confirme se as variáveis de ambiente estão configuradas
- Verifique se não há erros de build no log
- Teste localmente antes do deploy

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do console do navegador
2. Consulte a documentação do [Supabase](https://supabase.com/docs)
3. Verifique a documentação do [Vercel](https://vercel.com/docs)

---

**Resultado**: Sistema de salas multiplayer 100% gratuito e compatível com Vercel! 🎮
