# ADR-0028 — Proxy único da VPS compartilhada; o Caddy sai do compose da Clientela

- **Status**: Aceito
- **Data**: 2026-10-29
- **Substitui**: o serviço `caddy` do ADR-0008 (compose de produção com Caddy) e o "split por host no Caddy" do ADR-0017, que passam a viver no proxy da VPS

## Contexto

A VPS (Hostinger KVM 2) passou a hospedar uma segunda aplicação do mesmo dono, o Gizito, que também precisa das portas 80 e 443. Só um processo escuta numa porta, e o Caddy da Clientela as ocupava. A base da máquina (VPN, Portainer, Infisical, scripts) já mora no repositório `infra-vps`, clonado em `/srv/plataforma`, com uma pasta por aplicação em `/srv/apps/<app>`.

## Decisão

1. **O proxy é da VPS.** O Caddy sai deste repositório e vira a pasta `proxy/` do `infra-vps`, no projeto Compose `plataforma`. É o único container com 80 e 443 e tem um bloco por site. Os blocos da Clientela são os mesmos de antes: `consultoralaisbarbosa.com.br` e `www` no mesmo bloco, e `gestao.` com `X-Robots-Tag` e `redir / /crm`. Os certificados continuam vindo do Let's Encrypt.
2. **Uma rede de borda por aplicação.** O proxy cria a `clientela-edge`, e só o `web` entra nela, com o alias `clientela-web`. O Compose põe o nome do serviço (`web`, `api`) como alias em toda rede, e o Gizito também tem `web` e `api`. Numa rede única, o `http://api:3001` deste web poderia resolver para a api do Gizito. Com uma rede por aplicação, uma aplicação não enxerga a outra.
3. **Script `./compose` na pasta da VPS.** Ele passa a tag do `.image-tag` para o `docker compose`, e o `up` e o `pull` manuais nunca caem na `latest`. Mesmo modelo do Gizito e da plataforma.
4. **A limpeza de imagens do deploy só toca as `clientela-*`.** O `docker image prune -af` apagaria imagens de outras aplicações, como a versão anterior que o Gizito guarda para rollback ou as que um deploy dele acabou de puxar.
5. **A pasta vai para `/srv/apps/clientela`** (de `/opt/clientela`), junto com a troca do proxy. Os volumes não mudam, porque levam o nome do projeto (`name: clientela`).

## Alternativas consideradas

- **Gizito em outra porta ou outro IP**: rejeitada. Atrás da Cloudflare, os sites precisam de 443, e a VPS tem um IP só.
- **O Caddy da Clientela servindo também o Gizito**: rejeitada. O deploy de uma aplicação mexeria no proxy da outra, e um erro no compose da Clientela derrubaria o Gizito.
- **Rede `edge` única para todas as aplicações**: rejeitada pelo item 2.

## Consequências

- Mudar um site, um certificado ou um cabeçalho da Clientela passa a ser commit no `infra-vps` e `git pull` na VPS, feito à mão, e não mais o deploy deste repositório.
- A troca deixa o site fora do ar por alguns segundos. O deploy com este compose roda antes, com o Caddy antigo ainda servindo, porque o Compose não remove o container de um serviço que saiu do arquivo. Na troca, o Caddy antigo para e o proxy sobe. Os certificados atuais são copiados do volume `clientela_caddy_data` para o proxy antes, para não esperar emissão. O roteiro e a volta atrás estão no guia do `infra-vps` (`docs/proximos-passos.md`, parte A).
- O rate limit por visitante da API (LP-06) continua igual. O proxy confia no `X-Forwarded-For` das faixas da Cloudflare por causa do Gizito, mas os blocos da Clientela trocam o cabeçalho sempre pelo IP de quem se conectou (`header_up X-Forwarded-For {remote_host}`), até para uma conexão vinda de uma faixa da Cloudflare. É o mesmo comportamento do Caddy antigo, e o `proxy/test.sh` do `infra-vps` confere.
- Se o `clientela-edge` não existir, o `up` deste compose falha com `network clientela-edge declared as external, but could not be found`. A rede nasce com o proxy (`./compose up --no-start proxy` em `/srv/plataforma`, antes da troca).
