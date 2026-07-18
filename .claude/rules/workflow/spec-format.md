# Rule: Formato e ciclo de vida das specs

## Estrutura

Cada feature/bug não-trivial vive em `specs/{slug}/` (slug em kebab-case, ≤ 50 chars, em inglês). Templates canônicos em `specs/_templates/` — sempre partir deles.

| Artefato | Quando | Conteúdo |
|---|---|---|
| `spec.md` | sempre | o quê, por quê, requisitos (RF-NN), critérios de aceite, fora de escopo |
| `research.md` | size M/L | código existente relevante, padrões a seguir, gaps |
| `plan.md` | sempre | decisões técnicas, arquivos a criar/modificar, estratégia e decisão de cobertura de testes, riscos, DoD |
| `tasks.md` | sempre | tasks atômicas em milestones, dependências, verificação por task |
| `progress.md` | sempre | status, Decisions Log, Session Log |
| `validate.md` | fase QA | comandos executados + saídas + status por ferramenta |
| `review.md` | fase QA | achados (CRÍTICO/ALERTA/SUGESTÃO), conformidade, veredito |

## Sizing

- **P** — ≤ 3 arquivos, sem contrato novo, sem migração de banco. Sem `research.md`.
- **M** — vários arquivos em um app/package, ou 1 migração simples, ou contrato novo interno.
- **L** — cross-app (web + api + shared), migrações com dados, mudança de contrato público, ou incerteza técnica relevante.

## Tetos de iteração (defaults; o usuário pode sobrescrever)

- `MAX_SPEC_ROUNDS = 3` · `MAX_IMPL_ROUNDS = 3` · `MAX_VALIDATE_RETRIES = 2`
- Estourou o teto → **parar e escalar ao humano**. Nunca forçar aprovação nem girar em loop.

## Decisão de Cobertura de Testes (seção obrigatória do `plan.md`)

- **Teste de integração obrigatório** (Testcontainers com Postgres real) quando a mudança: altera schema do banco, altera contrato da API (rota/payload/resposta), ou altera regra de negócio central (venda, estoque, recebíveis, captura de lead).
- **E2E (Playwright) obrigatório** quando altera fluxo crítico de UI (login, registro de venda, captura de lead na landing). Enquanto a infra E2E não existir, registrar como **pendência explícita no handoff** — nunca fingir cobertura.
- **Bug de `specs/bugs-backlog.md` (BUG-NNN)**: teste de regressão é **obrigatório** e deve falhar antes do fix.
- **Dispensável** (justificar no Decisions Log): refactor sem mudança de contrato, mudança de docs/harness, comportamento já coberto por teste existente (citar o teste).
- Neutralidade: testes derivam do **`spec.md` (comportamento esperado)**, nunca do diff — teste derivado do código congela bug como comportamento.

## Ciclo de vida

`intake → spec → (loop revisão de spec) → implement → (loop QA) → graduate → handoff`. O checkbox de `tasks.md` é a fonte de verdade de progresso; `progress.md` espelha e loga.
