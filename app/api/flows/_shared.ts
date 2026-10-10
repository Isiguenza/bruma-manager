import { randomUUID } from "node:crypto"
import { asc, eq, inArray } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"

import { db } from "@/lib/db"
import {
  categories,
  flowDefinitions,
  flowEdges,
  flowNodeOptions,
  flowNodes,
  flowOptionPriceOverrides,
  flowTargets,
  products,
} from "@/lib/db/schema"
import type { FlowEdge, FlowGraph, FlowNode, Problem } from "@/lib/flows/types"
import { validateGraph } from "@/lib/flows/validate"

type JsonObject = Record<string, unknown>

export const scopeKinds = ["global", "category", "subcategory", "product"] as const
export const targetModes = ["include", "exclude"] as const

const temporaryId = (id: unknown) =>
  typeof id !== "string" || /^(new|tmp)-/i.test(id)

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback

const asNullableString = (value: unknown) =>
  typeof value === "string" ? value : null

const asNumber = (value: unknown, fallback = 0) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

/** Empty lists are stored as NULL so "nothing hidden" has a single representation. */
const stringList = (value: unknown) => {
  const list = Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : []
  return list.length > 0 ? list : null
}

const asArray = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter((item): item is JsonObject => item !== null && typeof item === "object") : []

export function errorResponse(error: string, status = 400, extras?: JsonObject) {
  return Response.json({ error, ...extras }, { status })
}

function targetLabel(target: {
  category: { name: string } | null
  subcategory: { name: string } | null
  product: { name: string } | null
}) {
  if (target.category) return { kind: "category", name: target.category.name }
  if (target.subcategory) return { kind: "subcategory", name: target.subcategory.name }
  if (target.product) return { kind: "product", name: target.product.name }
  return { kind: "unknown", name: "Eliminado" }
}

function presentTarget(target: any) {
  const label = targetLabel(target)
  return {
    id: target.id,
    flowId: target.flowId,
    mode: target.mode,
    categoryId: target.categoryId,
    subcategoryId: target.subcategoryId,
    productId: target.productId,
    variantName: target.variantName,
    targetKind: label.kind,
    targetName: label.name,
  }
}

export async function getFlow(id: string) {
  const flow = await db.query.flowDefinitions.findFirst({
    where: eq(flowDefinitions.id, id),
    with: {
      targets: {
        with: { category: true, subcategory: true, product: true },
      },
      nodes: {
        orderBy: [asc(flowNodes.sortOrder), asc(flowNodes.createdAt)],
        with: {
          options: {
            orderBy: [asc(flowNodeOptions.sortOrder), asc(flowNodeOptions.createdAt)],
            with: {
              priceOverrides: true,
            },
          },
        },
      },
      edges: {
        orderBy: [asc(flowEdges.sortOrder), asc(flowEdges.createdAt)],
      },
    },
  })
  if (!flow) return null

  return {
    definition: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      scopeKind: flow.scopeKind,
      priority: flow.priority,
      active: flow.active,
      parentFlowId: flow.parentFlowId,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    },
    targets: flow.targets.map(presentTarget),
    nodes: flow.nodes.map((node) => ({
      ...node,
      options: node.options.map((option) => ({
        ...option,
        priceOverrides: option.priceOverrides,
      })),
    })),
    edges: flow.edges,
    // Subflujos propios: viven dentro de este flujo y solo se alcanzan por referencia.
    subflows: await db.select({ id: flowDefinitions.id, name: flowDefinitions.name, active: flowDefinitions.active }).from(flowDefinitions).where(eq(flowDefinitions.parentFlowId, id)).orderBy(asc(flowDefinitions.name)),
  }
}

export async function getTargets(id: string) {
  const targets = await db.query.flowTargets.findMany({
    where: eq(flowTargets.flowId, id),
    with: { category: true, subcategory: true, product: true },
  })
  return targets.map(presentTarget)
}

export async function listFlows() {
  const flows = await db.query.flowDefinitions.findMany({
    orderBy: [asc(flowDefinitions.name)],
    with: {
      nodes: { columns: { id: true } },
      targets: { with: { category: true, subcategory: true, product: true } },
    },
  })
  return flows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    description: flow.description,
    scopeKind: flow.scopeKind,
    priority: flow.priority,
    active: flow.active,
    parentFlowId: flow.parentFlowId,
    nodeCount: flow.nodes.length,
    targets: flow.targets.map(presentTarget),
  }))
}

