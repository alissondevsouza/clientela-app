---
feature: {{FEATURE_NAME}}
module: {{MODULE_NAME}}
phase: review
status: draft
round: {{N}}
created: {{DATE}}
updated: {{DATE}}
depends_on: [spec.md, plan.md, validate.md]
---

# Review: {{FEATURE_NAME}} (rodada {{N}})

<!-- Escrito pelo clientela-implement-verifier. Checklist mínimo — o revisor deve ir além dele. -->

## Checklist

### Correção e edge cases
- [ ] Lógica correta contra os critérios de aceite do spec.md
- [ ] Edge cases: null/undefined, lista vazia, zero, boundary, duplicidade, concorrência
- [ ] Tratamento de erro: erro de domínio certo, mapeado na fronteira, sem catch engolido

### Arquitetura (rules typescript/api.md, web.md)
- [ ] Camadas respeitadas: routes → service → repository; DI por construtor
- [ ] Zod em toda fronteira (rota, server action, form) com schema de packages/shared
- [ ] Web: Server Components por padrão; estados loading/vazio/erro; mobile-first
- [ ] Dinheiro em centavos (integer); operações multi-passo em transação

### Banco (database.md)
- [ ] Migração gerada, versionada e coerente com o schema
- [ ] FKs com índice; sem N+1; listagens paginadas

### Segurança e LGPD (security.md)
- [ ] Rotas autenticadas por padrão (pública = exceção listada e justificada)
- [ ] Sem segredo em código/log; sem PII em log; erros não vazam internals
- [ ] Captura de dados pessoais com consentimento registrado

### Tipos e qualidade (core.md)
- [ ] Sem `any`/`as`/`!` injustificados; tipos compartilhados vêm de packages/shared
- [ ] Sem magic numbers; named exports; early returns

### Testes (testing.md)
- [ ] Cada acceptance criterion tem teste executável; testes derivados do spec (não do diff)
- [ ] Integração com Testcontainers quando obrigatória; regressão para BUG-NNN
- [ ] Nenhum teste relaxado/skipado para passar

### Escopo
- [ ] Todas as tasks do tasks.md implementadas; nada além do escopo
- [ ] Nenhum arquivo fora do escopo modificado

## Problemas Encontrados

| # | Severidade | Descrição | Arquivo | Como corrigir |
|---|-----------|-----------|---------|---------------|
| 1 | <!-- CRÍTICO/ALERTA/SUGESTÃO --> | <!-- o quê + porquê --> | <!-- path:line --> | <!-- sugestão --> |

## Veredito

<!-- APROVADO | REPROVADO — só APROVADO com validate.md verde + zero CRÍTICO -->
