---
feature: whatsapp-cta
module: web
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: Componente WhatsApp CTA

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | Builder puro separado do componente; env Zod em `lib/env.ts` do web; telefone E.164 flexível (10–15 dígitos) | Testável por unidade; `security.md`; wa.me exige número internacional |
| 2026-07-17 | spec | `WHATSAPP_PHONE` sem `NEXT_PUBLIC_` (lida em RSC/build; aparece no href por design) | Número é público por natureza; não precisa ir ao bundle JS |
| 2026-07-17 | spec | Review neutra (rodada 1): APROVADO com alertas incorporados — reclassificado **size M** (10 arquivos > régua de P) com research.md; mecanismo de env definido (`apps/web/.env.local` + `.env.example` próprio — Next não lê env da raiz do monorepo); `loadWebEnv(source)` em função para testabilidade; DDI documentado; label do rodapé perde número fake | Alertas do spec-verifier; critério de sizing de `spec-format.md` respeitado |

## Milestones

- [x] Milestone 1: Lógica e config
- [x] Milestone 2: Componente e integração

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | spec | Intake LP-04, spec/plan/tasks | Roadmap `[>]`; branch compartilhada `feature/phase-1-landing-page` |
| 2026-07-17 | 1 | implement | M1–M2 por clientela-implementer; lint/typecheck verdes; 68/68 testes; build `/` estática; build negativo falha citando WHATSAPP_PHONE | Decisões: `loadWebEnv` tipa source como Record<string, string|undefined> (ProcessEnv do Next exige NODE_ENV); `footer.ctaLabel` novo em landing.ts; styling preservado via className |
| 2026-07-17 | 1 | qa | QA (verifier A): APROVADO na 1ª rodada — RF-01..05 verificados (HTML gerado, build negativo, encoding testado manualmente, .env.local ignorado) | Sugestões não-bloqueantes aceitas para o futuro: caso de teste de encoding `&#%+` (adicionar quando tocar no builder); conferir DDI 55 quando o humano puser o número real (LP-08/12) |
| 2026-07-17 | 1 | graduate | Lesson: Next lê env do diretório do app (convenção `apps/web/.env.local` estabelecida) | Roadmap LP-04 → `[R]` |
