# Clientela App — instruções para o Claude

Idioma do projeto: **pt-BR** (documentação, commits, comunicação, textos de UI). Código e nomes de arquivos em **inglês**.

## Memória persistente do projeto

A pasta `project-memory/` é a memória persistente do projeto. Antes de qualquer trabalho:

1. Leia `project-memory/README.md` (índice) e os documentos relevantes à tarefa.
2. Consulte `project-memory/decisions/` (ADRs), `known-issues.md` e `lessons.md` antes de decidir — não contrarie um ADR aceito sem discutir com o usuário.
3. Decisão relevante tomada → **novo ADR** em `project-memory/decisions/` (template no README da pasta) + atualizar o índice.
4. Realidade mudou (arquitetura, escopo, domínio) → atualizar os documentos numerados na mesma sessão.

## Fluxo de desenvolvimento (obrigatório)

**`specs/ROADMAP.md` é a fonte de trabalho**: registra tudo do projeto (feito, em andamento, futuro) com status por item. "Continue o roadmap" = pegar o próximo item elegível e executá-lo pelo fluxo certo; manter os status do roadmap atualizados em todo ciclo ([>] iniciou, [R] handoff, [x] commitado).

Roteamento em `.claude/rules/workflow/dev-flow-routing.md`:

- **Feature ou bug não-trivial** → skill `clientela-spec-driven` (spec → revisão neutra → implementação → QA adversarial → graduação de memória → handoff). É o default; o usuário não precisa pedir.
- **Bug trivial e localizado** → skill `clientela-fix` (causa raiz + teste de regressão + validação real).
- **Pergunta/análise** → responder direto, sem criar artefatos.

Artefatos de trabalho em `specs/{slug}/` a partir de `specs/_templates/` (formato: `.claude/rules/workflow/spec-format.md`).

## Rules (contrato de qualidade — todo código deve cumprir)

- `.claude/rules/workflow/` — roteamento de fluxo, formato de specs, git (`git-workflow.md` + ADR-0006: **todo git de escrita é do humano** — sem commit/push/PR/merge; agente só cria branch de trabalho e entrega handoff com mensagem de commit sugerida).
- `.claude/rules/typescript/` — `core.md` (tipagem/estilo), `api.md` (Elysia, camadas), `web.md` (Next.js, mobile-first), `database.md` (Drizzle/Postgres), `testing.md` (Vitest/Testcontainers).
- `.claude/rules/security.md` — segredos, auth, LGPD.

Skills de referência de biblioteca em `.claude/skills/` (elysia, drizzle-postgres, zod, vitest, react, shadcn-ui, tailwindcss, typescript-advanced) — consultar ao trabalhar no módulo correspondente.

## Comandos (raiz do monorepo)

`bun run lint` (Biome) · `bun run typecheck` (tsc por workspace) · `bun run test` (Vitest) · `bun run format`. Toda entrega exige os três primeiros verdes.

## Resumo do projeto

Sistema para consultora Mary Kay: landing page pública (captação de leads + WhatsApp) e CRM (clientes, vendas, estoque, relacionamento). Stack: Next.js + Bun/Elysia (API) + PostgreSQL/Drizzle, monorepo Bun workspaces (`apps/web`, `apps/api`, `packages/shared`), deploy via Docker Compose em VPS. Fases em `project-memory/03-features.md`; domínio em `project-memory/04-domain-model.md`.
