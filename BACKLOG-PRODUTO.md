# Backlog de produto — priorizado para virar issues

**Data:** 2026-08-07 · **Autor:** análise crítica pós-entrega da agenda (REL-06)

> **Relação com o `specs/ROADMAP.md`:** o roadmap continua sendo o documento de trabalho dos agentes (status por item, dependências, fluxo). Este arquivo é a **camada de produto**: a ordem em que as coisas deveriam ser feitas e *por quê*, para você abrir as issues. Onde o item já existe no roadmap, o ID está indicado — ao criar a issue, vale colar o número dela no roadmap para os dois documentos não divergirem.

---

## Diagnóstico que gerou esta ordem

O sistema hoje é um **registro** muito bem feito: guarda o que já aconteceu. O problema é que **o caderno é mais rápido de alimentar** — rabiscar "Maria, base, fiado" leva 4 segundos; registrar a mesma venda no app leva busca de cliente, busca de produto, quantidade, forma de pagamento. Se o app só organiza melhor o que ela já anota, ele perde no dia a dia.

O que tem valor real hoje é estreito: **controle de fiado**, **margem e capital parado**, e **pedido de reposição**. O resto é substrato.

O valor que falta é a camada que **transforma dado em ação** — o sistema nunca diz "faça isso agora". Daí a ordem abaixo: primeiro proteger o que existe, depois reduzir o atrito da única ação que precisa acontecer todo dia, depois fazer o app falar com a consultora.

**Critério de corte usado:** cada item responde "isso faz a consultora ganhar dinheiro, economizar tempo, ou evita perder o negócio?". O que não responde foi para o fim.

---

# P0 — Inegociável

## 1. Backup diário do Postgres para fora da VPS

- **Roadmap:** LP-13 · **Tamanho:** M · **Depende de:** nada · **Bloqueia:** dormir tranquilo

**Por quê:** há dados reais de clientes, vendas e recebíveis em produção e **nenhuma cópia fora da VPS**. O snapshot pré-deploy (INF-07) protege contra migração ruim, não contra o disco morrer — os dois estão na mesma máquina. É o único item da lista cuja falha é irreversível: perder isso é perder o negócio da consultora, não uma feature.

**O que fazer:** job diário (`pg_dump` comprimido) enviando para destino externo, com retenção e criptografia em trânsito. **Exige decisão sua sobre o destino** (S3, Cloudflare R2, Backblaze B2 ou Google Drive) — gera ADR. Reusar a máquina que o INF-07 já criou.

**Pronto quando:** existe cópia de ontem fora da VPS, e o procedimento de restauração foi **executado uma vez** de verdade. Backup nunca restaurado é teatro.

---

# P1 — O que transforma o app em produto

## 2. Cobrança de fiado com mensagem pronta

- **Roadmap:** não existe (criar) · **Tamanho:** P/M · **Depende de:** CRM-06 (pronto)

**Por quê:** é a maior conversão de código em dinheiro do projeto inteiro. Os recebíveis já estão modelados e a tela de "quem me deve" existe, mas o botão de WhatsApp da parcela abre a conversa **sem mensagem** — ela ainda precisa escrever a cobrança, uma por uma. Venda fiado é o coração da venda direta e o que mais dá prejuízo por esquecimento.

**O que fazer:** mensagem pt-BR pré-preenchida por parcela (nome, valor, vencimento, educada), e uma visão consolidada "X pessoas te devem R$ Y" com um toque por pessoa, priorizando o que está vencido. Reusar `buildWhatsAppUrl` e o padrão de `appointment-message.ts` (helper puro em `lib/`, testável).

**Pronto quando:** ela cobra três pessoas em menos de um minuto, sem digitar nada.

**Notas técnicas:** `apps/web/src/components/sales/receivable-row.tsx` já tem o link; falta a mensagem e a tela agregadora.

---

## 3. Venda rápida — reduzir o registro a 3 toques

- **Roadmap:** não existe (criar) · **Tamanho:** M · **Depende de:** CRM-06 (pronto)

**Por quê:** esta é **a** ação que precisa acontecer todos os dias. Se ela for cara, nada mais no sistema importa — sem venda registrada, não há fiado, não há margem, não há recompra, não há dashboard. Hoje o formulário é completo e correto, mas pesado para o caso comum (uma cliente, um ou dois produtos, à vista).

