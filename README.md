# App Financeiro

Base técnica de um aplicativo de controle financeiro pessoal com React,
TypeScript, Vite e Supabase.

## Preparação

Use Node.js **24.18.0**, fixado em `.node-version`, e npm (validado com 11.16.0).
Instale as dependências a partir do lockfile e crie o arquivo de ambiente:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.local`. A chave
do frontend deve ser a chave pública `anon`; nunca use `service_role` no navegador.

Há somente dois ambientes: frontend local (`npm run dev`) e frontend de produção
no Cloudflare Pages, ambos usando o Supabase remoto atual. Não há staging.
Operações financeiras feitas pelo frontend local com essas variáveis também
atingem o banco de produção. Os testes automatizados usam mocks e PostgreSQL
descartável em memória, sem acessar esse banco. Docker/Podman só é necessário
para os comandos opcionais da pilha Supabase local.

## Comandos

```powershell
npm run dev             # frontend em http://127.0.0.1:3000
npm run typecheck       # valida os tipos TypeScript
npm run lint            # análise estática
npm run build           # build de produção
npm run preview         # serve dist em http://127.0.0.1:3000
npm test                # todas as suítes locais: interface e banco descartável
npm run test:ui         # testa autenticação e todos os módulos da interface sem Supabase real
npm run test:db         # testes SQL em PostgreSQL descartável, sem Docker
npm run db:types        # regenera src/types/database.ts das migrations
npm run db:start        # inicia a pilha Supabase local (requer Docker/Podman)
npm run db:reset        # recria o banco local a partir das migrations
npm run db:lint         # valida o banco local pelo Supabase CLI
npm run db:push:dry     # mostra migrations pendentes no projeto vinculado
npm run db:push         # aplica migrations pendentes no projeto vinculado
npm run db:migrations   # compara o histórico local e remoto
```

## Arquitetura

As páginas privadas ficam sob `ProtectedRoute` e compartilham o layout em
`src/components/layout/`. Cada domínio financeiro mantém tipos, componentes,
hooks e acesso a dados em `src/features/<domínio>/`. Chamadas ao Supabase ficam
nos serviços; componentes não executam RPCs diretamente. Dashboard, Despesas,
Receitas e Faturas usam carregamento sob demanda por rota para reduzir o JavaScript
inicial.

O cliente usa apenas `VITE_SUPABASE_URL` e a chave pública
`VITE_SUPABASE_ANON_KEY`. Autorização e isolamento são garantidos novamente pelo
PostgreSQL com RLS, ownership, constraints e RPCs atômicas.

## Modelo financeiro

`transactions` representa receitas e despesas. `account_movements` é o livro-caixa
imutável que representa entradas e saídas reais das contas. Compras no cartão entram
em `credit_card_invoices` sem movimentar uma conta; pagar a fatura cria apenas uma
saída no livro-caixa.

Liquidações, pagamentos de fatura, estornos, transferências, parcelamentos e geração
de recorrências são RPCs PostgreSQL atômicas. As views `account_balances` e
`invoice_totals` calculam saldos e totais sem armazenar valores derivados.

## Contas

Em `/contas`, o usuário autenticado pode cadastrar, editar, desativar e reativar
contas. A página separa contas ativas e inativas e mostra o saldo atual obtido da
view `account_balances`; não há exclusão física nem cálculo de saldo no navegador.
O formulário aceita saldo inicial negativo e datas no formato `date` do banco.
Se uma conta já tiver movimentações, a interface pede confirmação antes de alterar
o saldo ou a data inicial. A migration `20260915000800` remove o bloqueio antigo
dessa edição; a view passa a considerar as movimentações a partir da nova data,
preservando o histórico no livro-caixa.

## Categorias

Em `/categorias`, o usuário autenticado pode criar, editar, desativar e reativar
categorias de despesa e receita. Os filtros combinam tipo e status; categorias
inativas continuam acessíveis para consulta do histórico. O índice existente
`categories_user_type_name_key` impede duplicidade por usuário, tipo e nome sem
diferenciar maiúsculas de minúsculas nem espaços nas extremidades. A interface
também detecta duplicatas na lista carregada e traduz erros do banco em mensagens
simples. O tipo fica bloqueado quando a categoria está vinculada a transações ou
recorrências; as chaves estrangeiras compostas do banco preservam essa regra mesmo
se a informação mudar durante a edição. Nenhuma migration adicional é necessária.

## Cartões de crédito

Em `/cartoes`, o usuário autenticado pode criar, editar, desativar e reativar
cartões, filtrando por status. A página mostra apenas o limite cadastrado e os dias
configurados de fechamento e vencimento; não calcula limite usado, disponível ou
total de fatura. O valor monetário usa o utilitário compartilhado em `src/lib/finance.ts`.
O banco aceita limite zero e dias de 1 a 31. A regra já existente `private.month_day`
usa o último dia válido quando o mês é mais curto; o frontend não gera faturas.

A migration `20260915000900` remove o bloqueio antigo de alteração do ciclo após
a primeira fatura. Cada fatura guarda suas próprias datas, que não são atualizadas
ao editar o cartão. Faturas criadas depois da edição leem os novos dias; faturas
já criadas, inclusive para meses futuros, conservam os dias anteriores. A interface
pede confirmação para mudar os dias de um cartão que já tenha faturas ou transações.
Essa regra está definida na migration versionada. O banco remoto atual já está
preparado; o deploy do frontend não aplica migrations.

## Despesas

Em `/despesas`, o usuário pode filtrar lançamentos por período, status, categoria
e forma prevista, acompanhar totais do período e criar despesas pendentes ou já
pagas. PIX, débito e dinheiro exigem uma conta; boleto, transferência bancária e
outros meios podem permanecer pendentes sem movimentar saldo. Compras no cartão
são ligadas à fatura pelo banco e não oferecem pagamento individual.

Parcelamentos geram uma transação por parcela e preservam a soma exata do valor.
Recorrências guardam a regra e suas notas, e podem gerar ocorrências futuras. O
pagamento usa `settle_transaction`; o estorno usa `reverse_movement` e mantém o
livro-caixa append-only. Despesas pagas, parceladas, com histórico ou em fatura
fechada aceitam apenas as alterações autorizadas pelo banco.

A migration `20260915001000` adiciona as operações atômicas de criação paga,
parcelamento fora do cartão, criação de recorrência e edição segura de despesas,
além do wrapper de compra em cartão. Ela também restringe a execução das novas
RPCs ao papel `authenticated` e fixa o `search_path` das funções privilegiadas.

## Receitas

Em `/receitas`, o usuário pode filtrar receitas por período, status e categoria,
acompanhar os totais por competência e criar lançamentos pendentes, recebidos ou
recorrentes. Uma receita pendente não altera o saldo. Ao receber, o sistema usa
`settle_transaction` e cria uma entrada `income_receipt`; o estorno usa
`reverse_movement`, preserva o livro-caixa e devolve a transação ao estado pendente.

A migration `20260916233012` adiciona wrappers atômicos para criação já recebida,
criação de recorrência e edição segura. Ocorrências recorrentes nascem pendentes,
mesmo quando a regra possui uma conta prevista. Funções privilegiadas validam o
usuário autenticado e têm execução restrita ao papel `authenticated`.

## Faturas

Em `/faturas`, o usuário pode filtrar faturas por cartão, status e mês de
referência. Cada cartão mostra o total calculado pela view `invoice_totals`, as
datas de fechamento e vencimento, o status e, quando houver, a conta e a data do
pagamento. Cartões e contas inativos permanecem identificados no histórico.

Os detalhes da fatura apresentam os lançamentos, categorias, datas, parcelas e
recorrências sem permitir edição. O fechamento usa `close_invoice`; o pagamento
de uma fatura fechada usa `pay_invoice` e exige uma conta ativa; o estorno do
pagamento usa `reverse_movement`. As confirmações e bloqueios na interface evitam
ações duplicadas, enquanto as RPCs preservam as transições de status e o
livro-caixa no banco. O módulo utiliza o esquema, as views e as RPCs existentes e
não exige migration adicional.

## Transferências

Em `/transferencias`, o usuário pode movimentar valores entre contas próprias,
filtrar o histórico por período ou conta e consultar contas inativas que fizeram
parte de operações antigas. Novas transferências aceitam somente contas ativas e
não impõem bloqueio por saldo insuficiente.

A RPC `transfer_between_accounts` cria atomicamente uma saída e uma entrada com o
mesmo `transfer_group_id`, sem criar receitas ou despesas em `transactions`. A
migration `20260917000100` adiciona `reverse_transfer_group`, que cria os dois
movimentos inversos em uma única transação, referencia os movimentos originais e
impede uma segunda reversão. O histórico permanece append-only.

## Dashboard

O Dashboard reúne três visões sem misturar suas fontes. Receitas, despesas,
resultado e categorias usam `transactions` por data de competência. Entradas e
saídas reais usam `account_movements`, excluindo transferências internas e seus
estornos do caixa consolidado. O saldo disponível e o saldo por conta vêm da view
`account_balances` e não dependem do período selecionado.

O filtro global oferece mês atual, mês anterior, últimos três ou seis meses, ano
atual e período personalizado. A view `invoice_totals` fornece os valores das
faturas abertas ou fechadas. Rankings, evolução mensal, próximos vencimentos,
recebimentos previstos, faturas e cartões são apresentados com valores textuais e
barras CSS acessíveis, sem adicionar uma biblioteca de gráficos ou nova migration.

Todas as tabelas públicas usam RLS. Chaves estrangeiras compostas impedem que um
registro referencie dados de outro usuário. As migrations versionadas são a fonte de
verdade do esquema em `supabase/migrations/`.

## Migrations e produção

As migrations em `supabase/migrations/` devem acompanhar o versionamento do
projeto. O Supabase remoto atual já é o banco de produção e está preparado.
Esta entrega não cria migrations, não altera o banco e não executa `db:push`.
Os scripts administrativos existentes ficam disponíveis para manutenção futura,
mas não fazem parte do build ou do deploy no Cloudflare.

## Limites dos testes sem Docker

`npm run test:db` executa migrations, constraints, triggers, funções e RLS no
PostgreSQL PGlite. A integração completa de GoTrue, PostgREST/JWT e concorrência
entre conexões não é coberta por essa suíte. O OAuth real e o comportamento no
Cloudflare precisam do smoke test após o deploy; não há ambiente de staging.

## Google OAuth para o projeto vinculado

O projeto vinculado é `jkxnzovgmwaiozitzosn`. O frontend local usa
`http://127.0.0.1:3000/` e retorna a essa URL depois da autenticação.

