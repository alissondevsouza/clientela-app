# ADR-0001 — Documentação versionada como memória persistente do projeto

- **Status**: Aceito
- **Data**: 2026-07-16

## Contexto

O projeto será desenvolvido de forma incremental, provavelmente com sessões de trabalho espaçadas e com apoio de ferramentas de IA. Decisões tomadas numa sessão se perdem se ficarem só na conversa ou na memória de quem decidiu — e decisões perdidas são rediscutidas ou contrariadas depois.

## Decisão

Manter em `project-memory/`, dentro do próprio repositório, toda a documentação do projeto:

- Documentos numerados e **vivos** (visão geral, arquitetura, funcionalidades), atualizados quando a realidade mudar.
- Uma pasta `project-memory/decisions/` com **ADRs**: um arquivo por decisão, numerado, com contexto, alternativas e consequências. ADR aceito não se edita; se a decisão mudar, cria-se um novo ADR que substitui o anterior.

Toda sessão de desenvolvimento deve consultar a documentação antes de decidir e registrar o que decidir.

## Alternativas consideradas

- **Wiki externa (Notion, GitHub Wiki)** — separa a documentação do código; fácil de desatualizar e fica fora do controle de versão junto com o código que ela descreve.
- **Só comentários no código / mensagens de commit** — registram o *o quê*, mas espalham o *porquê*; impossível consultar como um todo.

## Consequências

- O repositório passa a ser a fonte única de verdade do projeto, incluindo o histórico de raciocínio.
- Custo contínuo de disciplina: decisões precisam ser registradas na hora, ou o sistema degrada.
- Ferramentas de IA e colaboradores futuros conseguem reconstituir o contexto lendo `project-memory/`.
