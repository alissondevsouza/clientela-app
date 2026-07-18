# Documentação — Clientela App

Esta pasta é a **memória persistente do projeto**. Toda documentação de desenvolvimento e todas as decisões tomadas ficam registradas aqui. Antes de tomar uma decisão técnica ou de produto, consulte esta pasta; depois de tomar, registre-a.

## Índice

| Documento | Conteúdo |
|---|---|
| [01-overview.md](./01-overview.md) | O que é o projeto, para quem, objetivos e contexto do negócio |
| [02-architecture.md](./02-architecture.md) | Stack, componentes do sistema, infraestrutura e como tudo se conecta |
| [03-features.md](./03-features.md) | Escopo detalhado das funcionalidades, divididas em fases |
| [04-domain-model.md](./04-domain-model.md) | Entidades, invariantes e relações do domínio (rascunho vivo) |
| [decisions/](./decisions/README.md) | ADRs — registro de cada decisão importante, com contexto e justificativa |
| [known-issues.md](./known-issues.md) | Dívidas técnicas deliberadas e drifts conhecidos |
| [../specs/ROADMAP.md](../specs/ROADMAP.md) | Roadmap executável — fonte de trabalho dos agentes (itens + status) |
| [lessons.md](./lessons.md) | Gotchas e aprendizados duráveis (consultar antes de investigar bugs) |

## Regras de uso

1. **Toda decisão relevante vira um ADR** em `decisions/` (escolha de biblioteca, mudança de escopo, padrão adotado, etc.). Decisões não registradas se perdem.
2. **Documentos numerados (01, 02, 03...) são vivos**: quando a realidade mudar, atualize o documento e registre o motivo da mudança em um ADR.
3. **Escreva para o "eu do futuro"**: daqui a 6 meses ninguém vai lembrar o contexto. Registre o *porquê*, não só o *o quê*.
