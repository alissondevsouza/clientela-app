---
feature: product-purchase-discount
module: shared, api, web
phase: spec
status: completed
size: L
created: 2026-09-08
updated: 2026-09-09
---

# Spec: product-purchase-discount (CRM-11)

## O Que

Permitir que a consultora cadastre e edite o custo atual de um produto de duas formas: pelo desconto de compra aplicado ao preço sugerido de venda ou informando o custo diretamente. O modo por desconto oferece atalhos de 30%, 35% e 40%, aceita percentual personalizado, calcula o custo e a margem bruta estimada imediatamente e persiste tanto o custo efetivo em centavos quanto a taxa que o originou.

## Por Que

Na venda direta, a consultora normalmente compra pelo preço de catálogo menos seu percentual de desconto. Hoje o CRM exige digitar `priceCents` e `costCents` manualmente, embora estoque, vendas, pedidos e dashboard já dependam do custo persistido. Automatizar o cálculo reduz digitação e erro sem comprometer exceções reais (promoções, kits e nota fiscal), que continuam cobertas pelo custo manual.

## Requisitos

- **RF-01 — Semântica financeira:** `priceCents` continua sendo o preço sugerido/padrão de venda; `costCents` continua sendo o custo atual consumido pelos agregados e snapshots. `purchaseDiscountBps` descreve a origem do custo quando não nulo (`3500` = 35%). No modo desconto, `costCents = roundHalfUp(priceCents × (10000 - purchaseDiscountBps) / 10000)`, sempre com inteiros. A margem bruta estimada em reais é `marginCents = priceCents - costCents`; quando `priceCents > 0`, sua taxa sobre o preço de venda é `marginBps = roundHalfAwayFromZero(marginCents × 10000 / priceCents)` e deve ser exibida com até duas casas decimais. O custo já arredondado é a entrada dessa segunda fórmula. Margem negativa é exibida com sinal; para preço zero, a taxa é apresentada como "Não calculável", nunca `NaN`/infinito. Nenhuma margem deve ser apresentada como lucro líquido garantido.
- **RF-02 — Contratos compartilhados:** `packages/shared` deve validar `purchaseDiscountBps` como inteiro entre 0 e 10000. Na criação manual, `costCents` é obrigatório e a taxa é ausente/nula; na criação por desconto, a taxa é obrigatória e `costCents` enviado pelo cliente é rejeitado como combinação ambígua. O PATCH permanece parcial e rejeita body vazio e a combinação simultânea de custo direto com taxa não nula. A resposta de produto inclui `purchaseDiscountBps: number | null` e o custo calculado persistido.
- **RF-03 — Autoridade e atomicidade do servidor:** a API calcula o custo no service e nunca confia em custo calculado pelo navegador. No PATCH: taxa não nula entra/permanece no modo desconto e recalcula pelo preço efetivo; custo direto muda para modo manual (`purchaseDiscountBps = null`); taxa explicitamente nula sem novo custo mantém o custo atual; alterar apenas o preço de produto em modo desconto recalcula o custo com a taxa persistida. Estoque, nome e demais PATCHes parciais não mudam a precificação. Estado atual + patch devem ser resolvidos dentro de uma transação que bloqueia a linha do produto, de modo que alterações concorrentes de preço/taxa produzam uma história serial válida, nunca erro interno ou combinação obsoleta.
- **RF-04 — Persistência e legado:** `products.purchase_discount_bps` é `integer NULL`, com CHECK de faixa 0..10000. Quando não nulo, um segundo CHECK garante no banco a igualdade entre `cost_cents` e a fórmula inteira com arredondamento de meio para cima e cast `bigint` antes da multiplicação. A migração é aditiva, sem backfill: todo produto preexistente recebe `null` e continua como custo manual, sem alteração de preço, custo, estoque ou histórico.
- **RF-05 — Formulário mobile-first:** cadastro e edição oferecem escolha acessível entre "Desconto da consultora" e "Informar custo diretamente". No modo desconto, exibir seleções de um toque para 30%, 35% e 40% e opção "Outro" com até duas casas decimais; nenhuma taxa deve ser assumida silenciosamente no cadastro. Ao editar, taxas 30/35/40 selecionam o preset correspondente; qualquer outra taxa válida seleciona "Outro" e preenche seu valor; produto com taxa nula abre no modo manual com o custo atual. Ao trocar de desconto para manual, o valor exibido obedece à prioridade: rascunho manual anterior → prévia válida do desconto → custo persistido da edição → vazio. Ao voltar para desconto, restaura a taxa escolhida/personalizada anteriormente e, se nunca houve uma, exige escolha sem aplicar default. Somente os campos do modo ativo compõem o payload. O custo manual só aparece no modo correspondente. Preço/taxa válidos atualizam uma prévia derivada durante o render, sem `useEffect`, com "Você paga" e "Margem bruta estimada" em reais e percentual conforme RF-01. Erros de campo e ajuda devem estar associados por label/fieldset/ARIA e os alvos devem ser confortáveis em ~375 px.
- **RF-06 — Leitura amigável:** o detalhe mostra preço sugerido, forma de custo (percentual ou manual), custo atual e margem bruta estimada. O card da listagem acrescenta uma linha compacta com custo e, quando aplicável, desconto. O resumo de estoque continua usando `costCents`, sem mudança de fórmula.
- **RF-07 — Integrações existentes:** venda continua congelando `products.costCents` em `sale_items.cost_cents`; pedidos continuam usando-o como custo default com override por item; dashboard e capital parado continuam lendo custos persistidos. Alterar preço/desconto de um produto nunca reescreve venda ou pedido histórico.
- **RF-08 — Qualidade e erros:** validações de percentual, combinações de modo e limites retornam 422 com mensagem acionável em pt-BR; nenhuma rota nova ou pública é criada; logs não incluem valores sensíveis; valores monetários permanecem inteiros em centavos.

