import type { FlowEdge, FlowGraph, FlowNode, FlowNodeOption } from "./types"

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
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed.flatMap((value: any) => {
      const name = typeof value?.name === "string" ? value.name.trim() : ""
      return name ? [{ name, price: number(value.price) }] : []
    }) : []
  } catch { return [] }
}

function variantDelta(raw: unknown, productId: string, variantName: string): number {
  try {
    const values = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown> | null
    if (!values || typeof values !== "object" || Array.isArray(values)) return 0
    // Category options are scoped by product to avoid charging every "Mineral".
    return number(values[`${productId}::${variantName}`] ?? values[variantName])
  } catch { return 0 }
}

/** Same target rules are used for the host product and for a child subflow. */
function applicableFlows(input: ComposeRows, product: any): any[] {
  return input.definitions.filter((flow) => {
    if (!flow.active) return false
    const targets = input.targets.filter((target) => target.flowId === flow.id)
    if (targets.some((target) => target.mode === "exclude" && matches(target, product))) return false
    const includes = targets.filter((target) => target.mode === "include")
    return flow.scopeKind === "global"
      ? includes.length === 0 || includes.some((target) => matches(target, product))
      : includes.some((target) => matches(target, product))
  }).sort((a, b) => scopeRank[a.scopeKind] - scopeRank[b.scopeKind] || a.priority - b.priority || a.name.localeCompare(b.name))
}

function sourceId(id: string): string {
  return id.split(":", 1)[0]
}

