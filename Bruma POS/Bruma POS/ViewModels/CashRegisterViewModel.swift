import Foundation
import SwiftUI
import Combine

enum PaymentMethodFilter: String, CaseIterable {
    case all = "Todas"
    case cash = "Efectivo"
    case card = "Terminal"
    case transfer = "Transferencia"
}

@MainActor
class CashRegisterViewModel: ObservableObject {
    @Published var register: CashRegister?
    @Published var loading = false
    @Published var paidOrders: [Order] = []
    @Published var loadingOrders = false
    
    // MARK: - Filters & Search
    @Published var orderSearchQuery = ""
    @Published var paymentFilter: PaymentMethodFilter = .all
    @Published var lastUpdated: Date?
    
    // MARK: - Transactions
    @Published var transactions: [CashRegisterTransaction] = []
    @Published var loadingTransactions = false
    
    // MARK: - Closure History
    @Published var closureHistory: [CashRegister] = []
    @Published var loadingClosures = false
    @Published var showClosureHistory = false
    
    // Modals
    @Published var showOpenDialog = false
    @Published var showCloseDialog = false
    @Published var showDepositDialog = false
    @Published var showWithdrawDialog = false
    @Published var showOrdersHistory = false
    
    // Toast
    @Published var toastMessage: String?
    @Published var toastIsError = false
    
    // Authentication
    @Published var isAuthenticated = false
    @Published var pinError = ""
    @Published var verifyingPin = false
    
    // MARK: - Order Detail
    @Published var selectedOrder: Order?
    @Published var showOrderDetail = false
    
    // MARK: - Quick Cash Count
    @Published var showQuickCount = false
    @Published var quickCashInput = ""
    
    var quickCashDifference: Double {
        let counted = Double(quickCashInput.replacingOccurrences(of: ",", with: "")) ?? 0
        return counted - expectedCash
    }
    
    // Auto-refresh
    private var refreshTimer: Timer?
    
    // MARK: - Inactivity Timeout
    private var inactivityTimer: Timer?
    
    // MARK: - Computed Sales
    
    var actualTotalSales: Double {
        filteredOrders.reduce(0.0) { sum, order in
            sum + (Double(order.total ?? "0") ?? 0)
        }
    }
    
    func sales(for paymentMethod: String?) -> Double {
        guard let method = paymentMethod else { return actualTotalSales }
        return paidOrders.filter { $0.paymentMethod == method }
            .reduce(0.0) { sum, order in sum + (Double(order.total ?? "0") ?? 0) }
    }
    
    var actualCashSales: Double { sales(for: "cash") }
    var actualTerminalSales: Double {
        sales(for: "card") + sales(for: "terminal_mercadopago")
    }
    var actualTransferSales: Double { sales(for: "transfer") }
    
    var expectedCash: Double {
        guard let register = register else { return 0 }
        let initial = Double(register.initialCash) ?? 0
        let deposits = Double(register.deposits) ?? 0
        let withdrawals = Double(register.withdrawals) ?? 0
        return initial + actualCashSales - withdrawals + deposits
    }
    
    // MARK: - Filtered Orders
    
    var filteredOrders: [Order] {
        var result = paidOrders
        
        // Payment method filter
        switch paymentFilter {
        case .cash:
            result = result.filter { $0.paymentMethod == "cash" }
        case .card:
            result = result.filter { $0.paymentMethod == "card" || $0.paymentMethod == "terminal_mercadopago" }
        case .transfer:
            result = result.filter { $0.paymentMethod == "transfer" }
        case .all:
            break
        }
        
        // Search
        if !orderSearchQuery.isEmpty {
            let query = orderSearchQuery.lowercased()
            result = result.filter { order in
                String(order.orderNumber).contains(query) ||
                (order.customerName?.lowercased().contains(query) ?? false) ||
                (order.tableNumber?.lowercased().contains(query) ?? false)
            }
        }
        
        return result
    }
    
    // MARK: - Grouped Orders
    
    var ordersByPaymentMethod: [(method: String, label: String, color: Color, orders: [Order])] {
        let methods: [(String, String, Color)] = [
            ("cash", "Efectivo", .green),
            ("card", "Terminal", .blue),
            ("terminal_mercadopago", "Terminal", .blue),
            ("transfer", "Transferencia", .purple)
        ]
        
        var groups: [(String, String, Color, [Order])] = []
        for (method, label, color) in methods {
            let orders = filteredOrders.filter { $0.paymentMethod == method }
            if !orders.isEmpty {
                if let existingIndex = groups.firstIndex(where: { $0.0 == method }) {
                    groups[existingIndex].3.append(contentsOf: orders)
                } else {
                    groups.append((method, label, color, orders))
                }
            }
        }
        return groups
    }
    
    // MARK: - Data Loading
    
    func loadData() async {
        loading = true
        do {
            register = try await APIService.shared.fetchCurrentCashRegister()
            if let reg = register {
                await loadPaidOrders(registerId: reg.id)
                await loadTransactions(registerId: reg.id)
            }
        } catch {
            print("Error loading cash register:", error)
        }
        loading = false
        lastUpdated = Date()
    }
    
    func loadPaidOrders(registerId: String) async {
        loadingOrders = true
        do {
            paidOrders = try await APIService.shared.fetchOrdersHistory(registerId: registerId)
        } catch {
            print("Error loading orders:", error)
        }
        loadingOrders = false
    }
    
