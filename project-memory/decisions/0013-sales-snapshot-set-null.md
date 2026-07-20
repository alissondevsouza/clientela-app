# ADR-0013 — Vendas imutáveis: snapshot + FK SET NULL (LGPD × histórico)

- **Status**: Aceito
- **Data**: 2026-07-18

## Contexto

O CRM-06 criou `sales`/`sale_items`/`receivables`. Duas exigências colidiam: `security.md`/LGPD (exclusão de cliente — e gestão de produto — deve ser possível) e a invariante 5 do domínio ("venda não se apaga"). O known-issue "Exclusão física × histórico de vendas" adiou a decisão para este ciclo.

## Decisão

1. **Venda é registro imutável com snapshots**: `sales.client_name`, `sale_items.product_name` e `sale_items.unit_price_cents` capturam os valores no momento da venda.
2. **FKs desvinculáveis**: `sales.client_id` e `sale_items.product_id` são nullable com `ON DELETE SET NULL` — excluir a cliente/produto preserva o registro financeiro, removendo o vínculo vivo. `sale_items`/`receivables` têm `ON DELETE CASCADE` apenas com a própria venda; `sales.consultant_id` é `CASCADE` (exclusão da conta leva os dados dela).
3. **Sem edição de venda**: apenas cancelamento (`status = canceled`), que devolve estoque (só de produtos ainda existentes) e remove parcelas pendentes; bloqueado com parcela paga.
4. **Snapshot de `client_name` permanece após a exclusão da cliente** — base: guarda de registro de operação financeira (minimização: só o nome, sem contato). **Sujeito à revisão do humano**: anonimizar o snapshot no DELETE é ajuste pequeno se preferido.

## Alternativas consideradas

- **Bloquear exclusão com vendas (RESTRICT)** — descartada: transformaria a LGPD em exceção operacional e travaria a gestão do catálogo.
- **Soft delete de clientes/produtos** — descartada: `database.md` evita soft delete por padrão; snapshot resolve com menos estado.

## Consequências

- Concorrência protegida por transações com guarda condicional (`UPDATE ... WHERE stock_qty >= qty`; cancelar×pagar serializados na linha da venda via `FOR UPDATE`).
- Relatórios históricos (CRM-07/MKT-02) leem snapshots — imunes a mudanças de preço/cadastro.
- Known-issue "Exclusão física × histórico de vendas" resolvido.
