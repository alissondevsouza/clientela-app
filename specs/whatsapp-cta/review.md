---
feature: whatsapp-cta
module: web
phase: review
status: done
round: 1
created: 2026-07-17
updated: 2026-07-17
depends_on: [spec.md, plan.md, validate.md]
---

# Review: whatsapp-cta (rodada 1)

Revisor neutro (não implementou). Arquivos revisados: `apps/web/src/lib/{whatsapp,whatsapp.test,env,env.test}.ts`, `apps/web/src/components/landing/whatsapp-cta.tsx`, `apps/web/src/components/landing/hero.tsx`, `apps/web/src/app/(landing)/page.tsx`, `apps/web/src/content/landing.ts`, `apps/web/package.json`, `apps/web/.env.example`, `.env.example`, `.gitignore`/`apps/web/.env.local`.

## Checklist

### Correção e edge cases
- [x] Lógica correta contra os critérios de aceite do spec.md (RF-01..05 verificados por teste + HTML gerado)
- [x] Edge cases: mensagem ausente/vazia, boundary 10/15 dígitos, telefone sem dígitos, símbolos no telefone; encoding de `&`/`#`/`%`/`+`/newline verificado manualmente (correto, mas sem teste — ver #1)
- [x] Tratamento de erro: builder e env lançam erro claro; build falha citando `WHATSAPP_PHONE` sem vazar valor

### Arquitetura (rules typescript/web.md)
- [x] Server Components apenas — zero `"use client"` no escopo (grep)
- [x] Lógica separada de UI: builder puro em `lib/`, env em módulo próprio, componente só compõe
- [x] Página `/` continua estática (output do build); a11y ok (link com texto via children)
- [ ] Estados loading/vazio/erro — n.a. (conteúdo estático, sem fetch)

### Banco (database.md)
- n.a. — sem banco no escopo

### Segurança e LGPD (security.md)
- [x] Env validada com Zod; erro lista só o NOME da variável (teste `não vaza o valor inválido`)
- [x] `.env.local` gitignored (`git check-ignore` confirma; ausente do `git status`); `.env.example` sem valor real (número de exemplo `5511912345678`)
- [x] `rel="noopener noreferrer"` em `target="_blank"`; número de WhatsApp é público por natureza (RF-05)
- [x] Nenhum número fake residual em `landing.ts` (footer.whatsappLabel virou texto sem número)

### Tipos e qualidade (core.md)
- [x] Sem `any`/`as`/`!`; constantes nomeadas (MIN/MAX_PHONE_DIGITS, DEFAULT_WHATSAPP_MESSAGE); named exports; early returns
- [x] Tipos derivados de `z.infer` e de `Parameters<typeof buttonVariants>` (sem duplicar união de variantes)

### Testes (testing.md)
- [x] Cada criterio de aceite tem teste executável (16 testes de unidade) ou verificação de build/HTML
- [x] Testes derivam do comportamento do spec (formatos de telefone, encoding, defaults, erros), não do diff
- [x] Nenhum teste relaxado/skipado; todos com assert real (toBe/toThrow com valor esperado)
- [ ] Encoding de `&`/`#`/`%`/`+` sem teste de unidade explícito (ver achado #1)

### Escopo
- [x] Tasks 1.1, 1.2 e 2.1 implementadas; nada além do escopo
- [x] Nenhum arquivo fora do escopo modificado (conferido contra o plano; repo sem commits — comparação por inventário de arquivos)

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | SUGESTÃO | Testes de encoding cobrem espaço/acento/emoji mas não `&`, `#`, `%`, `+` — exatamente os caracteres que quebrariam a query string se alguém trocar `encodeURIComponent` por `encodeURI` (que NÃO codifica `&`/`#`) num refactor futuro. Verifiquei manualmente: comportamento atual correto (`%26`, `%23`, `%25`, `%2B`, roundtrip OK) | `apps/web/src/lib/whatsapp.test.ts` | Adicionar 1 caso: mensagem `"kit A&B #promo 50%+frete"` com URL esperada literal |
| 2 | SUGESTÃO | Mínimo de 10 dígitos aceita silenciosamente celular BR sem DDI (ex.: `11912345678` = 11 dígitos) que gera `wa.me` quebrado (WhatsApp interpretaria DDI errado). Conforme ao spec (RF-01 fixa E.164 10–15) e mitigado por documentação do DDI no `.env.example` (decisão registrada no plan.md) — risco residual apenas quando o humano preencher o número real (LP-08/12) | `apps/web/src/lib/whatsapp.ts` | Opcional: no handoff do LP-08/12, conferir que o número começa com `55`; ou futuro refinamento validando DDI conhecido |
| 3 | SUGESTÃO | `plan.md` diz na tabela "Modificar" que a raiz `.env.example` ganharia `WHATSAPP_PHONE`/`WHATSAPP_DEFAULT_MESSAGE`, mas a implementação seguiu a decisão (correta) da tabela de decisões: raiz só aponta para `apps/web/.env.example`. Inconsistência interna do plano, não da implementação — comportamento entregue é o certo (Next não lê env da raiz) | `.env.example` | Nada a corrigir no código; anotado para o registro |

## Veredito

**APROVADO** — lint/typecheck/testes/build verdes, build negativo falha com mensagem clara sem vazar valores, os dois CTAs no HTML estático com URL correta e `rel` seguro, `#contato` preservado, zero `"use client"`, `.env.local` ignorado. Zero CRÍTICO; 3 sugestões não-bloqueantes.
