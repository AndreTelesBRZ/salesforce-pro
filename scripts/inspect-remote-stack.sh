#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_FILE="${STACK_FILE:-$ROOT_DIR/docker-compose.swarm.yml}"
DEPLOY_HOST="${DEPLOY_HOST:?Defina DEPLOY_HOST}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
STACK_NAME="${STACK_NAME:-salesforce-pro}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/stacks/$STACK_NAME}"
REMOTE_STACK_FILE="${REMOTE_STACK_FILE:-$DEPLOY_PATH/$(basename "$STACK_FILE")}"
SSH_TARGET="${SSH_USER}@${DEPLOY_HOST}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/.tmp/remote-stack/$STACK_NAME}"
LOCAL_REMOTE_STACK="$OUT_DIR/remote-stack.yml"
LOCAL_SERVICES="$OUT_DIR/stack-services.txt"
LOCAL_SERVICE_INSPECT="$OUT_DIR/service-inspect.txt"

mkdir -p "$OUT_DIR"

ssh_opts=(
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

echo ">>> Baixando stack remota de $SSH_TARGET:$REMOTE_STACK_FILE"
scp "${ssh_opts[@]}" "$SSH_TARGET:$REMOTE_STACK_FILE" "$LOCAL_REMOTE_STACK"

echo ">>> Coletando servicos atuais da stack $STACK_NAME"
ssh "${ssh_opts[@]}" "$SSH_TARGET" "docker stack services '$STACK_NAME'" > "$LOCAL_SERVICES"

remote_inspect=$(cat <<REMOTE
set -euo pipefail
for service in \$(docker stack services '$STACK_NAME' --format '{{.Name}}'); do
  echo "### \$service ###"
  docker service inspect "\$service" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
  docker service inspect "\$service" --format '{{json .Spec.Labels}}'
  echo
done
REMOTE
)

echo ">>> Coletando imagens e labels dos services da stack $STACK_NAME"
ssh "${ssh_opts[@]}" "$SSH_TARGET" "bash -lc $(printf '%q' "$remote_inspect")" > "$LOCAL_SERVICE_INSPECT"

echo ">>> Diff entre stack local e stack remota"
if diff -u "$STACK_FILE" "$LOCAL_REMOTE_STACK"; then
  echo "Sem diferencas entre a stack local e a remota."
else
  echo
  echo "Ha diferencas. Arquivos exportados em: $OUT_DIR"
fi

echo
printf 'Stack remota salva em: %s\n' "$LOCAL_REMOTE_STACK"
printf 'Resumo dos services salvo em: %s\n' "$LOCAL_SERVICES"
printf 'Inspect dos services salvo em: %s\n' "$LOCAL_SERVICE_INSPECT"
