# Guia de deploy — VPS Hostinger + consultoralaisbarbosa.com.br

Passo a passo completo para colocar a landing page no ar: segurança mínima da VPS, DNS, estrutura de diretórios e o deploy em si. Escrito para a **VPS KVM 2 da Hostinger** (2 vCPU, 8 GB RAM) com **Ubuntu 24.04** e o domínio **consultoralaisbarbosa.com.br** (ADR-0009).

**O que já está pronto no repositório** (você não precisa criar nada disso):

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Orquestra caddy, web, api, postgres e o job de migração na VPS (usa imagens do GHCR) |
| `Caddyfile` | Proxy reverso + HTTPS automático (Let's Encrypt) |
| `apps/web/Dockerfile`, `apps/api/Dockerfile` | Build das imagens **no runner do GitHub Actions** (a VPS não builda mais — ADR-0011) |
| `.env.production.example` | Template do `.env` de produção (você preenche NA VPS) |
| `scripts/deploy.sh` | O processo de deploy: sincroniza SÓ a infra → login no GHCR → pull da imagem → migração → up → verificação — **executado pelo GitHub Actions** |
| `.github/workflows/ci.yml` + `deploy.yml` | CI (lint/typecheck/testes) e deploy automático (build+push no GHCR → pull na VPS) |

O fluxo é: **preparar DNS → preparar a VPS (uma vez) → criar o `.env` na VPS (uma vez) → publicar no GitHub, cadastrar os secrets e as Variables de build (uma vez) → `push` na main = deploy automático**. O modelo é **pull via GHCR** (ADR-0011): o GitHub Actions builda as imagens no runner, publica no GitHub Container Registry (`ghcr.io`) e a VPS só **puxa** a imagem pronta, migra e sobe — no servidor ficam apenas arquivos de infra (`docker-compose.yml`, `Caddyfile`, `.env` e o template). A VPS não recebe código-fonte nem gasta CPU buildando.

---

## 0. Pré-requisitos na SUA máquina

- O repositório clonado (você já tem) e `rsync` instalado (`rsync --version`; no Ubuntu: `sudo apt install rsync`).
- Uma **conta no GitHub** (o deploy automático roda no GitHub Actions — seção 5). Se ainda não tem, crie em [github.com](https://github.com); o repositório será **privado**.
- Uma chave SSH. Se ainda não tem (`ls ~/.ssh/*.pub` vazio), crie:

```bash
ssh-keygen -t ed25519 -C "alisson@clientela"
# Enter para o caminho padrão; defina uma passphrase (recomendado)
```

---

## 1. DNS primeiro (a propagação leva tempo — comece por aqui)

O Caddy só consegue emitir o certificado HTTPS quando o domínio **já aponta** para a VPS. Fazendo o DNS agora, ele propaga enquanto você configura o servidor.

1. No **hPanel da Hostinger**, anote o **IP da VPS** (VPS → sua instância → painel).
2. Ainda no hPanel: **Domínios → consultoralaisbarbosa.com.br → DNS / Zona DNS**. Crie/ajuste estes registros (remova registros A/AAAA/CNAME conflitantes que a Hostinger cria por padrão apontando para parking):

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` | IP da VPS | 3600 (ou o mínimo disponível) |
| A | `www` | IP da VPS | 3600 |

3. Verifique a propagação (da sua máquina, pode levar de minutos a algumas horas):

```bash
dig +short consultoralaisbarbosa.com.br
dig +short www.consultoralaisbarbosa.com.br
# Ambos devem responder o IP da VPS antes do primeiro deploy (seção 6)
```

---

## 2. Segurança mínima da VPS (uma única vez)

> A Hostinger entrega a VPS com acesso `root` por senha (ou chave, se você cadastrou no provisionamento). O objetivo desta seção: **ninguém entra por senha, root não loga, só as portas 22/80/443 existem para o mundo** (ADR-0003 + `security.md`).

### 2.1 Primeiro acesso e atualização do sistema

```bash
ssh root@IP_DA_VPS
apt update && apt upgrade -y
reboot   # se o upgrade trouxe kernel novo; espere ~1 min e reconecte
```

### 2.2 Usuário de deploy (não usamos root no dia a dia)

```bash
ssh root@IP_DA_VPS
adduser deploy            # defina uma senha forte (só para sudo; SSH será por chave)
usermod -aG sudo deploy
```

Instale sua chave pública no usuário novo. **Da sua máquina**:

```bash
ssh-copy-id deploy@IP_DA_VPS
# Teste — precisa entrar SEM pedir senha do SSH:
ssh deploy@IP_DA_VPS
```

### 2.3 Endurecer o SSH (desligar senha e root)

Na VPS, como `deploy`:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf > /dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
X11Forwarding no
EOF
sudo systemctl restart ssh
```

> ⚠️ **Antes de fechar esta sessão**, abra um SEGUNDO terminal e confirme que `ssh deploy@IP_DA_VPS` ainda entra (por chave). Se você se trancar para fora, a Hostinger tem console de emergência no hPanel — mas é melhor não precisar.

### 2.4 Firewall (UFW): só 22, 80 e 443

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH     # porta 22
sudo ufw allow 80/tcp      # HTTP (necessário para o desafio do Let's Encrypt e redirect)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable            # confirme com "y"
sudo ufw status verbose    # confira: deny incoming; allow 22,80,443
```

> O Postgres e a API **não** ganham regra nenhuma: eles nem publicam porta no host (compose de produção, ADR-0008). O firewall é uma segunda camada.

### 2.5 Fail2ban (bloqueia força bruta no SSH)

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd   # jail sshd ativo
```

### 2.6 Atualizações de segurança automáticas

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # responda "Yes"
```

### 2.7 Docker (repositório oficial) + permissão para o usuário deploy

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
# Saia e entre de novo para o grupo valer:
exit
ssh deploy@IP_DA_VPS
docker ps        # deve responder sem sudo (lista vazia)
```

> Nota honesta: estar no grupo `docker` equivale, na prática, a poder virar root na máquina. Aceitável aqui porque a VPS é single-purpose e o usuário é seu; é o trade-off padrão para deploy sem sudo.

---

## 3. Estrutura de diretórios no servidor

Só existe **um** diretório para criar manualmente — o resto quem preenche é o **pipeline do GitHub Actions** a cada deploy (o runner executa o `scripts/deploy.sh`, que sincroniza só os arquivos de infra e puxa as imagens do GHCR; você não roda nada da sua máquina), e os dados ficam em volumes nomeados gerenciados pelo Docker:

```bash
# na VPS, como deploy:
sudo mkdir -p /opt/clientela
sudo chown deploy:deploy /opt/clientela
```

Como fica o layout — **só infra** (modelo pull, ADR-0011): a VPS nunca recebe código-fonte.

```
/opt/clientela/                  ← DEPLOY_PATH (SÓ arquivos de infra)
├── .env                         ← VOCÊ cria (passo 4). Único arquivo com segredos. NUNCA sai da VPS
├── .image-tag                   ← o pipeline grava a tag (sha-<curto>) do último deploy. Usada no `up` manual/pós-reboot
├── .env.production.example      ← template (vem do repo, sem segredos)
├── docker-compose.yml           ← orquestração (vem do repo)
└── Caddyfile                    ← config do proxy (vem do repo)
```

> **Transição automática (só relevante se você já rodou o modelo antigo — ADR-0010):** o deploy anterior sincronizava o repositório inteiro via rsync (`apps/`, `packages/`, `scripts/`, `.git`…). No **primeiro deploy pelo novo pipeline**, o `scripts/deploy.sh` faz uma limpeza **one-shot e cirúrgica**: só age se detectar resíduo real do layout antigo (existe `apps/` ou `packages/`) e remove **apenas uma blacklist explícita** desses arquivos conhecidos do repo — qualquer arquivo seu (`backup-*.sql`, `.env`, `.image-tag`, dumps soltos) fica **intocado**. Ao terminar grava o marcador `.layout-v2` e nunca mais roda a limpeza. Você não precisa fazer nada — em VPS novas não há o que limpar.

Dados persistentes **não** ficam em pastas — são volumes nomeados do Docker (sobrevivem a `down`/`up` e a redeploys):

| Volume | Conteúdo |
|---|---|
| `clientela_pg_data` (nome conforme compose) | Dados do Postgres (`/var/lib/postgresql`) |
| `caddy_data` / `caddy_config` | Certificados TLS e estado do Caddy |

---

## 4. O `.env` de produção (uma única vez, NA VPS)

```bash
# na VPS:
cd /opt/clientela
# (no primeiro deploy o pipeline ainda não sincronizou o template; crie-o a partir
#  do repo local — da SUA máquina: scp .env.production.example deploy@IP_DA_VPS:/opt/clientela/ )
cp .env.production.example .env
chmod 600 .env
nano .env
```

Gere uma senha forte para o Postgres (na VPS): `openssl rand -base64 24`

Preencha assim (substitua `SENHA_GERADA` e o telefone real):

```bash
# GHCR — dono do pacote das imagens no GitHub, em MINÚSCULAS (owner lowercase)
GHCR_OWNER=seu_usuario_github

# Caddy — os DOIS endereços no mesmo bloco (raiz + www, ADR-0009); HTTPS automático p/ ambos
DOMAIN=consultoralaisbarbosa.com.br, www.consultoralaisbarbosa.com.br

# Postgres (interno; nunca exposto)
POSTGRES_PASSWORD=SENHA_GERADA
DATABASE_URL=postgres://clientela:SENHA_GERADA@postgres:5432/clientela

# Web
SITE_URL=https://consultoralaisbarbosa.com.br
API_URL=http://api:3001
WHATSAPP_PHONE=55DDDNUMERO          # com DDI 55! ex.: 5511912345678
# WHATSAPP_DEFAULT_MESSAGE=Olá! Vi seu site e quero saber mais sobre os produtos.
```

Atenção aos detalhes que mais causam erro:
- `GHCR_OWNER` em **minúsculas** (o GHCR só aceita owner lowercase) — é seu usuário/organização do GitHub; o compose monta `ghcr.io/${GHCR_OWNER}/clientela-{web,api,migrate}`. Sem ele o `up`/`pull` falha explícito.
- `POSTGRES_PASSWORD` e a senha dentro de `DATABASE_URL` devem ser **idênticas**.
- `WHATSAPP_PHONE` **começa com 55** (sem ele, o link wa.me quebra silenciosamente).
- `SITE_URL` é o domínio **raiz com https** (vira canonical/OG do site).
- `SITE_URL`, `WHATSAPP_PHONE` (runtime, lidos pela server action) precisam **bater com as Variables** de build do GitHub (seção 5.6) — a imagem do web é buildada no runner com as Variables; divergência = HTML estático com um valor e runtime com outro. Trocou uma Variable? Rode o deploy de novo (rebuild da imagem).

---

## 5. Publicar no GitHub e configurar o deploy automático (uma única vez)

A partir daqui o deploy roda no **GitHub Actions**: todo `push` na `main` executa o CI (lint + typecheck + testes) e, se tudo passar, publica na VPS automaticamente (o runner do GitHub roda o mesmo `scripts/deploy.sh`). Para isso o GitHub precisa de uma **chave SSH dedicada** e de 4 secrets.

### 5.1 Criar o repositório privado e enviar o código

1. No GitHub: **New repository** → nome `clientela-app` → **Private** → *Create* (não marque "Add README", o repo local já tem).
2. Conecte o repo local ao remoto e envie os commits. **O git de escrita é do humano** (ADR-0006) — as mensagens de commit sugeridas estão nos handoffs de cada entrega. Comandos (ajuste a URL para a do seu repo):

```bash
cd /home/alisson/workspace/current-projects/clientela-app
git remote add origin git@github.com:SEU_USUARIO/clientela-app.git
git push -u origin main
```

> ℹ️ **Este primeiro push vai disparar o workflow de Deploy e ele vai FALHAR no job `deploy`** — é esperado: os secrets (5.3–5.5) ainda não existem. Termine as subseções seguintes e então rode o deploy manualmente pelo botão **Run workflow** (seção 6), sem precisar de um novo commit.

> O `.gitignore` já ignora `.env` e afins — nenhum segredo vai para o GitHub. Confirme com `git status` antes do push.

### 5.2 Gerar a chave SSH dedicada de deploy

Uma chave **só para o deploy**, **sem passphrase** (o runner não tem como digitar senha) — separada da sua chave pessoal:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/clientela_deploy -N "" -C "github-actions-deploy"
# Gera o par: ~/.ssh/clientela_deploy (PRIVADA) e ~/.ssh/clientela_deploy.pub (PÚBLICA)
```

### 5.3 Instalar a chave pública no usuário `deploy` da VPS

```bash
ssh-copy-id -i ~/.ssh/clientela_deploy.pub deploy@IP_DA_VPS
# Alternativa manual (se ssh-copy-id não estiver disponível):
#   cat ~/.ssh/clientela_deploy.pub | ssh deploy@IP_DA_VPS 'cat >> ~/.ssh/authorized_keys'

# Teste — o runner vai usar exatamente esta chave privada:
ssh -i ~/.ssh/clientela_deploy deploy@IP_DA_VPS "echo ok"
```

### 5.4 Capturar a host key da VPS (para o `DEPLOY_KNOWN_HOSTS`)

Fixamos a chave de host da VPS no known_hosts do runner (em vez de desligar a verificação) — isso evita ataque man-in-the-middle. Gere o valor:

```bash
ssh-keyscan -t ed25519 IP_DA_VPS
# A saída (uma linha começando com o IP) é o conteúdo do secret DEPLOY_KNOWN_HOSTS.
```

> ⚠️ **Aviso 1 — TOFU (confie na primeira vez, mas confira)**: o `ssh-keyscan` aceita cegamente a chave que a VPS apresentar *agora*. Confira o fingerprint contra o valor real da VPS, rodado **no console de emergência da VPS pelo hPanel** (não por SSH, para não confiar no mesmo canal que você quer validar):
> ```bash
> # NO CONSOLE DA VPS (hPanel):
> ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
> ```
> Compare com o fingerprint do que o keyscan trouxe: `ssh-keyscan -t ed25519 IP_DA_VPS | ssh-keygen -lf -`. Os dois **têm que bater**.
>
> ⚠️ **Aviso 2 — mesmo host literal**: o host usado no `ssh-keyscan` (o IP) precisa ser **idêntico** ao que você vai colocar em `DEPLOY_HOST` (a parte depois do `@`). Se `DEPLOY_HOST=deploy@203.0.113.10`, faça `ssh-keyscan -t ed25519 203.0.113.10`. Usar hostname em um e IP no outro faz a verificação falhar com "Host key verification failed".

### 5.5 Cadastrar os 4 secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository secret**. Crie **exatamente** estes 4 (os nomes precisam bater com os workflows):

| Secret | Valor | Como obter |
|---|---|---|
| `DEPLOY_SSH_KEY` | Conteúdo da chave **privada** dedicada | `cat ~/.ssh/clientela_deploy` (copie tudo, incluindo as linhas `BEGIN/END`) |
| `DEPLOY_KNOWN_HOSTS` | Saída do keyscan (passo 5.4) | `ssh-keyscan -t ed25519 IP_DA_VPS` |
| `DEPLOY_HOST` | `deploy@IP_DA_VPS` (usuário@host) | o mesmo IP do passo 5.4 |
| `DEPLOY_PATH` | `/opt/clientela` | o diretório criado no passo 3 |

> Secrets do GitHub não podem ser lidos de volta depois de salvos — se errar, é só sobrescrever. Nunca cole a chave **privada** em nenhum outro lugar (chat, issue, log).

### 5.6 Cadastrar as Variables de build

O web é buildado **no runner** (ADR-0011) e a página é estática (SSG): `SITE_URL`, o WhatsApp e a mensagem entram no HTML no momento do build. Esses valores **não são segredo** — aparecem no HTML público de qualquer forma —, então vão em **Variables** (visíveis e editáveis), não em Secrets. No repositório: **Settings → Secrets and variables → Actions → aba _Variables_ → New repository variable**:

| Variable | Valor | Obrigatória? |
|---|---|---|
| `SITE_URL` | `https://consultoralaisbarbosa.com.br` (domínio raiz com https) | **Sim** (o job `build-push` falha cedo sem ela) |
| `WHATSAPP_PHONE` | `55DDDNUMERO` (com DDI 55, só dígitos) | **Sim** (idem) |
| `WHATSAPP_DEFAULT_MESSAGE` | mensagem inicial do WhatsApp | Não (o app aplica um default pt-BR se ausente) |

> **Por que Variables e não Secrets?** Segredo é dado que não pode vazar (senha, chave, token). Esses três aparecem no HTML servido a qualquer visitante — mascará-los como Secret só atrapalharia a edição sem ganho de segurança. `API_URL` não é Variable: é fixo no nome interno do compose (`http://api:3001`), embutido pelo próprio workflow.
>
> **Precisam BATER com o `.env` da VPS**: `SITE_URL`/`WHATSAPP_PHONE` existem nos dois lugares — as Variables alimentam o **build** (HTML estático) e o `.env` alimenta o **runtime** (server action de lead). Se divergirem, o site mostra um valor e o backend usa outro. Ao trocar uma, troque a outra e rode o deploy.

---

## 6. O deploy (automático)

Com os secrets no lugar e o DNS propagado (passo 1.3), publicar é só enviar código:

```bash
# git é do humano (ADR-0006) — use a mensagem de commit sugerida no handoff:
git push origin main
```

O que acontece (modelo pull via GHCR — ADR-0011): o **GitHub Actions** dispara o `deploy.yml` com **três jobs em sequência**:

1. **`ci`** — reusa o `ci.yml` (lint + typecheck + testes com Postgres real). Nada segue sem ele verde.
2. **`build-push`** — no runner: valida as Variables de build (5.6), builda as 3 imagens (`clientela-web`, `-api`, `-migrate`) e publica no **GHCR** com duas tags: `:sha-<curto>` (a usada no deploy) e `:latest` (informativa).
3. **`deploy`** — na VPS, via `scripts/deploy.sh`: sincroniza só a infra → login no GHCR → **pull** da tag `sha-<curto>` → migração → `up -d` → grava `.image-tag` → prune → curl.

**Re-deploy manual** (sem mudar código — ex.: reprocessar após corrigir um secret/Variable): aba **Actions** → workflow **Deploy** → botão **Run workflow** → branch `main` → *Run workflow*.

**Rollback** (voltar a uma versão anterior): não há passo destrutivo — cada commit tem sua imagem `sha-<curto>` no GHCR. O botão **Run workflow** só aceita **branch/tag** (não um commit arbitrário), então o caminho real é: aba **Actions** → workflow **Deploy** → abra o **run do commit desejado** (o da versão para a qual quer voltar) → botão **Re-run all jobs**. O pipeline reprocessa aquele commit (rebuild/pull da imagem correspondente) e sobe. Alternativa: reverter o commit problemático (`git revert`, git é do humano — ADR-0006) e publicar na `main` normalmente. (Rollback por UI dedicada é melhoria futura — fora de escopo.)

**Acompanhar os logs**: aba **Actions** → clique no run em andamento → veja os jobs `ci`, `build-push` e `deploy` passo a passo.

O que o job `deploy` executa na VPS (o `scripts/deploy.sh`, falhando cedo com mensagem clara se algo estiver errado):

1. **rsync SÓ da infra** (`docker-compose.yml`, `Caddyfile`, `.env.production.example`) para `/opt/clientela` — sem `--delete`; o `.env` e o `.image-tag` da VPS nunca são tocados.
2. Confere que `/opt/clientela/.env` existe e faz a **transição idempotente** (remove código-fonte de deploys antigos, se houver).
3. **Login no GHCR** com o token efêmero do run (via stdin; logout garantido no fim).
4. **Pull** das 3 imagens na tag `sha-<curto>` exata (`docker compose --profile tools pull`) — nada é buildado na VPS.
5. **Migração do banco** (`docker compose run --rm migrate`, sem `--build`) — cria/atualiza a tabela `leads`; idempotente.
6. **Sobe tudo** (`docker compose up -d`), grava a tag em `.image-tag` e remove imagens antigas (`prune -af`).
7. **Verificação**: curl no domínio.

> **PRIMEIRO RUN**: fique de olho na aba **Actions** no primeiro push. Se o job `deploy` falhar logo no SSH, quase sempre é secret errado; se o pull vier `denied`, é permissão/pacote (veja "Problemas comuns"). Erros de build agora aparecem no job **`build-push`**, não mais na VPS.

No primeiro `up`, o Caddy pede os certificados ao Let's Encrypt para os dois endereços — leva segundos **se o DNS já propagou**. Acompanhe com:

```bash
ssh deploy@IP_DA_VPS "cd /opt/clientela && docker compose logs -f caddy"
# procure por "certificate obtained successfully"
```

### Fallback manual (sem GitHub Actions)

No modelo pull, o `scripts/deploy.sh` só **puxa** imagens já publicadas no GHCR — ele não builda. Para rodá-lo da sua máquina, gere um **PAT** (Personal Access Token) com escopo **`read:packages`** e passe a `IMAGE_TAG` de uma imagem que já existe no GHCR:

```bash
cd /home/alisson/workspace/current-projects/clientela-app
export GHCR_TOKEN=ghp_seu_pat_read_packages
export IMAGE_TAG=sha-1a2b3c4   # uma tag já publicada (veja em GitHub → repo → Packages)
DEPLOY_HOST=deploy@IP_DA_VPS DEPLOY_PATH=/opt/clientela ./scripts/deploy.sh --dry-run  # ensaio
DEPLOY_HOST=deploy@IP_DA_VPS DEPLOY_PATH=/opt/clientela ./scripts/deploy.sh            # real
```

> **Limite honesto (ADR-0011):** se o **GitHub estiver fora do ar**, não há build nem pull — sem imagem publicada, não há o que puxar. Nesse cenário resta apenas o que já roda na VPS (os containers voltam sozinhos por restart policy após reboot). Publicar uma imagem NOVA manualmente exigiria buildar localmente e um `docker login` com um PAT `write:packages` — fora do escopo deste script. O caminho normal é sempre o **Run workflow** no GitHub.

---

## 7. Verificação pós-deploy (checklist)

```bash
# Tudo de pé e saudável?
ssh deploy@IP_DA_VPS "cd /opt/clientela && docker compose ps"
# → caddy/web/api/postgres "Up (healthy)"; portas publicadas SÓ no caddy (80/443)

# Site no ar com HTTPS (e www funcionando):
curl -I https://consultoralaisbarbosa.com.br          # HTTP/2 200
curl -I https://www.consultoralaisbarbosa.com.br      # HTTP/2 200
curl -I http://consultoralaisbarbosa.com.br           # 308 → https (redirect automático)

# Nada além de 22/80/443 exposto:
ssh deploy@IP_DA_VPS "sudo ss -tlnp | grep -v 127.0.0.1"
```

**Teste funcional real** (o mais importante): abra o site no celular, confira as seções e o botão de WhatsApp (deve abrir conversa com o número certo), e **envie um lead de teste** pelo formulário. Depois confirme no banco:

```bash
ssh deploy@IP_DA_VPS "cd /opt/clientela && docker compose exec postgres \
  psql -U clientela -d clientela -c 'SELECT id, name, whatsapp, status, consent_at FROM leads ORDER BY created_at DESC LIMIT 5;'"
```

---

## 8. Operação do dia a dia

| Preciso de… | Comando |
|---|---|
| Publicar mudanças | `git push origin main` (deploy automático) ou, na aba **Actions**, botão **Run workflow** do workflow **Deploy** |
| Publicar sem GitHub (fallback) | seção 6 "Fallback manual" — exige PAT `read:packages` e `IMAGE_TAG` de imagem já publicada |
| Subir/reiniciar tudo manualmente na VPS | `cd /opt/clientela && IMAGE_TAG=$(cat .image-tag) docker compose up -d` (usa a última tag puxada; sem isso o compose cairia em `latest`, que o deploy nunca publica de forma confiável) |
| Ver logs | `docker compose logs -f web` (ou `api`, `caddy`, `postgres`) na VPS |
| Reiniciar um serviço | `docker compose restart web` |
| Ver leads capturados | o `psql` da seção 7 (até o CRM da Fase 2 existir) |
| Backup manual do banco | `mkdir -p ~/backups && docker compose exec -T postgres pg_dump -U clientela clientela > ~/backups/backup-$(date +%F).sql` e **copie para fora da VPS** (`scp`). Grave em `~/backups/` (**fora de `/opt/clientela`**): o deploy nunca entra nesse diretório, mantendo os dumps totalmente isolados do pipeline de infra |

> Após **reboot** da VPS os containers voltam sozinhos (restart policy `unless-stopped`) — sem `pull` (as imagens já estão locais). Só use o `up` manual acima se precisar recriar um container (ex.: depois de um `down`); ele lê a tag correta de `.image-tag`.

> ⚠️ **Backup**: o backup automático externo é o **LP-13** e ainda não existe. Até lá, backup que fica só na VPS não é backup — rode o `pg_dump` acima e traga o arquivo para sua máquina sempre que houver leads novos importantes.

---

## 9. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Job de deploy falha em `Permission denied` / `Host key verification failed` no step SSH | Um dos 4 secrets está errado | Confira os 4 (seção 5.5): `DEPLOY_SSH_KEY` é a chave **privada** dedicada; `DEPLOY_KNOWN_HOSTS` foi capturada do **mesmo IP** de `DEPLOY_HOST`; a pública está no `authorized_keys` do `deploy` (passo 5.3) |
| Site não abre / certificado não emite; logs do caddy com erros ACME | DNS ainda não propagou, ou porta 80 bloqueada | Confira `dig +short` (passo 1.3) e `sudo ufw status`; o Caddy fica em retry sozinho — resolvido o DNS, emite em minutos |
| `error: required variable POSTGRES_PASSWORD…` no deploy | `.env` da VPS ausente/incompleto | Revise o passo 4 (o script aponta o caminho exato) |
| `error: required variable GHCR_OWNER…` / `docker login` falha na VPS | `GHCR_OWNER` ausente no `.env` da VPS | Adicione `GHCR_OWNER=seu_usuario` (minúsculas) ao `.env` (passo 4 / seção 3) |
| Pull na VPS vem `denied` / `manifest unknown` | Permissão do token ou pacote ainda não vinculado ao repo | (1) O job `deploy` precisa de `permissions: packages: read` (já no `deploy.yml`); (2) o pacote GHCR nasce **privado, ligado ao repo** na 1ª publicação do `build-push` — confira em **GitHub → repo → Packages** se `clientela-web/-api/-migrate` existem e estão vinculados; (3) fallback manual exige PAT `read:packages` (seção 6) |
| Job `build-push` falha em "Variables de build ausentes" | `SITE_URL`/`WHATSAPP_PHONE` não cadastradas | Cadastre em **Settings → Secrets and variables → Actions → Variables** (seção 5.6) |
| Formulário retorna "Não foi possível enviar agora…" | API fora do ar ou `DATABASE_URL` errada | `docker compose ps` (api healthy?) e `docker compose logs api` |
| Troquei o WhatsApp/domínio e o site não mudou | São envs de **build** (página estática) buildadas no runner | Atualize a **Variable** (seção 5.6) *e* o `.env` da VPS, então rode o deploy de novo |
| Fiquei trancado fora do SSH | Endureceu o SSH sem testar a chave | Console de emergência no hPanel da Hostinger → reverta `/etc/ssh/sshd_config.d/99-hardening.conf` |

---

*Documento do LP-12, atualizado no INF-05 (roadmap). Decisões relacionadas: ADR-0003 (VPS+Caddy), ADR-0008 (compose de produção; API interna), ADR-0009 (domínio), ADR-0010 (CI + deploy via GitHub Actions), ADR-0011 (deploy por imagens via GHCR — modelo pull). Primeiro deploy: me chame para assistir — em caso de qualquer saída estranha nos passos 6–7 (ou no primeiro run do Actions), cole o erro na conversa.*
