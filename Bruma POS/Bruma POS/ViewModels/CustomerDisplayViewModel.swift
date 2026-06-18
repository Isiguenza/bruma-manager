import Foundation
import SwiftUI
import Combine

struct CustomerDisplayItem: Identifiable {
    let name: String
    let qty: Int
    let unitPrice: Double
    let total: Double
    let modifiers: String
    
    var id: String { "\(name)|\(modifiers)" }
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
    @Published var orderType: String = ""
    @Published var carouselIndex: Int = 0
    // Payment details
    @Published var paymentMethod: String = "cash"
    @Published var tipAmount: Double = 0
    @Published var tipPercentage: Int = 0
    @Published var showCustomTip: Bool = false
    @Published var bankCLABE: String = ""
    @Published var bankName: String = ""
    @Published var bankBank: String = ""
    
    // Carousel state
    @Published var isPlaying: Bool = true
    @Published var carouselProgress: Double = 0
    @Published var slideDirection: Edge = .trailing
    var carouselImageNames: [String] = []
    var carouselDishNames: [String] = []
    
    private let socketService = SocketService.shared
    private var idleTimer: Task<Void, Never>?
    private var thankYouTimer: Task<Void, Never>?
    private var inactivityResumeTask: Task<Void, Never>?
    private var progressTimer: Timer?
    private var progressStart: Date?
    private let carouselInterval: TimeInterval = 5.0
    
    init() {
        socketService.joinCustomerDisplayRoom()
        
        socketService.onCustomerDisplayUpdate = { [weak self] dict in
            Task { @MainActor in
                self?.handleUpdate(dict)
            }
        }
    }
    
    deinit {
        progressTimer?.invalidate()
    }
    
    // MARK: - Carousel Control
    
    func setCarouselImages(_ items: [(imageName: String, dishName: String)]) {
        carouselImageNames = items.map { $0.imageName }
        carouselDishNames = items.map { $0.dishName }
        guard !carouselImageNames.isEmpty, isPlaying else { return }
        startProgressTimer()
    }
    
    func togglePlayPause() {
        if isPlaying {
            isPlaying = false
            progressTimer?.invalidate()
            progressTimer = nil
            inactivityResumeTask?.cancel()
        } else {
            isPlaying = true
            inactivityResumeTask?.cancel()
            startProgressTimer()
        }
    }
    
    func goNext() {
        guard !carouselImageNames.isEmpty else { return }
        isPlaying = false
        progressTimer?.invalidate()
        progressTimer = nil
        carouselProgress = 0
        slideDirection = .trailing
        withAnimation(.easeInOut(duration: 0.35)) {
            carouselIndex = (carouselIndex + 1) % carouselImageNames.count
        }
        scheduleInactivityResume()
    }
    
    func goPrev() {
        guard !carouselImageNames.isEmpty else { return }
        isPlaying = false
        progressTimer?.invalidate()
        progressTimer = nil
        carouselProgress = 0
        slideDirection = .leading
        withAnimation(.easeInOut(duration: 0.35)) {
            carouselIndex = (carouselIndex - 1 + carouselImageNames.count) % carouselImageNames.count
        }
        scheduleInactivityResume()
    }
    
    private func scheduleInactivityResume() {
        inactivityResumeTask?.cancel()
        inactivityResumeTask = Task {
            try? await Task.sleep(nanoseconds: 60_000_000_000) // 1 min
            guard !Task.isCancelled else { return }
            isPlaying = true
            startProgressTimer()
        }
    }
    
    private func startProgressTimer() {
        progressTimer?.invalidate()
        progressStart = Date()
        carouselProgress = 0
        let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.isPlaying else { return }
                guard let start = self.progressStart else { return }
                let elapsed = Date().timeIntervalSince(start)
                let p = min(elapsed / self.carouselInterval, 1.0)
                self.carouselProgress = p
                if p >= 1.0 { self.advanceSlide() }
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        progressTimer = timer
    }
    
    private func advanceSlide() {
        guard !carouselImageNames.isEmpty else { return }
        slideDirection = .trailing
        withAnimation(.easeInOut(duration: 0.6)) {
            carouselIndex = (carouselIndex + 1) % carouselImageNames.count
        }
        progressStart = Date()
        carouselProgress = 0
    }
    
    private func handleUpdate(_ dict: [String: Any]) {
        guard let modeStr = dict["mode"] as? String else { return }
        
        switch modeStr {
        case "active":
            idleTimer?.cancel()
            thankYouTimer?.cancel()
            customerName = dict["customerName"] as? String ?? ""
            orderNumber = dict["orderNumber"] as? String ?? ""
            orderType = dict["orderType"] as? String ?? ""
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
            
        case "payment":
            idleTimer?.cancel()
            thankYouTimer?.cancel()
            total = dict["total"] as? Double ?? total
            subtotal = dict["subtotal"] as? Double ?? subtotal
            paymentMethod = dict["paymentMethod"] as? String ?? "cash"
            tipAmount = dict["tipAmount"] as? Double ?? 0
            tipPercentage = dict["tipPercentage"] as? Int ?? 0
            showCustomTip = dict["showCustomTip"] as? Bool ?? false
            let receivedCLABE = dict["bankCLABE"] as? String
            let receivedName = dict["bankName"] as? String
            let receivedBank = dict["bankBank"] as? String
            print("📥 [CD Receive] payment - method: \(paymentMethod), bankCLABE: \(receivedCLABE ?? "nil"), bankName: \(receivedName ?? "nil"), bankBank: \(receivedBank ?? "nil")")
            bankCLABE = receivedCLABE ?? bankCLABE
            bankName = receivedName ?? bankName
            bankBank = receivedBank ?? bankBank
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
                guard !Task.isCancelled else { return }
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
            guard !Task.isCancelled else { return }
            withAnimation {
                self.mode = .idle
                self.items = []
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
