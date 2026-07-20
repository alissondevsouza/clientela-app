---
feature: crm-products
phase: review
status: done
created: 2026-07-18
updated: 2026-07-18
reviewer: QA adversarial (neutro)
verdict: APROVADO (round 2; round 1 REPROVADO)
---

# Review: crm-products (QA round 1)

## Veredito: **REPROVADO** (1 CRÍTICO aberto)

Lint/typecheck/testes (474)/build todos verdes e a camada API + contratos estão sólidos e bem testados — mas a tela de detalhe/edição de produto (RF-07) **quebra em runtime em 100% das requisições**, o que torna edição e exclusão inacessíveis via UI. Achado provado em execução real (validate.md), não detectável por build/typecheck.

## Arquivos revisados

Shared: `packages/shared/src/products.ts` (+ teste, `index.ts`) · DB: `apps/api/src/db/schema/products.ts`, `drizzle/0004_sturdy_thundra.sql`, `products-table.integration.test.ts` · API: `apps/api/src/modules/products/*` (errors/repository/service/routes + testes), `apps/api/src/lib/route-auth.ts` (+ teste) e consumidores migrados (`auth.routes`, `clients.routes`, `leads-crm.routes`, `plugins/auth-guard`), `plugins/error-handler.ts`, `app.ts`, `index.ts` · Web: `lib/{products-api,format}.ts` (+ testes), `components/products/*`, `app/(crm)/crm/products/**`.

## Achados

### [CRÍTICO-1] `apps/web/src/app/(crm)/crm/products/[id]/page.tsx:8-11,143-144` — RSC chama função de módulo `"use client"`; detalhe de produto quebra em toda requisição

A página de detalhe (Server Component) importa `centsToReaisInput` de `product-form.tsx`, que é um módulo `"use client"`, e a **chama durante a renderização no servidor**:

```tsx
import { centsToReaisInput, ProductForm } from "@/components/products/product-form";
...
costCents: centsToReaisInput(product.costCents),
priceCents: centsToReaisInput(product.priceCents),
```

Em build de produção o React lança: `Attempted to call centsToReaisInput() from the server but centsToReaisInput is on the client` (digest 1424776248, reproduzido 2/2 vezes no runtime QA). Efeito observável: o detalhe **nunca renderiza** — a usuária cai no `error.tsx` com retry inútil, para produto existente e sessão válida.

- **Porquê é crítico**: derruba RF-07 inteiro (detalhe, edição, exclusão em 2 passos) e contamina RF-06/fluxo de criação — `createProductAction` redireciona para o detalhe após criar, então "criar produto" termina numa tela de erro. Critério de aceite "QA de runtime com checklist" falha nos itens 4 e 5 via UI.
- **Por que passou pelos gates**: import de módulo client em RSC é permitido (para renderizar componentes); *chamar* uma função exportada é restrição só de runtime — typecheck e `next build` não acusam, e nenhum teste cobre a renderização da página de detalhe.
- **Como corrigir**: mover `centsToReaisInput` para módulo neutro/servidor-seguro (ex.: `apps/web/src/lib/format.ts`, ao lado de `parseBRLToCents` — é pura e já tem irmã lá) e importar de lá na page e no form; alternativa: passar os centavos numéricos como props e converter dentro do próprio client component. Depois do fix, repetir o runtime QA dos itens 4–5 (badge via edição pela UI e exclusão em 2 passos).

### [ALERTA-1] `apps/api/src/modules/products/products.repository.ts:155-169` — summary converte SUM bigint via `Number()` sem guarda de precisão

`SUM(cost_cents::bigint * stock_qty)` chega como string e vira `Number(...)`. Acima de `Number.MAX_SAFE_INTEGER` (~9,0e15) a conversão perde precisão silenciosamente — atingível a partir de ~91 produtos no teto (1e8 centavos × 1e6 unidades = 1e14/linha). O schema `productsSummarySchema` (`.int()`) não pega isso (floats grandes são "inteiros"). Cenário irrealista para uma consultora MK hoje, mas a invariante "dinheiro exato" fica sem última linha de defesa. Corrigir barato: validar `Number.isSafeInteger` antes de retornar (erro explícito em vez de valor errado), ou documentar o limite como decisão. Não bloqueia.

### [ALERTA-2] Cobertura zero de renderização das pages de produtos (é exatamente onde o CRÍTICO-1 morava)

