#!/usr/bin/env bash
cd "$(dirname "$0")"
# Carrega vars do .env.local para o ambiente (disponível para server + client)
set -a
source .env.local 2>/dev/null || true
set +a
exec node ./node_modules/concurrently/dist/bin/concurrently.js "npm run server" "npm run client"
