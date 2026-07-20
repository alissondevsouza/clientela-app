# Backlog de Bugs

Bugs conhecidos ainda não corrigidos. Cada entrada ganha um ID `BUG-NNN`; ao corrigir (via `clientela-fix` ou `clientela-spec-driven`), o teste de regressão é **obrigatório** e a entrada é marcada como resolvida.

Formato:

```markdown
- [ ] **BUG-001** — <descrição curta do comportamento errado>
  - **Esperado**: <comportamento correto>
  - **Reproduzir**: <passos ou contexto>
  - **Reportado em**: YYYY-MM-DD
  - **Resolvido em**: <YYYY-MM-DD (specs/{slug}) — preencher ao fechar>
```

## Abertos

- [ ] **BUG-001** — Busca de clientes não escapa wildcards de LIKE (`%`, `_`)
  - **Esperado**: `?search=%` busca o literal `%` (provavelmente 0 resultados), não todas as clientes; `_` não casa "qualquer caractere". Escapar `\`, `%`, `_` no termo em `clients.repository.ts` antes de montar `%term%` + teste de integração.
  - **Reproduzir**: com clientes cadastradas, `GET /clients?search=%` autenticado retorna todas (QA CRM-03, runtime). Sem risco de injection (parametrizado, escopado ao tenant) — bug de correção de resultado.
  - **Reportado em**: 2026-07-18 (QA specs/crm-clients, ALERTA)
  - **Resolvido em**: —
- [ ] **BUG-003** — Sessão expirada nas páginas de dados do CRM cai no error boundary com retry inútil
  - **Esperado**: 401 da API em RSC (`/crm/clients`, `/crm/leads`) redireciona para `/login` (flag `unauthorized` nos helpers `listClients`/`listLeads`/etc. + `redirect` na page), em vez de "Tentar novamente" que nunca resolve.
  - **Reproduzir**: sessão expira (ou é removida do banco) com a página aberta → navegação/refresh renderiza o boundary de erro genérico (QA CRM-04, ALERTA; mesmo padrão em clients desde o CRM-03 e em products desde o CRM-05 — corrigir as três telas juntas).
  - **Reportado em**: 2026-07-18 (QA specs/crm-leads)
  - **Resolvido em**: —
- [ ] **BUG-004** — Venda com total acima de int32 (payload válido pelo contrato) vira 500 em vez de 422
  - **Esperado**: `totalCents` calculado no servidor validado ≤ 2.147.483.647 no service ⇒ 422 pt-BR antes do INSERT (+ teste). Hoje qty 1000 × R$ 1M = 10¹¹ estoura "integer out of range" no Postgres (rollback ok, atomicidade preservada — só o status/mensagem errados).
  - **Reproduzir**: POST /sales com item qty 1000 e unitPriceCents 100_000_000 (QA CRM-06, runtime).
  - **Reportado em**: 2026-07-18 (QA specs/crm-sales, ALERTA)
  - **Resolvido em**: —
- [ ] **BUG-005** — Teste de integração de sales usa data fixa `2026-08-31` — suíte começará a falhar em set/2026
  - **Esperado**: derivar firstDueDate da data corrente (padrão isoWithDayOffset dos testes de shared) mantendo um caso de clamp de fim de mês; determinismo de testing.md.
  - **Reproduzir**: rodar a suíte após 2026-09-01 → `createSaleSchema` rejeita a data (passado) e o teste do parcelamento quebra.
  - **Reportado em**: 2026-07-18 (QA specs/crm-sales, ALERTA; já sinalizado na Task 2.3)
  - **Resolvido em**: —
- [ ] **BUG-002** — Listagem de clientes com `?page` além do fim mostra estado vazio errado (aplica-se também a `/crm/leads` — QA CRM-04 — e `/crm/products` — CRM-05, replicado por consistência deliberada)
  - **Esperado**: com `total > 0` e `page > totalPages`, clampar/redirect para a última página (nunca mostrar "Nenhuma cliente cadastrada ainda" + CTA de primeira cliente). Alcançável ao excluir o último item da última página.
  - **Reproduzir**: 25 clientes cadastradas → `/crm/clients?page=99` renderiza o vazio de "primeira cliente" (QA CRM-03, runtime).
  - **Reportado em**: 2026-07-18 (QA specs/crm-clients, ALERTA)
  - **Resolvido em**: —