Os testes web cobrem só helpers puros (`products-api`, `parseBRLToCents`). Nenhum teste (nem smoke de render RSC) exercita `page.tsx`/`[id]/page.tsx` — o padrão é o mesmo das telas de clients/leads (consistência), mas este ciclo prova o custo: um crash de runtime atravessou 474 testes verdes. Sem infra E2E (REL-01, pendência legítima), considerar ao menos um smoke de produção pós-build no checklist de QA das próximas features de UI (o runtime QA desta revisão pegou o bug — manter obrigatório).

### [SUGESTÃO-1] `apps/web/src/app/(crm)/crm/products/page.tsx:181,189` — `aria-pressed` em `<a>`

`aria-pressed` é semântica de botão toggle; nos links de filtro o atributo é ruído para leitores de tela (o `aria-current="page"` já presente é o correto para link ativo). Remover `aria-pressed` dos dois `<Link>`.

### [SUGESTÃO-2] `apps/api/src/modules/products/products.repository.ts:31` — comentário impreciso no `escapeLikeTerm`

"A `\` é escapada primeiro para não duplicar as barras inseridas depois" descreve uma implementação sequencial; o replace é de passada única (classe `[\\%_]`), onde ordem não existe. O comportamento está correto (provado em integração com `%`, `_` e literal); só o comentário mente sobre o *porquê*. Ajustar ou remover.

### [SUGESTÃO-3] `AUTHORIZATION_HEADER` ainda duplicado por rota

`route-auth.ts` centralizou extração/resolução/uuid, mas cada `*.routes.ts` mantém sua constante `AUTHORIZATION_HEADER` e o boilerplate `request.headers.get(...)`. Um `resolveConsultantId(request)` que receba o `Request` eliminaria a última duplicação. Cosmético.

## Testes (executados de fato — ver validate.md)

- `bun run lint` ✅ · `bun run typecheck` ✅ (3 workspaces) · `bun run test` ✅ **474/474** (36 arquivos, integração com Postgres real via Testcontainers) · `bun run build` (web) ✅
- Runtime QA (checklist de 8 itens do plan.md): 7 OK no nível API/SSR; itens 4–5 **bloqueados via UI** pelo CRÍTICO-1. Detalhe completo no validate.md.

## Conformidade por critério de aceite (spec.md)

| Critério | Status | Evidência |
|---|---|---|
| RF-01 tabela/CHECKs/FK+índice/defaults | ✅ | `products-table.integration.test.ts` (10 testes: CHECKs violados, FK, cascade, índice, defaults) + `\d products` no runtime |
| RF-02 contratos (não-inteiro, teto, `{}`, update vazio, lowStock derivado) | ✅ | `products.test.ts` (20 testes) + `products.service.test.ts` (mapper) + 422s provados por curl |
| RF-04 summary sem overflow (bigint) | ✅ | integração "valores grandes não estouram integer (cast ::bigint provado)"; runtime com fixtures exatas (43500/71900/2). Ressalva teórica: ALERTA-1 |
| RF-03 CRUD/busca+escape/lowStock/escopo/401/uuid⇒404/paginação | ✅ | `products.integration.test.ts` (26 testes, sessão real) + runtime: `%` e `_` retornam 0, escopo 2 consultoras, 401 nas 6 rotas |
| RF-04 summary fixtures/semântica limiar 0/escopo | ✅ | integração + runtime (estoque 0 ≤ limiar 0 ⇒ alerta, confirmado) |
| RF-06/RF-07 helpers web + QA de runtime | ❌ | helpers ✅ (tabela fixa do parseBRLToCents completa, RF-07); listagem/summary/estados SSR ✅; **detalhe/edição/exclusão quebrados (CRÍTICO-1)** |
| RF-08 nota registrada | ⏳ | prevista para a graduação (pós-fix); ainda sem menção a products em known-issues/backlog — manter na lista do handoff |

Rules: camadas routes→service→repository respeitadas; DI por construtor no composition root; Zod em toda fronteira (na entrada, provado por 422); dinheiro integer centavos fim-a-fim (form converte por aritmética de string, sem `parseFloat`/float em payload — `toFixed` só em exibição); paginação com limite; migração versionada com FK indexada; sem N+1 (list = 2 queries fixas, summary = 1 agregada); rotas autenticadas por padrão (default-deny provado); sem PII/segredo em log; pt-BR na UI; mobile-first e a11y ok (labels, aria-invalid/describedby, badge textual). Refactor route-auth: equivalência confirmada por leitura (código idêntico ao removido), grep sem cópias remanescentes, 474 testes intactos e smoke de runtime (login/me/logout, clients CRUD, leads).

BUG-002/BUG-003 replicados em products por decisão explícita do spec (consistência) — não contam como achado novo.

## Próximo passo

