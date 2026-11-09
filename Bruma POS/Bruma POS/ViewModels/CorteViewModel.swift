import Foundation
import Combine

class CorteViewModel: ObservableObject {
    @Published var corteData: CorteData?
    @Published var loading = false
    @Published var error: String?
    @Published var showPrintSheet = false
    
    func loadCorte(registerId: String) async {
        loading = true
        error = nil
        
        do {
            let data = try await APIService.shared.fetchCorte(registerId: registerId)
            DispatchQueue.main.async {
                self.corteData = data
                self.loading = false
            }
        } catch {
            DispatchQueue.main.async {
                self.error = "Error cargando corte: \(error.localizedDescription)"
                self.loading = false
            }
        }
    }
    
    // MARK: - Computed Properties
    
    var hasData: Bool {
        corteData != nil
    }
    
    var totalNetSales: Double {
        guard let data = corteData else { return 0 }
        return data.sales.cash + data.sales.transfer + data.sales.netCard + data.sales.netOnline
    }

    var totalNetTips: Double {
        guard let data = corteData else { return 0 }
        return data.tips.cash + data.tips.transfer + data.tips.netCard + data.tips.netOnline
    }
    
    var cashExpected: Double {
        guard let data = corteData else { return 0 }
        return data.sales.cash + data.tips.cash + data.movements.deposits.total - data.movements.withdrawals.total + data.register.initialCash
    }
    
    var differenceAmount: Double {
        guard let data = corteData, let finalCash = data.summary.finalCash else { return 0 }
        return finalCash - cashExpected
    }
    
    // MARK: - Formatting
    
    func formatCurrency(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "$"
        formatter.locale = Locale(identifier: "es-MX")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
    
    func formatPercentage(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "\(value * 100)%"
    }
    
    // MARK: - Print
    
    /// `employeeNames` (id → nombre) resuelve quién abrió la caja: el corte solo
    /// trae el id. `printedBy` es el empleado activo en el POS.
    /// Regresa `false` si el print-server no respondió OK.
    @discardableResult
    func printCorte(employeeNames: [String: String] = [:], printedBy: String? = nil) async -> Bool {
        guard let data = corteData else { return false }
        let movementItems: (CorteMovement) -> [[String: Any]] = { movement in
            movement.items.map { ["amount": $0.amount, "description": $0.description ?? "", "createdAt": $0.createdAt] }
        }
        var register: [String: Any] = [
            "openedAt": data.register.openedAt,
            "initialCash": data.register.initialCash
        ]
        if let openedBy = data.register.openedBy, let name = employeeNames[openedBy] {
            register["openedByName"] = name
        }
        
        guard let url = URL(string: "\(APIService.shared.printServerURL)/print-corte") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "register": register,
            "sales": [
                "total": data.sales.total,
                "cash": data.sales.cash,
                "card": data.sales.card,
                "transfer": data.sales.transfer,
                "online": data.sales.online,
                "netCard": data.sales.netCard,
                "netOnline": data.sales.netOnline
            ],
            "tips": [
                "total": data.tips.total,
                "cash": data.tips.cash,
                "card": data.tips.card,
                "transfer": data.tips.transfer,
                "online": data.tips.online,
                "netCard": data.tips.netCard,
                "netOnline": data.tips.netOnline
            ],
            "commissions": [
                "rateWithIVA": data.commissions.rateWithIVA,
                "total": data.commissions.total,
                "online": [
                    "rateWithIVA": data.commissions.online.rateWithIVA,
                    "fixedFeeWithIVA": data.commissions.online.fixedFeeWithIVA,
                    "total": data.commissions.online.total
                ]
            ],
            "movements": [
                "deposits": [
                    "total": data.movements.deposits.total,
                    "count": data.movements.deposits.count,
                    "items": movementItems(data.movements.deposits)
                ],
                "withdrawals": [
                    "total": data.movements.withdrawals.total,
                    "count": data.movements.withdrawals.count,
                    "items": movementItems(data.movements.withdrawals)
                ]
            ],
            "summary": [
                "totalOrders": data.summary.totalOrders,
                "splitOrders": data.summary.splitOrders,
                "expectedCash": data.summary.expectedCash,
                "finalCash": data.summary.finalCash ?? 0
            ]
        ]
        if let printedBy, !printedBy.isEmpty { body["printedBy"] = printedBy }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return (200..<300).contains(http.statusCode)
    }
}
