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
- [ ] **BUG-002** — Listagem de clientes com `?page` além do fim mostra estado vazio errado
  - **Esperado**: com `total > 0` e `page > totalPages`, clampar/redirect para a última página (nunca mostrar "Nenhuma cliente cadastrada ainda" + CTA de primeira cliente). Alcançável ao excluir o último item da última página.
  - **Reproduzir**: 25 clientes cadastradas → `/crm/clients?page=99` renderiza o vazio de "primeira cliente" (QA CRM-03, runtime).
  - **Reportado em**: 2026-07-18 (QA specs/crm-clients, ALERTA)
  - **Resolvido em**: —
