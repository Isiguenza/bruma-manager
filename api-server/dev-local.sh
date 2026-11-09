#!/bin/bash
# Levanta el api-server en local contra el branch de Neon dev-local.
cd "$(dirname "$0")"
set -a; source .env.local; set +a

# Candado: si DATABASE_URL no quedó apuntando al branch (p.ej. un valor sin
# comillas con '&' que bash corta), dotenv caería al .env de PRODUCCIÓN.
if [[ "$DATABASE_URL" != *"ep-jolly-flower-aixqu6mv"* ]]; then
  echo "❌ DATABASE_URL no es el branch dev-local — no arranco para no escribir en prod." >&2
  exit 1
fi
echo "✅ DB: branch dev-local"

exec npm run dev
