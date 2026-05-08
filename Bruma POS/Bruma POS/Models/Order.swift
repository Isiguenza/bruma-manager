import Foundation

struct Order: Codable, Identifiable {
    let id: String
    let orderNumber: Int
    let status: String // "pending", "preparing", "ready", "delivered", "cancelled"
    let subtotal: String?
    let total: String?
    let paymentStatus: String?
    let customerName: String?
    let tableId: String?
    let tableName: String?
    let tableNumber: String?
    let employeeName: String?
    let createdAt: String?
    let items: [OrderItem]?
    let splitBillData: String?
    let paymentMethod: String?
    let tip: String?
    let discountAmount: String?
    let discountName: String?
    
    var displayName: String {
        if let name = customerName, !name.isEmpty {
            return name
        }
        return "Orden #\(orderNumber)"
    }
    
    var statusLabel: String {
        switch status {
        case "preparing": return "Preparando"
        case "ready": return "Listo"
        case "delivered": return "Entregado"
        case "cancelled": return "Cancelado"
        default: return "Pendiente"
        }
    }
    
    var statusColor: String {
        switch status {
        case "preparing": return "orange"
        case "ready": return "green"
        case "delivered": return "blue"
        case "cancelled": return "red"
        default: return "gray"
        }
    }
    
    var isPlatformDelivery: Bool {
        guard let name = customerName else { return false }
        return name.hasPrefix("Uber") || name.hasPrefix("Rappi") || name.hasPrefix("Didi")
    }
    
    var detectedPlatform: String? {
        guard let name = customerName else { return nil }
        if name.hasPrefix("Uber") { return "Uber" }
        if name.hasPrefix("Rappi") { return "Rappi" }
        if name.hasPrefix("Didi") { return "Didi" }
        return nil
    }
}

struct OrderItem: Codable, Identifiable {
    let id: String
    let orderId: String
    let productId: String
    let productName: String
    let quantity: Int
    let unitPrice: String
    let subtotal: String
    let notes: String?
    let frostingId: String?
    let frostingName: String?
    let dryToppingId: String?
    let dryToppingName: String?
    let extraId: String?
    let extraName: String?
    let customModifiers: String?
    let seat: String?
    let course: Int?
    let deliveredToTable: Bool?
    let voided: Bool?
    let createdAt: String?
    let isGuest: Bool?
    
    var numericUnitPrice: Double { Double(unitPrice) ?? 0 }
    var numericSubtotal: Double { Double(subtotal) ?? 0 }
}

struct CartItem: Identifiable {
    let id = UUID()
    let productId: String
    let productName: String
    var unitPrice: Double
    var quantity: Int
    var notes: String
    var frostingId: String?
    var frostingName: String?
    var dryToppingId: String?
    var dryToppingName: String?
    var extraId: String?
    var extraName: String?
    var customModifiers: String?
    var seat: String // "A1", "A2", ... or "C" (shared)
    var course: Int // 1, 2, 3...
    var sentToKitchen: Bool
    var orderId: String?
    var itemId: String?
    var isBeverage: Bool
    var orderStatus: String? // "pending", "preparing", "ready", "delivered"
    var deliveredToTable: Bool
    
    // Promotion fields
    var promotionId: String?
    var promotionName: String?
    var originalPrice: Double?
    var promotionDiscount: Double?
    
    // Guest fields
    var isGuest: Bool
    
    var total: Double {
        unitPrice * Double(quantity)
    }
    
    var modifierSummary: String {
        var parts: [String] = []
        if let f = frostingName { parts.append(f) }
        if let t = dryToppingName { parts.append(t) }
        if let e = extraName { parts.append(e) }
        if let cm = customModifiers,
           let data = cm.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for (_, value) in json {
                if let stepDict = value as? [String: Any],
                   let options = stepDict["options"] as? [[String: Any]] {
                    for opt in options {
                        if let name = opt["name"] as? String {
                            parts.append(name)
                        }
                    }
                }
            }
        }
        return parts.joined(separator: " · ")
    }
    
    static func fromOrderItem(_ item: OrderItem, orderId: String) -> CartItem {
        CartItem(
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.numericUnitPrice,
            quantity: item.quantity,
            notes: item.notes ?? "",
            frostingId: item.frostingId,
            frostingName: item.frostingName,
            dryToppingId: item.dryToppingId,
            dryToppingName: item.dryToppingName,
            extraId: item.extraId,
            extraName: item.extraName,
            customModifiers: item.customModifiers,
            seat: item.seat ?? "C",
            course: item.course ?? 1,
            sentToKitchen: true,
            orderId: orderId,
            itemId: item.id,
            isBeverage: false,
            orderStatus: nil,
            deliveredToTable: item.deliveredToTable ?? false,
            isGuest: item.isGuest ?? false
        )
    }
}