    func loadTransactions(registerId: String) async {
        loadingTransactions = true
        do {
            let report = try await APIService.shared.fetchCashRegisterReport(registerId: registerId)
            if let txs = report["transactions"] as? [[String: Any]] {
                transactions = txs.compactMap { dict in
                    guard let id = dict["id"] as? String,
                          let type = dict["type"] as? String,
                          let amount = dict["amount"] as? String,
                          let createdAt = dict["createdAt"] as? String else { return nil }
                    return CashRegisterTransaction(
                        id: id,
                        type: type,
                        amount: amount,
                        paymentMethod: dict["paymentMethod"] as? String,
                        description: dict["description"] as? String,
                        createdAt: createdAt
                    )
                }
            }
        } catch {
            print("Error loading transactions:", error)
        }
        loadingTransactions = false
    }
    
    func loadClosureHistory() async {
        loadingClosures = true
        // TODO: Backend endpoint needed
        // closureHistory = try await APIService.shared.fetchCashRegisterHistory()
        loadingClosures = false
    }
    
    // MARK: - Auto Refresh
    
    func startAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            Task { @MainActor in
                if self.register != nil {
                    await self.loadData()
                }
            }
        }
    }
    
    func stopAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }
    
    // MARK: - Inactivity
    
    func startInactivityTimer() {
        inactivityTimer?.invalidate()
        inactivityTimer = Timer.scheduledTimer(withTimeInterval: 120.0, repeats: false) { _ in
            Task { @MainActor in
                self.isAuthenticated = false
                self.pinError = ""
                self.stopAutoRefresh()
            }
        }
    }
    
    func resetInactivityTimer() {
        guard isAuthenticated else { return }
        startInactivityTimer()
    }
    
    func stopInactivityTimer() {
        inactivityTimer?.invalidate()
        inactivityTimer = nil
    }
    
    // MARK: - Actions
    
    func openRegister(initialCash: Double, employeeId: String) async {
        do {
            register = try await APIService.shared.openCashRegister(initialCash: initialCash, employeeId: employeeId)
            showToast("Caja abierta")
            showOpenDialog = false
            startAutoRefresh()
            startInactivityTimer()
        } catch {
            showToast("Error abriendo caja", isError: true)
        }
    }
    
    func closeRegister(registerId: String, body: [String: Any]) async {
        do {
            try await APIService.shared.closeCashRegister(registerId: registerId, body: body)
            showToast("Caja cerrada exitosamente")
            showCloseDialog = false
            stopAutoRefresh()
            stopInactivityTimer()
            quickCashInput = ""
            await loadData()
        } catch {
            showToast("Error cerrando caja", isError: true)
        }
    }
    
    func deposit(registerId: String, amount: Double, userId: String, description: String) async {
        do {
            try await APIService.shared.depositToCashRegister(registerId: registerId, amount: amount, userId: userId, description: description)
            showToast("Depósito registrado")
            showDepositDialog = false
            await loadData()
        } catch {
            showToast("Error registrando depósito", isError: true)
        }
    }
    
    func withdraw(registerId: String, amount: Double, userId: String, description: String) async {
        do {
            try await APIService.shared.withdrawFromCashRegister(registerId: registerId, amount: amount, userId: userId, description: description)
            showToast("Sangría registrada")
            showWithdrawDialog = false
            await loadData()
        } catch {
            showToast("Error registrando sangría", isError: true)
        }
    }
    
    func deleteOrder(orderId: String, reason: String) async -> Bool {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/orders/\(orderId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["reason": reason])
            
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                throw APIError.serverError
            }
            
            showToast("Orden eliminada")
            await loadData()
            return true
        } catch {
            showToast("Error eliminando orden", isError: true)
            return false
        }
    }
    
    // MARK: - Authentication
    
    func verifyPin(_ pin: String) async -> Bool {
        verifyingPin = true
        pinError = ""
        
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/employees/verify-pin")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["pin": pin])
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "", code: -1)
            }
            
            if httpResponse.statusCode == 200 {
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                let employee = json?["employee"] as? [String: Any]
                let role = employee?["role"] as? String
                
                if role == "admin" || role == "manager" {
                    isAuthenticated = true
                    verifyingPin = false
                    startInactivityTimer()
                    await loadData()
                    return true
                } else {
                    pinError = "Solo administradores pueden acceder a Caja"
                }
            } else {
                pinError = "PIN incorrecto"
            }
        } catch {
            pinError = "Error verificando PIN"
        }
        
        verifyingPin = false
        return false
    }
    
    // MARK: - Formatting
    
    func formatCurrency(_ amount: String) -> String {
        guard let value = Double(amount) else { return "$0.00" }
        return formatCurrency(value)
    }
    
    func formatCurrency(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "MXN"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: NSNumber(value: amount)) ?? "$0.00"
    }
    
    func formatDateTime(_ dateString: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        guard let date = isoFormatter.date(from: dateString) else {
            isoFormatter.formatOptions = [.withInternetDateTime]
            guard let date = isoFormatter.date(from: dateString) else { return "N/A" }
            let formatter = DateFormatter()
            formatter.dateFormat = "dd MMM HH:mm"
            formatter.locale = Locale(identifier: "es_MX")
            return formatter.string(from: date)
        }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "dd MMM HH:mm"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date)
    }
    
    func showToast(_ message: String, isError: Bool = false) {
        toastMessage = message
        toastIsError = isError
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            toastMessage = nil
        }
    }
}
