import type { FlowEdgeCondition, FlowGraph, FlowNode, FlowNodeOption, Problem } from "@/lib/flows/types"

export type OptionSource = "manual" | "product" | "category"
export type PriceMode = "free" | "product_price" | "delta"
export interface PriceOverride { id?: string; categoryId: string | null; subcategoryId: string | null; productId: string | null; priceDelta: string }
export interface EditorOption { id: string; source: OptionSource; label: string | null; refProductId: string | null; refCategoryId: string | null; refVariantName: string | null; allowVariantChoice: boolean; variantPriceDeltas: Record<string, string>; priceMode: PriceMode; priceDelta: string; emitsChildItem: boolean; sortOrder: number; active: boolean; priceOverrides: PriceOverride[] }
export interface EditorNode { id: string; title: string; subtitle: string | null; selectMode: "single" | "multi"; minSelections: number; maxSelections: number | null; includeNoneOption: boolean; noneLabel: string | null; isEntry: boolean; posX: number; posY: number; sortOrder: number; active: boolean; options: EditorOption[] }
export interface EditorEdge { id: string; fromNodeId: string; fromOptionId: string | null; toNodeId: string | null; condition: FlowEdgeCondition | null; sortOrder: number }
export interface FlowDefinition { id: string; name: string; description: string | null; scopeKind: "global" | "category" | "subcategory" | "product"; priority: number; active: boolean }
export interface FlowTarget { id?: string; mode: "include" | "exclude"; categoryId: string | null; subcategoryId: string | null; productId: string | null; targetKind?: string; targetName?: string }
export interface FlowDocument { definition: FlowDefinition; nodes: EditorNode[]; edges: EditorEdge[]; targets: FlowTarget[] }
export const temporaryId = (kind: "node" | "option" | "edge") => `tmp-${kind}-${crypto.randomUUID()}`

export function toValidationGraph(document: FlowDocument, evidence?: { products?: Map<string, boolean>; categories?: Map<string, boolean> }): FlowGraph {
  const nodes: FlowNode[] = document.nodes.map((node) => ({ id: node.id, flowId: document.definition.id, title: node.title, subtitle: node.subtitle, selectMode: node.selectMode, minSelections: node.minSelections, maxSelections: node.maxSelections, includeNoneOption: node.includeNoneOption, noneLabel: node.noneLabel, isEntry: node.isEntry, options: node.options.map((option): FlowNodeOption => ({ id: option.id, label: option.label ?? "", source: option.source, priceMode: option.priceMode, effectivePrice: Number(option.priceDelta) || 0, refProductId: option.refProductId, refCategoryId: option.refCategoryId, refVariantName: option.refVariantName, variantChoices: null, emitsChildItem: option.emitsChildItem, isBeverage: false, refProductActive: option.refProductId === null ? undefined : evidence?.products?.get(option.refProductId), refCategoryActive: option.refCategoryId === null ? undefined : evidence?.categories?.get(option.refCategoryId) })) }))
  return { productId: "", format: "graph", source: "editor", flows: [{ id: document.definition.id, name: document.definition.name, scopeKind: document.definition.scopeKind, priority: document.definition.priority }], entryNodeId: nodes.find((node) => node.isEntry)?.id ?? "", nodes, edges: document.edges.map((edge) => ({ id: edge.id, fromNodeId: edge.fromNodeId, fromOptionId: edge.fromOptionId, toNodeId: edge.toNodeId, condition: edge.condition, sortOrder: edge.sortOrder })) }
}

export function problemIds(problems: Problem[]) { return { nodes: new Set(problems.filter((problem) => problem.severity === "error" && problem.nodeId).map((problem) => problem.nodeId!)), edges: new Set(problems.filter((problem) => problem.severity === "error" && problem.edgeId).map((problem) => problem.edgeId!)) } }
