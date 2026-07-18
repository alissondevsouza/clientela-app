---
feature: whatsapp-cta
module: web
phase: spec
status: draft
size: M
created: 2026-07-17
updated: 2026-07-17
---

# Spec: Componente WhatsApp CTA parametrizável

## O Que

Componente reutilizável de CTA para WhatsApp no `apps/web`: link `wa.me` com mensagem pré-preenchida, com número e mensagem default parametrizáveis via env/config. Substitui o CTA placeholder (`#contato`) do hero e a menção de WhatsApp do rodapé da landing. O LP-05 (catálogo) reutilizará o componente com mensagem por produto.

## Por Que

Item **LP-04** do roadmap (Fase 1). A venda fecha no WhatsApp — o site direciona (`03-features.md`). O link precisa ser parametrizável porque o número real da consultora só entra no LP-08/12 (humano) e porque o catálogo pré-preencherá mensagens diferentes por produto.

## Requisitos

- **RF-01** — Builder puro `buildWhatsAppUrl({ phone, message })` em `lib/`: gera `https://wa.me/{phone}?text={mensagem urlencoded}`; `phone` normalizado para dígitos (aceita formatos com `+`, espaços, hífens); mensagem opcional (sem `?text` quando ausente); lança erro claro para telefone sem dígitos suficientes (E.164: 10–15 dígitos).
- **RF-02** — Config via env validada com Zod em módulo próprio (`lib/env.ts` do web): `WHATSAPP_PHONE` (obrigatória, formato validado) e `WHATSAPP_DEFAULT_MESSAGE` (opcional com default pt-BR nomeado). Lida em build time (página é SSG); env ausente/ inválida → build falha com mensagem clara (não página quebrada silenciosa). `.env.example` atualizado.
- **RF-03** — Componente Server `WhatsAppCta` (`components/landing/whatsapp-cta.tsx`): renderiza `<a>` estilizado (buttonVariants, tamanho/variante parametrizáveis) com `href` do builder, `target="_blank"` + `rel="noopener noreferrer"`, aceitando `message` custom (default = da config) e children/label.
- **RF-04** — Hero passa a usar `WhatsAppCta` (substitui o link `#contato`); rodapé `#contato` ganha um `WhatsAppCta` também (o rótulo estático vira botão real). A âncora `#contato` continua existindo (LP-06 pendurará o formulário lá).
- **RF-05** — Zero `"use client"`; página `/` continua estática no build; nenhuma env com dado sensível (número de WhatsApp é público por natureza — aparece no HTML).

## Critérios de Aceite

- [ ] (RF-01) Unidade: telefone `+55 (11) 91234-5678` → `https://wa.me/5511912345678`; mensagem com espaços/acentos/emoji urlencoded; sem mensagem → sem `?text`; telefone inválido → erro com mensagem clara.
- [ ] (RF-02) Build sem `WHATSAPP_PHONE` falha citando a variável; com env válida, build verde e `/` estática.
- [ ] (RF-03/04) HTML servido: CTA do hero e do rodapé apontam para `https://wa.me/<número da env>?text=...` com `rel="noopener noreferrer"`; âncora `#contato` presente.
- [ ] (RF-05) Zero `"use client"` no escopo; rota `/` estática no output do build.

## Fora de Escopo

- Mensagem por produto (LP-05 usará a prop `message`).
- Número real da consultora (`.env` local/prod — humano, LP-08/LP-12).
- Rastreamento de cliques/analytics.

## Restrições Conhecidas

- Página SSG: env lida em build time — trocar número exige rebuild (aceitável; documentado no `.env.example`).
- `web.md`: mobile-first, a11y (link com texto acessível).
- ADR-0006: sem git de escrita.
