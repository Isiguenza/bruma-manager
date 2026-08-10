import Foundation

struct Order: Codable, Identifiable {
    let id: String
    let orderNumber: Int
    let status: String // "pending", "preparing", "ready", "delivered", "cancelled"
    let subtotal: String?
    let total: String?
    let paymentStatus: String?
    let customerName: String?
    let guestCount: Int?
    let tableId: String?
    let tableName: String?
    let tableNumber: String?
    let employeeName: String?
    let userId: String?
    let source: String?
    let createdAt: String?
    let items: [OrderItem]?
    let splitBillData: String?
    let paymentMethod: String?
    let tip: String?
    let tipPaymentMethod: String?
    let discountAmount: String?
    let discountName: String?
    let payments: [OrderPayment]?
    let priority: Int?      // 0=normal, 1=rush
    let onHold: Bool?       // true if order is on hold

    // Pedidos en línea (web + Stripe)
    let customerPhone: String?
    let deliveryType: String?     // "pickup" | "delivery"
    let deliveryAddress: String?
    let deliveryLat: String?
    let deliveryLng: String?
    let estimatedReadyMinutes: Int?

    var isSplitPayment: Bool {
        (payments?.count ?? 0) > 1
    }
    
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

struct OrderPayment: Codable, Identifiable {
    let id: String
    let orderId: String
    let sequenceNumber: Int
    let paymentMethod: String
    let amount: String
    let tip: String?
    let tipPaymentMethod: String?
    let createdAt: String?
    
    var displayMethod: String {
        switch paymentMethod {
        case "cash": return "Efectivo"
        case "card", "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return paymentMethod
        }
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
    let promotionId: String?
    let promotionName: String?
    let originalPrice: String?
    let promotionDiscount: String?

    var numericUnitPrice: Double { Double(unitPrice) ?? 0 }
    var numericSubtotal: Double { Double(subtotal) ?? 0 }
    var numericOriginalPrice: Double? { originalPrice.flatMap { Double($0) } }
    var numericPromotionDiscount: Double? { promotionDiscount.flatMap { Double($0) } }

    /// Parses `customModifiers` into `{name, price}` entries for display on customer-facing
    /// tickets (reprint), mirroring `POSViewModel.parseModifiersForTicket`.
    var modifiersForTicket: [[String: Any]] {
        guard let cm = customModifiers,
              let data = cm.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        var mods: [[String: Any]] = []
        for (_, value) in json {
            if let stepData = value as? [String: Any],
               let options = stepData["options"] as? [[String: Any]] {
                for opt in options {
                    guard let name = opt["name"] as? String else { continue }
                    let price = (opt["price"] as? String).flatMap { Double($0) } ?? (opt["price"] as? Double) ?? 0
                    if price > 0 {
                        mods.append(["name": name, "price": String(format: "%.2f", price)])
                    }
                }
            }
        }
        return mods
    }
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
    
    // Variant field
    var variantName: String?
    
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
        // Parse variant name from productName if it follows "Product - Variant" format
        var variantName: String? = nil
        let components = item.productName.split(separator: " - ", maxSplits: 1)
        if components.count == 2 {
            variantName = String(components[1])
        }
        
        return CartItem(
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
            variantName: variantName,
            promotionId: item.promotionId,
            promotionName: item.promotionName,
            originalPrice: item.numericOriginalPrice,
            promotionDiscount: item.numericPromotionDiscount,
            isGuest: item.isGuest ?? false
        )
    }
}
