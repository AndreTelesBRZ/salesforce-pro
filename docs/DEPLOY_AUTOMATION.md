# Automacao de deploy via terminal

## O que o repositorio ja faz hoje

- O workflow [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) publica a imagem em `ghcr.io/andretelesbrz/salesforce-pro` quando ha `push` na branch `main`.
- As tags geradas no GHCR incluem:
  - `latest`
  - `sha-<commit-curto>`
  - `v*` quando o push e de tag Git
- A stack swarm versionada em [`docker-compose.swarm.yml`](../docker-compose.swarm.yml) usa `image: ${IMAGE}`. Isso e bom para automacao, porque o script pode injetar a tag exata no momento do deploy.

## Modelo atual do app

O projeto foi implementado como um app compartilhado entre duas empresas, com comportamento definido pelo dominio de acesso.

- `edsondosparafusos.app.br` usa loja/codigo `00001`
- `llfix.app.br` usa loja/codigo `00003`
- o frontend resolve backend e token por host em [`services/storeHost.ts`](../services/storeHost.ts)
- o backend trava a loja pelo host em [`server.js`](../server.js)

Na pratica, isso significa que um unico servico/container pode atender os dois dominios, desde que a imagem e as variaveis de ambiente contemplem os dois contextos.

## Divergencia que voce ainda precisa alinhar

A captura do Portainer mostra dois servicos (`...-edson` e `...-llfix`), enquanto o arquivo [`docker-compose.swarm.yml`](../docker-compose.swarm.yml) atual define um unico servico `salesforce-app` com roteamento por host no Traefik.

Isso pode significar uma destas situacoes:

1. A producao foi separada em dois servicos por decisao operacional, embora o codigo suporte um servico unico.
2. O arquivo da stack usado no servidor nao e o mesmo que esta versionado no repositorio.

A automacao criada aqui funciona para ambos os modelos, mas a stack real de producao precisa estar versionada para evitar drift operacional.

## Pre-requisitos na sua maquina Linux

Instale e configure:

- `git`
- `gh` autenticado no GitHub (`gh auth login`)
- `ssh` com chave autorizada no manager do Swarm
- `scp`
- `node`

## Pre-requisitos no servidor

No manager do Swarm, mantenha um arquivo de ambiente fora do repositorio, por exemplo:

`/opt/stacks/salesforce-pro/.env.stack`

Exemplo de conteudo:

```env
SECRET_KEY=...
MASTER_KEY=...
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=...
DATABASE_URL=...
VITE_BACKEND_URL=https://vendas.edsondosparafusos.app.br
VITE_APP_INTEGRATION_TOKEN_EDSON=...
VITE_APP_INTEGRATION_TOKEN_LLFIX=...
VITE_APP_INTEGRATION_TOKEN=...
```

## Arquivos adicionados

- [`.deploy.env.example`](../.deploy.env.example)
- [`scripts/deploy-stack.sh`](../scripts/deploy-stack.sh)
- [`scripts/release-and-deploy.sh`](../scripts/release-and-deploy.sh)
- [`scripts/inspect-remote-stack.sh`](../scripts/inspect-remote-stack.sh)

## Fluxo recomendado

### 1. Preparar as variaveis locais

```bash
cp .deploy.env.example .deploy.env
nano .deploy.env
set -a
source ./.deploy.env
set +a
```

### 2. Auditar a stack remota antes do primeiro deploy automatizado

```bash
set -a
source ./.deploy.env
set +a
./scripts/inspect-remote-stack.sh
```

Esse script:

1. Baixa a stack remota usada no manager.
2. Salva um snapshot local em `.tmp/remote-stack/<stack>/`.
3. Compara a stack remota com a stack versionada no repositorio.
4. Exporta o resumo dos services e o `docker service inspect` da stack atual.

Se houver diferencas, corrija primeiro a stack versionada. Automatizar antes disso e pedir drift em producao.

### 3. Publicar imagem e aplicar stack

```bash
./scripts/release-and-deploy.sh
```

Esse script faz:

1. Valida se voce esta em `main` e sem alteracoes locais pendentes.
2. Executa `git push origin main --follow-tags`.
3. Espera o workflow `docker-publish.yml` terminar no GitHub.
4. Usa a tag imutavel `sha-<commit-curto>` em vez de `latest`.
5. Copia a stack para o manager e roda `docker stack deploy` via SSH.

### 4. Aplicar apenas uma imagem ja publicada

```bash
set -a
source ./.deploy.env
set +a
IMAGE_TAG=sha-$(git rev-parse --short HEAD) ./scripts/deploy-stack.sh
```

Ou uma versao fixa:

```bash
IMAGE_TAG=v1.2.3 ./scripts/deploy-stack.sh
```

## Por que usar `sha-<commit>` em vez de `latest`

`latest` funciona para testes rapidos, mas e ruim para producao porque nao e imutavel. Quando voce usa `sha-<commit>`, fica claro exatamente qual commit esta rodando no Swarm e voce consegue rollback de forma previsivel.

## Rollback manual

Se precisar voltar uma versao:

```bash
set -a
source ./.deploy.env
set +a
IMAGE_TAG=sha-abc1234 ./scripts/deploy-stack.sh
```

## Melhorias futuras recomendadas

- Versionar tambem a stack exata que o Portainer usa hoje.
- Trocar `latest` operacional por tags semanticas (`v1.2.3`) ou por SHA sempre.
- Se o pacote GHCR for privado, garantir `docker login ghcr.io` no manager ou usar `--with-registry-auth` a partir de um manager autenticado.
- Se quiser zero clique, criar um segundo workflow GitHub para deploy remoto via SSH. Eu nao recomendo isso antes de consolidar a stack real que esta em producao.
