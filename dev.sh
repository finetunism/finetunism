#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

[ -d node_modules ] || npm install --no-audit --no-fund

url="http://localhost:8787"
( for _ in $(seq 1 40); do
    curl -s -o /dev/null "$url" && { xdg-open "$url" >/dev/null 2>&1 || true; break; }
    sleep 0.5
  done ) &

exec npx wrangler dev --port 8787
