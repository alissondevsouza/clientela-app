# 04 — Modelo de Domínio

> **Status: rascunho** — será refinado quando a Fase 2 (CRM MVP) for especificada. Serve de vocabulário comum; o schema Drizzle é a fonte de verdade dos detalhes quando existir.

## Entidades principais

| Entidade | O que é | Campos-chave (além de id/timestamps) |
|---|---|---|
| **Consultant** | A usuária do sistema (hoje: única) | name, email, password_hash, whatsapp — implementada no CRM-01 (ADR-0012) |
| **Session** | Sessão autenticada da consultora (CRM-01) | consultant_id, token_hash (SHA-256 do token opaco; nunca o token em claro), expires_at |
| **Lead** | Interessado capturado na landing | name, whatsapp, interest, source, status (`new → contacted → converted / discarded`), consent_at |
| **Client** | Cliente da consultora (pode nascer de um Lead) | consultant_id, name, whatsapp, birthday, skin_tone, notes — implementada no CRM-03 (exclusão física por ora; ver known-issue LGPD×vendas) |
| **Product** | Produto do catálogo da consultora | name, brand_code, cost_cents, price_cents, stock_qty, low_stock_threshold |
| **Sale** | Venda realizada | client_id, total_cents, payment_method, status |
| **SaleItem** | Item de uma venda | sale_id, product_id, qty, unit_price_cents |
| **Receivable** | Parcela/valor a receber (fiado/parcelado) | sale_id, amount_cents, due_date, paid_at |

## Invariantes do domínio (proteger em service + teste — ver rules `typescript/api.md`)

1. Venda dá baixa **atômica** no estoque; estoque nunca fica negativo.
2. Todo valor monetário é **inteiro em centavos**.
3. Soma dos `SaleItem` = `total_cents` da venda; soma dos `Receivable` pagos nunca excede o total.
4. Lead convertido vira `Client` mantendo o vínculo (rastreabilidade da origem).
5. Venda não se apaga — cancela-se (status), preservando histórico.

## Relações

`Consultant 1—N Client` · `Consultant 1—N Session` (delete cascade) · `Client 1—N Sale` · `Sale 1—N SaleItem N—1 Product` · `Sale 1—N Receivable` · `Lead N—1 Consultant` (e `Lead 1—0..1 Client` na conversão).

> Multi-tenant futuro (ver ADR-0002/visão geral): as entidades já penduram em `Consultant` — não criar atalho que assuma "consultora única" em queries de domínio.
