import Foundation

// MARK: - Corte Data Models

struct CorteData: Codable {
    let register: CorteRegister
    let sales: CorteSales
    let tips: CorteTips
    let commissions: CorteCommissions
    let movements: CorteMovements
    let summary: CorteSummary
    let notes: CorteNotes
}

struct CorteRegister: Codable {
    let id: String
    let openedAt: String
    let closedAt: String?
    let openedBy: String?
    let closedBy: String?
    let status: String
    let initialCash: Double
}

struct CorteSales: Codable {
    let total: Double
    let cash: Double
    let card: Double
    let transfer: Double
    let platformDelivery: Double
    let netCard: Double
}

struct CorteTips: Codable {
    let total: Double
    let cash: Double
    let card: Double
    let transfer: Double
    let netCard: Double
}

struct CorteCommissions: Codable {
    let rate: Double
    let rateWithIVA: Double
    let total: Double
    let salesCommission: Double
    let tipsCommission: Double
}

struct CorteMovements: Codable {
    let deposits: CorteMovement
    let withdrawals: CorteMovement
}

struct CorteMovement: Codable {
    let count: Int
    let total: Double
    let items: [CorteMovementItem]
}

struct CorteMovementItem: Codable, Identifiable {
    let id: String
    let amount: Double
    let description: String?
    let createdAt: String
    
    var displayDate: String {
        guard let date = ISO8601DateFormatter().date(from: createdAt) else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.locale = Locale(identifier: "es-MX")
        return formatter.string(from: date)
    }
}

struct CorteSummary: Codable {
    let totalOrders: Int
    let cashOrders: Int
    let cardOrders: Int
    let transferOrders: Int
    let splitOrders: Int
    let expectedCash: Double
    let finalCash: Double?
    let difference: Double?
}

struct CorteNotes: Codable {
    let opening: String?
    let closure: String?
}

// MARK: - Split Payment Models

struct SplitPayment: Identifiable, Codable {
    let id: UUID
    var paymentMethod: String
    var amount: Double
    var tip: Double
    var tipPaymentMethod: String?
    var sequenceNumber: Int
    
    var displayMethod: String {
        switch paymentMethod {
        case "cash": return "Efectivo"
        case "card": return "Tarjeta"
        case "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return paymentMethod
        }
    }
    
    var displayTipMethod: String? {
        guard let method = tipPaymentMethod else { return nil }
        switch method {
        case "cash": return "Efectivo"
        case "card": return "Tarjeta"
        case "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return method
        }
    }
    
    init(id: UUID = UUID(), paymentMethod: String, amount: Double, tip: Double = 0, tipPaymentMethod: String? = nil, sequenceNumber: Int = 1) {
        self.id = id
        self.paymentMethod = paymentMethod
        self.amount = amount
        self.tip = tip
        self.tipPaymentMethod = tipPaymentMethod
        self.sequenceNumber = sequenceNumber
    }
}

// MARK: - Formatters

extension Double {
    func formattedCurrency() -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "$"
        formatter.locale = Locale(identifier: "es-MX")
        return formatter.string(from: NSNumber(value: self)) ?? "\(self)"
    }
    
    func formattedPercentage() -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: self)) ?? "\(self * 100)%"
    }
}
