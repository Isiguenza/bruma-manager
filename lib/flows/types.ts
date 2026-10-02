/** The resolved, database-free graph sent to every flow client. */
export interface FlowGraph {
  productId: string
  format: "graph"
  source: string
  flows: FlowSummary[]
  entryNodeId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface FlowSummary {
  id: string
  name: string
  scopeKind: "global" | "category" | "subcategory" | "product"
  priority: number
}

export interface FlowNode {
  id: string
  flowId: string
  title: string
  subtitle: string | null
  selectMode: "single" | "multi"
  minSelections: number
  maxSelections: number | null
  includeNoneOption: boolean
  noneLabel: string | null
  isEntry?: boolean
  options: FlowNodeOption[]
}

export interface FlowNodeOption {
  id: string
  label: string
  source: "manual" | "product" | "category"
  priceMode: "free" | "product_price" | "delta"
  effectivePrice: number
  refProductId: string | null
  refCategoryId?: string | null
  refVariantName: string | null
  /** Resolved menu price of refProductId/variant, retained only for reporting. */
  refListPrice?: number | null
  variantChoices: FlowVariantChoice[] | null
  emitsChildItem: boolean
  isBeverage: boolean
  /** Optional resolver evidence used by the pure graph validator. */
  refProductActive?: boolean
  /** Optional resolver evidence used by the pure graph validator. */
  refCategoryActive?: boolean
}

export interface FlowVariantChoice {
  name: string
  price: number
}

export interface FlowEdge {
  /** Edges from the HTTP representation do not require an id. */
  id?: string
  fromNodeId: string
  fromOptionId: string | null
  toNodeId: string | null
  condition: FlowEdgeCondition | null
  sortOrder: number
}

export interface FlowEdgeCondition {
  variantNameIn?: string[]
  productHasTag?: string
  productIdIn?: string[]
  categoryIdIn?: string[]
  optionSelected?: string
}

export interface FlowContext {
  productId: string
  categoryId: string | null
  subcategoryId: string | null
  variantName: string | null
  flowTags: string[]
  pathOptionIds: string[]
}

export interface FlowPathVisit {
  nodeId: string
  selectedOptionIds: string[]
}

export type FlowPath = FlowPathVisit[]

export interface FlowProduct {
  id: string
  name: string
  price?: number
  seat?: string | null
  course?: number | null
}

export interface FlowVariant {
  name: string
  price: number
}

export interface BuiltParentItem {
  productId: string
  productName: string
  unitPrice: number
  subtotal: number
  packageLabel: string | null
  seat: string | null
  course: number | null
}

export interface BuiltChildItem {
  productId: string
  productName: string
  unitPrice: 0
  subtotal: 0
  parentItemId: "parent"
  seat: string | null
  course: number | null
  isBeverage: boolean
}

export interface BuiltSelection {
  flowId: string
  nodeId: string
  optionId: string
  nodeTitle: string
  optionLabel: string
  priceDelta: number
  refProductId: string | null
  refVariantName: string | null
  refListPrice: number | null
  childItemIndex: number | null
  sortOrder: number
}

export interface Problem {
  severity: "error" | "warning"
  code: string
  nodeId?: string
  edgeId?: string
  message: string
}