export function targetRows(value: unknown) {
  return asArray(Array.isArray(value) ? value : (value as JsonObject | null)?.targets)
}

export function validateTargets(targets: JsonObject[]) {
  const problems: string[] = []
  for (const [index, target] of targets.entries()) {
    const references = [target.categoryId, target.subcategoryId, target.productId]
      .filter((reference) => typeof reference === "string" && reference.length > 0)
    if (references.length !== 1) {
      problems.push(`targets[${index}] debe tener exactamente uno de categoryId, subcategoryId o productId.`)
    }
    if (typeof target.variantName === "string" && (target.mode !== "exclude" || typeof target.productId !== "string")) {
      problems.push(`targets[${index}].variantName solo aplica a un exclude de producto.`)
    }
    if (!targetModes.includes(target.mode as (typeof targetModes)[number])) {
      problems.push(`targets[${index}].mode debe ser include o exclude.`)
    }
  }
  return problems
}

type IncomingOption = JsonObject & { id: string; originalId: unknown; nodeId: string }
type IncomingNode = JsonObject & { id: string; originalId: unknown; options: IncomingOption[] }
type IncomingEdge = JsonObject & { id: string }

type PreparedGraph = {
  nodes: IncomingNode[]
  edges: IncomingEdge[]
  graph: FlowGraph
}

/** Builds the shared validator's wire shape; persistence-only canvas fields remain on IncomingNode. */
function prepareGraph(value: unknown): PreparedGraph {
  const body = (value ?? {}) as JsonObject
  const rawNodes = asArray(body.nodes)
  const rawEdges = asArray(body.edges)
  const nodes: IncomingNode[] = rawNodes.map((rawNode, nodeIndex) => {
    const originalId = rawNode.id
    const id = asString(originalId, `tmp-node-${nodeIndex}`)
    const options = asArray(rawNode.options).map((rawOption, optionIndex) => ({
      ...rawOption,
      originalId: rawOption.id,
      id: asString(rawOption.id, `tmp-option-${nodeIndex}-${optionIndex}`),
      nodeId: id,
    }))
    return { ...rawNode, originalId, id, options }
  })
  const edges: IncomingEdge[] = rawEdges.map((edge, index) => ({
    ...edge,
    id: asString(edge.id, `tmp-edge-${index}`),
  }))

  const graphNodes: FlowNode[] = nodes.map((node) => ({
    id: node.id,
    flowId: asString(node.flowId),
    title: asString(node.title),
    subtitle: asNullableString(node.subtitle),
    selectMode: node.selectMode === "multi" ? "multi" : "single",
    minSelections: asNumber(node.minSelections),
    maxSelections: node.maxSelections === null || node.maxSelections === undefined ? null : asNumber(node.maxSelections),
    includeNoneOption: asBoolean(node.includeNoneOption, true),
    noneLabel: asNullableString(node.noneLabel),
    isEntry: asBoolean(node.isEntry, false),
    options: node.options.map((option) => ({
      id: option.id,
      label: asString(option.label),
      source: option.source === "product" || option.source === "category" ? option.source : "manual",
      priceMode: option.priceMode === "free" || option.priceMode === "product_price" ? option.priceMode : "delta",
      effectivePrice: asNumber(option.priceDelta),
      refProductId: asNullableString(option.refProductId),
      refCategoryId: asNullableString(option.refCategoryId),
      refVariantName: asNullableString(option.refVariantName),
      variantPriceDeltas: option.variantPriceDeltas && typeof option.variantPriceDeltas === "object" && !Array.isArray(option.variantPriceDeltas) ? option.variantPriceDeltas as Record<string, unknown> : null,
      variantChoices: null,
      emitsChildItem: asBoolean(option.emitsChildItem, false),
      isBeverage: false,
    })),
  }))
  const graphEdges: FlowEdge[] = edges.map((edge) => ({
    id: edge.id,
    fromNodeId: asString(edge.fromNodeId),
    fromOptionId: asNullableString(edge.fromOptionId),
    toNodeId: asNullableString(edge.toNodeId),
    condition: (edge.condition as FlowEdge["condition"]) ?? null,
    sortOrder: asNumber(edge.sortOrder),
  }))
  const entry = graphNodes.find((node) => node.isEntry)
  return {
    nodes,
    edges,
    graph: {
      productId: "",
      format: "graph",
      source: "editor",
      flows: [],
      entryNodeId: entry?.id ?? "",
      nodes: graphNodes,
      edges: graphEdges,
    },
  }
}

