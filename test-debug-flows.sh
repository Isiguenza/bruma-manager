#!/bin/bash

# Script para ver todos los flujos de productos en debug
BASE_URL="http://192.168.0.109:3000"

echo "🔍 Fetching all product flows for debugging..."
echo "URL: $BASE_URL/api/debug/product-flows"
echo ""

curl -s "$BASE_URL/api/debug/product-flows" | jq '.'
