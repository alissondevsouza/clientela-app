# 04 — Modelo de Domínio

> **Status: rascunho** — será refinado quando a Fase 2 (CRM MVP) for especificada. Serve de vocabulário comum; o schema Drizzle é a fonte de verdade dos detalhes quando existir.

## Entidades principais

| Entidade | O que é | Campos-chave (além de id/timestamps) |
|---|---|---|
| **Consultant** | A usuária do sistema (hoje: única) | name, email, password_hash, whatsapp, **monthly_goal_cents** nullable (meta mensal editável; null = sem meta, CHECK > 0 quando presente — CRM-07, ADR-0014) — implementada no CRM-01 (ADR-0012) |
| **Session** | Sessão autenticada da consultora (CRM-01) | consultant_id, token_hash (SHA-256 do token opaco; nunca o token em claro), expires_at |
| **Lead** | Interessado capturado na landing | name, whatsapp, interest, source, status (`new → contacted → converted / discarded`), consent_at, client_id (vínculo da conversão, `SET NULL` se a cliente for excluída) — funil e conversão implementados no CRM-04. **Drift aceito**: sem `consultant_id` nesta fase (captura pública, usuária única) — a relação `Lead N—1 Consultant` fica para o multi-tenant |
| **Client** | Cliente da consultora (pode nascer de um Lead) | consultant_id, name, whatsapp, birthday, skin_tone, notes — implementada no CRM-03 (exclusão física por ora; ver known-issue LGPD×vendas) |
| **Product** | Produto do catálogo da consultora | consultant_id, name, brand_code, **cost_cents** (custo atual materializado), **purchase_discount_bps nullable** (`NULL` = custo manual/legado; 0..10000 = desconto que deriva o custo), price_cents, stock_qty, low_stock_threshold — CRM-05/CRM-11, ADR-0022; `lowStock = stock_qty <= low_stock_threshold` |
| **Sale** | Venda realizada (cancela-se se aconteceu; exclui-se se nunca existiu — ADR-0024) | consultant_id, client_id nullable (SET NULL), **client_name snapshot**, total_cents (sempre do servidor), payment_method (`cash/pix/card/credit`), status (`completed/canceled`), **sold_at informado pela usuária** (dia local → meio-dia no fuso da aplicação quando retroativo; hoje usa o instante da transação — ADR-0025) — CRM-06, ADR-0013 |
| **SaleItem** | Item de uma venda (snapshot) | sale_id, product_id nullable (SET NULL), **product_name snapshot**, qty, unit_price_cents, **cost_cents snapshot** (custo no momento da venda — base do lucro estimado; CRM-07, ADR-0014) — CRM-06 |
| **Receivable** | Parcela a receber (venda `credit`) | sale_id, amount_cents (> 0; Σ = total por construção), due_date, paid_at nullable — baixa/estorno por parcela inteira; CRM-06 |
| **Order** | Pedido de reposição à Mary Kay | consultant_id, status (`draft → placed → delivered`; `canceled` de draft/placed; delivered/canceled terminais), total_cents (sempre do servidor), placed_at/delivered_at/canceled_at nullable — CRM-09, ADR-0015 |
| **OrderItem** | Item de um pedido (snapshot de produto; encomenda opcional de cliente) | order_id, product_id nullable (SET NULL), **product_name snapshot**, qty (≥ 1), **unit_cost_cents snapshot** (default = custo atual do produto, override permitido), client_id nullable (SET NULL, **sem snapshot de nome** — `clientName` derivado por join; exclusão da cliente apaga o vínculo, ADR-0016) — CRM-09/CRM-10 |
| **Appointment** | Compromisso da agenda (sessão demonstrativa, análise de pele, entrega, follow-up) | consultant_id (cascade), client_id **e** lead_id nullable (SET NULL, **sem snapshot** — nome/WhatsApp por join, ADR-0016; cliente tem precedência na leitura), sale_id nullable (SET NULL, "essa sessão virou venda?"), kind (`skin_analysis/demo/delivery/follow_up/other`), title nullable, starts_at (timestamptz), duration_minutes (CHECK 1..1440), status (`scheduled → done / no_show / canceled`, terminais), location/notes nullable — REL-06, ADR-0018 |

## Invariantes do domínio (proteger em service + teste — ver rules `typescript/api.md`)