1. No [Google Auth Platform](https://console.cloud.google.com/auth), prepare a
   tela de consentimento e crie um OAuth Client ID do tipo **Web application**.
   Configure **Authorized JavaScript origins** como
   `http://127.0.0.1:3000`. Em **Authorized redirect URIs**, coloque a URL de
   callback do Supabase:
   `https://jkxnzovgmwaiozitzosn.supabase.co/auth/v1/callback`.
   Confira esse mesmo callback na página do provedor Google do projeto Supabase.
   Se a audiência estiver em modo de teste, adicione o usuário Google que fará
   o primeiro login à lista de test users.
2. No [dashboard deste projeto Supabase](https://supabase.com/dashboard/project/jkxnzovgmwaiozitzosn/auth/providers),
   abra **Authentication → Sign In / Providers → Google**, habilite o provedor
   e preencha **Client ID** e **Client Secret** obtidos do Google. Esses valores
   pertencem ao Supabase, não ao frontend ou ao Git.
3. Em **Authentication → URL Configuration**, mantenha as URLs locais em
   **Redirect URLs** conforme a lista na seção de deploy. Depois de publicar,
   **Site URL** será a URL de produção, mesmo durante o desenvolvimento local.
   `supabase/config.toml` configura apenas a pilha Supabase local; ele não
   configura o projeto hospedado, que é ajustado no dashboard.
4. Com `.env.local` configurado, execute `npm run dev`, visite
   `http://127.0.0.1:3000/login` e clique **Entrar com Google**. Após retornar
   ao Dashboard, atualize a página para conferir a persistência da sessão,
   abra as páginas no menu e clique **Sair** para conferir o logout.

Referências: [login Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
e [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls).

## Deploy em produção

### 1. Requisitos e Git

O destino é **Cloudflare Pages**, servindo uma SPA estática React/Vite, com o
Supabase remoto `jkxnzovgmwaiozitzosn`. O primeiro endereço pode ser
`https://NOME-DO-PROJETO.pages.dev`; não é necessário domínio personalizado.
Substitua esse exemplo pelo endereço real em todas as configurações abaixo.

O repositório Git já existe, na branch `master`, com um commit inicial. Na
preparação desta entrega havia alterações do MVP e cinco migrations ainda não
rastreadas. Revise e inclua esses arquivos no próximo commit; não execute
`git init` novamente. Nenhum commit, push ou deploy é executado por esta preparação.

```powershell
git status --short
git check-ignore .env.local node_modules dist
git add .
git diff --cached --stat
git diff --cached
git commit -m "feat: MVP financeiro pronto para produção"
```

Antes do commit, confirme que a revisão não contém credenciais. `.gitignore`
exclui arquivos `.env` (exceto `.env.example`), dependências, build, temporários,
logs e formatos comuns de credenciais. Isso não substitui a revisão de arquivos
novos. Preserve `package-lock.json` e todas as migrations. O repositório não
tem remoto configurado nesta entrega; configure e publique no provedor Git
escolhido somente quando decidir executar o deploy.

### 2. Build e validação local

Com Node.js 24.18.0 e `.env.local` preenchido:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

O build executa TypeScript e Vite e gera `dist/`. `npm test` reúne a interface
com Supabase simulado e os testes SQL em PGlite descartável. Nenhum desses
comandos aplica migrations no banco remoto. `preview` usa
`http://127.0.0.1:3000`; pare `dev` antes, pois ambos usam a porta 3000.

Verifique URLs diretas e refresh em `/`, `/login`, `/despesas`, `/receitas`,
`/faturas`, `/contas`, `/cartoes`, `/categorias` e `/transferencias`. Sem sessão,
rotas privadas devem abrir o login. Com sessão, devem aguardar sua recuperação
e exibir a página protegida. Confirme também que JavaScript e CSS retornam os
arquivos corretos, e não HTML. O preview valida o artefato local, não a CDN do
Cloudflare nem o OAuth real em produção.

O aviso de chunk acima de 500 kB não bloqueia a publicação. O lazy loading de
Dashboard, Despesas, Receitas e Faturas foi mantido.

### 3. Criar o projeto no Cloudflare Pages

Quando for publicar, em **Workers & Pages**, crie um projeto **Pages**, conecte
o repositório Git e configure:

| Campo | Valor |
| --- | --- |
| Production branch | `master` (branch atual; ajuste se for renomeada) |
| Framework preset | `Vite` |
| Root directory | raiz do repositório (deixe vazio) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js | `24.18.0`, selecionado pelo arquivo `.node-version` |
| Preview branch control | `None`, sem builds de branches de preview |

Se a interface exibir o preset como **Vite 3** ou **React (Vite)**, mantenha
os mesmos comandos e diretório acima. Não use uma configuração de Workers com
comando de deploy. Configure as duas variáveis abaixo no contexto **Production**
antes do primeiro build. Se já houver `NODE_VERSION` no painel, remova a
sobrescrita ou alinhe com `24.18.0`; essa é uma configuração do build e não uma
variável do frontend. O Pages não usa `package.json.engines` para selecionar
Node na imagem de build v3. [Build image](https://developers.cloudflare.com/pages/configuration/build-image/)

Para manter somente desenvolvimento local e produção, desative builds de preview
em **Branch control → Preview branch control → None**. Não cadastre URLs de
preview no OAuth. [Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)

**SPA fallback:** usamos o comportamento nativo do Pages: `dist/index.html`
existe e não há `dist/404.html`. Assim, acessos diretos e refresh em rotas React
recebem o documento da SPA, e `BrowserRouter` e `ProtectedRoute` decidem o que
renderizar. Não adicione um `404.html` na raiz nem Functions que interceptem
essas rotas. Não é necessário `public/_redirects` ou Wrangler nesta estrutura.
[Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)

### 4. Variáveis e credenciais

O frontend lê somente estas variáveis, tanto em `.env.local` quanto no build
de produção no Pages:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

No painel do Pages, preencha a URL do projeto Supabase e sua chave pública
`anon`. `.env.example` permanece sem valores reais. Variáveis `VITE_*` são
incorporadas ao JavaScript durante o build e ficam visíveis no navegador;
alterá-las exige um novo build/deploy. A chave `anon` é pública; o controle de
acesso depende de Supabase Auth e das políticas RLS existentes.

Nunca coloque `service_role`, chaves `sb_secret_`, senha do banco, access token
administrativo ou Google Client Secret em variáveis `VITE_*`, código, README ou
Git. O frontend não precisa dessas credenciais. Evite registrar sessões, tokens,
dados pessoais ou respostas completas do Supabase em logs.

### 5. Supabase após obter a URL final

No [projeto Supabase](https://supabase.com/dashboard/project/jkxnzovgmwaiozitzosn/auth/url-configuration),
abra **Authentication → URL Configuration** e configure:

**Site URL:** `https://NOME-DO-PROJETO.pages.dev/`.

**Redirect URLs:** cadastre cada URL exata abaixo, substituindo o hostname do
exemplo. Os paths privados são necessários porque o login preserva a página
originalmente solicitada. Não há rota `/auth/callback` no frontend.

```text
https://NOME-DO-PROJETO.pages.dev/
https://NOME-DO-PROJETO.pages.dev/despesas
https://NOME-DO-PROJETO.pages.dev/receitas
https://NOME-DO-PROJETO.pages.dev/faturas
https://NOME-DO-PROJETO.pages.dev/contas
https://NOME-DO-PROJETO.pages.dev/cartoes
https://NOME-DO-PROJETO.pages.dev/categorias
https://NOME-DO-PROJETO.pages.dev/transferencias
http://127.0.0.1:3000/
http://127.0.0.1:3000/despesas
http://127.0.0.1:3000/receitas
http://127.0.0.1:3000/faturas
http://127.0.0.1:3000/contas
http://127.0.0.1:3000/cartoes
http://127.0.0.1:3000/categorias
http://127.0.0.1:3000/transferencias
```

Use os paths sem barra final, como no menu. Para login local, use o hostname
`127.0.0.1` que os scripts exibem; `localhost` é uma origem diferente e exigiria
sua própria lista. Evite curingas de domínio em produção. O código monta
`redirectTo` a partir de `window.location.origin` e valida a origem do destino;
nenhuma URL de produção é fixada no código.
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### 6. Google OAuth em produção

No [Google Auth Platform](https://console.cloud.google.com/auth), selecione o
projeto e o OAuth Client ID do tipo **Web application** já utilizado pelo
provedor Google no Supabase. Configure em **Clients**:

- **Authorized JavaScript origins:** `https://NOME-DO-PROJETO.pages.dev`, sem
  path nem barra final. A origem local usada no desenvolvimento é
  `http://127.0.0.1:3000`.
- **Authorized redirect URIs:** mantenha exatamente
  `https://jkxnzovgmwaiozitzosn.supabase.co/auth/v1/callback`.

O retorno do Google vai ao Supabase, que então encaminha para o frontend:

```text
Cloudflare → Supabase Auth → Google → callback Supabase → Cloudflare
```

Confira **Audience / Publishing status** e **Branding**. Para disponibilizar
além do uso de teste, ajuste o status para **In production** e atenda às
exigências de verificação que o painel indicar. Revise nome do aplicativo,
contato, URLs de apresentação/privacidade e domínios autorizados conforme
solicitado pelo Google. A hospedagem no Pages não publica automaticamente a
tela de consentimento. [Google: preparação para produção](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

O **Client ID** e o **Client Secret** ficam em **Supabase → Authentication →
Sign In / Providers → Google**. Não adicione o secret ao Cloudflare nem ao
frontend. Se essas credenciais não mudaram, basta revisar a configuração já
existente. [Login Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)

### 7. Smoke test pós-deploy

Execute somente quando houver URL de produção e o OAuth estiver configurado.
Como o banco é real, use sua conta e lançamentos pequenos identificados como
teste; lembre que operações financeiras podem preservar histórico.

- [ ] Abrir a URL HTTPS do Pages sem erros de carregamento de JS/CSS.
- [ ] Sem sessão, acessar diretamente cada rota privada e confirmar o login.
- [ ] Fazer login Google, inclusive partindo de `/despesas`, e conferir o retorno.
- [ ] Com sessão, abrir diretamente e atualizar cada rota privada sem 404.
- [ ] Fazer logout e confirmar que rotas privadas voltam ao login.
- [ ] Entrar novamente e conferir o Dashboard.
- [ ] Abrir Contas e conferir os dados e saldos.
- [ ] Abrir Categorias.
- [ ] Abrir Cartões.
- [ ] Criar uma despesa e conferir sua situação e efeito esperado no saldo.
- [ ] Criar uma receita e conferir sua situação e efeito esperado no saldo.
- [ ] Visualizar uma fatura e seus lançamentos.
- [ ] Fazer uma transferência entre contas próprias e conferir os dois saldos.
- [ ] Conferir o saldo consolidado após as operações.
- [ ] Conferir menu, formulários e tabelas em tela pequena e desktop.
- [ ] Conferir console sem logs de sessão, tokens ou dados pessoais.

### 8. Rollback básico

No Pages, abra **Deployments**, localize um deploy de produção anterior que
esteja funcionando e use **Rollback to this deployment**. Verifique o login,
rotas diretas e assets novamente. Se ainda não houver deploy anterior (primeira
publicação), corrija o problema e publique um novo build.
[Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)

O rollback restaura o frontend, incluindo as variáveis incorporadas naquele
build; não desfaz dados, migrations, configurações do Supabase ou do Google.
Mantenha a URL canônica e o OAuth alinhados e corrija também o código no Git,
pois o próximo deploy usará novamente a branch de produção.
