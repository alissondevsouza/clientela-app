---
feature: github-actions-ci-deploy
module: infra
phase: handoff
status: completed
updated: 2026-07-17
---

# Progress: CI + deploy via GitHub Actions

**Status:** completed
**Current Phase:** handoff
**Current Task:** —

## Decisions Log

| Data | Fase | Decisão | Justificativa |
|---|---|---|---|
| 2026-07-17 | intake | Deploy contínuo via Actions decidido pelo humano (não quer depender da máquina local); INF-01 dispara junto | Pedido direto; repo será publicado no GitHub pelo humano |
| 2026-07-17 | spec | CI reutilizável (`workflow_call`) + `needs` no deploy; `branches-ignore: [main]` no ci.yml | Garantia sem race de CI verde do MESMO commit; sem duplicação de steps |
| 2026-07-17 | spec | Reusar `scripts/deploy.sh` no runner; host key fixada via secret | Uma fonte de verdade (script já passou por 2 rodadas de QA); sem StrictHostKeyChecking no |
| 2026-07-17 | spec | GHCR (build no runner + pull na VPS) adiado — registrado como evolução no ADR-0010 | Peça nova sem gargalo comprovado; build na VPS já validado |
| 2026-07-17 | spec | `research.md` dispensado (size M) — pesquisa embutida no plan | Código-alvo minúsculo e já mapeado (deploy.sh do LP-11, doc do LP-12); criar artefato separado só duplicaria as 2 tabelas do plan. Desvio de formato consciente e registrado |
| 2026-07-17 | spec | Review rodada 1: APROVADO; alertas incorporados — guard main-only no job de deploy (dispatch de outra ref não publica); RF-01 alinhado ao plan (branches-ignore main + concurrency por ref); sugestões acatadas: Bun pinado, setup-bun por SHA, avisos TOFU/host-literal do keyscan no guia | Achados do spec-verifier |

## Milestones

- [x] Milestone 1: Workflows
- [x] Milestone 2: Guia e memória

## Session Log

| Data | Sessão | Fase | O que foi feito | Notas |
|---|---|---|---|---|
| 2026-07-17 | 2 | spec | Intake INF-01/INF-04, spec/plan/tasks; review APROVADO 1ª rodada (alertas incorporados) | Roadmap `[>]` nos dois itens |
| 2026-07-17 | 2 | implement | M1–M2 por clientela-implementer; actionlint limpo (Docker); YAML parse ok; secrets coerentes YAML↔doc; gates raiz 99/99 | Decisões: pins por SHA reais (checkout v4.2.2, setup-bun v2.2.0); bun-version 1.3.11 (local); concurrency do ci.yml com cancel condicionado a `github.ref != main` (workflow_call herda event_name do caller — ref é o sinal confiável); segredos escritos via printf de env (nunca na linha de comando) |
| 2026-07-17 | 2 | qa | QA (verifier A): APROVADO — gate sem furo (needs+success implícito; guard main; fork sem secrets), concurrency serializa deploys, pins conferidos na API do GitHub, secrets coerentes YAML↔doc, gates raiz 99/99 | Alerta (referência de seção no doc) e sugestão (aviso do 1º run falhar antes dos secrets) corrigidos pelo orquestrador (mudança só de doc) |
| 2026-07-17 | 2 | graduate | ADR-0010 já criado no ciclo; roadmap INF-01/INF-04 → `[R]` | Pendência de handoff: observar o 1º run real do Actions após push+secrets do humano |
