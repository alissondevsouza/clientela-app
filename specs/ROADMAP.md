# Roadmap

**Este é o documento de trabalho dos agentes.** Registro de tudo que foi, está sendo e será construído — do início do projeto ao fim. Quando o humano disser "continue o roadmap" (ou equivalente), o agente lê este documento, pega o próximo item elegível e executa pelo fluxo correto — sem precisar de prompt detalhado.

## Como funciona

### Status de cada item

| Marcador | Significado |
|---|---|
| `[ ]` | Pendente |
| `[>]` | Em andamento — spec/trabalho em `specs/{slug}` |
| `[R]` | Em revisão — handoff entregue, aguardando revisão + commit do humano |
| `[x]` | Concluído — trabalho commitado |
| `[-]` | Cancelado/adiado (manter no documento com nota do porquê) |

### Regras de operação (agente)

1. **Próximo item elegível** = primeiro `[ ]` da fase ativa cujas dependências estejam `[x]` (ou `[R]`, se a dependência for só de código já validado). Itens `(humano)` nunca são executados pelo agente — apenas lembrados no handoff.
2. Um item = um ciclo do fluxo roteado por `.claude/rules/workflow/dev-flow-routing.md` (não-trivial → `clientela-spec-driven`). Ao iniciar: marcar `[>]` e anotar o slug (`→ specs/{slug}`). Ao entregar handoff: marcar `[R]`.
3. Marcar `[x]` somente quando o trabalho estiver **commitado** (verificável em `git log`) — normalmente na sessão seguinte ao handoff, ou quando o humano confirmar.
4. Escopo novo descoberto no meio do caminho → **novo item** na fase certa (nunca inchar o item atual). Mudança de prioridade/escopo relevante → registrar no Decisions Log ou ADR.
5. Não pular de fase com itens de código pendentes sem decisão explícita do humano.
6. Este documento não substitui as specs: o *o quê detalhado* de cada item nasce no `spec.md` do seu ciclo.

### Regras para o humano

- Revisar e commitar os itens `[R]` (o handoff sempre traz a mensagem de commit sugerida).
- Os itens marcados `(humano)` são seus — agente não consegue fazê-los.
- Reordenar/adicionar/cortar itens é sempre seu direito: edite este arquivo.

---

## Fase 0 — Fundação (concluída)

- [x] **F0-01** — Memória do projeto (`project-memory/`: visão, arquitetura, features, domínio, ADRs 0001–0006)
- [x] **F0-02** — Harness agêntico: rules (workflow, typescript, git, security), skills `clientela-spec-driven`/`clientela-fix`, 4 agents, templates de spec
- [x] **F0-03** — Guardrails mecânicos de git em `.claude/settings.json` (deny + hook PreToolUse; git de escrita é do humano — ADR-0006)
- [x] **F0-04** — Esqueleto do monorepo (Bun workspaces: `apps/web` Next 16 + Tailwind 4, `apps/api` Elysia, `packages/shared` Zod) com `lint`/`typecheck`/`test` verdes

## Fase 1 — Landing page

> Objetivo: página profissional no ar, capturando leads e direcionando vendas pro WhatsApp. Detalhes de escopo: `project-memory/03-features.md`.

### Base técnica

- [x] **LP-01** → `specs/dev-db-drizzle-leads` — Banco local de desenvolvimento: `docker-compose.dev.yml` com Postgres + setup Drizzle na API (`drizzle-kit`, client, convenções de `database.md`) + migração inicial com tabela `leads` (com `consent_at`) — _dep: nenhuma_
- [x] **LP-02** → `specs/leads-capture-api` — API: módulo `leads` — `POST /leads` público com schema de `packages/shared`, rate limit por IP, honeypot anti-bot, persistência; testes de integração com Testcontainers — _dep: LP-01_

### Página

