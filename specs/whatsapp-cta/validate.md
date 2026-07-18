---
feature: whatsapp-cta
module: web
phase: validate
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: whatsapp-cta (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 59 arquivos, zero erros |
| Typecheck | `bun run typecheck` | ✅ | shared, web e api com exit 0 |
| Testes | `bun run test` | ✅ (68 passed, 0 failed) | 10 arquivos; web isolado: 2 arquivos / 16 testes (whatsapp.test.ts + env.test.ts) |
| Integração | n.a. | n.a. | Sem banco/API no escopo (plan.md) |
| Build | `cd apps/web && bun run build` | ✅ | Next 16.2.10; rota `/` = `○ (Static) prerendered as static content` |
| Build negativo | `mv .env.local .env.local.qa-bak && env -u WHATSAPP_PHONE -u WHATSAPP_DEFAULT_MESSAGE bun run build` | ✅ (falhou como esperado) | Exit 1 com `Configuração de ambiente do web inválida. Verifique: WHATSAPP_PHONE` — cita a variável, não vaza valor. `.env.local` restaurado após o teste |
| Runtime (HTML gerado) | inspeção de `.next/server/app/index.html` | ✅ | 2 `<a>` `wa.me` (hero + rodapé), `?text=` urlencoded, `rel="noopener noreferrer"`, `target="_blank"`, `id="contato"` presente |
| Encoding adversarial | `bun -e` com `buildWhatsAppUrl` | ✅ | `&`→`%26`, `#`→`%23`, `%`→`%25`, `+`→`%2B`, `\n`→`%0A`; roundtrip via `new URL().searchParams` == mensagem original |
| Git hygiene | `git status` + `git check-ignore -v apps/web/.env.local` | ✅ | `.env.local` ignorado por `.gitignore:5 (.env.*)`; ausente do untracked |

## Saída Relevante

```
bun run test        → Test Files 10 passed (10) · Tests 68 passed (68)
vitest run apps/web → Test Files 2 passed (2)  · Tests 16 passed (16)

next build (com env):
  ┌ ○ /
  └ ○ /_not-found
  ○  (Static)  prerendered as static content

next build (sem WHATSAPP_PHONE):
  Error: Configuração de ambiente do web inválida. Verifique: WHATSAPP_PHONE
  ⨯ Next.js build worker exited with code: 1

HTML gerado (2 ocorrências, hero e rodapé):
  <a href="https://wa.me/5511912345678?text=Ol%C3%A1!%20Vi%20seu%20site%20e%20quero..."
     target="_blank" rel="noopener noreferrer" ...>
  id="contato" presente no <footer>

encoding manual:
  "Quero o kit A&B #promo 50%+frete" → ?text=Quero%20o%20kit%20A%26B%20%23promo%2050%25%2Bfrete (roundtrip OK)
```

## Pendências

- E2E (Playwright) sem infra — pendência já registrada em known-issues (plan.md); fluxo verificado via HTML estático gerado.
- Zero `"use client"` confirmado por grep em `apps/web/src/` (exit 1 = nenhuma ocorrência).
