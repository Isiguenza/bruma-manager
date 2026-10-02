// Duplicado de lib/flows/compose.ts porque api-server es un proyecto TS aparte que no puede importar desde la raíz.
type FlowGraph = any
type FlowNodeOption = any

export interface ComposeRows {
  product: any
  definitions: any[]
  targets: any[]
  nodes: any[]
  options: any[]
  overrides: any[]
  edges: any[]
  products: any[]
  categories: any[]
}

const scopeRank: Record<string, number> = { product: 0, subcategory: 1, category: 2, global: 3 }
const number = (value: unknown) => Number(value ?? 0)
const matches = (target: any, product: any) =>
  (target.productId != null && target.productId === product.id) ||
  (target.subcategoryId != null && target.subcategoryId === product.subcategoryId) ||
  (target.categoryId != null && target.categoryId === product.categoryId)

function parseVariants(raw: unknown): Array<{ name: string; price: number }> {
  if (typeof raw !== "string") return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.flatMap((value: any) => {
      const name = typeof value?.name === "string" ? value.name.trim() : ""
      return name ? [{ name, price: number(value.price) }] : []
    }) : []
  } catch { return [] }
}

/** Pure common implementation; DB adapters only collect rows and call this function. */
export function composeFlowGraph(input: ComposeRows): FlowGraph | null {
  const { product } = input
  const selected = input.definitions.filter((flow) => {
    if (!flow.active) return false
    const targets = input.targets.filter((target) => target.flowId === flow.id)
    if (targets.some((target) => target.mode === "exclude" && matches(target, product))) return false
    const includes = targets.filter((target) => target.mode === "include")
    return flow.scopeKind === "global" ? includes.length === 0 || includes.some((target) => matches(target, product)) : includes.some((target) => matches(target, product))
  }).sort((a, b) => scopeRank[a.scopeKind] - scopeRank[b.scopeKind] || a.priority - b.priority || a.name.localeCompare(b.name))
  if (!selected.length) return null
  const flowIds = new Set(selected.map((flow) => flow.id))
  const rawNodes = input.nodes.filter((node) => flowIds.has(node.flowId) && node.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const nodeIds = new Set(rawNodes.map((node) => node.id))
  const rawOptions = input.options.filter((option) => nodeIds.has(option.nodeId) && option.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const byProduct = new Map(input.products.map((row) => [row.id, row]))
  const beverages = new Map(input.categories.map((row) => [row.id, row.isBeverage]))
  const byNode = new Map<string, FlowNodeOption[]>()
  const add = (nodeId: string, option: FlowNodeOption) => byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), option])
  const materialize = (raw: any, ref: any, variantName: string | null, listPrice?: number): FlowNodeOption => {
    const candidates = input.overrides.filter((row) => row.optionId === raw.id)
    const override =
      candidates.find((row) => row.productId !== null && row.productId === product.id) ??
      candidates.find((row) => row.subcategoryId !== null && product.subcategoryId !== null && row.subcategoryId === product.subcategoryId) ??
      candidates.find((row) => row.categoryId !== null && product.categoryId !== null && row.categoryId === product.categoryId)
    const effectivePrice = raw.priceMode === "free" ? 0 : raw.priceMode === "product_price" ? (listPrice ?? number(ref?.price)) : number(override?.priceDelta ?? raw.priceDelta)
    return { id: raw.source === "category" && ref ? `${raw.id}:${ref.id}:${variantName ?? ""}` : raw.id, label: raw.source === "category" && ref && variantName ? `${ref.name} - ${variantName}` : raw.label ?? ref?.name ?? "", source: raw.source, priceMode: raw.priceMode, effectivePrice, refProductId: ref?.id ?? raw.refProductId ?? null, refCategoryId: raw.refCategoryId ?? null, refVariantName: variantName, refListPrice: ref ? (listPrice ?? number(ref.price)) : null, variantChoices: raw.allowVariantChoice && ref ? parseVariants(ref.variants) : null, emitsChildItem: raw.emitsChildItem, isBeverage: ref?.categoryId ? (beverages.get(ref.categoryId) ?? false) : false, refProductActive: ref?.active, refCategoryActive: raw.refCategoryId ? true : undefined }
  }
  for (const raw of rawOptions) {
    if (raw.source === "category" && raw.refCategoryId) {
      for (const ref of input.products.filter((row) => row.categoryId === raw.refCategoryId && row.active).sort((a, b) => a.name.localeCompare(b.name))) {
        const values = parseVariants(ref.variants); for (const variant of values.length ? values : [null]) add(raw.nodeId, materialize(raw, ref, variant?.name ?? null, variant?.price ?? number(ref.price)))
      }
    } else add(raw.nodeId, materialize(raw, byProduct.get(raw.refProductId), raw.refVariantName ?? null))
  }
  for (const [id, options] of byNode) {
    const explicitVariants = new Map<string, Set<string | null>>()
    for (const option of options) {
      const productId = option.source === "product" ? option.refProductId : null
      if (productId === null) continue
      const variants = explicitVariants.get(productId) ?? new Set<string | null>()
      variants.add(option.refVariantName)
      explicitVariants.set(productId, variants)
    }
    byNode.set(id, options.filter((option) => {
      if (option.source !== "category") return true
      const variants = explicitVariants.get(option.refProductId ?? "")
      return !variants || (!variants.has(null) && !variants.has(option.refVariantName))
    }))
  }
  const nodes = rawNodes.map((node) => ({ id: node.id, flowId: node.flowId, title: node.title, subtitle: node.subtitle ?? null, selectMode: node.selectMode, minSelections: node.minSelections, maxSelections: node.maxSelections, includeNoneOption: node.includeNoneOption, noneLabel: node.noneLabel ?? null, isEntry: node.isEntry, options: byNode.get(node.id) ?? [] }))
  const entries = new Map(selected.map((flow) => [flow.id, nodes.find((node) => node.flowId === flow.id && node.isEntry)?.id]))
  const edges = input.edges.filter((edge) => flowIds.has(edge.flowId)).map((edge) => { const index = selected.findIndex((flow) => flow.id === edge.flowId); return { id: edge.id, fromNodeId: edge.fromNodeId, fromOptionId: edge.fromOptionId ?? null, toNodeId: edge.toNodeId ?? entries.get(selected[index + 1]?.id) ?? null, condition: edge.condition ?? null, sortOrder: edge.sortOrder } })
  const entryNodeId = entries.get(selected[0].id); if (!entryNodeId) return null
  return { productId: product.id, format: "graph", source: "composed", flows: selected.map((flow) => ({ id: flow.id, name: flow.name, scopeKind: flow.scopeKind, priority: flow.priority })), entryNodeId, nodes, edges }
}
