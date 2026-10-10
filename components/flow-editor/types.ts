import type { FlowEdgeCondition, FlowGraph, FlowNode, FlowNodeOption } from "@/lib/flows/types"

export type OptionSource = "manual" | "product" | "category"
export type PriceMode = "free" | "product_price" | "delta"
export type ChildFlowMode = "inherit" | "none" | "custom"

export interface PriceOverride {
  id?: string
  categoryId: string | null
  subcategoryId: string | null
  productId: string | null
  priceDelta: string
}

export interface EditorOption {
  id: string
  source: OptionSource
  label: string | null
  refProductId: string | null
  refCategoryId: string | null
  refVariantName: string | null
  allowVariantChoice: boolean
  variantPriceDeltas: Record<string, string>
  /** Switched-off squares: `<productId>` or `<productId>::<variant>`. */
  hiddenRefs: string[]
  childFlowMode: ChildFlowMode
  childFlowId: string | null
  /** Products of a category option that do not open their own flow. */
  subflowHiddenRefs: string[]
  priceMode: PriceMode
  priceDelta: string
  emitsChildItem: boolean
  sortOrder: number
  active: boolean
  priceOverrides: PriceOverride[]
}

export interface EditorNode {
  id: string
  title: string
  subtitle: string | null
  selectMode: "single" | "multi"
  minSelections: number
  maxSelections: number | null
  includeNoneOption: boolean
  noneLabel: string | null
  isEntry: boolean
  posX: number
  posY: number
  sortOrder: number
  active: boolean
  options: EditorOption[]
}

export interface EditorEdge {
  id: string
  fromNodeId: string
  fromOptionId: string | null
  toNodeId: string | null
  condition: FlowEdgeCondition | null
  sortOrder: number
}

export interface FlowDefinition {
  id: string
  name: string
  description: string | null
  scopeKind: "global" | "category" | "subcategory" | "product"
  priority: number
  active: boolean
  parentFlowId: string | null
}

export interface FlowTarget {
  id?: string
  mode: "include" | "exclude"
  categoryId: string | null
  subcategoryId: string | null
  productId: string | null
  /** Only on a product exclude: takes one variant out of the flow. */
  variantName: string | null
  targetKind?: string
  targetName?: string
}

export interface SubflowSummary {
  id: string
  name: string
  active: boolean
}

export interface FlowDocument {
  definition: FlowDefinition
  nodes: EditorNode[]
  edges: EditorEdge[]
  targets: FlowTarget[]
  subflows: SubflowSummary[]
}

/** Row of `GET /api/flows`, enough to know which flow a product would inherit. */
export interface FlowListItem {
  id: string
  name: string
  scopeKind: FlowDefinition["scopeKind"]
  active: boolean
  parentFlowId: string | null
  targets: FlowTarget[]
}

export const temporaryId = (kind: "node" | "option" | "edge") => `tmp-${kind}-${crypto.randomUUID()}`

const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped API payload, narrowed right here */
/** The API returns nullable JSON columns; the editor always works with concrete lists. */
export function normalizeDocument(raw: any): FlowDocument {
  return {
    definition: { ...raw.definition, parentFlowId: raw.definition.parentFlowId ?? null },
    targets: (raw.targets ?? []).map((target: any) => ({ ...target, variantName: target.variantName ?? null })),
    subflows: raw.subflows ?? [],
    edges: raw.edges ?? [],
    nodes: (raw.nodes ?? []).map((node: any) => ({
      ...node,
      options: (node.options ?? []).map((option: any) => ({
        ...option,
        variantPriceDeltas: option.variantPriceDeltas ?? {},
        hiddenRefs: list(option.hiddenRefs),
        subflowHiddenRefs: list(option.subflowHiddenRefs),
        childFlowMode: option.childFlowMode === "none" || option.childFlowMode === "custom" ? option.childFlowMode : "inherit",
        childFlowId: option.childFlowId ?? null,
        priceOverrides: option.priceOverrides ?? [],
      })),
    })),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function newOption(sortOrder: number, patch: Partial<EditorOption> = {}): EditorOption {
  return {
    id: temporaryId("option"),
    source: "manual",
    label: "",
    refProductId: null,
    refCategoryId: null,
    refVariantName: null,
    allowVariantChoice: false,
    variantPriceDeltas: {},
    hiddenRefs: [],
    childFlowMode: "inherit",
    childFlowId: null,
    subflowHiddenRefs: [],
    priceMode: "delta",
    priceDelta: "0",
    emitsChildItem: false,
    sortOrder,
    active: true,
    priceOverrides: [],
    ...patch,
  }
}

export function toValidationGraph(document: FlowDocument, evidence?: { products?: Map<string, boolean>; categories?: Map<string, boolean> }): FlowGraph {
  const nodes: FlowNode[] = document.nodes.map((node) => ({
    id: node.id,
    flowId: document.definition.id,
    title: node.title,
    subtitle: node.subtitle,
    selectMode: node.selectMode,
    minSelections: node.minSelections,
    maxSelections: node.maxSelections,
    includeNoneOption: node.includeNoneOption,
    noneLabel: node.noneLabel,
    isEntry: node.isEntry,
    options: node.options.map((option): FlowNodeOption => ({
      id: option.id,
      label: option.label ?? "",
      source: option.source,
      priceMode: option.priceMode,
      effectivePrice: Number(option.priceDelta) || 0,
      refProductId: option.refProductId,
      refCategoryId: option.refCategoryId,
      refVariantName: option.refVariantName,
      variantChoices: null,
      emitsChildItem: option.emitsChildItem,
      isBeverage: false,
      refProductActive: option.refProductId === null ? undefined : evidence?.products?.get(option.refProductId),
      refCategoryActive: option.refCategoryId === null ? undefined : evidence?.categories?.get(option.refCategoryId),
    })),
  }))
  return {
    productId: "",
    format: "graph",
    source: "editor",
    flows: [{ id: document.definition.id, name: document.definition.name, scopeKind: document.definition.scopeKind, priority: document.definition.priority }],
    entryNodeId: nodes.find((node) => node.isEntry)?.id ?? "",
    nodes,
    edges: document.edges.map((edge) => ({ id: edge.id, fromNodeId: edge.fromNodeId, fromOptionId: edge.fromOptionId, toNodeId: edge.toNodeId, condition: edge.condition, sortOrder: edge.sortOrder })),
  }
}
