#!/bin/bash

# Script para probar el endpoint de flujos de productos
# Uso: ./test-flow-endpoint.sh <product-id>

PRODUCT_ID=${1:-""}
BASE_URL="http://192.168.0.109:3000"

if [ -z "$PRODUCT_ID" ]; then
  echo "❌ Error: Debes proporcionar un product ID"
  echo "Uso: ./test-flow-endpoint.sh <product-id>"
  exit 1
fi

echo "🔍 Testing product flow endpoint..."
echo "Product ID: $PRODUCT_ID"
echo "URL: $BASE_URL/api/products/$PRODUCT_ID/flow"
echo ""

curl -s "$BASE_URL/api/products/$PRODUCT_ID/flow" | jq '.'
