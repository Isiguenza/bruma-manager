#!/bin/bash

# Script para verificar productos de una categoría
CATEGORY_ID="f07ba2f7-3ff0-43f5-9aeb-27bb710490a1"
BASE_URL="http://192.168.0.152:3000"

echo "🔍 Checking products in category: $CATEGORY_ID"
echo ""

# Get category info
echo "📂 Category info:"
curl -s "$BASE_URL/api/categories" | jq ".[] | select(.id == \"$CATEGORY_ID\")"

echo ""
echo "📦 Products in this category:"
curl -s "$BASE_URL/api/products" | jq "[.[] | select(.categoryId == \"$CATEGORY_ID\") | {id, name, active, categoryId}]"
