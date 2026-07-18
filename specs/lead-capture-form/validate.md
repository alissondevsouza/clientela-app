---
feature: lead-capture-form
module: web, shared
phase: validate
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [tasks.md]
---

# Validate: lead-capture-form (rodada 1)

## Comandos Executados

| Ferramenta | Comando | Status | Observação |
|------------|---------|--------|------------|
| Lint | `bun run lint` | ✅ | Biome: 83 arquivos, 0 problemas |
| Typecheck | `bun run typecheck` | ✅ | shared, web e api — exit 0 |
| Testes | `bun run test` | ✅ (96 passed, 0 failed) | 15 arquivos; inclui `lead-form.test.ts`, `submit-lead.test.ts`, `client-ip.test.ts`, `env.test.ts` |
| Integração | `bunx vitest run apps/api/src/modules/leads/leads.integration.test.ts apps/api/src/db/leads-table.integration.test.ts` | ✅ (14 passed) | Testcontainers com Postgres real — reexecutado isolado para confirmar |
| Build | `cd apps/web && bun run build` | ✅ | `/` prerenderizada como `○ (Static)` |
| Build sem `API_URL` | `bun run build` com `.env.local` sem a variável | ✅ (falhou como esperado) | `Error: Configuração de ambiente do web inválida. Verifique: API_URL` — cita a variável, não vaza valor; `.env.local` restaurado |
| Bundle client | `grep -r "API_URL\|localhost:3001\|5511912345678" .next/static/` | ✅ | 0 ocorrências — nenhum segredo/URL no bundle client |
| Runtime (fim-a-fim real) | compose (5433) + migração + API (`:3001`) + web (`next start :3000`) + invocação da Server Action via protocolo RSC (`Next-Action: 401d2c6c…`) | ✅ | Cenários abaixo |

## Saída Relevante

### Fim-a-fim real (Server Action invocada de verdade via HTTP)

Action id obtido de `.next/server/server-reference-manifest.json` (`submitLeadAction` → `401d2c6cd964339555daccadd7ebdc974b25a5596a`); POST em `/` com `Next-Action` + `Content-Type: text/plain;charset=utf-8` + body JSON array.

1. **Payload válido** (XFF `203.0.113.10`) → `{"ok":true}`; psql: linha em `leads` com `whatsapp` normalizado para dígitos (`(11) 91234-0001` → `11912340001`), `consent_at` não-nulo, `status = new`.
2. **Honeypot preenchido** (`website: "http://spam.example"`) → `{"ok":true}` (indistinguível) e `count(*)` inalterado — **nenhuma linha nova**.
3. **Rate limit, 6× mesmo IP** (`203.0.113.50`) → 5× `{"ok":true}`, 6ª → `{"ok":false,"message":"Muitas solicitações em pouco tempo. Aguarde um instante e tente novamente."}` (mensagem do 429 repassada).
4. **XFF multi-valor com 1º valor rotativo** (`10.0.0.N, 203.0.113.60`) → 6ª submissão bloqueada: rotacionar o 1º valor **não escapa** do limite (último valor é o usado).
5. **IP distinto** (`203.0.113.99`) após os floods → `{"ok":true}` (janela é por visitante, não global).
6. **API derrubada** → `{"ok":false,"message":"Não foi possível enviar agora. Verifique sua conexão e tente novamente."}` — genérica, sem stack/URL interna.

### HTML servido (`curl /`)

- `id="contato"` presente (1 ocorrência).
- Honeypot: `<input id="lead-website" type="text" tabindex="-1" autoComplete="off" name="website">` dentro de `<div aria-hidden="true" class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">` — presente no DOM, fora da tela e da tabulação.
- Consentimento: `role="checkbox"` com `aria-checked="false"` no SSR — **não pré-marcado**; label com a finalidade declarada associado via `for="lead-consent"`.
- Labels presentes para nome, WhatsApp e interesse.

### Logs de runtime (web e API)

Nenhum dado pessoal nem payload logado durante todas as submissões (incluindo a falha com API derrubada) — logs contêm apenas boot/ready.

### Higiene

- `git check-ignore`: `apps/web/.env.local` e `.env` ignorados (`.gitignore:5 .env.*`); `.env.example` atualizado com `API_URL` documentada (build + runtime).
- Teardown: leads de QA removidos do banco dev, web/API encerrados, `docker compose down` executado (volume preservado).

## Pendências

- **E2E Playwright**: infra inexistente (fora de escopo declarado no spec) — o fluxo de captura de lead é O caso que justifica REL-01. Registrar no handoff.
- **Validação client-side interativa** (mensagens por campo, `aria-describedby` do erro, retry preservando valores no DOM): sem browser na QA — coberta por análise do componente + validação do schema compartilhado; será exercitada no E2E futuro.
- **Responsividade 375px**: verificada por análise estática (form `flex flex-col`, inputs `w-full`, container `max-w-xl px-4`, botão `h-11 w-full`, sem larguras fixas) — sem browser real.
- Aviso do Next no runtime: `"next start" does not work with "output: standalone"` — serviu normalmente em dev; o deploy (LP-11) deve usar `node .next/standalone/server.js`.
