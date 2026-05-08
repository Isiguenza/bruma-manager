import Foundation

struct CashRegister: Codable, Identifiable {
    let id: String
    let openedAt: String
    let closedAt: String?
    let initialCash: String
    let finalCash: String?
    let expectedCash: String?
    let totalSales: String
    let cashSales: String
    let terminalSales: String
    let transferSales: String
    let deposits: String
    let withdrawals: String
    let status: String // "open" | "closed"
    let openedBy: String
    let closedBy: String?
}

struct CashRegisterTransaction: Codable, Identifiable {
    let id: String
    let type: String // "sale" | "deposit" | "withdrawal"
    let amount: String
    let paymentMethod: String?
    let description: String?
    let createdAt: String
}
