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

const refs = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [])

/**
 * Variant names of `product` that `flow` still applies to, or null when the flow
 * has no per-variant exclusion for it. Names are returned exactly as stored (the
 * client compares the raw name, and real data has "Orden de 3 " with a trailing
 * space) but matched trimmed.
 */
function allowedVariants(input: ComposeRows, flow: any, product: any): string[] | null {
  const excluded = new Set(input.targets.filter((target) => target.flowId === flow.id && target.mode === "exclude" && target.productId === product.id && typeof target.variantName === "string").map((target) => target.variantName.trim()))
  if (excluded.size === 0) return null
  try {
    const parsed: unknown = typeof product.variants === "string" ? JSON.parse(product.variants) : product.variants
    return (Array.isArray(parsed) ? parsed : []).flatMap((value: any) => (typeof value?.name === "string" && value.name.trim() && !excluded.has(value.name.trim()) ? [value.name] : []))
  } catch { return [] }
}

/** Same target rules are used for the host product and for a child subflow. */
function applicableFlows(input: ComposeRows, product: any): any[] {
  return input.definitions.filter((flow) => {
    // An embedded subflow belongs to its parent flow and is only reached by reference.
    if (!flow.active || flow.parentFlowId) return false
    const targets = input.targets.filter((target) => target.flowId === flow.id)
    if (targets.some((target) => target.mode === "exclude" && target.variantName == null && matches(target, product))) return false
    if (allowedVariants(input, flow, product)?.length === 0) return false
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
      return { id: raw.source === "category" && ref ? `${raw.id}:${ref.id}:${variantName ?? ""}` : raw.id, label: raw.source === "category" && ref && categoryExpanded && variantName ? `${ref.name} - ${variantName}` : raw.source === "category" && ref && raw.allowVariantChoice ? ref.name : raw.label ?? ref?.name ?? "", source: raw.source, priceMode: raw.priceMode, effectivePrice, refProductId: ref?.id ?? raw.refProductId ?? null, refCategoryId: raw.refCategoryId ?? null, refVariantName: variantName, refListPrice: ref ? (listPrice ?? number(ref.price)) : null, variantChoices: raw.allowVariantChoice && ref ? parseVariants(ref.variants).filter((variant) => !refs(raw.hiddenRefs).includes(`${ref.id}::${variant.name}`)) : null, ...(raw.variantPriceDeltas == null ? {} : { variantPriceDeltas: raw.variantPriceDeltas }), emitsChildItem: raw.emitsChildItem, isBeverage: ref?.categoryId ? (beverages.get(ref.categoryId) ?? false) : false, refProductActive: ref?.active, refCategoryActive: raw.refCategoryId ? true : undefined }
    }
    for (const raw of rawOptions) {
      if (raw.source === "category" && raw.refCategoryId) {
        const hidden = new Set(refs(raw.hiddenRefs))
        for (const ref of input.products.filter((row) => row.categoryId === raw.refCategoryId && row.active).sort((a, b) => a.name.localeCompare(b.name))) {
          if (hidden.has(ref.id)) continue
          const allValues = parseVariants(ref.variants)
          const values = allValues.filter((variant) => !hidden.has(`${ref.id}::${variant.name}`))
          // Every variant switched off is the same as switching the product off.
          if (allValues.length > 0 && values.length === 0) continue
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
  const stepNode = (id: string, flowId: string): FlowNode => ({ id, flowId, title: "", subtitle: null, selectMode: "single", minSelections: 0, maxSelections: null, includeNoneOption: false, noneLabel: null, isEntry: false, childOwnerOptionId: null, options: [] })
  // "Paquete applies to Orden de 3, not to Pieza": the variant is only known on the
  // client, so the exclusion is compiled into an invisible step that skips the flow.
  const variantGates: Array<{ gateId: string; flowId: string; entryId: string; allowed: string[] }> = []
  for (const flow of selected) {
    const allowed = allowedVariants(input, flow, input.product)
    const entryId = entries.get(flow.id)
    if (allowed === null || entryId === undefined) continue
    const gateId = `${flow.id}:variant-gate`
    nodes.push(stepNode(gateId, flow.id))
    entries.set(flow.id, gateId)
    variantGates.push({ gateId, flowId: flow.id, entryId, allowed: [...new Set(allowed.flatMap((name) => [name, name.trim()]))] })
  }
  // `closeDeadEnds` is for subflow instances, whose "end" is rewired to the host's exits.
  // A later flow without an entry node must not swallow the ones after it.
  const nextEntryOf = (flows: any[], entriesByFlow: Map<string, string | undefined>, flowId: string) => flows.slice(flows.findIndex((flow) => flow.id === flowId) + 1).map((flow) => entriesByFlow.get(flow.id)).find((entry) => entry !== undefined) ?? null
  const composeEdges = (flows: any[], entriesByFlow: Map<string, string | undefined>, flowNodes: readonly any[], closeDeadEnds = false): FlowEdge[] => {
    const flowIds = new Set(flows.map((flow) => flow.id))
    const nextEntry = (flowId: string) => nextEntryOf(flows, entriesByFlow, flowId)
    const composed: FlowEdge[] = input.edges.filter((edge) => flowIds.has(edge.flowId)).map((edge) => ({ id: edge.id, fromNodeId: edge.fromNodeId, fromOptionId: edge.fromOptionId ?? null, toNodeId: edge.toNodeId ?? nextEntry(edge.flowId), condition: edge.condition ?? null, sortOrder: edge.sortOrder }))
    // A node saved without any exit used to end the whole composition, silently
    // dropping every later flow (an empty product flow hid Paquete). Its end is
    // the end of ITS flow only.
    for (const node of flowNodes) {
      if (composed.some((edge) => edge.fromNodeId === node.id)) continue
      const toNodeId = nextEntry(node.flowId)
      if (toNodeId !== null || closeDeadEnds) composed.push({ fromNodeId: node.id, fromOptionId: null, toNodeId, condition: null, sortOrder: 0 })
    }
    return composed
  }
  const edges = composeEdges(selected, entries, regular.rawNodes)
  for (const gate of variantGates) {
    edges.push({ fromNodeId: gate.gateId, fromOptionId: null, toNodeId: gate.entryId, condition: { variantNameIn: gate.allowed }, sortOrder: 0 })
    edges.push({ fromNodeId: gate.gateId, fromOptionId: null, toNodeId: nextEntryOf(selected, entries, gate.flowId), condition: null, sortOrder: 1 })
  }
  const flowSummaries = [...selected]
  // A child can be targeted by the same flow as its host (Pescadito is Pescado,
  // which is a Paquete target). Never re-enter a host flow: traversal has no
  // stack for recursive packages. Sibling drink options may still instance the
  // same child flow independently, so they must not be treated as re-entry.
  const hostFlowIds = new Set(selected.map((flow) => flow.id))

  const rawOptionById = new Map(input.options.map((option) => [option.id, option]))
  const MAX_SUBFLOW_DEPTH = 3
  // A worklist, not recursion: instanced nodes are appended and may host a
  // subflow of their own, but only one attached on purpose (custom). An inherited
  // subflow never nests, so a child's flow cannot pull in a grandchild's.
  const hosts: Array<{ node: FlowNode; depth: number }> = nodes.map((node) => ({ node, depth: 0 }))
  for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
    const { node: hostNode, depth } = hosts[hostIndex]
    const isMulti = hostNode.selectMode !== "single"
    const hostExits = edges.filter((edge) => edge.fromNodeId === hostNode.id)
    const plans = hostNode.options.flatMap((hostOption: FlowNodeOption) => {
      const raw = rawOptionById.get(hostOption.sourceOptionId ?? sourceId(hostOption.id))
      const mode: string = raw?.childFlowMode ?? "inherit"
      const custom = mode === "custom" ? input.definitions.find((flow) => flow.id === raw.childFlowId && flow.active) : undefined
      if (depth > 0 && !custom) return []
      const childProduct = hostOption.refProductId == null ? undefined : byProduct.get(hostOption.refProductId)
      // Depth is exactly one for inherited flows; this direct self-reference is the only possible cycle there.
      if (!custom && (!childProduct || childProduct.id === input.product.id)) return []
      const muted = mode !== "inherit" || refs(raw?.subflowHiddenRefs).includes(hostOption.refProductId ?? "")
      const childFlows: any[] = custom ? [custom] : muted || !hostOption.emitsChildItem ? [] : applicableFlows(input, childProduct).filter((flow) => {
        if (hostFlowIds.has(flow.id)) return false
        const allowed = allowedVariants(input, flow, childProduct)
        const fixedVariant = hostOption.refVariantName?.trim()
        return allowed === null || fixedVariant == null || allowed.some((name) => name.trim() === fixedVariant)
      })
      const child = childFlows.length ? materializedOptions(childFlows, childProduct ?? input.product) : null
      const childEntries = child ? entryFor(childFlows, child.rawNodes.map((node) => ({ ...node, options: [] }) as FlowNode)) : new Map<string, string | undefined>()
      const childEntry = child ? childEntries.get(childFlows[0].id) : undefined
      const needsVariantStep = depth === 0 && (hostOption.variantChoices?.length ?? 0) > 0
      return !needsVariantStep && !childEntry ? [] : [{ hostOption, childFlows, child, childEntries, childEntry, needsVariantStep }]
    })
    if (plans.length === 0) continue
    // A multi host visits the subflow of EVERY selected option. The client engine
    // has no stack, so the sequence is compiled into invisible steps: one gate per
    // option ("was it selected?") chained into a join that owns the host's exits.
    const gateId = (optionId: string) => `${hostNode.id}:gate:${optionId}`
    const joinId = `${hostNode.id}:join`
    plans.forEach(({ hostOption, childFlows, child, childEntries, childEntry, needsVariantStep }, planIndex) => {
      const exits: FlowEdge[] = isMulti ? [{ fromNodeId: hostNode.id, fromOptionId: null, toNodeId: plans[planIndex + 1] ? gateId(plans[planIndex + 1].hostOption.id) : joinId, condition: null, sortOrder: 0 }] : hostExits
      const ownerOptionId = hostNode.childOwnerOptionId ?? hostOption.id
      const enter = (toNodeId: string) => edges.push(isMulti ? { fromNodeId: gateId(hostOption.id), fromOptionId: null, toNodeId, condition: { optionSelected: hostOption.id }, sortOrder: 0 } : { fromNodeId: hostNode.id, fromOptionId: hostOption.id, toNodeId, condition: null, sortOrder: -1 })
      if (isMulti) {
        nodes.push(stepNode(gateId(hostOption.id), hostNode.flowId))
        edges.push({ fromNodeId: gateId(hostOption.id), fromOptionId: null, toNodeId: exits[0].toNodeId, condition: null, sortOrder: 1 })
      }
      const nodeId = (id: string) => `${id}:sub:${hostOption.id}`
      const optionId = (id: string) => `${id}:sub:${hostOption.id}`
      for (const rawNode of child?.rawNodes ?? []) {
        const instance: FlowNode = { id: nodeId(rawNode.id), flowId: rawNode.flowId, title: rawNode.title, subtitle: rawNode.subtitle ?? null, selectMode: rawNode.selectMode, minSelections: rawNode.minSelections, maxSelections: rawNode.maxSelections, includeNoneOption: rawNode.includeNoneOption, noneLabel: rawNode.noneLabel ?? null, isEntry: false, sourceNodeId: rawNode.id, childOwnerOptionId: ownerOptionId, options: (child?.byNode.get(rawNode.id) ?? []).map((option) => ({ ...option, id: optionId(option.id), sourceOptionId: sourceId(option.id), emitsChildItem: false })) }
        nodes.push(instance)
        if (depth + 1 < MAX_SUBFLOW_DEPTH) hosts.push({ node: instance, depth: depth + 1 })
      }
      const childEdges = composeEdges(childFlows, childEntries, child?.rawNodes ?? [], true)
      for (const edge of childEdges) {
        if (edge.toNodeId !== null) {
          edges.push({ ...edge, id: edge.id ? `${edge.id}:sub:${hostOption.id}` : undefined, fromNodeId: nodeId(edge.fromNodeId), fromOptionId: edge.fromOptionId === null ? null : optionId(edge.fromOptionId), toNodeId: nodeId(edge.toNodeId) })
          continue
        }
        for (const hostExit of exits) {
          edges.push({ id: edge.id ? `${edge.id}:sub:${hostOption.id}:continue:${hostExit.id ?? "edge"}` : undefined, fromNodeId: nodeId(edge.fromNodeId), fromOptionId: edge.fromOptionId === null ? null : optionId(edge.fromOptionId), toNodeId: hostExit.toNodeId, condition: hostExit.condition, sortOrder: hostExit.sortOrder })
        }
      }
      const variantNodeId = `${hostNode.id}:sub:${hostOption.id}`
      if (needsVariantStep) {
        const choices = hostOption.variantChoices ?? []
        nodes.push({ id: variantNodeId, sourceNodeId: hostNode.id, flowId: hostNode.flowId, title: "Variante", subtitle: hostOption.label, selectMode: "single", minSelections: 1, maxSelections: 1, includeNoneOption: false, noneLabel: null, isEntry: false, childOwnerOptionId: ownerOptionId, options: choices.map((choice: any) => ({ id: `${sourceId(hostOption.id)}:${choice.name}:sub:${hostOption.id}`, sourceOptionId: sourceId(hostOption.id), label: choice.name, source: "product", priceMode: "delta", effectivePrice: variantDelta(hostOption.variantPriceDeltas, hostOption.refProductId!, choice.name), refProductId: hostOption.refProductId, refVariantName: choice.name, refListPrice: choice.price, variantChoices: null, emitsChildItem: false, isBeverage: hostOption.isBeverage })) })
        for (const choice of choices) {
          const fromOptionId = `${sourceId(hostOption.id)}:${choice.name}:sub:${hostOption.id}`
          if (childEntry) edges.push({ fromNodeId: variantNodeId, fromOptionId, toNodeId: nodeId(childEntry), condition: null, sortOrder: 0 })
          else for (const hostExit of exits) edges.push({ id: hostExit.id ? `${hostExit.id}:variant:${hostOption.id}` : undefined, fromNodeId: variantNodeId, fromOptionId, toNodeId: hostExit.toNodeId, condition: hostExit.condition, sortOrder: hostExit.sortOrder })
        }
        enter(variantNodeId)
      } else if (childEntry) enter(nodeId(childEntry))
      for (const flow of childFlows) {
        if (!flowSummaries.some((candidate) => candidate.id === flow.id)) {
          flowSummaries.push(flow)
        }
      }
    })
    if (isMulti) {
      nodes.push(stepNode(joinId, hostNode.flowId))
      // An exit tied to one host option cannot fire from a step node (nothing is
      // "selected" there), so it becomes a condition over the path instead.
      for (const hostExit of hostExits) edges.push({ id: hostExit.id ? `${hostExit.id}:join` : undefined, fromNodeId: joinId, fromOptionId: null, toNodeId: hostExit.toNodeId, condition: hostExit.fromOptionId === null ? hostExit.condition : { ...(hostExit.condition ?? {}), optionSelected: hostExit.fromOptionId }, sortOrder: hostExit.sortOrder })
      edges.push({ fromNodeId: hostNode.id, fromOptionId: null, toNodeId: gateId(plans[0].hostOption.id), condition: null, sortOrder: Math.min(0, ...hostExits.map((edge) => edge.sortOrder)) - 1 })
    }
  }
  const entryNodeId = entries.get(selected[0].id)
  if (!entryNodeId) return null
  return { productId: input.product.id, format: "graph", source: "composed", flows: flowSummaries.map((flow) => ({ id: flow.id, name: flow.name, scopeKind: flow.scopeKind, priority: flow.priority })), entryNodeId, nodes, edges }
}
