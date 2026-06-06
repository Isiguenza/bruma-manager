import Foundation

struct Promotion: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let type: String // "buy_x_get_y", "percentage_discount", "fixed_discount", "combo"
    let buyQuantity: Int?
    let getQuantity: Int?
    let discountPercentage: Double?
    let discountAmount: Double?
    let applyTo: String // "all_products", "specific_products", "category"
    let productIds: String? // JSON array
    let categoryId: String?
    let active: Bool
    let startDate: String?
    let endDate: String?
    let daysOfWeek: String? // JSON array
    let startTime: String?
    let endTime: String?
    let priority: Int?
    let comboRules: String? // JSON array: [{productId?, categoryId?, quantity}]
    
    var parsedProductIds: [String] {
        guard let productIds = productIds,
              let data = productIds.data(using: .utf8),
              let ids = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return ids
    }
    
    var parsedDaysOfWeek: [Int] {
        guard let daysOfWeek = daysOfWeek,
              let data = daysOfWeek.data(using: .utf8),
              let days = try? JSONDecoder().decode([Int].self, from: data) else { return [] }
        return days
    }
    
    var parsedComboRules: [ComboRule] {
        guard let comboRules = comboRules,
              let data = comboRules.data(using: .utf8),
              let rules = try? JSONDecoder().decode([ComboRule].self, from: data) else { return [] }
        return rules
    }
}

struct ComboRule: Codable {
    let productId: String?
    let categoryId: String?
    let quantity: Int
}

struct Discount: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let type: String // "percentage", "fixed_amount", "flexible"
    let value: Double
    let requiresAuthorization: Bool
    let active: Bool
    
    enum CodingKeys: String, CodingKey {
        case id, name, description, type, value, requiresAuthorization, active
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        type = try container.decode(String.self, forKey: .type)
        requiresAuthorization = try container.decode(Bool.self, forKey: .requiresAuthorization)
        active = try container.decode(Bool.self, forKey: .active)
        
        // Decode value as String or Double
        if let stringValue = try? container.decode(String.self, forKey: .value) {
            value = Double(stringValue) ?? 0
        } else {
            value = try container.decode(Double.self, forKey: .value)
        }
    }
}

struct LoyaltyCard: Codable, Identifiable {
    let id: String
    let customerName: String
    let customerPhone: String?
    let customerEmail: String?
    let barcodeValue: String
    let stamps: Int
    let totalStamps: Int
    let rewardsAvailable: Int
    let rewardsRedeemed: Int
    let stampsPerReward: Int
    let active: Bool
}

struct Reservation: Codable, Identifiable {
    let id: String
    let tableId: String
    let customerName: String
    let customerPhone: String?
    let guestCount: Int
    let reservationDate: String
    let reservationTime: String
    let duration: Int
    let status: String // "pending", "confirmed", "arrived", "cancelled", "no_show"
    let notes: String?
    let createdAt: String?
    let updatedAt: String?
    let table: ReservationTable?
}

struct ReservationTable: Codable {
    let id: String
    let number: String
    let name: String?
    let capacity: Int
}
