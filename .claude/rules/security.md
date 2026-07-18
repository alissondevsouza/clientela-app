# Rule: Segurança e LGPD

## Segredos e configuração

- Segredos **só** em variáveis de ambiente; `.env` nunca commitado; `.env.example` sempre atualizado (sem valores reais).
- Validar env no boot com schema Zod (`packages/shared` ou config local) — app não sobe com config inválida/ausente.
- Nada de segredo, token ou connection string em código, log ou mensagem de erro.

## Fronteira e autenticação

- Todo input externo validado com Zod **na entrada** (rotas da API, server actions, formulários). Ver `typescript/api.md`.
- CRM: **todas as rotas autenticadas por padrão** (guard default-deny `createAuthGuard` — ADR-0012). Endpoint público é exceção explícita e listada — hoje apenas: `GET /health`, `POST /leads` (captura de lead da landing, com rate limit por IP e honeypot anti-bot) e `POST /auth/login` (com rate limit próprio por IP e resposta 401 anti-enumeração).
- Senhas com hash forte (`Bun.password` — argon2id). Sessão/token com expiração; cookie `httpOnly` + `secure` + `sameSite`.
- SQL somente via Drizzle (parametrizado). Proibido interpolar string em SQL cru.
- Erros para o cliente nunca expõem stack trace, query ou internals — mensagem mapeada + log completo só no servidor.

## LGPD (a landing captura dados pessoais)

- Formulário de lead coleta o mínimo (nome, WhatsApp, interesse) com **consentimento explícito** (checkbox não pré-marcado) e finalidade declarada.
- Registrar `consent_at` junto do lead. Exclusão de cliente/lead a pedido deve ser possível (dado pessoal não entra em log).
- Dados pessoais nunca aparecem em logs da aplicação — logar IDs, não nomes/telefones.

## Infra (VPS)

- Apenas 80/443 (+ SSH com chave) expostos; Postgres **nunca** exposto publicamente — acessível só pela rede interna do Docker.
- HTTPS obrigatório (Caddy/Let's Encrypt). Backups do banco criptografados em trânsito para destino externo.
