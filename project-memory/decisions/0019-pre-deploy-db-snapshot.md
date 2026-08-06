# ADR-0019 — Snapshot do banco antes da migração, fail-closed, no pipeline de deploy

- **Status**: Aceito
- **Data**: 2026-08-06

## Contexto

Desde o LP-12 existe banco de produção com dados reais da consultora (clientes, vendas, recebíveis). O backup externo (LP-13) ainda não existe, e o momento de maior risco para esse dado é a **migração de schema** durante o deploy: um `ALTER`/`DROP` mal avaliado é irreversível e acontece antes de qualquer chance de intervenção humana, porque o deploy é automático no push da `main` (ADR-0010/0011).

A migração da agenda (REL-06) é puramente aditiva e segura, mas o padrão não se sustenta sozinho: a próxima pode não ser. O `docs/deploy-vps.md` já orientava um `pg_dump` **manual** antes de mexer no banco — instrução que depende de alguém lembrar, no dia errado.

## Decisão

O `scripts/deploy.sh` passa a executar, **entre o pull das imagens e o job de migração**, um snapshot do banco na própria VPS:

1. **Fail-closed**: se o snapshot falhar, o deploy **aborta antes de tocar o schema**. Snapshot opcional é decoração — no dia em que for preciso, não existiria.
2. **Retenção de 5, podada ANTES de gravar**: disco cheio no meio do dump deixaria um arquivo truncado com cara de backup válido. O KVM 2 tem disco limitado e isto é ponto de restauração de deploy, não arquivo histórico.
3. **Destino `~/backups` na VPS**, fora do `DEPLOY_PATH` — a limpeza one-shot de transição só age dentro do `DEPLOY_PATH` e nunca alcança os dumps. Nome `predeploy-<image_tag>-<UTC>.sql.gz`, correlacionando cada restauração ao deploy que a motivou.
4. **Credenciais lidas de dentro do container** (`POSTGRES_USER`/`POSTGRES_DB` que o compose injeta), não do `.env` remoto: não há parsing nem risco de divergir da configuração real.
5. **VPS sem container `postgres`** (instalação nova) ⇒ passo **pulado sem falhar** — não há dado a preservar.
6. Guarda de integridade: arquivo vazio é tratado como erro e removido, em vez de ficar no diretório parecendo um backup.

## Alternativas consideradas

- **Publicar o dump como artifact do GitHub Actions**: rejeitada. O dump contém nome e WhatsApp de clientes; exportá-lo para um serviço cuja retenção e controle de acesso não administramos é tratamento de dado pessoal sem necessidade (`security.md`, LGPD). O destino externo é decisão do LP-13, com criptografia em trânsito.
- **Snapshot só quando há migração nova**: rejeitada por ora. Exigiria inspecionar o journal do Drizzle antes de migrar, e o ganho (poupar segundos com um banco pequeno) não paga a complexidade nem o risco de errar a detecção.
- **Depender do `pg_dump` manual documentado**: é o estado anterior. Depende de disciplina humana exatamente no momento de pressa.
- **Snapshot de volume (`docker commit`/cópia de diretório)**: rejeitada — cópia de diretório de dados com o Postgres em execução não é consistente sem parar o serviço; `pg_dump` usa MVCC e dá snapshot consistente sem downtime.

## Consequências

- Todo deploy passa a ter um ponto de restauração imediatamente anterior à migração, correlacionado à `IMAGE_TAG`.
- O deploy fica alguns segundos mais lento e cresce com o tamanho do banco. Irrelevante hoje; se um dia doer, o caminho é `--format=custom` e/ou snapshot condicional.
- Disco cheio passa a **bloquear deploy** — consequência deliberada do fail-closed. A poda anterior à gravação e a retenção de 5 mitigam.
- **Isto não é backup**: o arquivo mora na mesma VPS e no mesmo domínio de falha do banco. Não substitui o **LP-13** (cópia externa diária), que continua sendo o item de maior risco em aberto — ver `known-issues.md`.
- O procedimento de restauração foi exercitado (dump → banco limpo → 11 tabelas e dados conferidos) e está documentado em `docs/deploy-vps.md`.
