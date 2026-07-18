# Rule: Testes — Vitest + Testcontainers

## Pirâmide do projeto

| Nível | Alvo | Ferramentas | Quando é obrigatório |
|---|---|---|---|
| Unidade | services (regra de negócio), utils, schemas Zod | Vitest puro (deps injetadas → fakes simples) | toda regra de negócio nova/alterada |
| Integração | repositories + rotas da API com **Postgres real** | Vitest + Testcontainers | mudança de schema, contrato de API ou invariante de domínio (ver `workflow/spec-format.md`) |
| E2E | fluxos críticos de UI | Playwright (infra futura — registrar pendência) | login, registro de venda, captura de lead |

## Regras

- Teste ao lado do código: `sale-service.test.ts` junto de `sale-service.ts`. `bun run test` roda tudo via Vitest.
- **Teste comportamento, não implementação**: entrada → saída/efeito observável. Proibido assertar chamada interna de método privado ou detalhes de query.
- **Sem mock de banco em teste de integração** — Testcontainers sobe Postgres real e roda as migrações reais. Mock de Drizzle não prova nada.
- Injeção por construtor (ver `api.md`) torna `vi.mock` quase sempre desnecessário em unidade — prefira fakes explícitos; `vi.mock` é último recurso.
- Todo teste de regra de negócio cobre: happy path + **edge cases** (vazio, zero, limite, duplicado, concorrência quando aplicável) + caminho de erro (o erro certo, com a mensagem/código certo).
- Bug corrigido = **teste de regressão que falhava antes do fix** — sem exceção.
- Proibido: teste sem assert, `expect(true)`, snapshot como assert principal de lógica, relaxar/skipar teste para "passar" (teste legítimo quebrando é sinal, não obstáculo).
- Determinismo: sem dependência de relógio real (`vi.useFakeTimers`/injetar clock), sem ordem entre testes, sem dado compartilhado mutável — cada teste de integração prepara e limpa seu estado.
- Factories de dados de teste em `test/factories/` por app — sem duplicar setup gigante em cada arquivo.

## Cobertura

Sem meta numérica cega. O critério é o do QA loop: **critérios de aceite do `spec.md` cobertos por teste executável** + invariantes de domínio protegidas. Código sem teste que o justifique é achado de review.
