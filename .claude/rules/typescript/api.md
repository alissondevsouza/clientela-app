# Rule: API (`apps/api`) — Bun + Elysia

## Arquitetura — monólito modular

```
apps/api/src/
├── modules/<domain>/          # ex.: clients, leads, products, sales
│   ├── <domain>.routes.ts     # rotas Elysia: validação + mapeamento, SEM regra de negócio
│   ├── <domain>.service.ts    # regra de negócio pura (não conhece HTTP)
│   └── <domain>.repository.ts # acesso a dados via Drizzle (única camada que toca o db)
├── db/                        # schema Drizzle + client + migrations
├── plugins/                   # auth, cors, logger, error-handler (Elysia plugins)
└── index.ts                   # composition root: monta app, injeta dependências
```

- **Camadas são unidirecionais**: routes → service → repository. Route nunca chama repository direto; service nunca importa nada de Elysia; repository não contém regra de negócio.
- **Módulos não importam internals uns dos outros** — se `sales` precisa de `products`, usa o service de `products` recebido por injeção (parâmetro de factory/construtor). Dependências explícitas = testável sem mock de módulo.
- Services e repositories são **factories/classes com dependências no construtor**, instanciadas no composition root (`index.ts`). Sem service locator, sem singleton importado.

## Fronteira HTTP

- **Toda rota valida body/query/params com schema Zod** (via Standard Schema do Elysia). Schemas de contrato público vivem em `packages/shared` e são reusados pelo front.
- Respostas de erro padronizadas: `{ error: { code, message } }` com status HTTP correto; erros de domínio mapeados no error-handler central (plugin), nunca `try/catch` repetido em cada rota.
- Rotas autenticadas por padrão; **públicas são exceção explícita** (hoje: captura de lead da landing, com rate limit). Ver `security.md`.
- Paginação obrigatória em toda listagem (`?page`/`?perPage`, default e máximo definidos); nunca retornar tabela inteira sem limite.

## Regras de negócio (invariantes do domínio — proteger em service + teste)

- Venda dá baixa atômica no estoque (transação); estoque nunca fica negativo.
- Valores monetários: **inteiros em centavos** — nunca float. Formatação é responsabilidade do front.
- Venda a prazo gera recebíveis; baixa de pagamento nunca deixa saldo devedor negativo.
