# Rule: TypeScript — núcleo (vale para todo o monorepo)

## Tipagem

- `strict: true` sempre; adicionalmente `noUncheckedIndexedAccess: true`.
- **Proibido `any`** — use `unknown` + narrowing. Proibido `as` para "calar" o compilador e `!` (non-null assertion); a exceção rara exige justificativa em uma linha no PR/Decisions Log.
- Todo dado externo (HTTP, banco, env, formulário, JSON) entra **validado por Zod** na fronteira; depois da fronteira circula só tipo inferido (`z.infer`).
- Tipos e schemas compartilhados entre `web` e `api` vivem em `packages/shared` — nunca duplicar contrato.
- Preferir `type` a `interface` (consistência); union types e discriminated unions a enums (`as const` quando precisar de valores).

## Estilo e organização

- Nomes em **inglês** (código, arquivos, tabelas); textos de UI e mensagens para a usuária em **pt-BR**.
- Arquivos kebab-case (`sale-service.ts`); tipos/classes PascalCase; funções/variáveis camelCase; constantes UPPER_SNAKE.
- **Named exports** apenas — sem `export default` (exceto onde o framework exige, ex.: pages/layouts do Next).
- Early returns em vez de aninhamento; funções pequenas com uma responsabilidade; sem magic numbers/strings (extrair constante nomeada).
- Comentários só para restrições que o código não consegue expressar (o *porquê* não-óbvio). Nunca comentar o *o quê*.
- Imutabilidade por padrão: `const`, spread/`toSorted`/`toSpliced`; nada de mutar parâmetros.

## Erros

- Erros de domínio são classes nomeadas (`InsufficientStockError`) lançadas na camada de negócio e **mapeadas para HTTP na fronteira** (nunca vazar erro cru para o cliente).
- Proibido `catch` vazio ou que só loga e engole; ou trata de verdade, ou relança.
- Mensagens de erro para a usuária em pt-BR, acionáveis ("Estoque insuficiente: restam 2 unidades").

## Ferramentas

- **Biome** para lint + format (config única na raiz). `bun run lint`, `bun run format`, `bun run typecheck` (`tsc --noEmit`) devem passar limpos em qualquer entrega.
- Runtime/package manager: **Bun** com workspaces (`@clientela/web`, `@clientela/api`, `@clientela/shared`).
- Nada de dependência nova sem justificativa: preferir stdlib/Bun/lib já presente; adição de lib relevante = ADR ou entrada no Decisions Log.
