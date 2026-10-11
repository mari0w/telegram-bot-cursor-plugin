#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
cd "$SERVER"
if [[ ! -d node_modules/@modelcontextprotocol/sdk ]]; then
  if [[ -n "${SAND_EGRESS_TUNNEL_PROXY_ADDR:-}" && -z "${HTTPS_PROXY:-}" ]]; then
    proxy="$SAND_EGRESS_TUNNEL_PROXY_ADDR"
    [[ "$proxy" == *://* ]] || proxy="http://$proxy"
    HTTPS_PROXY="$proxy" npm install --omit=dev --no-fund --no-audit >/dev/null
  else
    npm install --omit=dev --no-fund --no-audit >/dev/null
  fi
fi
exec node "$SERVER/index.js"
