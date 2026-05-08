import Foundation
import SwiftUI
import Combine

@MainActor
class CashRegisterViewModel: ObservableObject {
    @Published var register: CashRegister?
    @Published var loading = false
    @Published var paidOrders: [Order] = []
    @Published var loadingOrders = false
    
    // Modals
    @Published var showOpenDialog = false
    @Published var showCloseDialog = false
    @Published var showDepositDialog = false
    @Published var showWithdrawDialog = false
    @Published var showOrdersHistory = false
    
    // Toast
    @Published var toastMessage: String?
    @Published var toastIsError = false
    
    var actualTotalSales: Double {
        paidOrders.reduce(0.0) { sum, order in
            sum + (Double(order.total ?? "0") ?? 0)
        }
    }
    
    var actualCashSales: Double {
        paidOrders.filter { $0.paymentMethod == "cash" }
            .reduce(0.0) { sum, order in sum + (Double(order.total ?? "0") ?? 0) }
    }
    
    var actualTerminalSales: Double {
        paidOrders.filter { $0.paymentMethod == "card" || $0.paymentMethod == "terminal_mercadopago" }
            .reduce(0.0) { sum, order in sum + (Double(order.total ?? "0") ?? 0) }
    }
    
    var actualTransferSales: Double {
        paidOrders.filter { $0.paymentMethod == "transfer" }
            .reduce(0.0) { sum, order in sum + (Double(order.total ?? "0") ?? 0) }
    }
    
    var expectedCash: Double {
        guard let register = register else { return 0 }
        let initial = Double(register.initialCash) ?? 0
        let deposits = Double(register.deposits) ?? 0
        let withdrawals = Double(register.withdrawals) ?? 0
        return initial + actualCashSales - withdrawals + deposits
    }
    
    func loadData() async {
        loading = true
        do {
            register = try await APIService.shared.fetchCurrentCashRegister()
            if let reg = register {
                await loadPaidOrders(registerId: reg.id)
            }
        } catch {
            print("Error loading cash register:", error)
        }
        loading = false
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
    
    func openRegister(initialCash: Double, employeeId: String) async {
        do {
            register = try await APIService.shared.openCashRegister(initialCash: initialCash, employeeId: employeeId)
            showToast("Caja abierta")
            showOpenDialog = false
        } catch {
            showToast("Error abriendo caja", isError: true)
        }
    }
    
    func closeRegister(registerId: String, body: [String: Any]) async {
        do {
            try await APIService.shared.closeCashRegister(registerId: registerId, body: body)
            showToast("Caja cerrada exitosamente")
            showCloseDialog = false
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
    
    func showToast(_ message: String, isError: Bool = false) {
        toastMessage = message
        toastIsError = isError
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            toastMessage = nil
        }
    }
}
