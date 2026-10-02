import Foundation

/// The database-free graph representation resolved by the API for both POS clients.
struct FlowGraph: Codable, Equatable {
    let productId: String
    let format: String
    let source: String
    let flows: [FlowSummary]
    let entryNodeId: String
    let nodes: [FlowNode]
    let edges: [FlowEdge]
}

struct FlowSummary: Codable, Equatable {
    let id: String
    let name: String
    let scopeKind: String
    let priority: Int
}

struct FlowNode: Codable, Equatable {
    let id: String
    let flowId: String
    let title: String
    let subtitle: String?
    let selectMode: String
    let minSelections: Int
    let maxSelections: Int?
    let includeNoneOption: Bool
    let noneLabel: String?
    let isEntry: Bool?
    let options: [FlowNodeOption]
}

struct FlowNodeOption: Codable, Equatable {
    let id: String
    let label: String
    let source: String
    let priceMode: String
    let effectivePrice: Double
    let refProductId: String?
    let refCategoryId: String?
    let refVariantName: String?
    let refListPrice: Double?
    let variantChoices: [FlowVariantChoice]?
    let emitsChildItem: Bool
    let isBeverage: Bool
    let refProductActive: Bool?
    let refCategoryActive: Bool?
}

struct FlowVariantChoice: Codable, Equatable {
    let name: String
    let price: Double
}

struct FlowEdge: Codable, Equatable {
    let id: String?
    let fromNodeId: String
    let fromOptionId: String?
    let toNodeId: String?
    let condition: FlowEdgeCondition?
    let sortOrder: Int
}

/// Every non-nil property narrows an edge match; all present properties are ANDed.
struct FlowEdgeCondition: Codable, Equatable {
    let variantNameIn: [String]?
    let productHasTag: String?
    let productIdIn: [String]?
    let categoryIdIn: [String]?
    let optionSelected: String?
}

struct FlowContext: Codable, Equatable {
    let productId: String
    let categoryId: String?
    let subcategoryId: String?
    let variantName: String?
    let flowTags: [String]
    let pathOptionIds: [String]
}

struct FlowPathVisit: Codable, Equatable {
    let nodeId: String
    let selectedOptionIds: [String]
}

typealias FlowPath = [FlowPathVisit]

struct FlowProduct: Codable, Equatable {
    let id: String
    let name: String
    let price: Double?
    let seat: String?
    /// Matches CartItem.course and order_items.course, both integer-valued.
    let course: Int?
}

struct FlowVariant: Codable, Equatable {
    let name: String
    let price: Double
}

struct BuiltParentItem: Codable, Equatable {
    let productId: String
    let productName: String
    let unitPrice: Double
    let subtotal: Double
    let packageLabel: String?
    let seat: String?
    let course: Int?
}

struct BuiltChildItem: Codable, Equatable {
    let productId: String
    let productName: String
    let unitPrice: Double
    let subtotal: Double
    let parentItemId: String
    let seat: String?
    let course: Int?
    let isBeverage: Bool
}

struct BuiltSelection: Codable, Equatable {
    let flowId: String
    let nodeId: String
    let optionId: String
    let nodeTitle: String
    let optionLabel: String
    let priceDelta: Double
    let refProductId: String?
    let refVariantName: String?
    let refListPrice: Double?
    let childItemIndex: Int?
    let sortOrder: Int
}

struct BuiltFlowItems: Codable, Equatable {
    let parent: BuiltParentItem
    let children: [BuiltChildItem]
    let selections: [BuiltSelection]
}

struct FlowProblem: Codable, Equatable {
    let severity: String
    let code: String
    let nodeId: String?
    let edgeId: String?
    let message: String
}
