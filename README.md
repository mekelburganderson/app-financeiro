# App Financeiro

Base técnica de um aplicativo de controle financeiro pessoal com React,
TypeScript, Vite e Supabase.

## Preparação

Requer Node.js 20.19+ e, para a pilha Supabase local completa, Docker Desktop ou
Podman. Instale as dependências e crie o arquivo de ambiente:

```powershell
npm install
Copy-Item .env.example .env.local
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.local`. A chave
do frontend deve ser a chave pública `anon`; nunca use `service_role` no navegador.

## Comandos

```powershell
npm run dev             # frontend em http://127.0.0.1:3000
npm run typecheck       # valida os tipos TypeScript
npm run lint            # análise estática
npm run build           # build de produção
npm run test:db         # testes SQL em PostgreSQL descartável, sem Docker
npm run db:types        # regenera src/types/database.ts das migrations
npm run db:start        # inicia a pilha Supabase local (requer Docker/Podman)
npm run db:reset        # recria o banco local a partir das migrations
npm run db:lint         # valida o banco local pelo Supabase CLI
npm run db:push:dry     # mostra migrations pendentes no projeto vinculado
npm run db:push         # aplica migrations pendentes no projeto vinculado
npm run db:migrations   # compara o histórico local e remoto
```

## Modelo financeiro

`transactions` representa receitas e despesas. `account_movements` é o livro-caixa
imutável que representa entradas e saídas reais das contas. Compras no cartão entram
em `credit_card_invoices` sem movimentar uma conta; pagar a fatura cria apenas uma
saída no livro-caixa.

Liquidações, pagamentos de fatura, estornos, transferências, parcelamentos e geração
de recorrências são RPCs PostgreSQL atômicas. As views `account_balances` e
`invoice_totals` calculam saldos e totais sem armazenar valores derivados.

Todas as tabelas públicas usam RLS. Chaves estrangeiras compostas impedem que um
registro referencie dados de outro usuário. As migrations versionadas são a fonte de
verdade do esquema em `supabase/migrations/`.

## Limites dos testes sem Docker

`npm run test:db` executa migrations, constraints, triggers, funções e RLS no
PostgreSQL PGlite. A integração completa de GoTrue, PostgREST/JWT e concorrência
entre conexões deve ser validada com a pilha Supabase local ou em um ambiente de
integração antes de lançar o produto.
