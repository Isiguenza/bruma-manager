import Foundation

struct ModifierOption: Codable, Identifiable {
    let id: String
    let stepId: String
    let name: String
    let description: String?
    let price: String
    let sortOrder: Int
    let active: Bool
    
    var numericPrice: Double {
        Double(price) ?? 0
    }
}

struct ModifierStep: Codable, Identifiable {
    let id: String
    let categoryId: String?  // Optional to support product flows
    let stepType: String // "frosting", "topping", "extra", "custom", "products", "category"
    let stepName: String
    let sortOrder: Int
    let isRequired: Bool
    let allowMultiple: Bool
    let includeNoneOption: Bool
    let active: Bool
    let options: [ModifierOption]?
}

struct CategoryFlow: Codable {
    let categoryId: String
    let useDefaultFlow: Bool
    let steps: [ModifierStep]
}