- [x] **LP-03** → `specs/landing-page-structure` — Estrutura da landing: layout mobile-first com seções hero (foto + proposta + CTA WhatsApp), sobre a consultora e depoimentos — conteúdo placeholder; shadcn/ui instalado e configurado — _dep: nenhuma_
- [x] **LP-04** → `specs/whatsapp-cta` — Componente WhatsApp CTA: link `wa.me` com mensagem pré-preenchida parametrizável (número/mensagem via env/config) — _dep: LP-03_
- [x] **LP-05** → `specs/featured-catalog` — Catálogo de destaque: cards de produto (foto, nome, preço) com "Pedir pelo WhatsApp" pré-preenchendo o nome do produto; dados estáticos em config nesta fase (o CRM alimentará depois) — _dep: LP-04_
- [x] **LP-06** → `specs/lead-capture-form` — Formulário de captura de lead com isca de conversão: react-hook-form + schema compartilhado, consentimento LGPD explícito, server action → API, estados de sucesso/erro — _dep: LP-02, LP-03_
- [x] **LP-07** → `specs/landing-seo-polish` — SEO e polimento: `generateMetadata`, Open Graph, sitemap/robots, imagens via `next/image`, passe de performance (Lighthouse) e acessibilidade — _dep: LP-03..LP-06_
- [x] **LP-14** → `specs/landing-visual-refinement` — Refinamento visual da landing: header fixo, marca "Lais Barbosa", fotos reais (`project-memory/UI-resources`, autorizadas pelo humano), melhoria das seções de depoimentos e contato, animações CSS — _dep: LP-07_

### Conteúdo e conformidade (humano)

- [ ] **LP-08** `(humano)` — Conteúdo real: fotos, história da consultora, depoimentos de clientes, lista de produtos de destaque com preços, texto da isca de conversão
- [ ] **LP-09** `(humano)` — Verificar diretrizes da Mary Kay para divulgação por consultoras (uso de marca/logo/preços em site próprio)
- [x] **LP-10** `(humano)` — Registrar domínio e decidir subdomínios — feito em 2026-07-17: `consultoralaisbarbosa.com.br` (ADR-0009)

### No ar

- [x] **LP-11** → `specs/production-deploy` — Deploy: Dockerfiles (web standalone, api), `docker-compose.yml` de produção com Caddy (HTTPS automático) + Postgres com volume; script de deploy via SSH — _dep: LP-01..LP-07_
- [>] **LP-12** `(humano)` — Provisionar VPS (Hostinger), apontar DNS, rodar primeiro deploy com o agente assistindo — VPS KVM 2 e domínio comprados (2026-07-17); guia passo a passo entregue em `docs/deploy-vps.md`; falta executar o primeiro deploy
- [ ] **LP-13** — Backup diário do Postgres para fora da VPS (destino a decidir — gera ADR) — _dep: LP-12_

## Fase 2 — CRM MVP

> Objetivo: substituir caderno/planilha. Invariantes do domínio: `project-memory/04-domain-model.md`.

- [x] **CRM-01** → `specs/crm-auth` — ADR + implementação de autenticação (usuária única): login, sessão, guard das rotas da API e do grupo `(crm)` no web — _dep: LP-01_ — ADR-0012; handoff 2026-07-17
- [x] **CRM-02** → `specs/crm-layout` — Layout do CRM: navegação mobile-first do grupo `(crm)`, shell autenticado — _dep: CRM-01_ — handoff 2026-07-17
- [x] **CRM-03** → `specs/crm-clients` — Clientes: CRUD com campos do domínio (aniversário, tom de pele, observações), busca, botão WhatsApp — _dep: CRM-02_ — handoff 2026-07-18 (BUG-001/002 registrados)
- [R] **CRM-04** → `specs/crm-leads` — Leads no CRM: lista dos capturados na landing, status (novo → contatado → convertido/descartado), conversão lead → cliente — _dep: CRM-02_ — handoff 2026-07-18 (fecha known-issue do rate limit; BUG-003 registrado)
- [R] **CRM-05** → `specs/crm-products` — Produtos & estoque: CRUD com custo/preço em centavos, quantidade, alerta de estoque baixo, capital parado — _dep: CRM-02_ — handoff 2026-07-18 (QA 2 rodadas: CRÍTICO de RSC×client corrigido; lesson graduada)
- [R] **CRM-06** → `specs/crm-sales` — Vendas: registro com itens, baixa atômica de estoque, formas de pagamento, fiado/parcelado com recebíveis e baixa de pagamento ("quem me deve") — _dep: CRM-03, CRM-05_ — handoff 2026-07-18 (ADR-0013; fecha known-issue LGPD×vendas; BUG-004/005 registrados)
- [R] **CRM-07** → `specs/crm-dashboard` — Dashboard: vendas do mês, lucro estimado, a receber, meta mensal — _dep: CRM-06_ — handoff 2026-07-19 (ADR-0014 snapshot de custo/lucro/meta; QA APROVADO 674 testes; size L)
- [ ] **CRM-08** — Catálogo da landing alimentado pelos produtos do CRM (flag "destaque") — _dep: CRM-05_
- [R] **CRM-09** → `specs/crm-orders` — Pedidos de reposição: controle do que a consultora precisa pedir à Mary Kay, com ciclo de status (rascunho → pedido → entregue / cancelado), itens vinculados a produtos, sugestão a partir do estoque baixo e entrada atômica de estoque na entrega — _dep: CRM-05_ — handoff 2026-07-20 (ADR-0015; QA APROVADO rodada 1, 784 testes)
- [R] **CRM-10** → `specs/order-item-client-link` — Encomendas de clientes no pedido: vínculo opcional de cliente por item (join derivado, sem snapshot — ADR-0016), cadastro rápido de cliente no form (nome + WhatsApp) e visão "para quem é" no detalhe — _dep: CRM-03, CRM-09_ — handoff 2026-07-20 (ADR-0016; QA APROVADO rodada 1, 807 testes, runtime provado)