**O que fazer:** atalho a partir da ficha da cliente; produtos mais vendidos primeiro no seletor; "repetir última compra"; quantidade com toque em vez de digitação. Não é feature nova — é **remoção de atrito**.

**Pronto quando:** registrar uma venda simples leva menos de 15 segundos no celular, medido de verdade com o app em produção.

---

## 4. Lembretes de recompra

- **Roadmap:** REL-02 · **Tamanho:** M/L · **Depende de:** CRM-06 (pronto)

**Por quê:** é a feature matadora **para beleza especificamente**, e a única coisa da lista que um caderno não faz de jeito nenhum. Consumível tem ciclo previsível — base, skincare, batom. "A base da Maria acaba essa semana" é receita que hoje se perde por esquecimento. É o que separa um arquivo de um sócio.

**O que fazer:** marcar produtos como consumíveis com duração média estimada (editável); cruzar com o histórico de vendas; gerar sugestões de follow-up com mensagem pronta. Começar simples: duração fixa por produto, sem inferência estatística.

**Pronto quando:** ela recebe uma lista semanal de quem provavelmente está acabando o produto, e pelo menos uma venda nasce dali.

---

## 5. Aniversariantes da semana/mês

- **Roadmap:** REL-03 · **Tamanho:** P · **Depende de:** CRM-03 (pronto)

**Por quê:** barato (o campo `birthday` já existe) e alto retorno emocional num negócio que vive de relacionamento. É o tipo de toque que fideliza e que ninguém consegue manter no caderno.

**O que fazer:** lista da semana e do mês, com mensagem pronta. Só isso.

---

## 6. Tela "Hoje" como página inicial do CRM

- **Roadmap:** REL-05 · **Tamanho:** M · **Depende de:** itens 2, 4 e 5 + REL-06 (agenda, pronto)

**Por quê:** é o produto. Todo o resto é entrada de dados para esta tela. Hoje, ao abrir o CRM, ela vê **números** (vendas do mês, lucro, meta) — coisas que ela já intui e que não pedem ação. Deveria ver **pessoas para falar hoje**: compromissos, aniversariantes, recompra prevista, fiado vencido, lead parado. Cada item com um botão que já abre a conversa.

**O que fazer:** agregar as fontes numa lista única priorizada e **trocar a home** — o dashboard vira uma aba, não a porta de entrada.

**Pronto quando:** ela abre o app e a primeira coisa na tela é o que fazer, não o que aconteceu.

---

# P2 — Proteger o que já existe

## 7. Infra de testes E2E (Playwright)

- **Roadmap:** REL-01 · **Tamanho:** M/L

**Por quê:** dois defeitos críticos deste último ciclo passaram por lint, typecheck, 1119 testes e `next build`, e só apareceram exercitando o app de verdade: o formulário da agenda que **falhava em silêncio** ao editar compromisso pós-conversão, e o reexport de Server Action que teria colocado a agenda inteira em produção com **todos os botões inertes**. Hoje a rede é a QA manual — que funcionou, mas não escala e não roda no CI.

**O que fazer:** cobrir login, captura de lead na landing, registro de venda e o formulário da agenda. Rodar no pipeline.

---

## 8. Gate contra reexport de Server Action

- **Roadmap:** INF-08 · **Tamanho:** P

**Por quê:** o bug do manifest (`404 Server action not found` em produção, com todos os gates verdes) hoje só está impedido por um comentário no código e uma lesson. É barato tornar mecânico.

**O que fazer:** regra de lint proibindo `export { … } from "…/actions"` em arquivo `"use server"`, **ou** teste pós-build lendo `.next/server/server-reference-manifest.json` e assertando o mínimo de ids por rota.

---

## 9. Instrumentar adoção real

- **Roadmap:** não existe (criar) · **Tamanho:** P

**Por quê:** o maior risco do projeto não é técnico, é **abandono**. Se a consultora parar de registrar vendas, todo o resto vira ficção — e os testes verdes não vão avisar. Você precisa de um número honesto.