1. Venda dá baixa **atômica** no estoque; estoque nunca fica negativo.
2. Todo valor monetário é **inteiro em centavos**.
3. Soma dos `SaleItem` = `total_cents` da venda; soma dos `Receivable` pagos nunca excede o total.
4. Lead convertido vira `Client` mantendo o vínculo (rastreabilidade da origem).
5. **Venda que aconteceu não se apaga — cancela-se** (status), preservando histórico. Venda que **nunca existiu** (duplicata, erro de digitação) **exclui-se**: a exclusão reverte os efeitos e remove as linhas na mesma transação, devolvendo estoque **somente** quando a venda estava entregue e não cancelada (ADR-0024). Cancelar e excluir são verbos distintos e coexistem.
6. Pedido entregue dá **entrada atômica** no estoque (mesma transação da transição `placed → delivered`; crédito único sob concorrência); item de produto excluído não credita. Pedido não se apaga — cancela-se; `delivered` é terminal (sem estorno). Sob corrida sem efeito colateral (`place`×`cancel`), o resultado é sempre uma história serial legal da matriz de status (ADR-0015).
7. **Encontro não realizado não tem venda vinculada**: `cancel` e `no_show` limpam `sale_id` na mesma transação da transição; `done` **preserva** um vínculo feito antes. É o que garante o estado legal sob concorrência sem lock — o guard do vínculo de venda (`scheduled`/`done`) é superconjunto do alvo do `done`, então os dois podem aplicar (EvalPlanQual); a limpeza torna qualquer ordem consistente (REL-06, ADR-0018).
8. **Recorte de dia da agenda é calculado no fuso da aplicação** (`America/Sao_Paulo`, ADR-0018), em TypeScript, e passado ao SQL como bounds UTC — nunca `CURRENT_DATE`/`date_trunc(now())`/`AT TIME ZONE`, que dependeriam do `TimeZone` da sessão Postgres. Um compromisso às 20h de 05/08 pertence ao dia 05/08.
9. **Conversão de lead propaga a agenda**: os compromissos do lead que ainda não têm cliente passam a apontar para a cliente criada, na mesma transação, **preservando `lead_id`** (rastreabilidade). É por isso que `appointments` não tem CHECK de exclusividade cliente×lead — a regra vive no contrato Zod, não no banco.
10. **Lucro estimado** = Σ `(unit_price_cents − cost_cents) × qty` sobre itens de vendas `completed`, por **snapshot de custo** (imune a reajustes de custo posteriores); pode ser **negativo** (venda abaixo do custo). Agregados do dashboard escopados por consultora e recortados por **`sold_at`** — a venda conta no mês em que foi vendida, não no mês em que terminou de ser paga (ADR-0025, emenda o faturamento por conclusão do ADR-0023). Consequência aceita: o faturamento de um mês passado pode aumentar retroativamente quando uma venda antiga é quitada. Borda do mês ainda em `date_trunc('month', now())`, no fuso da sessão Postgres (ADR-0018) — CRM-07, ADR-0014.
11. **Custo atual por desconto**: quando `products.purchase_discount_bps` não é nulo, `cost_cents = floor((price_cents × (10000 − purchase_discount_bps) + 5000) / 10000)`; contrato, service e CHECKs mantêm a igualdade, e PATCHes financeiros concorrentes são serializados por lock de linha. Taxa nula significa custo informado diretamente e não é inferida para o legado. Alterações afetam somente o custo corrente e snapshots futuros — CRM-11, ADR-0022.

## Relações

`Consultant 1—N Client` · `Consultant 1—N Session` (delete cascade) · `Client 1—N Sale` · `Sale 1—N SaleItem N—1 Product` · `Sale 1—N Receivable` · `Lead N—1 Consultant` (e `Lead 1—0..1 Client` na conversão) · `Consultant 1—N Order` · `Order 1—N OrderItem N—0..1 Product` (SET NULL) · `OrderItem N—0..1 Client` (SET NULL, encomenda — ADR-0016) · `Consultant 1—N Appointment` (cascade) · `Appointment N—0..1 Client`, `N—0..1 Lead`, `N—0..1 Sale` (todas SET NULL — REL-06).

> Multi-tenant futuro (ver ADR-0002/visão geral): as entidades já penduram em `Consultant` — não criar atalho que assuma "consultora única" em queries de domínio.
