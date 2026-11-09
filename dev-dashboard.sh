#!/bin/bash
# Dashboard Next.js en local (puerto 3010) contra el branch de Neon dev-local.
cd "$(dirname "$0")"
if ! grep -q 'ep-jolly-flower-aixqu6mv' .env.development.local 2>/dev/null; then
  echo "❌ .env.development.local no apunta al branch dev-local — no arranco para no tocar prod." >&2
  exit 1
fi
echo "✅ DB: branch dev-local · API: localhost:4000"
exec npx next dev -p 3010
