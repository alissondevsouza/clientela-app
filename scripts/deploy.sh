#!/usr/bin/env bash
#
# Deploy de produção para a VPS (INF-05, ADR-0011) — modelo PULL via GHCR.
# O runner do GitHub Actions executa este script: sincroniza SÓ os arquivos de
# infra para a VPS e, remotamente:
#   login no GHCR → pull das imagens (tag EXATA) → migração → up -d →
#   grava .image-tag → image prune -af → verificação por curl.
# A VPS NÃO recebe código-fonte e NÃO builda — as imagens vêm prontas do GHCR
# (ghcr.io/${GHCR_OWNER}/clientela-{web,api,migrate}). Idempotente.
#
# Entradas (env; --host/--path têm precedência para HOST/PATH):
#   DEPLOY_HOST  usuario@ip da VPS (SSH já configurado pelo runner).
#   DEPLOY_PATH  diretório de infra na VPS (ex.: /opt/clientela).
#   IMAGE_TAG    tag das imagens a puxar (ex.: sha-1a2b3c4). OBRIGATÓRIA no
#                deploy real (o modelo pull nunca usa :latest — ADR-0011);
#                --dry-run não a exige.
#   GHCR_TOKEN   token com read:packages para o pull das imagens privadas
#                (login via stdin; NUNCA ecoado; logout garantido no fim).
#
# O owner do GHCR (GHCR_OWNER) vive no .env da VPS — o compose o resolve e o
# login o usa como usuário. O script só precisa do token e da tag.
#
# Uso:
#   DEPLOY_HOST=usuario@ip DEPLOY_PATH=/opt/clientela IMAGE_TAG=sha-abc GHCR_TOKEN=… ./scripts/deploy.sh
#   ./scripts/deploy.sh --host usuario@ip --path /opt/clientela
#   ./scripts/deploy.sh --dry-run          # imprime o plano; nada remoto é executado
#
# Fallback manual (GitHub fora do ar): este script só PUXA imagens já publicadas
# — precisa de GHCR_TOKEN com read:packages e da IMAGE_TAG desejada. Buildar/
# publicar imagem nova exige login próprio no GHCR com um PAT com write:packages
# (fora do escopo deste script); sem imagem publicada não há o que puxar — nesse
# caso, use "Run workflow" na aba Actions do GitHub.
#
# Pré-requisito na VPS: existir DEPLOY_PATH/.env preenchido (a partir de
# .env.production.example, INCLUINDO GHCR_OWNER). O script FALHA CEDO se ausente.
set -euo pipefail

# --- Parâmetros (env ou flags; flags têm precedência) ---
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-}"
IMAGE_TAG="${IMAGE_TAG:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
DRY_RUN=false

# Registro do GHCR (host fixo — imagens ghcr.io/<owner>/clientela-*).
readonly GHCR_HOST="ghcr.io"

# Arquivos de infra sincronizados (SÓ estes — a VPS não recebe código-fonte).
readonly INFRA_FILES=(docker-compose.yml Caddyfile .env.production.example)

# Marcador one-shot da transição: uma vez presente, a limpeza nunca mais roda.
readonly LAYOUT_MARKER=".layout-v2"

# BLACKLIST explícita dos resíduos conhecidos do modelo rsync antigo (código-fonte
# do repo que a VPS recebia por engano). A limpeza remove SOMENTE estes nomes, e
# só quando existem — NUNCA um glob genérico. Qualquer arquivo do operador
# (backup-*.sql, .env, .image-tag, dumps soltos…) fica intocado por não estar aqui.
readonly OLD_LAYOUT_RESIDUE=(
	apps packages scripts specs project-memory docs .claude .github .git node_modules
	package.json bun.lock tsconfig.base.json biome.json vitest.config.ts
	README.md CLAUDE.md .gitignore .dockerignore .env.example
)

while [ $# -gt 0 ]; do
	case "$1" in
		--host)
			DEPLOY_HOST="${2:-}"
			shift 2
			;;
		--path)
			DEPLOY_PATH="${2:-}"
			shift 2
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		-h|--help)
			# tail -n +2: pula o shebang (linha 1) p/ não imprimir "!/usr/bin/env bash".
			tail -n +2 "$0" | grep '^#' | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "erro: argumento desconhecido: $1" >&2
			exit 2
			;;
	esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

