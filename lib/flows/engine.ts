import type {
  BuiltChildItem,
  BuiltParentItem,
  BuiltSelection,
  FlowContext,
  FlowEdgeCondition,
  FlowGraph,
  FlowNode,
  FlowNodeOption,
  FlowPath,
  FlowProduct,
  FlowVariant,
} from "./types"

const MAX_STEP_NODE_HOPS = 1_000

export class FlowTraversalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlowTraversalError"
  }
}

function conditionMatches(condition: FlowEdgeCondition, ctx: FlowContext): boolean {
  return (
    (condition.variantNameIn === undefined ||
      (ctx.variantName !== null && condition.variantNameIn.includes(ctx.variantName))) &&
    (condition.productHasTag === undefined || ctx.flowTags.includes(condition.productHasTag)) &&
    (condition.productIdIn === undefined || condition.productIdIn.includes(ctx.productId)) &&
    (condition.categoryIdIn === undefined ||
      (ctx.categoryId !== null && condition.categoryIdIn.includes(ctx.categoryId))) &&
    (condition.optionSelected === undefined || ctx.pathOptionIds.includes(condition.optionSelected))
  )
}

function matchingNextId(
  graph: FlowGraph,
  nodeId: string,
  selectedOptionIds: readonly string[],
  ctx: FlowContext,
): string | null {
  const edge = graph.edges
    .filter((candidate) => candidate.fromNodeId === nodeId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find(
      (candidate) =>
        (candidate.fromOptionId === null || selectedOptionIds.includes(candidate.fromOptionId)) &&
        (candidate.condition === null || conditionMatches(candidate.condition, ctx)),
    )

  return edge?.toNodeId ?? null
}

/**
 * Selects the first matching edge and makes step nodes transparent to callers.
 * A malformed cycle of step nodes is surfaced as an error instead of spinning forever.
 */
export function nextNode(
  graph: FlowGraph,
  currentNodeId: string,
  selectedOptionIds: readonly string[],
  ctx: FlowContext,
): string | null {
  let nextId = matchingNextId(graph, currentNodeId, selectedOptionIds, ctx)
  let hops = 0

  while (nextId !== null) {
    const node = graph.nodes.find((candidate) => candidate.id === nextId)
    if (node === undefined) {
      throw new FlowTraversalError(`La arista apunta al nodo inexistente \"${nextId}\".`)
    }
    if (node.options.length > 0) return node.id
    if (++hops > MAX_STEP_NODE_HOPS) {
      throw new FlowTraversalError("Se excedió el límite de nodos de paso; el grafo probablemente tiene un ciclo.")
    }
    nextId = matchingNextId(graph, node.id, [], ctx)
  }

  return null
}

export function canAdvance(node: FlowNode, selectedOptionIds: readonly string[]): boolean {
  return (
    selectedOptionIds.length >= node.minSelections &&
    (node.maxSelections === null || selectedOptionIds.length <= node.maxSelections)
  )
}

function selectedOptions(graph: FlowGraph, path: FlowPath): Array<{ node: FlowNode; option: FlowNodeOption }> {
  const result: Array<{ node: FlowNode; option: FlowNodeOption }> = []
  for (const visit of path) {
    const node = graph.nodes.find((candidate) => candidate.id === visit.nodeId)
    if (node === undefined) {
      throw new FlowTraversalError(`El path contiene el nodo inexistente \"${visit.nodeId}\".`)
    }
    for (const optionId of visit.selectedOptionIds) {
      const option = node.options.find((candidate) => candidate.id === optionId)
      if (option === undefined) {
        throw new FlowTraversalError(`El path contiene la opción inexistente \"${optionId}\" en \"${node.id}\".`)
      }
      result.push({ node, option })
    }
  }
  return result
}

export function computeTotal(graph: FlowGraph, path: FlowPath, basePrice: number): number {
  return basePrice + selectedOptions(graph, path).reduce((total, { option }) => total + option.effectivePrice, 0)
}

function referencedProductName(option: FlowNodeOption): string {
  const variantName = option.refVariantName?.trim()
  if (!variantName) return option.label
  const suffix = ` - ${variantName}`
  return option.label.trimEnd().toLowerCase().endsWith(suffix.toLowerCase())
    ? option.label
    : `${option.label}${suffix}`
}

function preparedProductName(productName: string, graph: FlowGraph, path: FlowPath): string {
  const isPrepared = selectedOptions(graph, path).some(({ node, option }) =>
    node.childOwnerOptionId == null && /^(preparado|preparada)$/i.test(option.label.trim()),
  )
  return isPrepared && !/\(prep\)/i.test(productName) ? `${productName} (Prep)` : productName
}

function packageLabel(graph: FlowGraph, path: FlowPath): string | null {
  const childFlowIds = new Set(
    selectedOptions(graph, path)
      .filter(({ option }) => option.emitsChildItem)
      .map(({ node }) => node.flowId),
  )
  if (childFlowIds.size === 0) return null
  const flow = graph.flows.find((candidate) => childFlowIds.has(candidate.id))
  return flow?.name ?? null
}

/** Builds order-ready snapshots. Child parentItemId is the in-memory parent token. */
export function buildItems(
  graph: FlowGraph,
  path: FlowPath,
  product: FlowProduct,
  variant: FlowVariant | null,
  _ctx: FlowContext,
): { parent: BuiltParentItem; children: BuiltChildItem[]; selections: BuiltSelection[] } {
  const basePrice = variant?.price ?? product.price ?? 0
  const parent: BuiltParentItem = {
    productId: product.id,
    productName: preparedProductName(
      variant === null ? product.name : `${product.name} - ${variant.name}`,
      graph,
      path,
    ),
    unitPrice: computeTotal(graph, path, basePrice),
    subtotal: computeTotal(graph, path, basePrice),
    packageLabel: packageLabel(graph, path),
    seat: product.seat ?? null,
    course: product.course ?? null,
  }
  const children: BuiltChildItem[] = []
  const selections: BuiltSelection[] = []
  const childIndexByOwnerOptionId = new Map<string, number>()

  for (const { node, option } of selectedOptions(graph, path)) {
    let childItemIndex: number | null = null
    if (option.emitsChildItem) {
      if (option.refProductId === null) {
        throw new FlowTraversalError(`La opción hija \"${option.id}\" no tiene refProductId.`)
      }
      childItemIndex = children.length
      childIndexByOwnerOptionId.set(option.id, childItemIndex)
      children.push({
        productId: option.refProductId,
        productName: referencedProductName(option),
        ...(option.refVariantName == null ? {} : { refVariantName: option.refVariantName }),
        unitPrice: 0,
        subtotal: 0,
        parentItemId: "parent",
        seat: parent.seat,
        course: parent.course,
        isBeverage: option.isBeverage,
      })
    }
    // The server-spliced variant node belongs to the previously emitted child.
    // Its choice changes the child snapshot, while its delta remains on the parent.
    if (node.childOwnerOptionId != null && option.refVariantName != null) {
      const ownerIndex = childIndexByOwnerOptionId.get(node.childOwnerOptionId)
      if (ownerIndex !== undefined) {
        children[ownerIndex].productName = referencedProductName(option)
        children[ownerIndex].refVariantName = option.refVariantName
      }
    }
    selections.push({
      flowId: node.flowId,
      // Instance ids carry routing identity only; persistence requires raw UUIDs.
      nodeId: node.sourceNodeId ?? node.id,
      optionId: option.sourceOptionId ?? option.id,
      nodeTitle: node.title,
      optionLabel: option.label,
      priceDelta: option.effectivePrice,
      refProductId: option.refProductId,
      refVariantName: option.refVariantName,
      // The resolved menu price is intentionally not represented as originalPrice.
      refListPrice: option.refListPrice ?? null,
      childItemIndex,
      ownerChildItemIndex: node.childOwnerOptionId == null ? null : childIndexByOwnerOptionId.get(node.childOwnerOptionId) ?? null,
      sortOrder: selections.length,
    })
  }

  return { parent, children, selections }
}
