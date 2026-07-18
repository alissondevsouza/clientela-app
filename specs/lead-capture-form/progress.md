---
feature: lead-capture-form
module: web, shared
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Formulário de captura de lead

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | `leadFormSchema` no shared (consent boolean+refine) em vez de usar o literal true no RHF | defaultValues.consent=false tipável sem `as`; contrato da API intacto |
| 2026-07-17 | spec | Action = wrapper fino de `submitLead` (helper puro com fetch/apiUrl injetados) | Action não é unit-testável fora do Next; helper testado com fakes |
| 2026-07-17 | spec | Integração Testcontainers dispensada neste item | Persistência/contrato cobertos pelo LP-02; elo action→API verificado fim-a-fim real na QA |
| 2026-07-17 | spec | Honeypot: input real off-screen (não `type="hidden"`, não `display:none`) | Maximizar captura de bots simples sem afetar leitores de tela (aria-hidden + tabIndex -1) |
| 2026-07-17 | spec | `API_URL` obrigatória sem default | Default silencioso apontando errado em prod é pior que build falhando claro |
| 2026-07-17 | spec | Review rodada 1: REPROVADO (2 CRÍTICOS de design) → corrigidos: `leadFormSchema` deriva de `leadCaptureRequestSchema` (resolver stripava o honeypot → bot seria persistido) e action repassa IP do visitante via `x-forwarded-for` (sem isso o rate limit por IP virava limite GLOBAL de 5 leads/min — DoS barato da captação) | + consent via `.pipe(z.literal(true))` (output literal tipado); `@hookform/resolvers` ≥ 5.1 (3.x não suporta Zod 4); critério mobile-first 375px adicionado; msg pt-BR no `.max` de interest |
| 2026-07-17 | spec | Confiança no XFF entre web→API: aceita porque a API só é alcançável pela rede interna (Docker) e o web é o único cliente | Reafirmar no LP-11 (Postgres/API nunca expostos publicamente — security.md) |
| 2026-07-17 | spec | Review rodada 2: REPROVADO — extração do 1º valor do XFF na action reabriria o bypass por spoof (Caddy dá append; 1º valor é do atacante) → corrigido para ÚLTIMO valor via helper `extractClientIp` testado com XFF multi-valor; caso de QA multi-valor adicionado; rótulos RF do plan corrigidos; suíte da API na verificação da Task 1.1 | Mesma semântica de `resolveClientIp` da API; rodada 3 = teto de spec |

## Milestones

- [x] Milestone 1: Schema do form + deps
- [x] Milestone 2: Submissão (helper + action)
- [x] Milestone 3: UI e integração

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-06, research, spec/plan/tasks; 3 rodadas de review (2 REPROVADO → APROVADO na 3ª) | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | implement | M1–M3 por clientela-implementer; lint/typecheck verdes; 96/96 testes (inclui integração da API); build `/` estática; bundle client sem API_URL; build negativo falha citando API_URL | Decisões: tipo `FetchImpl` próprio (typeof fetch do Bun exige preconnect); biome-ignore justificado no label.tsx do shadcn (falso-positivo a11y); lucide-react agora é dep real (CheckIcon do checkbox); resolvers@5.4 com suporte nativo Zod 4 |
| 2026-07-17 | 1 | qa | QA (verifier A): APROVADO na 1ª rodada — server action invocada via protocolo RSC real; fluxo completo provado (linha no psql; honeypot 0 linhas; 429 por IP; spoof do 1º XFF não escapa; API off → erro genérico; logs sem PII) | Sugestões não-bloqueantes: INTEREST_MAX_LENGTH exportado do shared (futuro); log ops-friendly de falha de fetch (decisão LGPD consciente); `next start` ≠ standalone → LP-11 usa `node .next/standalone/server.js` |
| 2026-07-17 | 1 | graduate | Lesson (zodResolver stripa chaves fora do schema — honeypot); known-issues E2E atualizado (fluxo captura existe, REL-01 nasce cobrindo-o) | Roadmap LP-06 → `[R]` |
