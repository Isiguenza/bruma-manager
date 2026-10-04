import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { composeFlowGraph } from "../compose"

interface Vector {
  name: string
  input: Parameters<typeof composeFlowGraph>[0]
  expected: unknown
}

const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/compose-vectors.json", import.meta.url), "utf8"),
) as Vector[]

const wire = (value: unknown) => JSON.parse(JSON.stringify(value))

export function runComposeVectors(): number {
  for (const vector of vectors) {
    assert.deepEqual(wire(composeFlowGraph(vector.input)), vector.expected, vector.name)
  }

  const categoryWithExplicitProduct = composeFlowGraph({
    product: { id: "main", categoryId: "mains", subcategoryId: null },
    definitions: [{ id: "flow", name: "Bebidas", scopeKind: "product", priority: 0, active: true }],
    targets: [{ flowId: "flow", mode: "include", productId: "main" }],
    nodes: [{ id: "drink", flowId: "flow", title: "Bebida", selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, isEntry: true, active: true, sortOrder: 0 }],
    options: [
      { id: "category", nodeId: "drink", source: "category", label: null, refCategoryId: "drinks", priceMode: "free", priceDelta: 0, active: true, sortOrder: 0, emitsChildItem: true },
      { id: "mineral", nodeId: "drink", source: "product", label: "Naranjada - Mineral", refProductId: "naranjada", refVariantName: "Mineral", priceMode: "delta", priceDelta: 10, active: true, sortOrder: 1, emitsChildItem: true },
    ],
    overrides: [], edges: [],
    products: [{ id: "naranjada", name: "Naranjada", categoryId: "drinks", price: 40, variants: '[{"name":"Natural","price":"40"},{"name":"Mineral ","price":"40"}]', active: true }],
    categories: [{ id: "drinks", isBeverage: true }],
  } as never)
  assert.deepEqual(
    categoryWithExplicitProduct?.nodes[0].options.map((option) => option.label),
    ["Naranjada - Natural", "Naranjada - Mineral"],
    "una variante explícita reemplaza solo su variante expandida, incluso con espacios heredados",
  )
  const variantBeforeChildFlow = composeFlowGraph({
    product: { id: "main", categoryId: "mains", subcategoryId: null },
    definitions: [
      { id: "host", name: "Paquete", scopeKind: "product", priority: 0, active: true },
      { id: "child", name: "Preparado", scopeKind: "product", priority: 0, active: true },
    ],
    targets: [{ flowId: "host", mode: "include", productId: "main" }, { flowId: "child", mode: "include", productId: "pepsi" }],
    nodes: [
      { id: "drink", flowId: "host", title: "Bebida", selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, isEntry: true, active: true, sortOrder: 0 },
      { id: "prepared", flowId: "child", title: "Preparado", selectMode: "single", minSelections: 0, maxSelections: 1, includeNoneOption: true, isEntry: true, active: true, sortOrder: 0 },
    ],
    options: [
      { id: "pepsi-option", nodeId: "drink", source: "product", label: "Pepsi", refProductId: "pepsi", allowVariantChoice: true, variantPriceDeltas: { Normal: 0, Black: 0 }, priceMode: "free", priceDelta: 0, emitsChildItem: true, active: true, sortOrder: 0 },
      { id: "yes", nodeId: "prepared", source: "manual", label: "Preparado", priceMode: "free", priceDelta: 0, emitsChildItem: false, active: true, sortOrder: 0 },
    ], overrides: [],
    edges: [{ id: "prepared-end", flowId: "child", fromNodeId: "prepared", fromOptionId: null, toNodeId: null, sortOrder: 0 }],
    products: [{ id: "pepsi", name: "Pepsi", categoryId: "drinks", price: 25, variants: '[{"name":"Normal","price":25},{"name":"Black","price":25}]', active: true }], categories: [{ id: "drinks", isBeverage: true }],
  } as never)
  assert.ok(variantBeforeChildFlow)
  const variantNode = variantBeforeChildFlow.nodes.find((node) => node.title === "Variante")
  assert.ok(variantNode, "la variante debe splicearse antes del subflujo del producto")
  assert.equal(variantBeforeChildFlow.edges.find((edge) => edge.fromNodeId === "drink" && edge.fromOptionId === "pepsi-option")?.toNodeId, variantNode.id)
  assert.equal(variantBeforeChildFlow.edges.find((edge) => edge.fromNodeId === variantNode.id)?.toNodeId, "prepared:sub:pepsi-option")
  return vectors.length
}

if (process.argv[1]?.endsWith("compose.test.ts")) {
  console.log(`${runComposeVectors()} compose vectors passed`)
}