**O que fazer:** o sinal mais simples possível — "última venda registrada há X dias" e "vendas registradas nos últimos 7 dias", visível para você (não precisa ser tela bonita). Se depois de três semanas de uso real esse número estiver ruim, a prioridade toda muda: o problema é atrito, não falta de feature.

---

# P3 — Ajustes e dívidas conhecidas

## 10. Unificar o fuso do dashboard e dos recebíveis

- **Roadmap:** known-issue aberta · **Tamanho:** P/M

**Por quê:** a agenda recorta o dia em `America/Sao_Paulo` (ADR-0018), mas o dashboard ainda agrega o mês em UTC e `overdue` usa `CURRENT_DATE` (fuso da sessão do Postgres). Duas semânticas de "hoje" convivendo. Nenhum número está errado dentro da própria feature, mas a virada de mês do dashboard acontece ~21h do dia anterior. Migrar muda números de feature já entregue — **decisão sua**.

## 11. Cadastro rápido: detectar pessoa duplicada por WhatsApp

- **Roadmap:** REL-08 · **Tamanho:** P

**Por quê:** o cadastro rápido da agenda facilita criar a mesma pessoa duas vezes. É o caminho mais curto para poluir a base — e base suja mata a confiança nas features de relacionamento (itens 4 e 5).

## 12. `createManual` usando `RETURNING`

- **Roadmap:** não existe · **Tamanho:** P

**Por quê:** sugestão de QA sem impacto funcional: hoje faz `insert` + `findById` onde um `RETURNING` bastaria, e o erro genérico vira 500 sem código de domínio. Puramente higiene.

## 13. Catálogo da landing alimentado pelo CRM

- **Roadmap:** CRM-08 · **Tamanho:** M

**Por quê:** hoje o catálogo da landing é estático em config. Vincular ao estoque real evita anunciar o que acabou. **Só vale se a landing tiver tráfego** — ver item 15.

## 14. Follow-up de leads parados

- **Roadmap:** REL-04 · **Tamanho:** P/M

**Por quê:** completa a tela "Hoje". Prioridade baixa enquanto o volume de leads for pequeno — o que depende do item 15.

---

# P4 — Decisão antes de código

## 15. Medir a landing antes de investir mais nela

- **Roadmap:** afeta LP-08, LP-09, CRM-08 · **Tamanho:** nenhum (é medição)

**Por quê:** site pessoal de consultora não tem tráfego orgânico — as pessoas chegam por Instagram e indicação. A captura de lead só funciona se ela levar gente para lá (link na bio). **Antes** de investir em conteúdo real, fotos, verificação de diretrizes da Mary Kay e catálogo dinâmico, olhe o número: quantos leads reais entraram em um mês? Se for perto de zero, a landing é vitrine, não canal — e todo o esforço deve ir para o CRM.

**Ação:** consultar a tabela `leads` daqui a 30 dias e decidir. Custo zero, evita semanas de trabalho no lugar errado.

---

# O que eu NÃO faria agora

- **Relatórios e gráficos (MKT-02).** Uma consultora com ~100 clientes não precisa de BI; precisa de empurrão. Análise é resposta para quem já tem volume.
- **Mini-campanhas (MKT-01)** antes da tela "Hoje" existir e ser usada.
- **Metas e comissão Mary Kay (MKT-04)** — depende de regras externas que mudam e entregam pouco frente ao custo.
- **Mais telas de cadastro.** O sistema já registra o suficiente. O gargalo é ação, não captura.
- **Integração oficial com a WhatsApp Business API.** O padrão manual `wa.me` já resolve; o gargalo não é *enviar*, é *saber para quem*.

---

# Ordem sugerida de execução

```
1. LP-13 (backup)              ← risco irreversível, faça já
2. Cobrança de fiado           ← dinheiro imediato, esforço baixo
3. Venda rápida                ← destrava todo o resto
9. Instrumentar adoção         ← barato, roda em paralelo
5. Aniversariantes             ← barato, valor emocional
4. Recompra                    ← a feature matadora
6. Tela "Hoje"                 ← junta tudo e vira o produto
7. E2E + 8. Gate               ← quando o ritmo de mudança aumentar
```

Os itens 2, 3 e 9 cabem numa semana somados e mudam a percepção de valor mais do que os últimos dois ciclos inteiros.
