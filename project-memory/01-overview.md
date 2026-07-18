# 01 — Visão Geral

## O que é

Sistema de apoio para uma **consultora de beleza Mary Kay** (venda direta), composto por duas frentes que se complementam:

1. **Página profissional (landing page)** — página pública de apresentação da consultora, com objetivo de **vendas e captura de leads**: catálogo de produtos em destaque, botão de contato direto via WhatsApp e formulário de cadastro de interessados.
2. **CRM (aplicação web)** — sistema interno de uso da consultora para organizar o dia a dia do negócio: clientes, vendas, estoque, cobranças e ações de marketing/relacionamento.

As duas frentes são integradas: **todo lead capturado na landing page entra automaticamente no CRM**.

## Usuária

- **Usuária única (por enquanto)**: a consultora. O sistema é feito sob medida para o fluxo de trabalho dela.
- Perfil não técnico — a interface precisa ser simples, direta e funcionar bem no **celular** (grande parte do uso será mobile).

## Contexto do negócio

- Venda direta de cosméticos: a consultora compra produtos da Mary Kay e revende com margem/comissão.
- O negócio vive de **relacionamento e recompra**: produtos são consumíveis (base, batom, skincare), então a cliente que comprou volta a comprar — se alguém lembrar de procurá-la na hora certa.
- A venda acontece majoritariamente pelo **WhatsApp**. O sistema não substitui o WhatsApp; ele organiza a informação e aponta *com quem falar e quando*.
- Dores reais do dia a dia: controle de quem deve (fiado/parcelado), estoque parado, esquecer de fazer follow-up, não saber quanto lucrou no mês.

## Objetivos

1. Dar presença profissional online à consultora (credibilidade + canal de captação).
2. Centralizar clientes, vendas e estoque num lugar só (hoje: caderno/planilha/memória).
3. Aumentar recompra via lembretes de follow-up, aniversários e reposição de produto.
4. Dar visibilidade financeira: vendas do mês, lucro estimado, valores a receber.

## Não-objetivos (por enquanto)

- E-commerce completo com checkout/pagamento online — a venda fecha no WhatsApp.
- Multi-tenant / SaaS para outras consultoras — é uma possibilidade futura (o mercado de revendedoras Mary Kay/Natura/Avon/Boticário tem as mesmas dores), e a modelagem deve **evitar bloquear** esse caminho, mas não é escopo atual.
- Integração oficial com a API do WhatsApp Business — usaremos links `wa.me` com mensagem pré-preenchida.

## Restrições e atenções

- **Diretrizes da marca Mary Kay**: empresas de venda direta costumam ter regras sobre uso de logo, marca e divulgação de preços por consultoras em sites próprios. Verificar o que é permitido antes de publicar a landing page.
- **LGPD**: a landing page captura dados pessoais (nome, WhatsApp). O formulário precisa de consentimento explícito e finalidade clara.
- Orçamento enxuto: infraestrutura de baixo custo (VPS única — ver [02-architecture.md](./02-architecture.md)).