# Diretório raiz do repositório (o script vive em scripts/).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Recusa DEPLOY_PATH perigoso ANTES de qualquer rm (guarda de sanidade).
# `/*/?*` exige caminho absoluto com ao menos um subdiretório (ex.: /opt/clientela):
# rejeita vazio, "/", raiz sem subdiretório e caminho relativo.
assert_safe_deploy_path() {
	case "$DEPLOY_PATH" in
		/*/?*) : ;;
		*) fail "DEPLOY_PATH inseguro: '${DEPLOY_PATH}'. Exija caminho absoluto com subdiretório (ex.: /opt/clientela) — recusado por segurança antes da limpeza de transição." ;;
	esac
}

# Executa a transição do layout antigo na VPS: one-shot, cirúrgica e guardada.
#   - pula se o marcador ${LAYOUT_MARKER} já existe (idempotente / one-shot);
#   - recusa destino sem docker-compose.yml (garantia extra além de assert_safe_deploy_path);
#   - só remove se detectar resíduo REAL (existe apps/ ou packages/);
#   - remove SOMENTE a blacklist explícita e apenas os nomes que existem — nunca glob;
#   - grava o marcador ao final para que a limpeza jamais volte a rodar.
# A blacklist é fixa e segura (sem espaço/metachar) — interpolada no script remoto;
# `\$e`/`\$(date)` ficam escapados para executar NA VPS, não localmente.
run_transition() {
	local residue_str="${OLD_LAYOUT_RESIDUE[*]}"
	ssh "$DEPLOY_HOST" "$(cat <<REMOTE
set -eu
cd '${DEPLOY_PATH}'
if [ -f '${LAYOUT_MARKER}' ]; then
	echo 'Transição já aplicada (${LAYOUT_MARKER} presente) — pulando limpeza.'
	exit 0
fi
if [ ! -f docker-compose.yml ]; then
	echo 'ERRO: docker-compose.yml ausente no destino — abortando transição por segurança.' >&2
	exit 1
fi
if [ -d apps ] || [ -d packages ]; then
	for e in ${residue_str}; do
		if [ -e "\$e" ]; then
			echo "  removendo resíduo do layout antigo: \$e"
			rm -rf -- "\$e"
		fi
	done
	echo 'Resíduo do layout antigo (modelo rsync) removido; arquivos do operador preservados.'
else
	echo 'Nenhum resíduo do layout antigo detectado — nada a remover.'
fi
printf 'layout v2 (pull/GHCR, INF-05 / ADR-0011) aplicado em %s\n' "\$(date -u +%FT%TZ)" > '${LAYOUT_MARKER}'
REMOTE
)"
}

# --- Modo dry-run: imprime o plano e sai (não exige HOST/PATH/token) ---
if [ "$DRY_RUN" = true ]; then
	IMAGE_TAG_DISPLAY="${IMAGE_TAG:-<obrigatória no deploy real>}"
	log "DRY-RUN — plano de deploy PULL/GHCR (nada será executado):"
	echo "  1/10 rsync SÓ da infra → \${DEPLOY_HOST}:\${DEPLOY_PATH}  (sem --delete)"
	echo "       arquivos: ${INFRA_FILES[*]}"
	echo "  2/10 ssh remoto: verificar \${DEPLOY_PATH}/.env (falha cedo se ausente)"
	echo "  3/10 ssh remoto: transição one-shot — só se houver resíduo REAL (apps/ ou"
	echo "       packages/); remove SOMENTE a blacklist conhecida do modelo rsync,"
	echo "       preserva .env/.image-tag/backups do operador; grava ${LAYOUT_MARKER} e"
	echo "       pula se já presente. Blacklist: ${OLD_LAYOUT_RESIDUE[*]}"
	echo "  4/10 ssh remoto: docker login ${GHCR_HOST} (usuário=GHCR_OWNER do .env; token via stdin)"
	echo "  5/10 ssh remoto: IMAGE_TAG=${IMAGE_TAG_DISPLAY} docker compose --profile tools pull"
	echo "  6/10 ssh remoto: IMAGE_TAG=${IMAGE_TAG_DISPLAY} docker compose run --rm migrate  (sem --build)"
	echo "  7/10 ssh remoto: IMAGE_TAG=${IMAGE_TAG_DISPLAY} docker compose up -d"
	echo "  8/10 ssh remoto: gravar IMAGE_TAG em \${DEPLOY_PATH}/.image-tag"
	echo "  9/10 ssh remoto: docker image prune -af  (remove tags sha antigas)"
	echo " 10/10 ssh remoto: curl do DOMAIN (1º endereço)"
	echo "  +    sempre: docker logout ${GHCR_HOST}  (trap de saída, não numerado)"
	echo ""
	echo "  DEPLOY_HOST=${DEPLOY_HOST:-<não definido>}"
	echo "  DEPLOY_PATH=${DEPLOY_PATH:-<não definido>}"
	echo "  IMAGE_TAG=${IMAGE_TAG_DISPLAY}"
	echo "  GHCR_TOKEN=$([ -n "$GHCR_TOKEN" ] && echo '<definido>' || echo '<não definido>')"
	exit 0
fi

# --- Validação de parâmetros para execução real ---
[ -n "$DEPLOY_HOST" ] || fail "DEPLOY_HOST não definido (use env DEPLOY_HOST ou --host usuario@ip)."
[ -n "$DEPLOY_PATH" ] || fail "DEPLOY_PATH não definido (use env DEPLOY_PATH ou --path /opt/clientela)."
[ -n "$GHCR_TOKEN" ] || fail "GHCR_TOKEN não definido — necessário para o pull das imagens privadas (read:packages)."
[ -n "$IMAGE_TAG" ] || fail "IMAGE_TAG não definido — o deploy real exige a tag EXATA das imagens (ex.: sha-1a2b3c4); o modelo pull nunca usa :latest (ADR-0011). Use env IMAGE_TAG=sha-<curto>."
assert_safe_deploy_path

log "1/10 Sincronizando SÓ a infra → ${DEPLOY_HOST}:${DEPLOY_PATH} (sem --delete)"
# Apenas os arquivos de infra são enviados — a VPS não recebe código-fonte.
# Sem --delete: preserva o .env e o .image-tag remote-only.
INFRA_PATHS=()
for f in "${INFRA_FILES[@]}"; do
	INFRA_PATHS+=("${REPO_ROOT}/${f}")
done
rsync -az "${INFRA_PATHS[@]}" "${DEPLOY_HOST}:${DEPLOY_PATH}/"

log "2/10 Verificando .env remoto"
ssh "$DEPLOY_HOST" "test -f '${DEPLOY_PATH}/.env'" \
	|| fail "${DEPLOY_PATH}/.env não existe na VPS. Crie-o a partir de ${DEPLOY_PATH}/.env.production.example (sincronizado neste deploy) e preencha os valores (inclusive GHCR_OWNER) antes de rodar novamente."

log "3/10 Transição do layout antigo (one-shot, cirúrgica: só resíduo conhecido do modelo rsync)"
# One-shot via marcador ${LAYOUT_MARKER}; só age com resíduo REAL (apps/ ou packages/);
# remove SOMENTE a blacklist explícita — backups do operador (backup-*.sql), .env e
# .image-tag ficam intocados por não estarem na lista.
run_transition

# Owner do GHCR (usuário do login) vem do .env remoto.
GHCR_OWNER_REMOTE="$(ssh "$DEPLOY_HOST" "grep -E '^GHCR_OWNER=' '${DEPLOY_PATH}/.env' | head -n1 | cut -d= -f2- | tr -d '\"' | xargs")"
[ -n "$GHCR_OWNER_REMOTE" ] || fail "GHCR_OWNER ausente no ${DEPLOY_PATH}/.env — adicione-o (ver .env.production.example)."

# Logout garantido em QUALQUER saída (sucesso, erro ou sinal): o token é efêmero
# e nada de credencial deve ficar residente no ~/.docker/config.json da VPS.
remote_logout() { ssh "$DEPLOY_HOST" "docker logout '${GHCR_HOST}'" >/dev/null 2>&1 || true; }
trap remote_logout EXIT

log "4/10 Login no ${GHCR_HOST} (usuário ${GHCR_OWNER_REMOTE}; token via stdin, sem echo)"
printf '%s' "$GHCR_TOKEN" | ssh "$DEPLOY_HOST" "docker login '${GHCR_HOST}' -u '${GHCR_OWNER_REMOTE}' --password-stdin"

log "5/10 Pull das imagens na tag ${IMAGE_TAG} (--profile tools inclui a migrate)"
# --profile tools OBRIGATÓRIO: sem a flag o serviço migrate (profile tools) fica
# FORA do pull e a migração rodaria de imagem stale (mesma classe do defeito do LP-11).
ssh "$DEPLOY_HOST" "cd '${DEPLOY_PATH}' && IMAGE_TAG='${IMAGE_TAG}' docker compose --profile tools pull"

log "6/10 Migração do banco (job efêmero; sem --build — imagem já veio do pull)"
ssh "$DEPLOY_HOST" "cd '${DEPLOY_PATH}' && IMAGE_TAG='${IMAGE_TAG}' docker compose run --rm migrate"

log "7/10 Subindo os serviços"
ssh "$DEPLOY_HOST" "cd '${DEPLOY_PATH}' && IMAGE_TAG='${IMAGE_TAG}' docker compose up -d"

log "8/10 Persistindo a tag em ${DEPLOY_PATH}/.image-tag (operação manual / pós-reboot)"
printf '%s' "$IMAGE_TAG" | ssh "$DEPLOY_HOST" "cat > '${DEPLOY_PATH}/.image-tag'"

log "9/10 Removendo imagens órfãs (prune -af — remove tags sha antigas)"
# -a: sem isso o prune não remove as tags sha-<curto> anteriores (não são
# "dangling"), e o disco do KVM 2 cresceria sem teto a cada deploy.
ssh "$DEPLOY_HOST" "docker image prune -af"

log "10/10 Verificação (curl no domínio)"
# DOMAIN pode ser lista de endereços ("raiz, www" — ADR-0009): o curl usa só o primeiro.
DOMAIN_VALUE="$(ssh "$DEPLOY_HOST" "cd '${DEPLOY_PATH}' && grep -E '^DOMAIN=' .env | head -n1 | cut -d= -f2- | cut -d, -f1 | xargs")"
if [ -n "$DOMAIN_VALUE" ]; then
	ssh "$DEPLOY_HOST" "curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' '${DOMAIN_VALUE}'" \
		|| warn "curl de verificação falhou — confira os logs (docker compose logs) na VPS."
else
	warn "DOMAIN não encontrado no .env remoto — pulei a verificação por curl."
fi

log "Deploy concluído."
