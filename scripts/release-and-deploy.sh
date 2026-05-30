#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-main}"
WORKFLOW_FILE="${WORKFLOW_FILE:-docker-publish.yml}"
DEPLOY_AFTER_BUILD="${DEPLOY_AFTER_BUILD:-1}"
POLL_SECONDS="${POLL_SECONDS:-10}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-30}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Comando obrigatorio ausente: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd gh
require_cmd node

current_branch="$(git rev-parse --abbrev-ref HEAD)"
head_sha="$(git rev-parse HEAD)"
short_sha="$(git rev-parse --short HEAD)"

if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "Branch atual: $current_branch. Esperado para release: $BRANCH" >&2
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "Worktree suja. Commit ou stash antes de publicar." >&2
  exit 1
fi

echo ">>> Enviando $BRANCH para origin"
git push origin "$BRANCH" --follow-tags

echo ">>> Procurando workflow $WORKFLOW_FILE para o commit $head_sha"
run_id=""
for ((attempt=1; attempt<=POLL_ATTEMPTS; attempt++)); do
  runs_json="$(gh run list --workflow "$WORKFLOW_FILE" --branch "$BRANCH" --json databaseId,headSha,status,conclusion --limit 20)"
  run_id="$(RUNS_JSON="$runs_json" HEAD_SHA="$head_sha" node -e "const runs = JSON.parse(process.env.RUNS_JSON || '[]'); const run = runs.find((item) => item.headSha === process.env.HEAD_SHA); process.stdout.write(run ? String(run.databaseId) : '');")"
  if [[ -n "$run_id" ]]; then
    break
  fi
  echo "Tentativa $attempt/$POLL_ATTEMPTS: workflow ainda nao apareceu; aguardando ${POLL_SECONDS}s"
  sleep "$POLL_SECONDS"
done

if [[ -z "$run_id" ]]; then
  echo "Nao encontrei workflow do commit $head_sha em $WORKFLOW_FILE" >&2
  exit 1
fi

echo ">>> Aguardando conclusao do workflow #$run_id"
gh run watch "$run_id" --exit-status

export IMAGE_TAG="sha-$short_sha"
echo ">>> Imagem publicada esperada: ${IMAGE_REPO:-ghcr.io/andretelesbrz/salesforce-pro}:$IMAGE_TAG"

if [[ "$DEPLOY_AFTER_BUILD" == "1" ]]; then
  "$ROOT_DIR/scripts/deploy-stack.sh"
else
  echo ">>> Deploy remoto desabilitado. Execute scripts/deploy-stack.sh quando quiser aplicar a imagem."
fi