async function addReferenceEvidence(graph: FlowGraph) {
  const productIds = [...new Set(graph.nodes.flatMap((node) => node.options.map((option) => option.refProductId).filter((id): id is string => id !== null)))]
  const categoryIds = [...new Set(graph.nodes.flatMap((node) => node.options.map((option) => option.refCategoryId).filter((id): id is string => id !== null)))]
  const [referencedProducts, referencedCategories] = await Promise.all([
    productIds.length === 0 ? [] : db.select({ id: products.id, active: products.active, deletedAt: products.deletedAt }).from(products).where(inArray(products.id, productIds)),
    categoryIds.length === 0 ? [] : db.select({ id: categories.id, active: categories.active }).from(categories).where(inArray(categories.id, categoryIds)),
  ])
  const productsById = new Map(referencedProducts.map((product) => [product.id, product.active && product.deletedAt === null]))
  const categoriesById = new Map(referencedCategories.map((category) => [category.id, category.active]))
  for (const node of graph.nodes) {
    for (const option of node.options) {
      if (option.refProductId !== null) option.refProductActive = productsById.get(option.refProductId) === true
      if (option.refCategoryId != null) option.refCategoryActive = categoriesById.get(option.refCategoryId) === true
    }
  }
}

export async function replaceGraph(flowId: string, value: unknown): Promise<{ problems: Problem[] } | { flow: NonNullable<Awaited<ReturnType<typeof getFlow>>> }> {
  const flow = await db.query.flowDefinitions.findFirst({
    where: eq(flowDefinitions.id, flowId),
    columns: { id: true },
  })
  if (!flow) throw new Error("FLOW_NOT_FOUND")

  const prepared = prepareGraph(value)
  await addReferenceEvidence(prepared.graph)
  const problems = validateGraph(prepared.graph)
  if (problems.some((problem) => problem.severity === "error")) return { problems }

  const existingNodes = await db.select({ id: flowNodes.id }).from(flowNodes).where(eq(flowNodes.flowId, flowId))
  const existingOptions = existingNodes.length === 0
    ? []
    : await db.select({ id: flowNodeOptions.id }).from(flowNodeOptions)
      .innerJoin(flowNodes, eq(flowNodeOptions.nodeId, flowNodes.id))
      .where(eq(flowNodes.flowId, flowId))
  const nodeIds = new Set(existingNodes.map((node) => node.id))
  const optionIds = new Set(existingOptions.map((option) => option.id))
  const nodeIdMap = new Map<string, string>()
  const optionIdMap = new Map<string, string>()

  for (const node of prepared.nodes) {
    // Only IDs already owned by this flow survive; client `new-*`/`tmp-*` IDs and unknown IDs receive a server UUID.
    nodeIdMap.set(node.id, !temporaryId(node.originalId) && nodeIds.has(node.id) ? node.id : randomUUID())
    for (const option of node.options) {
      optionIdMap.set(option.id, !temporaryId(option.originalId) && optionIds.has(option.id) ? option.id : randomUUID())
    }
  }

  // Upsert by id instead of delete + reinsert: order_item_selections points at
  // nodes/options with ON DELETE SET NULL, so recreating a row with the same id
  // still wiped the reference of every historical selection on each save.
  const keptNodeIds = new Set(nodeIdMap.values())
  const keptOptionIds = new Set(optionIdMap.values())
  const removedNodeIds = [...nodeIds].filter((id) => !keptNodeIds.has(id))
  const removedOptionIds = [...optionIds].filter((id) => !keptOptionIds.has(id))
  const survivingOptionIds = [...optionIds].filter((id) => keptOptionIds.has(id))
  const statements: BatchItem<"pg">[] = [db.delete(flowEdges).where(eq(flowEdges.flowId, flowId))]
  if (removedOptionIds.length > 0) statements.push(db.delete(flowNodeOptions).where(inArray(flowNodeOptions.id, removedOptionIds)))
  if (removedNodeIds.length > 0) statements.push(db.delete(flowNodes).where(inArray(flowNodes.id, removedNodeIds)))
  if (survivingOptionIds.length > 0) statements.push(db.delete(flowOptionPriceOverrides).where(inArray(flowOptionPriceOverrides.optionId, survivingOptionIds)))
  for (const node of prepared.nodes) {
    const values = {
      flowId,
      title: asString(node.title),
      subtitle: asNullableString(node.subtitle),
      selectMode: node.selectMode === "multi" ? "multi" as const : "single" as const,
      minSelections: asNumber(node.minSelections),
      maxSelections: node.maxSelections === null || node.maxSelections === undefined ? null : asNumber(node.maxSelections),
      includeNoneOption: asBoolean(node.includeNoneOption, true),
      noneLabel: asNullableString(node.noneLabel),
      isEntry: asBoolean(node.isEntry, false),
      posX: asNumber(node.posX),
      posY: asNumber(node.posY),
      sortOrder: asNumber(node.sortOrder),
      active: asBoolean(node.active, true),
    }
    statements.push(db.insert(flowNodes).values({ id: nodeIdMap.get(node.id)!, ...values }).onConflictDoUpdate({ target: flowNodes.id, set: values }))
  }
  for (const node of prepared.nodes) {
    for (const option of node.options) {
      const values = {
        nodeId: nodeIdMap.get(node.id)!,
        source: option.source === "product" || option.source === "category" ? option.source as "product" | "category" : "manual" as const,
        label: asNullableString(option.label),
        refProductId: asNullableString(option.refProductId),
        refCategoryId: asNullableString(option.refCategoryId),
        refVariantName: asNullableString(option.refVariantName),
        allowVariantChoice: asBoolean(option.allowVariantChoice, false),
        variantPriceDeltas: option.variantPriceDeltas && typeof option.variantPriceDeltas === "object" && !Array.isArray(option.variantPriceDeltas) ? option.variantPriceDeltas : null,
        hiddenRefs: stringList(option.hiddenRefs),
        childFlowMode: option.childFlowMode === "none" || option.childFlowMode === "custom" ? option.childFlowMode : "inherit",
        childFlowId: option.childFlowMode === "custom" ? asNullableString(option.childFlowId) : null,
        subflowHiddenRefs: stringList(option.subflowHiddenRefs),
        priceMode: option.priceMode === "free" || option.priceMode === "product_price" ? option.priceMode as "free" | "product_price" : "delta" as const,
        priceDelta: String(asNumber(option.priceDelta)),
        emitsChildItem: asBoolean(option.emitsChildItem, false),
        sortOrder: asNumber(option.sortOrder),
        active: asBoolean(option.active, true),
      }
      statements.push(db.insert(flowNodeOptions).values({ id: optionIdMap.get(option.id)!, ...values }).onConflictDoUpdate({ target: flowNodeOptions.id, set: values }))
      for (const override of asArray(option.priceOverrides)) {
        statements.push(db.insert(flowOptionPriceOverrides).values({
          optionId: optionIdMap.get(option.id)!,
          categoryId: asNullableString(override.categoryId),
          subcategoryId: asNullableString(override.subcategoryId),
          productId: asNullableString(override.productId),
          priceDelta: String(asNumber(override.priceDelta)),
        }))
      }
    }
  }
  for (const edge of prepared.edges) {
    statements.push(db.insert(flowEdges).values({
      flowId,
      fromNodeId: nodeIdMap.get(asString(edge.fromNodeId)) ?? asString(edge.fromNodeId),
      fromOptionId: edge.fromOptionId === null || edge.fromOptionId === undefined ? null : optionIdMap.get(asString(edge.fromOptionId)) ?? asString(edge.fromOptionId),
      toNodeId: edge.toNodeId === null || edge.toNodeId === undefined ? null : nodeIdMap.get(asString(edge.toNodeId)) ?? asString(edge.toNodeId),
      condition: (edge.condition as JsonObject | null) ?? null,
      sortOrder: asNumber(edge.sortOrder),
    }))
  }

  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]])
  // TODO: notify the API server here so connected POS clients invalidate this flow.
  return { flow: (await getFlow(flowId))! }
}

export async function replaceTargets(flowId: string, targets: JsonObject[]) {
  const values = targets.map((target) => ({
    flowId,
    mode: target.mode as "include" | "exclude",
    categoryId: asNullableString(target.categoryId),
    subcategoryId: asNullableString(target.subcategoryId),
    productId: asNullableString(target.productId),
    variantName: asNullableString(target.variantName),
  }))
  await db.batch([
    db.delete(flowTargets).where(eq(flowTargets.flowId, flowId)),
    ...(values.length === 0 ? [] : [db.insert(flowTargets).values(values)]),
  ])
  return getTargets(flowId)
}
