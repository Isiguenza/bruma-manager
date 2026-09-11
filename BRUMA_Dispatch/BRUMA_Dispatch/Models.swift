//
//  Models.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import Foundation

// MARK: - Order
struct Order: Codable, Identifiable {
    let id: String
    let orderNumber: Int
    let status: String
    let total: String
    let paymentStatus: String
    let paymentMethod: String?
    let customerName: String?
    let notes: String?
    let tableId: String?
    let createdAt: String
    let updatedAt: String
    let items: [OrderItem]?
    let table: Table?
    let preparationTime: Int?
    let priority: Int?         // 0=normal, 1=rush
    let onHold: Bool?
    let holdStartedAt: String?
    let holdAccumulatedSeconds: Int?
    let isPractice: Bool?      // Modo Práctica (Bruma POS Mobile) — orden real, solo entrenamiento
}

// MARK: - OrderItem
struct OrderItem: Identifiable {
    let id: String
    let orderId: String
    let productId: String
    let productName: String
    let quantity: Int
    let unitPrice: String
    let subtotal: String
    let notes: String?
    let voided: Bool?
    let course: Int?
    let seat: String?
    let frostingName: String?
    let dryToppingName: String?
    let extraName: String?
    let customModifiers: String?
    let product: Product?
    let createdAt: String?
    let deliveredToTable: Bool?
    let isBeverage: Bool?  // categoría es bebida O flujo del producto marcado como bebida

    /// Bebida efectiva: usa el flag del backend (categoría o flujo) y cae a la
    /// categoría por compatibilidad si el backend no lo mandó.
    var effectiveIsBeverage: Bool {
        isBeverage ?? (product?.category?.isBeverage ?? false)
    }
}

extension OrderItem: Codable {
    enum CodingKeys: String, CodingKey {
        case id, orderId, productId, productName, quantity, unitPrice, subtotal
        case notes, voided, course, seat
        case frostingName, dryToppingName, extraName, customModifiers
        case product, createdAt, deliveredToTable, isBeverage
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        orderId = try container.decode(String.self, forKey: .orderId)
        productId = try container.decode(String.self, forKey: .productId)
        productName = try container.decode(String.self, forKey: .productName)
        quantity = try container.decode(Int.self, forKey: .quantity)
        unitPrice = try container.decode(String.self, forKey: .unitPrice)
        subtotal = try container.decode(String.self, forKey: .subtotal)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        voided = try container.decodeIfPresent(Bool.self, forKey: .voided)
        course = try container.decodeIfPresent(Int.self, forKey: .course)
        seat = try container.decodeIfPresent(String.self, forKey: .seat)
        frostingName = try container.decodeIfPresent(String.self, forKey: .frostingName)
        dryToppingName = try container.decodeIfPresent(String.self, forKey: .dryToppingName)
        extraName = try container.decodeIfPresent(String.self, forKey: .extraName)
        customModifiers = try container.decodeIfPresent(String.self, forKey: .customModifiers)
        product = try container.decodeIfPresent(Product.self, forKey: .product)
        deliveredToTable = try container.decodeIfPresent(Bool.self, forKey: .deliveredToTable)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        isBeverage = try container.decodeIfPresent(Bool.self, forKey: .isBeverage)
    }
}

// MARK: - OrderBatch (grupo de items enviados juntos)
struct OrderBatch: Identifiable {
    let id: String
    let orderId: String
    let orderNumber: Int
    let items: [OrderItem]
    let createdAt: String
    let table: Table?
    let customerName: String?
    let preparationTime: Int?
    var isRush: Bool = false
    var isOnHold: Bool = false
    var holdAccumulatedSeconds: Int = 0
    var isPractice: Bool = false
    
    // Effective elapsed minutes excluding hold time
    var effectiveElapsedMinutes: Double {
        guard let date = parseDate(createdAt) else { return 0 }
        let total = Date().timeIntervalSince(date)
        let effective = max(0, total - Double(holdAccumulatedSeconds))
        return effective / 60.0
    }
    
    var urgency: OrderUrgency {
        let elapsed = effectiveElapsedMinutes
        if elapsed < 4 { return .normal }
        if elapsed < 7 { return .attention }
        if elapsed < 10 { return .warning }
        return .urgent
    }
    
    private func parseDate(_ dateString: String) -> Date? {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSZ",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ssZ",
        ]
        
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        
        for format in formats {
            df.dateFormat = format
            if let date = df.date(from: dateString) {
                return date
            }
        }
        
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: dateString) {
            return date
        }
        
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: dateString)
    }
}

// MARK: - CompletedOrder (franja de "recién completadas" con deshacer)
struct CompletedOrder: Identifiable {
    let id: String          // orderId
    let orderNumber: Int
    let label: String       // "Mesa 5" / "Llevar - Juan"
    let itemIds: [String]
    let completedAt: Date
}

// MARK: - Product
struct Product: Codable {
    let id: String
    let categoryId: String?
    let category: Category?
}

// MARK: - Category
struct Category: Codable {
    let id: String
    let name: String
    let isBeverage: Bool?
}

// MARK: - Table
struct Table: Codable {
    let id: String
    let number: String
    let status: String
    let guestCount: Int?
}

// MARK: - Custom Modifiers
struct CustomModifier: Codable {
    let stepName: String
    let options: [ModifierOption]
}

struct ModifierOption: Codable {
    let name: String
}

// MARK: - Order Urgency
enum OrderUrgency {
    case normal   // < 4 min
    case attention // 4-7 min
    case warning  // 7-10 min
    case urgent   // > 10 min
    
    var color: String {
        switch self {
        case .normal: return "gray"
        case .attention: return "yellow"
        case .warning: return "orange"
        case .urgent: return "red"
        }
    }
}