/** Pure common implementation; DB adapters only collect rows and call this function. */
export function composeFlowGraph(input: ComposeRows): FlowGraph | null {
  const selected = applicableFlows(input, input.product)
  if (!selected.length) return null

  const byProduct = new Map(input.products.map((row) => [row.id, row]))
  const beverages = new Map(input.categories.map((row) => [row.id, row.isBeverage]))
  const materializedOptions = (flows: any[], baseProduct: any) => {
    const flowIds = new Set(flows.map((flow) => flow.id))
    const rawNodes = input.nodes.filter((node) => flowIds.has(node.flowId) && node.active).sort((a, b) => a.sortOrder - b.sortOrder)
    const nodeIds = new Set(rawNodes.map((node) => node.id))
    const rawOptions = input.options.filter((option) => nodeIds.has(option.nodeId) && option.active).sort((a, b) => a.sortOrder - b.sortOrder)
    const byNode = new Map<string, FlowNodeOption[]>()
    const add = (nodeId: string, option: FlowNodeOption) => byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), option])
    const materialize = (raw: any, ref: any, variantName: string | null, listPrice?: number, categoryExpanded = false): FlowNodeOption => {
      const candidates = input.overrides.filter((row) => row.optionId === raw.id)
      const override =
        candidates.find((row) => row.productId !== null && row.productId === baseProduct.id) ??
        candidates.find((row) => row.subcategoryId !== null && baseProduct.subcategoryId !== null && row.subcategoryId === baseProduct.subcategoryId) ??
        candidates.find((row) => row.categoryId !== null && baseProduct.categoryId !== null && row.categoryId === baseProduct.categoryId)
      const effectivePrice = raw.priceMode === "free" ? 0 : raw.priceMode === "product_price" ? (listPrice ?? number(ref?.price)) : number(override?.priceDelta ?? raw.priceDelta)
      return { id: raw.source === "category" && ref ? `${raw.id}:${ref.id}:${variantName ?? ""}` : raw.id, label: raw.source === "category" && ref && categoryExpanded && variantName ? `${ref.name} - ${variantName}` : raw.source === "category" && ref && raw.allowVariantChoice ? ref.name : raw.label ?? ref?.name ?? "", source: raw.source, priceMode: raw.priceMode, effectivePrice, refProductId: ref?.id ?? raw.refProductId ?? null, refCategoryId: raw.refCategoryId ?? null, refVariantName: variantName, refListPrice: ref ? (listPrice ?? number(ref.price)) : null, variantChoices: raw.allowVariantChoice && ref ? parseVariants(ref.variants) : null, ...(raw.variantPriceDeltas == null ? {} : { variantPriceDeltas: raw.variantPriceDeltas }), emitsChildItem: raw.emitsChildItem, isBeverage: ref?.categoryId ? (beverages.get(ref.categoryId) ?? false) : false, refProductActive: ref?.active, refCategoryActive: raw.refCategoryId ? true : undefined }
    }
    for (const raw of rawOptions) {
      if (raw.source === "category" && raw.refCategoryId) {
        for (const ref of input.products.filter((row) => row.categoryId === raw.refCategoryId && row.active).sort((a, b) => a.name.localeCompare(b.name))) {
          const values = parseVariants(ref.variants)
          if (raw.allowVariantChoice) add(raw.nodeId, materialize(raw, ref, null, number(ref.price)))
          else for (const variant of values.length ? values : [null]) add(raw.nodeId, materialize(raw, ref, variant?.name ?? null, variant?.price ?? number(ref.price), true))
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
        // Old per-variant product overrides are superseded by the category's
        // per-variant delta map once the category asks for a variant itself.
        if (option.source === "product" && option.refVariantName !== null && options.some((candidate) => candidate.source === "category" && candidate.refProductId === option.refProductId && candidate.variantChoices !== null)) return false
        if (option.source !== "category") return true
        const variants = explicitVariants.get(option.refProductId ?? "")
        return !variants || (!variants.has(null) && !variants.has(option.refVariantName))
      }))
    }
    return { rawNodes, byNode }
  }
  const regular = materializedOptions(selected, input.product)
  const nodes: FlowNode[] = regular.rawNodes.map((node) => ({ id: node.id, flowId: node.flowId, title: node.title, subtitle: node.subtitle ?? null, selectMode: node.selectMode, minSelections: node.minSelections, maxSelections: node.maxSelections, includeNoneOption: node.includeNoneOption, noneLabel: node.noneLabel ?? null, isEntry: node.isEntry, childOwnerOptionId: null, options: regular.byNode.get(node.id) ?? [] }))
  const entryFor = (flows: any[], graphNodes: readonly FlowNode[]) => new Map(flows.map((flow) => [flow.id, graphNodes.find((node) => node.flowId === flow.id && node.isEntry)?.id]))
  const entries = entryFor(selected, nodes)
  const composeEdges = (flows: any[], entriesByFlow: Map<string, string | undefined>): FlowEdge[] => {
    const flowIds = new Set(flows.map((flow) => flow.id))
    return input.edges.filter((edge) => flowIds.has(edge.flowId)).map((edge) => {
      const index = flows.findIndex((flow) => flow.id === edge.flowId)
      return { id: edge.id, fromNodeId: edge.fromNodeId, fromOptionId: edge.fromOptionId ?? null, toNodeId: edge.toNodeId ?? entriesByFlow.get(flows[index + 1]?.id) ?? null, condition: edge.condition ?? null, sortOrder: edge.sortOrder }
    })
  }
  const edges = composeEdges(selected, entries)
  const flowSummaries = [...selected]
  // A child can be targeted by the same flow as its host (Pescadito is Pescado,
  // which is a Paquete target). Never re-enter a host flow: traversal has no
  // stack for recursive packages. Sibling drink options may still instance the
  // same child flow independently, so they must not be treated as re-entry.
  const hostFlowIds = new Set(selected.map((flow) => flow.id))

  // A multi host can select several children. Supporting several active subflows needs
  // a traversal stack, so v2 deliberately splices only single-select hosts.
  for (const hostNode of [...nodes]) {
    if (hostNode.selectMode !== "single") continue
    const hostExits = edges.filter((edge) => edge.fromNodeId === hostNode.id)
    for (const hostOption of hostNode.options) {
      if (hostOption.refProductId === null) continue
      const childProduct = byProduct.get(hostOption.refProductId)
      // Depth is exactly one; this direct self-reference is the only possible cycle here.
      if (!childProduct || childProduct.id === input.product.id) continue
      const childFlows = hostOption.emitsChildItem ? applicableFlows(input, childProduct).filter((flow) => !hostFlowIds.has(flow.id)) : []
      const child = childFlows.length ? materializedOptions(childFlows, childProduct) : null
      const childEntries = child ? entryFor(childFlows, child.rawNodes.map((node) => ({ ...node, options: [] }) as FlowNode)) : new Map<string, string | undefined>()
      const childEntry = child ? childEntries.get(childFlows[0].id) : undefined
      const needsVariantStep = (hostOption.variantChoices?.length ?? 0) > 0
      if (!needsVariantStep && !childEntry) continue
      const nodeId = (id: string) => `${id}:sub:${hostOption.id}`
      const optionId = (id: string) => `${id}:sub:${hostOption.id}`
      for (const rawNode of child?.rawNodes ?? []) {
        nodes.push({ id: nodeId(rawNode.id), flowId: rawNode.flowId, title: rawNode.title, subtitle: rawNode.subtitle ?? null, selectMode: rawNode.selectMode, minSelections: rawNode.minSelections, maxSelections: rawNode.maxSelections, includeNoneOption: rawNode.includeNoneOption, noneLabel: rawNode.noneLabel ?? null, isEntry: false, sourceNodeId: rawNode.id, childOwnerOptionId: hostOption.id, options: (child?.byNode.get(rawNode.id) ?? []).map((option) => ({ ...option, id: optionId(option.id), sourceOptionId: sourceId(option.id), emitsChildItem: false })) })
      }
      const childEdges = composeEdges(childFlows, childEntries)
      for (const edge of childEdges) {
        if (edge.toNodeId !== null) {
          edges.push({ ...edge, id: edge.id ? `${edge.id}:sub:${hostOption.id}` : undefined, fromNodeId: nodeId(edge.fromNodeId), fromOptionId: edge.fromOptionId === null ? null : optionId(edge.fromOptionId), toNodeId: nodeId(edge.toNodeId) })
          continue
        }
        for (const hostExit of hostExits) {
          edges.push({ id: edge.id ? `${edge.id}:sub:${hostOption.id}:continue:${hostExit.id ?? "edge"}` : undefined, fromNodeId: nodeId(edge.fromNodeId), fromOptionId: edge.fromOptionId === null ? null : optionId(edge.fromOptionId), toNodeId: hostExit.toNodeId, condition: hostExit.condition, sortOrder: hostExit.sortOrder })
        }
      }
      const variantNodeId = `${hostNode.id}:sub:${hostOption.id}`
      if (needsVariantStep) {
        const choices = hostOption.variantChoices ?? []
        nodes.push({ id: variantNodeId, sourceNodeId: hostNode.id, flowId: hostNode.flowId, title: "Variante", subtitle: hostOption.label, selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, noneLabel: null, isEntry: false, childOwnerOptionId: hostOption.id, options: choices.map((choice) => ({ id: `${sourceId(hostOption.id)}:${choice.name}:sub:${hostOption.id}`, sourceOptionId: sourceId(hostOption.id), label: hostOption.label, source: "product", priceMode: "delta", effectivePrice: variantDelta(hostOption.variantPriceDeltas, hostOption.refProductId!, choice.name), refProductId: hostOption.refProductId, refVariantName: choice.name, refListPrice: choice.price, variantChoices: null, emitsChildItem: false, isBeverage: hostOption.isBeverage })) })
        for (const choice of choices) {
          const fromOptionId = `${sourceId(hostOption.id)}:${choice.name}:sub:${hostOption.id}`
          if (childEntry) edges.push({ fromNodeId: variantNodeId, fromOptionId, toNodeId: nodeId(childEntry), condition: null, sortOrder: 0 })
          else for (const hostExit of hostExits) edges.push({ id: hostExit.id ? `${hostExit.id}:variant:${hostOption.id}` : undefined, fromNodeId: variantNodeId, fromOptionId, toNodeId: hostExit.toNodeId, condition: hostExit.condition, sortOrder: hostExit.sortOrder })
        }
        edges.push({ fromNodeId: hostNode.id, fromOptionId: hostOption.id, toNodeId: variantNodeId, condition: null, sortOrder: -1 })
      } else if (childEntry) edges.push({ fromNodeId: hostNode.id, fromOptionId: hostOption.id, toNodeId: nodeId(childEntry), condition: null, sortOrder: -1 })
      for (const flow of childFlows) {
        if (!flowSummaries.some((candidate) => candidate.id === flow.id)) {
          flowSummaries.push(flow)
        }
      }
    }
  }
  const entryNodeId = entries.get(selected[0].id)
  if (!entryNodeId) return null
  return { productId: input.product.id, format: "graph", source: "composed", flows: flowSummaries.map((flow) => ({ id: flow.id, name: flow.name, scopeKind: flow.scopeKind, priority: flow.priority })), entryNodeId, nodes, edges }
}
