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
    
    enum CodingKeys: String, CodingKey {
        case id, name, description, type, buyQuantity, getQuantity
        case discountPercentage, discountAmount, applyTo
        case productIds, categoryId, active
        case startDate, endDate, daysOfWeek, startTime, endTime
        case priority, comboRules
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        type = try container.decode(String.self, forKey: .type)
        buyQuantity = try container.decodeIfPresent(Int.self, forKey: .buyQuantity)
        getQuantity = try container.decodeIfPresent(Int.self, forKey: .getQuantity)
        
        // Handle discountPercentage as String or Double
        if let stringVal = try? container.decode(String.self, forKey: .discountPercentage) {
            discountPercentage = Double(stringVal)
        } else {
            discountPercentage = try container.decodeIfPresent(Double.self, forKey: .discountPercentage)
        }
        
        // Handle discountAmount as String or Double
        if let stringVal = try? container.decode(String.self, forKey: .discountAmount) {
            discountAmount = Double(stringVal)
        } else {
            discountAmount = try container.decodeIfPresent(Double.self, forKey: .discountAmount)
        }
        
        applyTo = try container.decode(String.self, forKey: .applyTo)
        productIds = try container.decodeIfPresent(String.self, forKey: .productIds)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        active = try container.decode(Bool.self, forKey: .active)
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        daysOfWeek = try container.decodeIfPresent(String.self, forKey: .daysOfWeek)
        startTime = try container.decodeIfPresent(String.self, forKey: .startTime)
        endTime = try container.decodeIfPresent(String.self, forKey: .endTime)
        priority = try container.decodeIfPresent(Int.self, forKey: .priority)
        comboRules = try container.decodeIfPresent(String.self, forKey: .comboRules)
    }
    
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

    // MARK: - Live schedule state (Promociones tab, iPad)
    //
    // Mirrors api-server/src/lib/promotionSchedule.ts field-by-field (same
    // precedence, same device-local time) so the tab's "En vivo/Programada"
    // split matches what the backend actually serves to the POS.

    private static let gregorian = Calendar(identifier: .gregorian)

    static let isoDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = gregorian
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let hhmmFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = gregorian
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()

    private static let dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

    static func friendlyDate(_ iso: String) -> String {
        guard let date = isoDateFormatter.date(from: iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }

    static func hhmm(_ date: Date) -> String { hhmmFormatter.string(from: date) }

    func scheduleInfo(now: Date = Date()) -> PromotionScheduleInfo {
        guard active else { return PromotionScheduleInfo(state: .paused, reason: "Pausada manualmente") }

        let todayISO = Self.isoDateFormatter.string(from: now)
        if let startDate, todayISO < startDate {
            return PromotionScheduleInfo(state: .scheduled, reason: "Empieza el \(Self.friendlyDate(startDate))")
        }
        if let endDate, todayISO > endDate {
            return PromotionScheduleInfo(state: .expired, reason: "Venció el \(Self.friendlyDate(endDate))")
        }

        let currentDay = Self.gregorian.component(.weekday, from: now) - 1 // 0=domingo, como JS getDay()
        let days = parsedDaysOfWeek
        let daysOk = days.isEmpty || days.contains(currentDay)

        let hhmm = Self.hhmm(now)
        let startTrim = startTime.map { String($0.prefix(5)) }
        let endTrim = endTime.map { String($0.prefix(5)) }
        let afterStart = startTrim.map { hhmm >= $0 } ?? true
        let beforeEnd = endTrim.map { hhmm <= $0 } ?? true

        if daysOk && afterStart && beforeEnd {
            return PromotionScheduleInfo(state: .live, reason: nil)
        }
        if !daysOk {
            let next = Self.nextAllowedDayLabel(days: days, from: currentDay)
            let suffix = startTrim.map { ", \($0)" } ?? ""
            return PromotionScheduleInfo(state: .scheduled, reason: "Próxima: \(next)\(suffix)")
        }
        if !afterStart, let s = startTrim {
            return PromotionScheduleInfo(state: .scheduled, reason: "Empieza hoy a las \(s)")
        }
        if !beforeEnd, let e = endTrim {
            return PromotionScheduleInfo(state: .scheduled, reason: "Termina hoy a las \(e) · vuelve mañana")
        }
        return PromotionScheduleInfo(state: .scheduled, reason: "Fuera de horario")
    }

    private static func nextAllowedDayLabel(days: [Int], from: Int) -> String {
        guard !days.isEmpty else { return "" }
        for i in 1...7 {
            let d = (from + i) % 7
            if days.contains(d) { return i == 1 ? "mañana" : dayNames[d] }
        }
        return ""
    }
}

enum PromotionLiveState { case live, scheduled, paused, expired }

struct PromotionScheduleInfo {
    let state: PromotionLiveState
    let reason: String?
}

struct ComboRule: Codable {
    let productId: String?         // legacy single product
    let productIds: [String]?      // multiple product options (OR)
    let categoryId: String?        // legacy single category
    let categoryIds: [String]?      // multiple category options (OR)
    let quantity: Int
    let variantNames: [String]?    // specific variant names to match (optional)
    
    /// All product IDs to check for this rule (legacy + array combined)
    var allProductIds: [String] {
        var ids: [String] = []
        if let productId = productId { ids.append(productId) }
        if let productIds = productIds { ids.append(contentsOf: productIds) }
        return ids
    }
    
    /// All category IDs to check for this rule (legacy + array combined)
    var allCategoryIds: [String] {
        var ids: [String] = []
        if let categoryId = categoryId { ids.append(categoryId) }
        if let categoryIds = categoryIds { ids.append(contentsOf: categoryIds) }
        return ids
    }
    
    /// Check if a cart item matches this rule considering variant names
    func matchesItem(_ item: CartItem) -> Bool {
        // Check product ID match
        if !allProductIds.isEmpty {
            guard allProductIds.contains(item.productId) else { return false }
            // If variant names specified, item must have a matching variant
            if let variantNames = variantNames, !variantNames.isEmpty {
                guard let itemVariant = item.variantName else { return false }
                return variantNames.contains(itemVariant)
            }
            return true
        }
        return false
    }
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
    
    init(id: String, name: String, description: String?, type: String, value: Double, requiresAuthorization: Bool, active: Bool) {
        self.id = id
        self.name = name
        self.description = description
        self.type = type
        self.value = value
        self.requiresAuthorization = requiresAuthorization
        self.active = active
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
    let customerLastName: String?
    let customerPhone: String?
    let customerEmail: String?
    let birthDate: String?
    let barcodeValue: String
    let stamps: Int
    let totalStamps: Int
    let rewardsAvailable: Int
    let rewardsRedeemed: Int
    let stampsPerReward: Int
    let active: Bool
    
    var displayName: String {
        let last = customerLastName ?? ""
        return last.isEmpty ? customerName : "\(customerName) \(last)"
    }
}

struct Reservation: Codable, Identifiable {
    let id: String
    let tableId: String?
    let customerName: String
    let customerPhone: String?
    let customerEmail: String?
    let guestCount: Int
    let reservationDate: String
    let reservationTime: String
    let duration: Int
    let status: String // "pending", "confirmed", "arrived", "cancelled", "no_show"
    let occasion: String?
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
