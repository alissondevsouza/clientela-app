# Rule: Web (`apps/web`) — Next.js App Router

## Estrutura

```
apps/web/src/
├── app/
│   ├── (landing)/         # páginas públicas — SSG/ISR, foco em SEO e velocidade
│   └── (crm)/             # área autenticada — layout próprio com guard de auth
├── components/
│   ├── ui/                # shadcn/ui (gerado — não editar à mão sem necessidade)
│   └── <feature>/         # componentes de feature (client-list, sale-form…)
└── lib/                   # api-client tipado, utils, hooks
```

## Server-first

- **Server Components por padrão**; `"use client"` só quando há interatividade/estado/efeito — e no menor componente possível (empurrar para as folhas da árvore).
- Busca de dados **no servidor** (RSC chama a API via client tipado de `lib/`); nunca fetch em `useEffect` para dados de página.
- Mutações via **Server Actions** que chamam a API e usam `revalidatePath`/`revalidateTag`. O browser não fala com a API diretamente (token não vaza para o client).
- Landing page: estática (SSG) — nada de dependência de runtime para renderizar; metadata completa (`generateMetadata`), Open Graph, `next/image` para toda imagem.

## UI

- **shadcn/ui + Tailwind CSS** — componente novo só se shadcn não tiver equivalente; estilização utility-first, sem CSS module/styled-components.
- **Mobile-first obrigatório**: a consultora usa o CRM primariamente no celular. Toda tela nova deve funcionar bem em ~375px antes do desktop.
- Formulários: react-hook-form + resolver Zod, **reusando os schemas de `packages/shared`** — a validação do front e da API é o mesmo schema.
- Estados obrigatórios em toda tela de dados: loading (skeleton), vazio (com call-to-action), erro (com retry). Não entregar tela só com happy path.
- Acessibilidade mínima: label em todo input, botão com texto ou `aria-label`, contraste AA, navegável por teclado.
- Texto de UI em **pt-BR**; datas `dd/mm/aaaa`; moeda `R$` via `Intl.NumberFormat('pt-BR')` (valores chegam em centavos — dividir por 100 só na formatação).

## Performance

- Sem waterfalls: dados independentes buscados em paralelo (`Promise.all` no RSC).
- `next/dynamic` para componentes pesados fora da primeira dobra; nenhuma lib grande no bundle client sem justificativa.
