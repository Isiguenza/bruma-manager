import Foundation
import SwiftUI
import Combine

enum PaymentMethodFilter: String, CaseIterable {
    case all = "Todas"
    case cash = "Efectivo"
    case card = "Terminal"
    case transfer = "Transferencia"
    case online = "Online"
    case split = "Dividida"
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
    
    // Only deposits and withdrawals (not sales)
    var cashMovements: [CashRegisterTransaction] {
        transactions.filter { $0.type == "deposit" || $0.type == "withdrawal" }
    }
    
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
    
    // MARK: - Corte
    @Published var showCorte = false

    // MARK: - Resumen
    @Published var showResumen = false
    
    var quickCashDifference: Double {
        let counted = Double(quickCashInput.replacingOccurrences(of: ",", with: "")) ?? 0
        return counted - expectedCash
    }
    
    // Auto-refresh
    private var refreshTimer: Timer?
    
    // MARK: - Inactivity Timeout
    private var inactivityTimer: Timer?
    
    // MARK: - Computed Sales
    
    // MARK: - Sales & Tips (computed from paidOrders for accuracy)
    
    var totalTips: Double {
        paidOrders.reduce(0.0) { sum, order in sum + (Double(order.tip ?? "0") ?? 0) }
    }
    
    var actualTotalSales: Double {
        paidOrders.reduce(0.0) { sum, order in sum + (Double(order.total ?? "0") ?? 0) }
    }
    
    // MARK: - Desglose de efectivo (replica exacta del Corte, fuente de verdad)
    //
    // El Corte (backend) es la referencia. Estas computeds replican su método
    // para que el cliente coincida incluso offline:
    //   • los pagos divididos se leen de `order.payments` (método por pago),
    //   • las ventas usan el SUBTOTAL (las propinas van aparte por su método),
    //   • las propinas en efectivo se cuentan UNA sola vez,
    //   • los movimientos salen en vivo de `transactions`.

    /// (cash, card, transfer, cashTips) — subtotales por método y propinas por
    /// método real, considerando pagos divididos. Espeja al Corte.
    private var cashBreakdown: (cash: Double, card: Double, transfer: Double, cashTips: Double) {
        var cash = 0.0, card = 0.0, transfer = 0.0, cashTips = 0.0
        for order in paidOrders {
            if let payments = order.payments, !payments.isEmpty {
                // Orden dividida: sumar cada pago por su propio método.
                for p in payments {
                    let amount = Double(p.amount) ?? 0
                    let tip = Double(p.tip ?? "0") ?? 0
                    let method = p.paymentMethod
                    let tipMethod = p.tipPaymentMethod ?? method
                    switch method {
                    case "cash": cash += amount
                    case "card", "terminal_mercadopago": card += amount
                    case "transfer": transfer += amount
                    default: break
                    }
                    if tipMethod == "cash" { cashTips += tip }
                }
            } else {
                // Pago único: la venta es el subtotal (sin propina).
                let total = Double(order.total ?? "0") ?? 0
                let tip = Double(order.tip ?? "0") ?? 0
                let parsedSub = Double(order.subtotal ?? "0") ?? 0
                let subtotal = parsedSub > 0 ? parsedSub : (total - tip)
                let method = order.paymentMethod
                let tipMethod = order.tipPaymentMethod ?? method
                switch method {
                case "cash": cash += subtotal
                case "card", "terminal_mercadopago": card += subtotal
                case "transfer": transfer += subtotal
                default: break
                }
                if tipMethod == "cash" { cashTips += tip }
            }
        }
        return (cash, card, transfer, cashTips)
    }

    /// Ventas en efectivo (subtotal, sin propina) — igual que Corte `sales.cash`.
    var actualCashSales: Double { cashBreakdown.cash }

    /// Ventas con terminal (subtotal, sin propina) — igual que Corte `sales.card`.
    var actualTerminalSales: Double { cashBreakdown.card }

    /// Ventas con transferencia (subtotal) — igual que Corte `sales.transfer`.
    var actualTransferSales: Double { cashBreakdown.transfer }

    /// Propinas cobradas en efectivo (de cualquier orden), contadas una sola vez —
    /// igual que Corte `tips.cash`.
    var actualCashTips: Double { cashBreakdown.cashTips }

    /// Depósitos y sangrías en vivo desde las transacciones (como el Corte).
    private var depositsTotal: Double {
        transactions.filter { $0.type == "deposit" }.reduce(0.0) { $0 + (Double($1.amount) ?? 0) }
    }
    private var withdrawalsTotal: Double {
        transactions.filter { $0.type == "withdrawal" }.reduce(0.0) { $0 + (Double($1.amount) ?? 0) }
    }

    /// Efectivo esperado en caja — misma fórmula que el Corte: fondo inicial +
    /// ventas efectivo (subtotal) + propinas efectivo + depósitos − sangrías.
    var expectedCash: Double {
        guard let register = register else { return 0 }
        let initial = Double(register.initialCash) ?? 0
        let b = cashBreakdown
        return initial + b.cash + b.cashTips + depositsTotal - withdrawalsTotal
    }

    // MARK: - Resumen (operativo, sin dinero)

    /// Órdenes para llevar (sin mesa asignada).
    var takeoutOrdersCount: Int {
        paidOrders.filter { $0.tableId == nil }.count
    }

    /// Órdenes en mesa.
    var tableOrdersCount: Int {
        paidOrders.filter { $0.tableId != nil }.count
    }

    /// Productos vendidos agrupados por nombre (incluye variantes), de mayor a
    /// menor cantidad. Mismo patrón que usaba `printSummary`.
    var productsSold: [(name: String, qty: Int)] {
        var counts: [String: Int] = [:]
        for order in paidOrders {
            for item in order.items ?? [] {
                counts[item.productName, default: 0] += item.quantity
            }
        }
        return counts
            .map { (name: $0.key, qty: $0.value) }
            .sorted { $0.qty > $1.qty }
    }

    var totalProductsSold: Int {
        productsSold.reduce(0) { $0 + $1.qty }
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
        case .online:
            result = result.filter { $0.paymentMethod == "online" }
        case .split:
            result = result.filter { $0.isSplitPayment }
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
            ("transfer", "Transferencia", .purple),
            ("online", "Online", .teal)
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
        // Add split orders group
        let splitOrders = filteredOrders.filter { $0.isSplitPayment }
        if !splitOrders.isEmpty {
            groups.append(("split", "Dividida", .orange, splitOrders))
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

    /// Agrega/edita la propina de una orden ya pagada. Recarga para reflejar
    /// el nuevo total en la barrita (el corte se recarga desde la vista).
    func addTip(orderId: String, tip: Double, tipPaymentMethod: String) async -> Bool {
        do {
            try await APIService.shared.addTipToOrder(orderId: orderId, tip: tip, tipPaymentMethod: tipPaymentMethod)
            showToast("Propina agregada")
            await loadData()
            return true
        } catch {
            showToast("Error al agregar propina", isError: true)
            return false
        }
    }

    /// Reembolsa (anula) una orden pagada con PIN de gerente. En la tab de Caja
    /// todas las órdenes están pagadas, por eso el "matar" desde aquí es refund.
    func refundOrder(orderId: String, reason: String, pin: String) async -> Bool {
        do {
            try await APIService.shared.refundOrder(orderId: orderId, pin: pin, reason: reason)
            showToast("Orden reembolsada")
            await loadData()
            return true
        } catch {
            showToast("PIN inválido o error al reembolsar", isError: true)
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
