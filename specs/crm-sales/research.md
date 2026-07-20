---
feature: crm-sales
module: api, web, shared
phase: research
status: draft
created: 2026-07-18
updated: 2026-07-18
depends_on: [spec.md]
---

# Research: crm-sales

> Contexto herdado dos ciclos CRM-01..05 (mesma sequência de trabalho).

## Código Existente Relevante

| Arquivo | Relevância |
|---------|------------|
| `apps/api/src/modules/leads/leads.repository.ts` (`convert`) | Única `db.transaction` do projeto — padrão de update condicional + rollback por exceção a replicar (baixa de estoque, cancelamento) |
| `apps/api/src/modules/products/*` | Template de módulo mais recente (route-auth, escape LIKE, CHECKs, summary SQL); `products.stock_qty` é o alvo da baixa |
| `apps/api/src/lib/route-auth.ts` | Auth de rota compartilhada (CRM-05) |
| `apps/api/src/db/schema/{clients,products,leads}.ts` | Convenções; leads.client_id SET NULL é o precedente do desvínculo |
| `packages/shared/src/{products,clients,pagination}.ts` | Padrões de contrato; tetos monetários (`100_000_000`) a reusar |
| `apps/web/src/lib/{products-api,clients-api,format}.ts` | Helpers (parseBRLToCents, formatBRL, formatDateBr); padrão de api-helper |
| `apps/web/src/components/{clients,products,leads}/*` | Padrões de form/confirmação/badges; `delete-*-button` (2 passos) |
| `apps/web/src/app/(crm)/crm/sales/page.tsx` | Placeholder do CRM-02 a substituir |
| `project-memory/known-issues.md` | Entrada "Exclusão física × histórico de vendas" — este ciclo fecha |

## Padrões do Codebase a Seguir

- Transações com guarda condicional dentro (lesson do convert/TOCTOU do CRM-04); erros de domínio → error-handler central (409 já existe: `LEAD_ALREADY_CONVERTED`).
- Money: contrato em centavos; UI converte com parseBRLToCents/formatBRL (CRM-05); nunca float.
- Snapshot + SET NULL: precedente em leads (client_id) — estendido a name/preço aqui.
- Runtime QA com build de produção (lessons: Server Actions via next-action; RSC×client import).

## Schemas e Tipos Relevantes

- Novo: `sales`, `sale_items`, `receivables` (Drizzle + CHECKs); contratos de venda/recebível; migração `0005`.
- Reusar: `paginated`, tetos, `clientSchema`/`productSchema` (referência), enums novos com CHECK via sql.raw.

## Gaps Identificados

- Nenhuma transação multi-tabela ainda (convert toca 2 tabelas; venda toca 3 + N updates de estoque).
- Divisão de parcelas em centavos e vencimentos mensais: lógica pura nova — extrair para funções puras testáveis (`splitInstallments`, `addMonthsClamped`) em shared ou service.
- Form de venda é o mais complexo do app (linhas dinâmicas com busca de produto): RHF `useFieldArray` — primeiro uso.
- Seleção de cliente/produto por busca no form: reusar os endpoints de listagem existentes via Server Actions? Não — form client-side precisa de busca; opções: (a) server action de busca chamada do client, (b) datalist com carga inicial. Decidir no plan (a favor de (a): actions de busca finas reusando os api-helpers).

## Referências Externas

- Rules: database.md (transação obrigatória; dinheiro), api.md (invariantes de venda/estoque/recebíveis explícitas), web.md, testing.md (concorrência quando aplicável — caso real aqui).
- Lessons: TOCTOU/transação; Elysia 204; RSC×client; Server Action em build de produção.
