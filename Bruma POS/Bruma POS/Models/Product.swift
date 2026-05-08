import Foundation

struct ProductVariant: Codable, Identifiable {
    var id: String { name }
    let name: String
    let price: String
    let platformPrice: String?
    
    var numericPrice: Double {
        Double(price) ?? 0
    }
    
    var numericPlatformPrice: Double {
        guard let pp = platformPrice else { return numericPrice }
        return Double(pp) ?? numericPrice
    }
}

struct Product: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let price: String
    let platformPrice: String?
    let categoryId: String?
    let groupId: String?
    let hasVariants: Bool
    let variants: String? // JSON string of ProductVariant[]
    let active: Bool
    let category: ProductCategory?
    let imageUrl: String?
    
    var parsedVariants: [ProductVariant] {
        guard let variants = variants,
              let data = variants.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([ProductVariant].self, from: data)) ?? []
    }
    
    var numericPrice: Double {
        Double(price) ?? 0
    }
    
    var numericPlatformPrice: Double {
        guard let pp = platformPrice else { return numericPrice }
        return Double(pp) ?? numericPrice
    }
}

struct ProductCategory: Codable {
    let id: String
    let name: String
    let isBeverage: Bool?
}

struct Category: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let color: String?
    let icon: String?
    let sortOrder: Int
    let active: Bool
    let isBeverage: Bool?
}

struct Frosting: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let price: String?
    let active: Bool
    
    var numericPrice: Double { Double(price ?? "0") ?? 0 }
}

struct DryTopping: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let price: String?
    let active: Bool
    
    var numericPrice: Double { Double(price ?? "0") ?? 0 }
}

struct Extra: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let price: String
    let active: Bool
    
    var numericPrice: Double { Double(price) ?? 0 }
}
