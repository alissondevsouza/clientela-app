# Rule: Banco de dados — PostgreSQL + Drizzle

## Schema

- Schema Drizzle em `apps/api/src/db/schema/` (um arquivo por agregado: `clients.ts`, `sales.ts`…). **Só a API acessa o banco** — web nunca importa nada de `db/`.
- Nomes: tabelas snake_case plural (`sale_items`), colunas snake_case. No TypeScript, camelCase mapeado pelo Drizzle.
- Toda tabela tem: `id` (uuid v7, default no banco), `created_at` e `updated_at` (`timestamptz`, default `now()`).
- **Dinheiro em `integer` (centavos)** — proibido `real`/`float`/`numeric` para valores monetários.
- FKs sempre com constraint declarada + **índice** (Postgres não indexa FK automaticamente). Índices adicionais só com query que os justifique.
- `NOT NULL` por padrão; coluna nullable é decisão consciente (o que significa a ausência?).
- Enums de domínio: `text` com CHECK via Drizzle enum + union type no TS (evita dor de `ALTER TYPE`).
- Sem soft delete por padrão; se histórico importar (ex.: venda não se apaga, cancela-se), modelar status explícito.

## Migrações

- **`drizzle-kit generate`** — migrações SQL versionadas e commitadas em `apps/api/drizzle/`. Proibido `push` fora de ambiente local descartável e proibido editar migração já aplicada.
- Migração destrutiva (drop/rename de coluna com dados) exige: passo de backfill, plano de rollback e menção explícita no `plan.md` da feature.
- Ver skill `drizzle-safe-migrations` para playbook de migração em produção.

## Queries

- Acesso a dados **somente em repositories**. Query complexa ganha nome/método próprio — não inline em service.
- **Proibido N+1**: listagens com relação usam `with` (relational queries) ou join explícito.
- Multi-passo que precisa ser atômico (venda + itens + baixa de estoque + recebíveis) = **`db.transaction`** — sempre.
- `select` com colunas necessárias em listagens grandes; `limit` sempre presente (paginação — ver `api.md`).