Corrigir CRÍTICO-1 (mover `centsToReaisInput` para `lib/format.ts` ou converter no client), rodar typecheck/test/build e **repetir o runtime QA do detalhe** (itens 4–5 via UI). ALERTA-1/2 e SUGESTÕES ficam a critério do humano/próximo round.

---

# Review: crm-products (QA round 2 — pós-fix) — **APROVADO**

Rodada 2 com verifier novo (revisão e validação do zero; estado parcial de sessão anterior descartado). Escopo: o diff do fix do CRÍTICO-1 + ALERTA-1 + SUGESTÕES 1–2, com reexecução completa dos gates e do runtime de produção no perímetro onde o CRÍTICO vivia.

## Veredito: **APROVADO**

- Lint ✅ · Typecheck ✅ (3 workspaces) · Testes ✅ **484/484** · Build web ✅ · Runtime de produção ✅ (detalhe/edição/exclusão funcionando de verdade — ver validate.md round 2).
- Nenhum CRÍTICO ou ALERTA novo encontrado no diff do fix.

## Verificação dos achados da rodada 1

| Achado (round 1) | Status | Evidência |
|---|---|---|
| **CRÍTICO-1** — RSC chamava `centsToReaisInput` de módulo `"use client"` | ✅ **corrigido e provado em runtime** | Função movida para `apps/web/src/lib/format.ts` (módulo server-safe, sem `"use client"`); `[id]/page.tsx` importa de `@/lib/format`; `product-form.tsx` não exporta mais a função (grep: únicas referências são lib, teste e a page). Em `next start` (produção): criar produto via Server Action real → 303 ao detalhe → **detalhe renderiza HTTP 200 com o nome do produto e defaultValues "35,50"/"59,90" gerados no servidor** — zero digest/error boundary. Itens 4–5 do checklist, antes bloqueados, agora ✅ via Server Action real (edição ⇒ badge no detalhe e na lista; exclusão ⇒ 303 → lista vazia) |
| ALERTA-1 — `Number()` no summary sem guarda de precisão | ✅ corrigido | `toSafeInteger` em `products.repository.ts` lança em vez de devolver dinheiro impreciso (`Number.isSafeInteger`); coberto por 4 testes de unidade novos (limite MAX_SAFE_INTEGER aceito, acima ⇒ throw); caminho normal provado em runtime (summary 0/0/0 e 7100/11980) |
| ALERTA-2 — cobertura zero de render das pages | ⚠️ aceito como pendência estrutural (REL-01) | Sem infra E2E; mitigado pelo runtime QA obrigatório (que pegou o bug na rodada 1 e provou o fix na 2). Não bloqueia por decisão já registrada no spec/plan |
| SUGESTÃO-1 — `aria-pressed` em `<a>` | ✅ removido | `products/page.tsx` usa só `aria-current="page"` nos tabs de filtro |
| SUGESTÃO-2 — comentário impreciso do `escapeLikeTerm` | ✅ corrigido | Comentário agora descreve a passada única com classe `[\\%_]` (sem ordem) |
| SUGESTÃO-3 — `AUTHORIZATION_HEADER` duplicado | ⏳ não tratado | Cosmético; segue como sugestão para ciclo futuro |

## Achados novos (rodada 2)

- **[SUGESTÃO]** `apps/web/src/lib/format.ts:23` — `centsToReaisInput` usa a constante `DECIMAL_PLACES` declarada ~40 linhas abaixo (seção do `parseBRLToCents`). Funciona (TDZ só vale durante a avaliação do módulo) e lint/typecheck aceitam, mas a leitura sugere dependência quebrada; mover a constante para o topo do arquivo. Cosmético, não bloqueia.

Nenhum outro import de módulo `"use client"` com símbolo chamado no servidor nas pages de products (varrido: `page.tsx`, `new/page.tsx`, `[id]/page.tsx` usam client components apenas como JSX; `product-card.tsx`/`products-summary.tsx` são server-safe; `actions.ts` é `"use server"`).

## Conformidade final por critério de aceite

Todos os critérios do spec.md atendidos: RF-01..RF-05 inalterados desde a rodada 1 (✅, re-provados pela suíte de 484); RF-06/RF-07 agora ✅ completos (o ❌ da rodada 1 era exatamente o detalhe/edição/exclusão — provados em runtime de produção); RF-08 segue ⏳ para a graduação (nota em known-issues/backlog — pendência de handoff, não de código); RF-09 ✅ (logs limpos, pt-BR, a11y).

## Próximo passo

Fase de graduação + handoff: registrar as notas do RF-08 (BUG-002/BUG-003 + exclusão física × histórico) e entregar ao humano com mensagem de commit sugerida. Nenhuma correção de código pendente.
