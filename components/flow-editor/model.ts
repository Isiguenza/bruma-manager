import type { FlowEdgeCondition } from "@/lib/flows/types"
import type { Product } from "@/lib/types"
import { temporaryId, type EditorEdge, type EditorNode, type EditorOption, type FlowDocument, type FlowListItem } from "./types"

/**
 * The editor never shows raw edges. Every step answers one question — "what comes
 * next?" — once for the step and optionally once per option; these helpers keep the
 * edge list equivalent to those answers.
 */

export interface Variant {
  name: string
  price: number
}

/** Variant names are trimmed: the composer matches them trimmed, and real data has trailing spaces. */
export function variantsOf(product: Product | undefined): Variant[] {
  if (!product?.variants) return []
  try {
    const parsed: unknown = JSON.parse(product.variants)
    return Array.isArray(parsed)
      ? parsed.flatMap((item: { name?: unknown; price?: unknown }) => (typeof item.name === "string" && item.name.trim() ? [{ name: item.name.trim(), price: Number(item.price) || 0 }] : []))
      : []
  } catch {
    return []
  }
}

export const variantRef = (productId: string, variantName: string) => `${productId}::${variantName}`

const isDefault = (edge: EditorEdge) => edge.fromOptionId === null && edge.condition === null
const isOptionEdge = (edge: EditorEdge, optionId: string) => edge.fromOptionId === optionId && edge.condition === null

export const edgesOf = (document: FlowDocument, nodeId: string) =>
  document.edges.filter((edge) => edge.fromNodeId === nodeId).sort((a, b) => a.sortOrder - b.sortOrder)

export const defaultEdge = (document: FlowDocument, nodeId: string) => edgesOf(document, nodeId).find(isDefault)
export const optionEdge = (document: FlowDocument, nodeId: string, optionId: string) => edgesOf(document, nodeId).find((edge) => isOptionEdge(edge, optionId))
export const ruleEdges = (document: FlowDocument, nodeId: string) => edgesOf(document, nodeId).filter((edge) => edge.condition !== null)

/** The first matching edge wins, so the catch-all has to be evaluated last. */
function withNodeEdges(document: FlowDocument, nodeId: string, edges: EditorEdge[]): FlowDocument {
  const ordered = [...edges.filter((edge) => !isDefault(edge)), ...edges.filter(isDefault).slice(0, 1)].map((edge, sortOrder) => ({ ...edge, sortOrder }))
  return { ...document, edges: [...document.edges.filter((edge) => edge.fromNodeId !== nodeId), ...ordered] }
}

const edge = (fromNodeId: string, fromOptionId: string | null, toNodeId: string | null, condition: FlowEdgeCondition | null = null): EditorEdge => ({
  id: temporaryId("edge"),
  fromNodeId,
  fromOptionId,
  toNodeId,
  condition,
  sortOrder: 0,
})

export function setDefaultNext(document: FlowDocument, nodeId: string, next: string | null): FlowDocument {
  const others = edgesOf(document, nodeId).filter((candidate) => !isDefault(candidate))
  return withNodeEdges(document, nodeId, [...others, edge(nodeId, null, next)])
}

/** `undefined` removes the override, so the option follows the step again. */
export function setOptionNext(document: FlowDocument, nodeId: string, optionId: string, next: string | null | undefined): FlowDocument {
  const others = edgesOf(document, nodeId).filter((candidate) => !isOptionEdge(candidate, optionId))
  return withNodeEdges(document, nodeId, next === undefined ? others : [edge(nodeId, optionId, next), ...others])
}

export function addRule(document: FlowDocument, nodeId: string, condition: FlowEdgeCondition, next: string | null): FlowDocument {
  return withNodeEdges(document, nodeId, [...edgesOf(document, nodeId), edge(nodeId, null, next, condition)])
}

export function removeEdge(document: FlowDocument, edgeId: string): FlowDocument {
  return { ...document, edges: document.edges.filter((candidate) => candidate.id !== edgeId) }
}

function blankNode(title: string, sortOrder: number, isEntry: boolean): EditorNode {
  return { id: temporaryId("node"), title, subtitle: null, selectMode: "single", minSelections: 0, maxSelections: 1, includeNoneOption: true, noneLabel: null, isEntry, posX: 0, posY: sortOrder * 120, sortOrder, active: true, options: [] }
}

/** Inserts a step right after `afterNodeId` on its own line; the new step inherits where that one was going. */
export function addStepAfter(document: FlowDocument, afterNodeId: string | null, title: string): { document: FlowDocument; nodeId: string } {
  const node = blankNode(title, document.nodes.length, !document.nodes.some((candidate) => candidate.isEntry))
  let next: FlowDocument = { ...document, nodes: [...document.nodes, node] }
  if (afterNodeId !== null) {
    const inherited = defaultEdge(document, afterNodeId)?.toNodeId ?? null
    next = setDefaultNext(setDefaultNext(next, node.id, inherited), afterNodeId, node.id)
  } else {
    next = setDefaultNext(next, node.id, null)
  }
  return { document: next, nodeId: node.id }
}