## Critérios de Aceite

- [x] (RF-01/RF-02) Unidade shared prova 30/35/40%, personalizado 37,5%, bordas 0/100%, arredondamento de R$ 99,90 com 35% para R$ 64,94, entradas fracionárias/fora da faixa e combinações manual/desconto válidas e inválidas. Helpers de margem provam preço zero (taxa não calculável), custo maior que preço (margem negativa), precisão de duas casas e que a taxa usa o custo já arredondado.
- [x] (RF-02/RF-08) POST manual legado (`costCents`, sem taxa) continua válido; POST por desconto sem `costCents` é válido; POST com taxa não nula e custo simultâneo recebe 422 pt-BR; PATCH vazio e taxa fora da faixa recebem 422 pt-BR.
- [x] (RF-03) Unidade do service prova criação calculada, mudança de taxa, custo direto mudando para manual, taxa nula preservando custo, mudança isolada de preço recalculando produto com desconto e PATCH de estoque preservando preço/custo/taxa.
- [x] (RF-03/RF-04) Integração dispara PATCHes concorrentes de preço e taxa e prova que ambos observam estados serializados e que o resultado final satisfaz a fórmula persistida, sem 500.
- [x] (RF-04) Integração com Postgres real prova coluna nullable, CHECK de faixa, CHECK de consistência e preservação de uma linha legada com taxa nula; a migração gerada contém apenas DDL aditivo esperado.
- [x] (RF-03/RF-04/RF-08) Integração HTTP autenticada prova POST/PATCH/leitura/listagem nos dois modos, cálculo autoritativo e isolamento entre consultoras; resposta sempre traz taxa nula ou inteira e custo coerente.
- [x] (RF-05) Helpers web provam parse de percentual pt-BR, presets, customizado, preview e payloads dos dois modos; QA de runtime prova navegação por teclado, preview e submit em viewport mobile, incluindo cadastro sem default, edição com preset, edição com taxa personalizada, produto manual/legado e ida/volta entre modos preservando os respectivos rascunhos.
- [x] (RF-06) Detalhe e card renderizam rótulos/valores corretos para produto com desconto e produto manual, sem chamar helper de Client Component em RSC; QA de runtime percorre listagem e detalhe nos dois modos.
- [x] (RF-07) Suítes existentes de produtos, vendas, pedidos e dashboard permanecem verdes; snapshots históricos não são alterados pela migração ou por edição de produto.
- [x] (RF-08) `bun run lint`, `bun run typecheck`, `bun run test` e build de produção passam; nenhuma operação Git de escrita além da branch é executada.

## Fora de Escopo

- Custo médio ponderado, FIFO, lotes ou histórico de movimentação de estoque.
- Atualizar automaticamente o custo do produto na entrega de um pedido.
- Frete, impostos, despesas operacionais ou cálculo de lucro líquido.
- Percentual padrão por consultora/marca e integração com catálogo externo.
- Recalcular vendas, pedidos ou lucros históricos.
- Alterar o catálogo estático da landing page.

## Restrições Conhecidas

- Produção possui dados reais; o deploy já faz snapshot fail-closed antes de migrar (ADR-0019), mas o backup externo LP-13 segue pendente.
- A infra Playwright ainda não existe. O formulário de produto não está na lista de fluxos críticos que tornam E2E obrigatório, portanto a fiação React será validada por helpers unitários, build e runtime manual documentado.
- `costCents` permanece uma estimativa corrente do catálogo; o custo real por lote continua fora do modelo, como já ocorre nos pedidos de reposição.
