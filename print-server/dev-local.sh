#!/bin/bash
# Levanta el print-server en local (puerto 3003) contra las impresoras reales.
cd "$(dirname "$0")"
set -a; source .env.local; set +a
exec node --watch server.js