/** Opens a branch from one option; the branch rejoins wherever the step was going. */
export function addBranchStep(document: FlowDocument, nodeId: string, optionId: string, title: string): { document: FlowDocument; nodeId: string } {
  const node = blankNode(title, document.nodes.length, false)
  const rejoin = defaultEdge(document, nodeId)?.toNodeId ?? null
  const withNode: FlowDocument = { ...document, nodes: [...document.nodes, node] }
  return { document: setOptionNext(setDefaultNext(withNode, node.id, rejoin), nodeId, optionId, node.id), nodeId: node.id }
}

/** Whatever pointed at the removed step now points at where it was going. */
export function removeNode(document: FlowDocument, nodeId: string): FlowDocument {
  const removed = document.nodes.find((node) => node.id === nodeId)
  if (!removed || document.nodes.length <= 1) return document
  const next = defaultEdge(document, nodeId)?.toNodeId ?? null
  const nodes = document.nodes.filter((node) => node.id !== nodeId)
  const optionIds = new Set(removed.options.map((option) => option.id))
  const edges = document.edges
    .filter((candidate) => candidate.fromNodeId !== nodeId && !(candidate.fromOptionId !== null && optionIds.has(candidate.fromOptionId)))
    .map((candidate) => (candidate.toNodeId === nodeId ? { ...candidate, toNodeId: next === candidate.fromNodeId ? null : next } : candidate))
  const entryId = removed.isEntry ? (next ?? nodes[0].id) : null
  return { ...document, nodes: entryId === null ? nodes : nodes.map((node) => ({ ...node, isEntry: node.id === entryId })), edges }
}

/** Swaps a main-line step with the one before it. */
export function moveStepUp(document: FlowDocument, nodeId: string): FlowDocument {
  const trunk = trunkIds(document)
  const index = trunk.indexOf(nodeId)
  if (index <= 0) return document
  const previousId = trunk[index - 1]
  const beforeId = trunk[index - 2] ?? null
  const afterId = defaultEdge(document, nodeId)?.toNodeId ?? null
  let next = setDefaultNext(setDefaultNext(document, nodeId, previousId), previousId, afterId)
  if (beforeId !== null) next = setDefaultNext(next, beforeId, nodeId)
  const wasEntry = document.nodes.find((node) => node.id === previousId)?.isEntry === true
  return wasEntry ? { ...next, nodes: next.nodes.map((node) => ({ ...node, isEntry: node.id === nodeId })) } : next
}

export function updateNode(document: FlowDocument, nodeId: string, patch: Partial<EditorNode>): FlowDocument {
  return { ...document, nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)) }
}

export function updateOption(document: FlowDocument, nodeId: string, optionId: string, patch: Partial<EditorOption>): FlowDocument {
  const node = document.nodes.find((candidate) => candidate.id === nodeId)
  return node ? updateNode(document, nodeId, { options: node.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)) }) : document
}

export function removeOption(document: FlowDocument, nodeId: string, optionId: string): FlowDocument {
  const node = document.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return document
  const options = node.options.filter((option) => option.id !== optionId).map((option, sortOrder) => ({ ...option, sortOrder }))
  return { ...updateNode(document, nodeId, { options }), edges: document.edges.filter((candidate) => candidate.fromOptionId !== optionId) }
}

export function toggleRef(refs: string[], ref: string): string[] {
  return refs.includes(ref) ? refs.filter((candidate) => candidate !== ref) : [...refs, ref]
}

// ---------------------------------------------------------------------------
// Branch tree: the read-only picture of the graph.

export function trunkIds(document: FlowDocument): string[] {
  const ids: string[] = []
  let current: string | null = document.nodes.find((node) => node.isEntry)?.id ?? null
  while (current !== null && !ids.includes(current)) {
    ids.push(current)
    current = defaultEdge(document, current)?.toNodeId ?? null
  }
  return ids
}

export type BranchTarget =
  | { kind: "steps"; steps: TreeStep[]; rejoinTitle: string | null }
  | { kind: "jump"; title: string }
  | { kind: "end" }
  | { kind: "subflow"; flowId: string | null; names: string[]; mode: "inherit" | "custom" }

export interface TreeBranch {
  key: string
  label: string
  tone: "option" | "rule" | "subflow"
  optionId: string | null
  target: BranchTarget
}

export interface TreeStep {
  node: EditorNode
  branches: TreeBranch[]
}