## Fase 3 — Relacionamento

- [ ] **REL-01** — Infra de E2E (Playwright) cobrindo login, captura de lead e registro de venda (fecha o known-issue) — _dep: CRM-06_
- [ ] **REL-02** — Lembretes de recompra: produto consumível comprado há X dias ⇒ sugestão de follow-up — _dep: CRM-06_
- [ ] **REL-03** — Aniversariantes da semana/mês com mensagem pronta — _dep: CRM-03_
- [ ] **REL-04** — Follow-up de leads parados (sem contato há N dias) — _dep: CRM-04_
- [ ] **REL-05** — Central "com quem falar hoje": tela única agregando REL-02/03/04, cada item com botão WhatsApp com mensagem modelo — _dep: REL-02, REL-03, REL-04_

## Fase 4 — Marketing e extras

- [ ] **MKT-01** — Mini-campanhas: filtro de clientes + mensagem modelo para copiar — _dep: REL-05_
- [ ] **MKT-02** — Relatórios: produtos mais vendidos, melhores clientes, lucro por produto — _dep: CRM-07_
- [ ] **MKT-03** — Agenda de sessões de demonstração/análise de pele — _dep: CRM-03_
- [ ] **MKT-04** — Metas e acompanhamento de comissão/nível Mary Kay — _dep: CRM-07_

## Infra contínua (sem fase — quando o gatilho disparar)

- [x] **INF-01** → `specs/github-actions-ci-deploy` — CI (lint + typecheck + testes) quando houver remote — _gatilho disparado: humano vai publicar o repo no GitHub (2026-07-17)_
- [x] **INF-04** → `specs/github-actions-ci-deploy` — Deploy contínuo via GitHub Actions (push na `main` → CI → deploy SSH na VPS), substituindo o deploy manual da máquina local (decisão do humano; gera ADR) — _dep: INF-01, LP-11_
- [ ] **INF-02** — `linker: "isolated"` no Bun — _gatilho: segundo bug de phantom dependency_
- [ ] **INF-03** — Turborepo — _gatilho: pipeline > 2–3 min ou > 5 packages_
- [R] **INF-06** — Split de domínios para produção: landing na raiz + CRM em `gestao.*` (Caddy por host, env `CRM_DOMAIN`, seed da consultora em produção, guia de deploy atualizado — ADR-0017) — pedido do humano em 2026-07-20; edição direta (docs/infra)
- [x] **INF-05** → `specs/ghcr-image-deploy` — Deploy por imagens via GHCR: pipeline builda e publica (`web`/`api`/`migrate`), VPS só faz pull+up — servidor fica apenas com arquivos de infra (pedido do humano; gera ADR que substitui parte do 0010) — _dep: INF-04_
