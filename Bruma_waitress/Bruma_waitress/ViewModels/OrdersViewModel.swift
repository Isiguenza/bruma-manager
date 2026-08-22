import Foundation
import Combine

@MainActor
class OrdersViewModel: ObservableObject {
    @Published var orders: [Order] = []
    @Published var loading: Bool = false
    
    private var timer: Timer?
    
    func startPolling() {
        fetchOrders()
        // 10s: red de seguridad — el socket (order:updated/order:items_ready)
        // es la vía principal para que esto se sienta instantáneo.
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.fetchOrders() }
        }
    }
    
    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }
    
    func fetchOrders() {
        Task {
            do {
                let fetched = try await APIService.shared.fetchActiveOrders()
                self.orders = fetched.sorted {
                    ($0.createdAt ?? "") > ($1.createdAt ?? "")
                }
            } catch {
                print("Error fetching orders:", error)
            }
        }
    }
}