export function conditionText(condition: FlowEdgeCondition | null): string {
  if (!condition) return ""
  return [
    condition.variantNameIn?.length ? `variante ${condition.variantNameIn.join(" o ")}` : null,
    condition.productHasTag ? `etiqueta «${condition.productHasTag}»` : null,
    condition.productIdIn?.length ? "ciertos productos" : null,
    condition.categoryIdIn?.length ? "ciertas categorías" : null,
    condition.optionSelected ? "se eligió una opción antes" : null,
  ]
    .filter(Boolean)
    .join(" y ")
}

export function optionName(option: EditorOption, products: Product[], categoryName: (id: string | null) => string): string {
  if (option.source === "category") return `Toda la categoría ${categoryName(option.refCategoryId)}`
  const product = products.find((candidate) => candidate.id === option.refProductId)
  const base = option.label?.trim() || product?.name || "Sin nombre"
  return option.refVariantName && !base.includes(option.refVariantName) ? `${base} · ${option.refVariantName}` : base
}

export interface TreeContext {
  products: Product[]
  categoryName: (id: string | null) => string
  /** Names of the flows a product would bring along as an inherited subflow. */
  inheritedFlowNames: (option: EditorOption) => string[]
}

export function buildTree(document: FlowDocument, context: TreeContext): { trunk: TreeStep[]; orphans: EditorNode[] } {
  const byId = new Map(document.nodes.map((node) => [node.id, node]))
  const claimed = new Set(trunkIds(document))
  const title = (id: string) => byId.get(id)?.title || "Paso sin título"

  const chain = (startId: string): { steps: TreeStep[]; rejoinTitle: string | null } => {
    const ids: string[] = []
    let current: string | null = startId
    let rejoinTitle: string | null = null
    while (current !== null) {
      if (claimed.has(current)) {
        rejoinTitle = title(current)
        break
      }
      claimed.add(current)
      ids.push(current)
      current = defaultEdge(document, current)?.toNodeId ?? null
    }
    return { steps: ids.map(step), rejoinTitle }
  }

  const step = (nodeId: string): TreeStep => {
    const node = byId.get(nodeId)!
    const branches: TreeBranch[] = []
    for (const candidate of edgesOf(document, nodeId)) {
      if (isDefault(candidate)) continue
      const option = node.options.find((item) => item.id === candidate.fromOptionId)
      const label = [option ? optionName(option, context.products, context.categoryName) : null, candidate.condition ? `si ${conditionText(candidate.condition)}` : null].filter(Boolean).join(" · ")
      const target: BranchTarget =
        candidate.toNodeId === null ? { kind: "end" } : claimed.has(candidate.toNodeId) ? { kind: "jump", title: title(candidate.toNodeId) } : { kind: "steps", ...chain(candidate.toNodeId) }
      branches.push({ key: candidate.id, label: label || "Otro camino", tone: candidate.condition ? "rule" : "option", optionId: option?.id ?? null, target })
    }
    for (const option of node.options) {
      if (option.childFlowMode === "none") continue
      const custom = option.childFlowMode === "custom" ? document.subflows.find((flow) => flow.id === option.childFlowId) : undefined
      const names = custom ? [custom.name] : option.childFlowMode === "inherit" ? context.inheritedFlowNames(option) : []
      if (names.length === 0) continue
      branches.push({
        key: `subflow-${option.id}`,
        label: optionName(option, context.products, context.categoryName),
        tone: "subflow",
        optionId: option.id,
        target: { kind: "subflow", flowId: custom?.id ?? null, names, mode: custom ? "custom" : "inherit" },
      })
    }
    return { node, branches }
  }

  const trunk = trunkIds(document).map(step)
  return { trunk, orphans: document.nodes.filter((node) => !claimed.has(node.id)) }
}

// ---------------------------------------------------------------------------
// Which flows would a product inherit? Mirrors `applicableFlows` in lib/flows/compose.ts
// closely enough for labels; the server stays the authority (see "Probar").

export function flowsForProduct(flows: FlowListItem[], product: Product, hostFlowId: string): FlowListItem[] {
  const matches = (target: FlowListItem["targets"][number]) =>
    (target.productId !== null && target.productId === product.id) ||
    (target.subcategoryId !== null && target.subcategoryId === (product.subcategoryId ?? null)) ||
    (target.categoryId !== null && target.categoryId === product.categoryId)
  return flows.filter((flow) => {
    if (!flow.active || flow.parentFlowId || flow.id === hostFlowId) return false
    if (flow.targets.some((target) => target.mode === "exclude" && !target.variantName && matches(target))) return false
    const includes = flow.targets.filter((target) => target.mode === "include")
    return flow.scopeKind === "global" ? includes.length === 0 || includes.some(matches) : includes.some(matches)
  })
}
