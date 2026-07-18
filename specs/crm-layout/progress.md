---
feature: crm-layout
module: web
phase: spec
status: in_progress
updated: 2026-07-17
---

# Progress: crm-layout (CRM-02)

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|------|------|---------|---------------|
| 2026-07-17 | spec | Segmentos de rota em inglês (`/crm/clients`…) | Pastas de rota = nomes de arquivo (regra: inglês); URL interna de usuária única |
| 2026-07-17 | spec | Sem teste de integração | Nenhuma mudança de schema/contrato/invariante (spec-format.md); só UI + lógica pura de ativação (unidade) |
| 2026-07-17 | spec | Sem teste de componente (markup) | Projeto sem RTL/jsdom (limitação registrada no CRM-01); QA de runtime cobre |
| 2026-07-17 | spec | Logout migra da page para o header do shell | Presente em todas as páginas do grupo (não regride RF-09 do crm-auth) |
| 2026-07-17 | spec-review | RF-08 adicionado: maxAge do cookie derivado do `expiresAt` da API; constante de duração sai do web | CRÍTICO do spec-verifier (rodada 1): known-issue agendado "resolver no CRM-02" estava excluído em silêncio |
| 2026-07-17 | spec-review | Task 1.2 dividida (componentes / integração); checklist de QA de runtime no plan; fallback safe-area 0 aceito; caso trailing slash no teste | ALERTAs/sugestões do verifier |
| 2026-07-17 | qa | Saudação `hidden sm:inline` **aceita** (ALERTA da QA): no mobile o header prioriza marca + Sair; o nome aparece ≥ sm | Header de ~375px ficaria apertado com 3 elementos; RF-01 atendido no desktop e a identidade da sessão é evidente pelo próprio CRM |
| 2026-07-17 | qa | Sugestões adiadas (registrar aqui): `role="list"` nas `<ul>` da nav e alvo maior do "Sair" no mobile | Melhorias menores de a11y; aplicar exigiria nova rodada de verifier — endereçar no CRM-03, que retoca o shell |

## Milestones

- [x] Milestone 1: Navegação e shell (Tasks 1.1–1.5, 2026-07-17)
- [x] Milestone 2: Checkpoint (189 testes verdes, lint/typecheck limpos, 2026-07-17)

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|------|--------|------|-----------------|-------|
| 2026-07-17 | 1 | intake→spec | Spec set autorado (contexto herdado do ciclo crm-auth na mesma sessão) | Size M |
| 2026-07-17 | 1 | spec-review | Rodada 1 REPROVADA (CRÍTICO: known-issue agendado excluído) → corrigido (RF-08); rodada 2 APROVADA | 2 verifiers neutros distintos |
| 2026-07-17 | 1 | implement | Tasks 1.1–1.5 por 5 implementers isolados; checkpoint verde (189 testes) | — |
| 2026-07-17 | 1 | qa | QA rodada 1: **APROVADO** (checklist runtime 6/6; RF-08 fim-a-fim) | 2 ALERTAs tratados na graduação; 2 sugestões adiadas p/ CRM-03 |
| 2026-07-17 | 1 | graduate→handoff | Known-issue da duração marcado resolvido; roadmap CRM-02 → [R] | — |
