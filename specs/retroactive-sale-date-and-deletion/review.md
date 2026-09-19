---
feature: Data retroativa da venda e exclusão de venda
phase: qa
round: 4
date: 2026-09-19
verdict: approved
---

# Revisão adversarial — rodada 4

## Veredito

**APROVADO**

Não há achado CRÍTICO. Lint, typecheck, suíte, build e as validações adicionais exigidas pelo plano estão verdes.

## Conformidade técnica

- A rota `DELETE /sales/:id` continua na camada HTTP, delega ao service e retorna `Response` 204 explícita. A remoção trava a venda, restaura estoque somente para entregue não cancelada, ignora item órfão e faz a remoção na mesma transação.
- O escopo por consultora preserva o mesmo 404 para venda inexistente e alheia. O fluxo não expõe dados, segredos ou erros internos.
- `soldOn` é validado no contrato, tem guarda autoritativa no service contra o instante do Postgres e conserva o caminho de hoje. Datas passadas usam meio-dia no fuso da aplicação; campos de negócio e campos de linha preservam suas semânticas distintas.
- Os CHECKs e a migração correspondem ao ADR-0025. A cadeia real de produção legada foi reproduzida em teste de integração, cobrindo `0010` → `0014` e as pré-migrações necessárias para materializar o estado anterior.
- O dashboard filtra vendas concluídas por `sold_at`, como exigem RF-15 e ADR-0025. Os quatro pontos de UI no escopo usam o helper de data local compartilhado.
- O `build` raiz agora é um comando versionado e executável: compila o workspace web, único com artefato de build neste monorepo; os demais workspaces são validados por `typecheck` e testes de integração/runtime.

## Acceptance criteria

Atendidos. A matriz completa está coberta pelos testes derivados da spec, inclusive os cenários críticos de estoque (entregue, aberta, cancelada, item sem produto e concorrências), os CHECKs em Postgres real e o cenário de faturamento retroativo.

## Achados

Nenhum achado CRÍTICO, ALERTA ou SUGESTÃO nesta rodada.
