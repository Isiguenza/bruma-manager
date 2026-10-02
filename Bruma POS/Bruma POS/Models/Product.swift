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
    let subcategoryId: String?
    let groupId: String?
    let hasVariants: Bool
    let variants: String? // JSON string of ProductVariant[]
    let active: Bool
    let category: ProductCategory?
    let imageUrl: String?
    let flowTags: [String]

    init(
        id: String,
        name: String,
        description: String?,
        price: String,
        platformPrice: String?,
        categoryId: String?,
        subcategoryId: String?,
        groupId: String?,
        hasVariants: Bool,
        variants: String?,
        active: Bool,
        category: ProductCategory?,
        imageUrl: String?,
        flowTags: [String] = []
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.price = price
        self.platformPrice = platformPrice
        self.categoryId = categoryId
        self.subcategoryId = subcategoryId
        self.groupId = groupId
        self.hasVariants = hasVariants
        self.variants = variants
        self.active = active
        self.category = category
        self.imageUrl = imageUrl
        self.flowTags = flowTags
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, description, price, platformPrice, categoryId, subcategoryId, groupId, hasVariants, variants, active, category, imageUrl, flowTags
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        description = try values.decodeIfPresent(String.self, forKey: .description)
        price = try values.decode(String.self, forKey: .price)
        platformPrice = try values.decodeIfPresent(String.self, forKey: .platformPrice)
        categoryId = try values.decodeIfPresent(String.self, forKey: .categoryId)
        subcategoryId = try values.decodeIfPresent(String.self, forKey: .subcategoryId)
        groupId = try values.decodeIfPresent(String.self, forKey: .groupId)
        hasVariants = try values.decodeIfPresent(Bool.self, forKey: .hasVariants) ?? false
        variants = try values.decodeIfPresent(String.self, forKey: .variants)
        active = try values.decodeIfPresent(Bool.self, forKey: .active) ?? true
        category = try values.decodeIfPresent(ProductCategory.self, forKey: .category)
        imageUrl = try values.decodeIfPresent(String.self, forKey: .imageUrl)
        flowTags = try values.decodeIfPresent([String].self, forKey: .flowTags) ?? []
    }
    
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
    let subcategories: [Subcategory]?
}

struct Subcategory: Codable, Identifiable {
    let id: String
    let name: String
    let sortOrder: Int
    let active: Bool
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
