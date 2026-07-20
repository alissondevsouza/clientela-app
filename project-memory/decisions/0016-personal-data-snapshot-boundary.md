# ADR-0016 — Snapshot de dado pessoal só com fundamento; caso contrário, derivar por join e propagar apagamento

- **Status**: Aceito
- **Data**: 2026-07-20

## Contexto

O CRM-10 vincula itens de pedido de reposição a clientes ("encomenda da Maria"). O primeiro desenho copiava o padrão do ADR-0013 (snapshot de `client_name` + FK `SET NULL`), mas a revisão neutra da spec apontou: a justificativa do ADR-0013 é a **guarda de registro financeiro** (venda) — fundamento que não se transfere a um registro operacional como pedido de reposição. Reter nome de pessoa após ela pedir exclusão (LGPD, `security.md`) exige base; "conveniência de histórico" não é uma.

## Decisão

Regra geral do projeto para dado pessoal em agregados relacionados:

1. **Snapshot de dado pessoal** (nome etc.) **só quando há fundamento explícito** de retenção — hoje, apenas o registro financeiro de vendas (ADR-0013). Cada novo snapshot exige decisão registrada.
2. **Sem fundamento ⇒ sem snapshot**: armazenar apenas a FK (`ON DELETE SET NULL` + índice) e **derivar o nome por join na leitura**. Exclusão da pessoa propaga naturalmente (vínculo apagado, sem coluna órfã, sem rotina de anonimização); rename reflete automaticamente.

Aplicado em `order_items.client_id` (CRM-10): `clientName` é derivado por LEFT JOIN; excluir a cliente faz o item voltar a "reposição".

## Alternativas consideradas

- **Estender o snapshot do ADR-0013**: rejeitada — base legal diferente; reteria dado pessoal sem fundamento.
- **Snapshot + anonimização no DELETE** (sentinel "Cliente excluída"): rejeitada — exige escrita cross-módulo (clients tocando order_items) ou trigger, complexidade sem ganho sobre o join.

## Consequências

- Perde-se o rótulo da encomenda se a cliente for excluída — aceito: o apagamento é a exceção e é exatamente o que a LGPD pede em registro não-financeiro.
- Leitura do pedido carrega um LEFT JOIN (custo desprezível; sem N+1 — join na query de itens).
- Padrão a consultar em qualquer feature futura que "carimbe" nome de pessoa em outra tabela.
