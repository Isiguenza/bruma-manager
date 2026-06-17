import Foundation
import SwiftUI
import Combine

struct CustomerDisplayItem: Identifiable {
    let id = UUID()
    let name: String
    let qty: Int
    let unitPrice: Double
    let total: Double
    let modifiers: String
}

@MainActor
class CustomerDisplayViewModel: ObservableObject {
    
    enum DisplayMode {
        case idle
        case active
        case payment
        case thankYou
    }
    
    @Published var mode: DisplayMode = .idle
    @Published var items: [CustomerDisplayItem] = []
    @Published var subtotal: Double = 0
    @Published var total: Double = 0
    @Published var customerName: String = ""
    @Published var orderNumber: String = ""
    @Published var carouselIndex: Int = 0
    
    private let socketService = SocketService.shared
    private var idleTimer: Task<Void, Never>?
    private var thankYouTimer: Task<Void, Never>?
    private var carouselTimer: Task<Void, Never>?
    var carouselImageNames: [String] = []
    
    init() {
        socketService.joinCustomerDisplayRoom()
        
        socketService.onCustomerDisplayUpdate = { [weak self] dict in
            Task { @MainActor in
                self?.handleUpdate(dict)
            }
        }
        
        startCarousel()
    }
    
    private func handleUpdate(_ dict: [String: Any]) {
        guard let modeStr = dict["mode"] as? String else { return }
        
        switch modeStr {
        case "active":
            idleTimer?.cancel()
            customerName = dict["customerName"] as? String ?? ""
            orderNumber = dict["orderNumber"] as? String ?? ""
            subtotal = dict["subtotal"] as? Double ?? 0
            total = dict["total"] as? Double ?? 0
            if let rawItems = dict["items"] as? [[String: Any]] {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                    items = rawItems.compactMap { item in
                        guard let name = item["name"] as? String,
                              let qty = item["qty"] as? Int else { return nil }
                        return CustomerDisplayItem(
                            name: name,
                            qty: qty,
                            unitPrice: item["unitPrice"] as? Double ?? 0,
                            total: item["total"] as? Double ?? 0,
                            modifiers: item["modifiers"] as? String ?? ""
                        )
                    }
                    mode = .active
                }
            }
            scheduleIdleTimeout()
            
        case "payment":
            idleTimer?.cancel()
            withAnimation(.easeInOut(duration: 0.5)) {
                mode = .payment
            }
            
        case "idle", "paid":
            idleTimer?.cancel()
            thankYouTimer?.cancel()
            thankYouTimer = Task {
                withAnimation(.easeInOut(duration: 0.5)) {
                    self.mode = .thankYou
                }
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                withAnimation(.easeInOut(duration: 0.5)) {
                    self.items = []
                    self.customerName = ""
                    self.orderNumber = ""
                    self.total = 0
                    self.subtotal = 0
                    self.mode = .idle
                }
            }
            
        default: break
        }
    }
    
    private func scheduleIdleTimeout() {
        idleTimer?.cancel()
        idleTimer = Task {
            try? await Task.sleep(nanoseconds: 120_000_000_000) // 2 min
            withAnimation {
                self.mode = .idle
                self.items = []
            }
        }
    }
    
    private func startCarousel() {
        carouselTimer?.cancel()
        carouselTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !carouselImageNames.isEmpty else { continue }
                withAnimation(.easeInOut(duration: 0.8)) {
                    carouselIndex = (carouselIndex + 1) % carouselImageNames.count
                }
            }
        }
    }
    
    func formattedPrice(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "$"
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "$\(Int(value))"
    }
}
