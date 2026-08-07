# ADR-0020 — Consentimento de lead criado pelo CRM (`source = "crm_manual"`)

- **Status**: Aceito
- **Data**: 2026-08-06

## Contexto

O cadastro rápido no formulário da agenda (RF-23) permite que a consultora crie a pessoa sem sair da tela, escolhendo entre **cliente** e **lead**. Criar cliente é trivial (a tabela `clients` não guarda consentimento — são pessoas com quem já existe relacionamento). Criar **lead** não é: `leads.consent_at` é `NOT NULL`, e esse campo nasceu para registrar o instante em que a pessoa marcou o checkbox de consentimento LGPD no formulário público da landing (LP-06).

Quando a consultora digita nome e WhatsApp de alguém durante uma conversa, não existe checkbox. Precisávamos decidir o que gravar em `consent_at` sem mentir sobre a origem do dado nem quebrar a coluna obrigatória (tornar `consent_at` nulável exigiria migração destrutiva numa tabela **com dados de produção** — ver `known-issues.md`).

## Decisão

Lead criado pelo CRM grava `consent_at = agora` e **`source = "crm_manual"`**, distinguindo-o do `source` default da captura pública.

O fundamento do consentimento é **declarado pela consultora**: a pessoa forneceu o contato diretamente, na conversa, com a finalidade explícita de marcar um atendimento. Isso é diferente — e a distinção precisa continuar auditável — do consentimento coletado por checkbox na landing.

A rota pública `POST /leads` permanece **inalterada** (honeypot, rate limit por IP, `source` default). A criação pelo CRM é uma **rota autenticada separada**: reusar a pública a partir do CRM misturaria dois modelos de confiança e aplicaria a leads internos defesas desenhadas para tráfego anônimo.

## Alternativas consideradas

- **Tornar `consent_at` nulável para leads internos**: rejeitada. Exigiria migração afrouxando constraint em tabela com dados reais em produção, e a ausência de valor não diz *por que* não há consentimento — perde-se informação em vez de ganhar.
- **Permitir cadastro rápido só como cliente**: rejeitada pelo humano. Inflaria a base de clientes com quem talvez nunca compre; a distinção lead/cliente é útil para o funil, e a conversão a partir do compromisso (RF-25) cobre o caso da venda acontecer.
- **Reusar a rota pública de captura**: rejeitada — rate limit por IP puniria a consultora (todas as requisições vêm do mesmo servidor) e o honeypot é defesa contra bot, sem sentido atrás de autenticação.
- **Campo próprio de "base legal" na tabela**: adiada. Com duas origens apenas, `source` já discrimina; um campo dedicado só se justifica quando houver terceira origem ou exigência formal.

## Consequências

- Todo lead do sistema continua tendo consentimento datado — a invariante da coluna sobrevive.
- É possível segmentar e auditar por origem: `source = "crm_manual"` versus a captura da landing. Qualquer relatório de LGPD futuro consegue separar os dois fundamentos.
- A afirmação de consentimento passa a depender da consultora ter de fato coletado o dado da própria pessoa. É uma responsabilidade dela, e está documentada aqui em vez de implícita no código.
- Se um dia a exclusão a pedido do titular for automatizada, os dois tipos de lead se comportam igual (o dado pessoal já é apagável e não tem snapshot em outras tabelas — ADR-0016).
