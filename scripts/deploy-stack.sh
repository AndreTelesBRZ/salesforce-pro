#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

STACK_FILE="${STACK_FILE:-$ROOT_DIR/docker-compose.swarm.yml}"
DEPLOY_HOST="${DEPLOY_HOST:?Defina DEPLOY_HOST}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
STACK_NAME="${STACK_NAME:-salesforce-pro}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/apps/$STACK_NAME}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-$DEPLOY_PATH/.env.stack}"
REMOTE_STACK_FILE="${REMOTE_STACK_FILE:-$DEPLOY_PATH/$(basename "$STACK_FILE")}"
REMOTE_STACK_DIR="$(dirname "$REMOTE_STACK_FILE")"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/andretelesbrz/salesforce-pro}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SSH_TARGET="${SSH_USER}@${DEPLOY_HOST}"

if [[ ! -f "$STACK_FILE" ]]; then
  echo "Stack file nao encontrado: $STACK_FILE" >&2
  exit 1
fi

ssh_opts=(
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

echo ">>> Copiando stack para $SSH_TARGET:$REMOTE_STACK_FILE"
ssh "${ssh_opts[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_STACK_DIR'"
scp "${ssh_opts[@]}" "$STACK_FILE" "$SSH_TARGET:$REMOTE_STACK_FILE"

remote_script=$(cat <<REMOTE
set -euo pipefail
cd '$DEPLOY_PATH'
if [ ! -f '$REMOTE_ENV_FILE' ]; then
  echo 'Arquivo de ambiente remoto nao encontrado: $REMOTE_ENV_FILE' >&2
  exit 1
fi
set -a
. '$REMOTE_ENV_FILE'
set +a
export IMAGE='$IMAGE_REPO:$IMAGE_TAG'
docker stack deploy -c '$REMOTE_STACK_FILE' '$STACK_NAME' --with-registry-auth
echo
echo 'Servicos da stack:'
docker stack services '$STACK_NAME'
REMOTE
)

echo ">>> Aplicando stack $STACK_NAME com IMAGE=$IMAGE_REPO:$IMAGE_TAG"
ssh "${ssh_opts[@]}" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_script")"
