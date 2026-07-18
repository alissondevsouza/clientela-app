---
feature: {{FEATURE_NAME}}
module: {{MODULE_NAME}}
phase: validate
status: draft
round: {{N}}
created: {{DATE}}
updated: {{DATE}}
depends_on: [tasks.md]
---

# Validate: {{FEATURE_NAME}} (rodada {{N}})

<!-- Escrito pelo clientela-implement-verifier. Registrar o que foi DE FATO executado — nunca presumir. -->

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | <!-- ✅/❌ --> | |
| Typecheck | `bun run typecheck` | <!-- ✅/❌ --> | |
| Testes | `bun run test` | <!-- ✅/❌ (n passed, n failed) --> | |
| Integração | <!-- comando ou n.a. --> | <!-- ✅/❌/n.a. --> | |
| Build | <!-- comando --> | <!-- ✅/❌ --> | |
| Runtime (skill verify) | <!-- fluxo exercitado ou n.a. --> | <!-- ✅/❌/n.a. --> | |

## Saída Relevante
<!-- Trechos de saída que fundamentam o status (falhas completas; sucesso resumido) -->

```
```

## Pendências
<!-- O que NÃO foi possível validar e por quê (ex.: E2E sem infra) — vira item do handoff -->
