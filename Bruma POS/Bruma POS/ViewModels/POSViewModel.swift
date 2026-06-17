import Foundation
import SwiftUI
import Combine

@MainActor
class POSViewModel: ObservableObject {
    
    // MARK: - WebSocket & Network
    private let socketService = SocketService.shared
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - App State
    enum AppScreen { case dashboard, tableSelection, pos }
    @Published var currentScreen: AppScreen = .dashboard
    @Published var activeView: String = "pos" // "pos" or "reservations"
    @Published var selectedTab: Int = 0 // Tab selection: 0=Mesas, 1=Caja, 2=Reservas, 3=Empleados
    @Published var loading = false
    @Published var toastMessage: String?
    @Published var toastIsError = false
    
    // MARK: - Auth
    enum AuthStep: String { case idle, pin }
    @Published var authStep: AuthStep = .idle
    @Published var pin = ""
    @Published var employeeId: String?
    @Published var employeeName: String?
    @Published var authenticating = false
    @Published var cashRegisterOpen = false
    @Published var checkingRegister = false
    @Published var lastActivity = Date()
    
    // MARK: - Config
    @Published var config = POSConfig.load()
    @Published var showSettings = false
    
    // MARK: - Tables
    @Published var tables: [Table] = []
    @Published var selectedTable: Table?
    @Published var tablesWithReadyItems: Set<String> = []
    @Published var tableFilter: TableFilter = .all
    @Published var tableSearchQuery = ""
    
    enum TableFilter: String, CaseIterable {
        case all = "Todas"
        case available = "Libres"
        case occupied = "Ocupadas"
        case reserved = "Reservadas"
    }
    
    var filteredTables: [Table] {
        var result = tables.filter { !config.disabledTableIds.contains($0.id) }
        
        // Filter by status
        switch tableFilter {
        case .all: break
        case .available: result = result.filter { $0.isAvailable }
        case .occupied: result = result.filter { $0.isOccupied }
        case .reserved: result = result.filter { $0.isReserved }
        }
        
        // Filter by search
        if !tableSearchQuery.isEmpty {
            let query = tableSearchQuery.lowercased()
            result = result.filter {
                $0.number.lowercased().contains(query) ||
                ($0.name?.lowercased().contains(query) ?? false)
            }
        }
        
        // Sort by number numerically (not alphabetically so "10" comes after "9")
        return result.sorted {
            (Int($0.number) ?? 0) < (Int($1.number) ?? 0)
        }
    }
    
    // MARK: - Delivery
    @Published var deliveryOrders: [Order] = []
    @Published var platformDeliveryOrders: [Order] = []
    @Published var customerName = ""
    @Published var showCustomerNameDialog = false
    
    // MARK: - Products & Categories
    @Published var products: [Product] = []
    @Published var categories: [Category] = []
    @Published var frostings: [Frosting] = []
    @Published var toppings: [DryTopping] = []
    @Published var extras: [Extra] = []
    @Published var selectedCategory: String?
    @Published var searchQuery = ""
    
    // MARK: - Modifier Flow
    @Published var categoryFlow: CategoryFlow?
    @Published var currentStepIndex = -1
    @Published var stepSelections: [String: Any] = [:]
    @Published var selectedProduct: Product?
    @Published var selectedFrosting: Frosting?
    @Published var selectedTopping: DryTopping?
    @Published var selectedExtras: [Extra] = []
    @Published var productNotes = ""
    
    // MARK: - Variant Dialog
    @Published var showVariantDialog = false
    @Published var selectedProductForVariant: Product?
    
    // MARK: - Notes Dialog
    @Published var showNotesDialog = false
    @Published var pendingCartItem: CartItem?
    @Published var tempNotes = ""
    
    // MARK: - Cart
    @Published var cart: [CartItem] = []
    @Published var activeSeat = "C"
    @Published var activeCourse = 1
    @Published var guestCount = 1
    @Published var currentOrderId: String?
    @Published var submitting = false
    
    // MARK: - Guest Count Dialog
    @Published var showGuestCountDialog = false
    @Published var showInitialGuestDialog = false
    @Published var tempGuestCount = 1
    
    // MARK: - Void
    @Published var showVoidDialog = false
    @Published var voidItemIndex: Int?
    @Published var voidReason = ""
    
    // MARK: - Change Item
    @Published var showChangeItemDialog = false
    @Published var changeItemIndex: Int?
    
    // MARK: - Transfer Table
    @Published var showTransferTableDialog = false
    @Published var showingReleaseConfirmation = false
    
    // MARK: - Offline Mode
    @Published var isOffline = false
    @Published var syncQueueCount = 0
    @Published var syncing = false
    
    // MARK: - Employee Orders
    @Published var employees: [Employee] = []
    @Published var selectedEmployee: Employee?
    @Published var isEmployeeOrder = false
    @Published var employeeOrderTab = 0 // 0=Orden Actual, 1=Historial
    @Published var employeeOrderHistory: [Order] = []
    @Published var employeeIdsWithActiveOrders: Set<String> = []
    @Published var loadingEmployees = false
    
    // MARK: - Delivery
    @Published var showDeliveryDialog = false
    @Published var isCreatingPlatformDelivery = false
    @Published var isPlatformDelivery = false
    @Published var deliveryPlatform = ""
    @Published var platformOrderDigits = ""
    @Published var deliveryCustomerName = ""
    @Published var isHomeDelivery = false
    let homeDeliveryFee: Double = 25.0
    
    var isCurrentOrderRush: Bool {
        if let table = selectedTable, let priority = table.activeOrder?.priority {
            return priority == 1
        }
        if let orderId = currentOrderId,
           let order = deliveryOrders.first(where: { $0.id == orderId }) {
            return order.priority == 1
        }
        return false
    }
    
    var isCurrentOrderOnHold: Bool {
        if let table = selectedTable, let onHold = table.activeOrder?.onHold {
            return onHold == true
        }
        if let orderId = currentOrderId,
           let order = deliveryOrders.first(where: { $0.id == orderId }) {
            return order.onHold == true
        }
        return false
    }
    
    // MARK: - Payment
    @Published var showingPayment = false
    @Published var paymentStep = "payment" // summary, payment, confirmation, done, split-assign, split-overview, split-pay-person
    @Published var paymentMethod: String?
    @Published var cashReceived = ""
    @Published var tipPercentage = 0
    @Published var customTip = ""
    @Published var showCustomTip = false
    @Published var tipPaymentMethod: String?
    @Published var processing = false
    @Published var paymentCompleted = false
    @Published var confirmingOrder = false
    @Published var splitPayments: [SplitPayment] = []
    @Published var showAddSplitPayment = false
    @Published var editingSplitPayment: SplitPayment? = nil
    @Published var activeNumericField: String? = nil // "cash", "tip", nil
    
    // Reset payment state when switching tables/orders
    func resetPaymentState() {
        showingPayment = false
        paymentStep = "payment"
        paymentMethod = "cash"
        cashReceived = ""
        tipPercentage = 0
        customTip = ""
        showCustomTip = false
        tipPaymentMethod = nil
        splitPayments = []
        showAddSplitPayment = false
        editingSplitPayment = nil
        processing = false
        paymentCompleted = false
        confirmingOrder = false
        splitBillMode = false
        splitBillType = "by-seat"
        itemAssignments = [:]
        individualPayments = [:]
        individualTips = [:]
        splitPaymentMethod = nil
        splitTipPaymentMethod = nil
        splitPersonDiscountAmount = 0
        splitPersonDiscountName = ""
        splitCashReceived = ""
        currentPersonIndex = 0
        activeNumericField = nil
    }
    
    // MARK: - Numpad Input Handlers
    func appendToActiveField(_ key: String) {
        guard let field = activeNumericField else { return }
        switch field {
        case "cash":
            cashReceived += key
        case "tip":
            customTip += key
        default:
            break
        }
    }
    
    func backspaceActiveField() {
        guard let field = activeNumericField else { return }
        switch field {
        case "cash":
            if !cashReceived.isEmpty { cashReceived.removeLast() }
        case "tip":
            if !customTip.isEmpty { customTip.removeLast() }
        default:
            break
        }
    }
    
    func clearActiveField() {
        guard let field = activeNumericField else { return }
        switch field {
        case "cash":
            cashReceived = ""
        case "tip":
            customTip = ""
        default:
            break
        }
    }
    
    // MARK: - Split Bill
    @Published var splitBillMode = false
    @Published var splitBillType: String = "by-seat" // "by-seat" | "custom"
    @Published var itemAssignments: [Int: [Int]] = [:]
    @Published var individualPayments: [Int: IndividualPayment] = [:]
    @Published var individualTips: [Int: IndividualTip] = [:]
    @Published var splitPaymentMethod: String?
    @Published var splitTipPaymentMethod: String? = nil
    @Published var splitPersonDiscountAmount: Double = 0
    @Published var splitPersonDiscountName: String = ""
    @Published var splitCashReceived = ""
    @Published var currentPersonIndex = 0
    @Published var selectedSplitPersonIndex = 0
    
    // MARK: - Promotions & Discounts
    @Published var activePromotions: [Promotion] = []
    @Published var availableDiscounts: [Discount] = []
    @Published var selectedDiscount: Discount?
    @Published var showFlexibleDiscountDialog = false
    @Published var flexibleDiscountType = "percentage"
    @Published var flexibleDiscountValue: Double = 10
    @Published var customFlexibleAmount = ""
    
    // MARK: - Loyalty
    @Published var loyaltyCard: LoyaltyCard?
    @Published var qrDialogOpen = false
    @Published var qrCode = ""
    @Published var loadingCard = false
    @Published var showingLoyaltyStep = false
    @Published var manualStampDialogOpen = false
    @Published var manualBarcodeInput = ""
    
    // MARK: - Guest / Courtesy
    @Published var showGuestProductDialog = false
    @Published var guestProductCart: [GuestProductItem] = []
    @Published var showAdminMenu = false
    @Published var showGuestItemsDialog = false
    @Published var guestItemsSelection: [Int] = []
    
    // MARK: - Timers
    private var tablePollingTimer: Timer?
    private var inactivityTimer: Timer?
    
    // MARK: - Computed
    
    var filteredProducts: [Product] {
        if !searchQuery.isEmpty {
            return products.filter { $0.active && $0.name.localizedCaseInsensitiveContains(searchQuery) }
        }
        guard let catId = selectedCategory else { return [] }
        return products.filter { $0.active && $0.categoryId == catId }
    }
    
    var cartSubtotalBeforeDiscounts: Double {
        cart.filter { !$0.isGuest }.reduce(0.0) { sum, item in
            let basePrice = item.originalPrice ?? item.unitPrice
            let promoDiscount = item.promotionDiscount ?? 0
            return sum + (basePrice * Double(item.quantity) - promoDiscount)
        }
    }
    
    var cartRenderElements: [CartRenderElement] {
        let seatOrder = selectedTable != nil
            ? Array(1...guestCount).map { "A\($0)" } + ["C"]
            : ["C"]
        
        let sortedCart = cart.enumerated().map { (index: $0, item: $1) }
            .sorted { a, b in
                let courseA = a.item.course
                let courseB = b.item.course
                if courseA != courseB { return courseA < courseB }
                if selectedTable != nil {
                    let aIdx = seatOrder.firstIndex(of: a.item.seat) ?? 999
                    let bIdx = seatOrder.firstIndex(of: b.item.seat) ?? 999
                    return aIdx < bIdx
                }
                return false
            }
        
        // Build promotion groups (grouped by promoId + course + seat)
        let promoItems = sortedCart.filter { $0.item.promotionId != nil }
        let promoDict = Dictionary(grouping: promoItems) { "\($0.item.promotionId!)|\($0.item.course)|\($0.item.seat)" }
        var promoGroups: [PromotionGroup] = []
        
        for (key, items) in promoDict {
            let parts = key.split(separator: "|")
            guard parts.count >= 3 else { continue }
            let promoId = String(parts[0])
            let course = Int(parts[1]) ?? 0
            let seat = String(parts[2])
            guard let promo = activePromotions.first(where: { $0.id == promoId }) else { continue }
            let totalSavings = items.reduce(0) { $0 + ($1.item.promotionDiscount ?? 0) }
            promoGroups.append(PromotionGroup(
                id: key,
                promotionId: promoId,
                name: promo.name,
                type: promo.type,
                course: course,
                seat: seat,
                items: items,
                totalSavings: totalSavings
            ))
        }
        
        let maxCourse = cart.map { $0.course }.max() ?? 1
        let showCourseHeaders = maxCourse > 1
        
        var renderElements: [CartRenderElement] = []
        var renderedPromoKeys = Set<String>()
        var lastCourse = 0
        var lastSeat = ""
        
        for (_, element) in sortedCart.enumerated() {
            let item = element.item
            let promoKey = "\(item.promotionId ?? "")|\(item.course)|\(item.seat)"
            if let promoId = item.promotionId, !renderedPromoKeys.contains(promoKey) {
                if let group = promoGroups.first(where: { $0.promotionId == promoId && $0.course == item.course && $0.seat == item.seat }) {
                    let firstItem = group.items.first?.item
                    let showCourseHeader = showCourseHeaders && (firstItem?.course ?? 0) != lastCourse
                    let showSeatHeader = selectedTable != nil && (firstItem?.seat ?? "") != lastSeat
                    if showCourseHeader { lastCourse = firstItem?.course ?? 0; lastSeat = "" }
                    if showSeatHeader { lastSeat = firstItem?.seat ?? "" }
                    renderElements.append(.promotionGroup(group, showCourseHeader: showCourseHeader, showSeatHeader: showSeatHeader))
                    renderedPromoKeys.insert(promoKey)
                }
            } else if item.promotionId == nil {
                let showCourseHeader = showCourseHeaders && item.course != lastCourse
                let showSeatHeader = selectedTable != nil && item.seat != lastSeat
                if showCourseHeader { lastCourse = item.course; lastSeat = "" }
                if showSeatHeader { lastSeat = item.seat }
                renderElements.append(.item(element.index, item, showCourseHeader: showCourseHeader, showSeatHeader: showSeatHeader))
            }
        }
        
        return renderElements
    }
    
    var totalPromotionDiscount: Double {
        cart.filter { !$0.isGuest }.reduce(0) { $0 + ($1.promotionDiscount ?? 0) }
    }
    
    var cartTotal: Double {
        cartSubtotalBeforeDiscounts
    }
    
    var flexibleDiscountAmount: Double {
        guard let discount = selectedDiscount else { return 0 }
        if discount.type == "flexible" {
            if flexibleDiscountType == "percentage" {
                return PromotionEngine.calculateDiscount(subtotal: cartTotal, discountType: "percentage", discountValue: flexibleDiscountValue)
            } else {
                return PromotionEngine.calculateDiscount(subtotal: cartTotal, discountType: "fixed_amount", discountValue: Double(customFlexibleAmount) ?? 0)
            }
        }
        return PromotionEngine.calculateDiscount(subtotal: cartTotal, discountType: discount.type, discountValue: discount.value)
    }
    
    var cartTotalWithDiscount: Double {
        cartTotal - flexibleDiscountAmount
    }
    
    var totalDiscount: Double {
        flexibleDiscountAmount
    }
    
    var deliveryFeeAmount: Double {
        isHomeDelivery ? homeDeliveryFee : 0
    }
    
    func toggleHomeDelivery() {
        isHomeDelivery.toggle()
        // Persist to backend if order already exists
        guard let orderId = currentOrderId else { return }
        let nameForBackend = isHomeDelivery
            ? "\(customerName) [ENVIO]"
            : customerName.replacingOccurrences(of: " [ENVIO]", with: "")
        Task {
            try? await APIService.shared.updateOrder(orderId: orderId, body: ["customerName": nameForBackend])
        }
    }
    
    var tipAmount: Double {
        if showCustomTip {
            return Double(customTip) ?? 0
        }
        return cartTotalWithDiscount * Double(tipPercentage) / 100
    }
    
    var tipWithDelivery: Double {
        tipAmount + deliveryFeeAmount
    }
    
    var totalWithTip: Double {
        cartTotalWithDiscount + tipAmount + deliveryFeeAmount
    }
    
    var changeAmount: Double {
        max(0, (Double(cashReceived) ?? 0) - totalWithTip)
    }
    
    var cashSufficient: Bool {
        (Double(cashReceived) ?? 0) >= totalWithTip
    }
    
    var hasUnsent: Bool {
        cart.contains { !$0.sentToKitchen }
    }
    
    var unsentCount: Int {
        cart.filter { !$0.sentToKitchen }.count
    }
    
    // MARK: - Init
    
    init() {
        restoreSession()
        setupSocketCallbacks()
        socketService.connect()
        setupSyncEngine()
    }
    
    private func setupSyncEngine() {
        // Bind offline state
        SyncEngine.shared.$isOnline
            .map { !$0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] offline in
                self?.isOffline = offline
                self?.syncQueueCount = OfflineQueueService.shared.count
            }
            .store(in: &cancellables)
        
        // Bind sync state
        SyncEngine.shared.$isSyncing
            .receive(on: RunLoop.main)
            .sink { [weak self] syncing in
                self?.syncing = syncing
            }
            .store(in: &cancellables)
        
        // Bind queue count
        OfflineQueueService.shared.$queue
            .receive(on: RunLoop.main)
            .sink { [weak self] queue in
                self?.syncQueueCount = queue.count
            }
            .store(in: &cancellables)
    }
    
    private func setupSocketCallbacks() {
        socketService.onTableUpdated = { [weak self] tableId in
            Task { @MainActor in
                await self?.refreshTable(tableId: tableId)
                await self?.refreshReadyItemsAndDelivery()
            }
        }
        
        socketService.onOrderUpdated = { [weak self] dict in
            Task { @MainActor in
                guard let orderId = dict["id"] as? String else { return }
                print("📦 [Socket] order:updated received for \(orderId)")
                print("📦 [Socket] Full dict: \(dict)")
                
                // Update table's activeOrder status if tableId is present
                if let tableId = dict["tableId"] as? String,
                   let status = dict["status"] as? String,
                   let self = self {
                    print("📦 [Socket] tableId=\(tableId), status=\(status)")
                    if let index = self.tables.firstIndex(where: { $0.id == tableId }) {
                        var table = self.tables[index]
                        print("📦 [Socket] Found table #\(table.number) at index \(index)")
                        if var activeOrder = table.activeOrder {
                            print("📦 [Socket] Old activeOrder.status=\(activeOrder.status)")
                            let priority = dict["priority"] as? Int ?? activeOrder.priority
                            let onHold = dict["onHold"] as? Bool ?? activeOrder.onHold
                            activeOrder = ActiveOrder(
                                id: activeOrder.id,
                                orderNumber: activeOrder.orderNumber,
                                status: status,
                                total: activeOrder.total,
                                itemCount: activeOrder.itemCount,
                                items: activeOrder.items,
                                createdAt: activeOrder.createdAt,
                                priority: priority,
                                onHold: onHold
                            )
                            table = Table(
                                id: table.id,
                                number: table.number,
                                name: table.name,
                                capacity: table.capacity,
                                status: table.status,
                                active: table.active,
                                activeOrder: activeOrder,
                                guestCount: table.guestCount,
                                nextReservation: table.nextReservation
                            )
                            self.tables[index] = table
                            print("🪑 [Socket] Updated table #\(table.number) activeOrder.status to \(status)")
                        } else {
                            print("⚠️ [Socket] table.activeOrder is nil")
                        }
                    } else {
                        print("⚠️ [Socket] Table not found for tableId=\(tableId)")
                    }
                } else {
                    print("⚠️ [Socket] Missing tableId or status in dict")
                }
                
                await self?.refreshOrderFromSocket()
                await self?.refreshReadyItemsAndDelivery()
            }
        }
        
        socketService.onOrderRush = { [weak self] dict in
            Task { @MainActor in
                guard let self = self,
                      let orderId = dict["id"] as? String else { return }
                print("🔥 [Socket] order:rush received for \(orderId)")
                let priority = dict["priority"] as? Int
                let onHold = dict["onHold"] as? Bool
                if let tableId = dict["tableId"] as? String {
                    self.updateTableOrderFlags(tableId: tableId, priority: priority, onHold: onHold)
                }
                // Also update delivery orders
                self.updateDeliveryOrderFlags(orderId: orderId, priority: priority, onHold: onHold)
            }
        }
        
        socketService.onOrderHold = { [weak self] dict in
            Task { @MainActor in
                guard let self = self,
                      let orderId = dict["id"] as? String else { return }
                print("⏸️ [Socket] order:hold received for \(orderId)")
                let priority = dict["priority"] as? Int
                let onHold = dict["onHold"] as? Bool
                if let tableId = dict["tableId"] as? String {
                    self.updateTableOrderFlags(tableId: tableId, priority: priority, onHold: onHold)
                }
                // Also update delivery orders
                self.updateDeliveryOrderFlags(orderId: orderId, priority: priority, onHold: onHold)
            }
        }
        
        socketService.onOrderPaid = { [weak self] orderId in
            Task { @MainActor in
                self?.showToast("Orden cobrada")
                await self?.refreshOrderFromSocket()
                await self?.refreshReadyItemsAndDelivery()
            }
        }
        
        socketService.onCashRegisterOpened = { [weak self] in
            Task { @MainActor in
                self?.cashRegisterOpen = true
                self?.showToast("Caja abierta")
            }
        }
        
        socketService.onCashRegisterClosed = { [weak self] in
            Task { @MainActor in
                self?.cashRegisterOpen = false
                self?.showToast("Caja cerrada", isError: true)
            }
        }
    }
    
    private func refreshTable(tableId: String) async {
        guard let index = tables.firstIndex(where: { $0.id == tableId }) else { return }
        do {
            let updated = try await APIService.shared.fetchTableDetail(tableId: tableId)
            tables[index] = updated
        } catch {
            print("Error refreshing table: \(error)")
        }
    }
    
    // MARK: - Real-time Rush/Hold helpers
    
    @MainActor
    private func updateTableOrderFlags(tableId: String, priority: Int?, onHold: Bool?) {
        guard let index = tables.firstIndex(where: { $0.id == tableId }) else {
            print("⚠️ [Socket] Table not found for tableId=\(tableId)")
            return
        }
        var table = tables[index]
        guard var activeOrder = table.activeOrder else {
            print("⚠️ [Socket] table.activeOrder is nil for #\(table.number)")
            return
        }
        print("🔥⏸️ [Socket] Updating table #\(table.number) — priority=\(priority ?? activeOrder.priority ?? -1), onHold=\(onHold ?? activeOrder.onHold ?? false)")
        activeOrder = ActiveOrder(
            id: activeOrder.id,
            orderNumber: activeOrder.orderNumber,
            status: activeOrder.status,
            total: activeOrder.total,
            itemCount: activeOrder.itemCount,
            items: activeOrder.items,
            createdAt: activeOrder.createdAt,
            priority: priority ?? activeOrder.priority,
            onHold: onHold ?? activeOrder.onHold
        )
        table = Table(
            id: table.id,
            number: table.number,
            name: table.name,
            capacity: table.capacity,
            status: table.status,
            active: table.active,
            activeOrder: activeOrder,
            guestCount: table.guestCount,
            nextReservation: table.nextReservation
        )
        tables[index] = table
    }
    
    @MainActor
    private func updateDeliveryOrderFlags(orderId: String, priority: Int?, onHold: Bool?) {
        // Update delivery orders
        if let idx = deliveryOrders.firstIndex(where: { $0.id == orderId }) {
            var order = deliveryOrders[idx]
            // We can't mutate Order directly (it's a let struct), so we need to use a workaround
            // Since Order fields are lets, we need to rebuild it. But priority/onHold are optional lets.
            // Actually in Swift, structs with let properties can be reconstructed via a copy if we have them all.
            // But since Order has many fields, let's just refresh delivery orders from API instead.
            print("🔥⏸️ [Socket] Delivery order flagged, refreshing...")
            Task { await refreshReadyItemsAndDelivery() }
        }
        if let idx = platformDeliveryOrders.firstIndex(where: { $0.id == orderId }) {
            print("🔥⏸️ [Socket] Platform delivery order flagged, refreshing...")
            Task { await refreshReadyItemsAndDelivery() }
        }
    }
    
    private func refreshOrderFromSocket() async {
        guard let table = selectedTable else { return }
        do {
            let orders = try await APIService.shared.fetchOrdersByTable(tableId: table.id)
            let activeOrders = orders.filter { $0.paymentStatus != "paid" && $0.status != "completed" }
            
            if let mainOrder = activeOrders.first {
                currentOrderId = mainOrder.id
                var allItems: [CartItem] = []
                for order in activeOrders {
                    if let items = order.items {
                        for item in items where !(item.voided ?? false) {
                            var cartItem = CartItem.fromOrderItem(item, orderId: order.id)
                            cartItem.orderStatus = order.status
                            allItems.append(cartItem)
                        }
                    }
                }
                cart = allItems
                applyPromotions()
            }
        } catch {
            print("Error refreshing order from socket: \(error)")
        }
    }
    
    deinit {
        tablePollingTimer?.invalidate()
        inactivityTimer?.invalidate()
    }
    
    // MARK: - Format
    
    func formatCurrency(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "es_MX")
        formatter.currencyCode = "MXN"
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }
    
    // MARK: - Toast
    
    func showToast(_ message: String, isError: Bool = false) {
        toastMessage = message
        toastIsError = isError
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.toastMessage = nil
        }
    }
    
    // MARK: - Session
    
    func restoreSession() {
        if let empId = UserDefaults.standard.string(forKey: "pos_employeeId"),
           let empName = UserDefaults.standard.string(forKey: "pos_employeeName") {
            employeeId = empId
            employeeName = empName
            currentScreen = .tableSelection
            lastActivity = Date()
            Task { await fetchData() }
        }
    }
    
    func saveSession() {
        UserDefaults.standard.set(employeeId, forKey: "pos_employeeId")
        UserDefaults.standard.set(employeeName, forKey: "pos_employeeName")
    }
    
    func clearSession() {
        UserDefaults.standard.removeObject(forKey: "pos_employeeId")
        UserDefaults.standard.removeObject(forKey: "pos_employeeName")
        employeeId = nil
        employeeName = nil
        currentScreen = .dashboard
        authStep = .idle
        pin = ""
    }
    
    // MARK: - Auth Actions
    
    func handleOpenComanda() {
        checkingRegister = true
        Task {
            let isOpen = (try? await APIService.shared.checkCashRegister()) ?? false
            cashRegisterOpen = isOpen
            checkingRegister = false
            if !isOpen {
                showToast("Caja cerrada. Abre la caja desde el dashboard.", isError: true)
                return
            }
            authStep = .pin
        }
    }
    
    func handleNumberClick(_ key: String) {
        lastActivity = Date()
        if authStep == .pin {
            guard pin.count < 4 else { return }
            pin += key
            if pin.count == 4 { handlePinSubmit() }
        }
    }
    
    func handleBackspace() {
        if authStep == .pin && !pin.isEmpty {
            pin.removeLast()
        }
    }
    
    func handleClear() {
        if authStep == .pin { pin = "" }
    }
    
    func handlePinSubmit() {
        guard pin.count == 4 else { return }
        authenticating = true
        Task {
            do {
                let emp = try await APIService.shared.verifyPin(pin: pin)
                handlePinSuccess(empId: emp.id, empName: emp.name)
            } catch {
                showToast(error.localizedDescription, isError: true)
                pin = ""
            }
            authenticating = false
        }
    }
    
    func handlePinSuccess(empId: String, empName: String) {
        employeeId = empId
        employeeName = empName
        currentScreen = .tableSelection
        authStep = .idle
        pin = ""
        lastActivity = Date()
        saveSession()
        showToast("Bienvenido, \(empName)")
        Task { await fetchData() }
        startPolling()
    }
    
    func handleCancel() {
        authStep = .idle
        pin = ""
    }
    
    // MARK: - Polling (backup only, WebSocket is primary)
    
    func startPolling() {
        tablePollingTimer?.invalidate()
        tablePollingTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                print("🔄 Backup poll (WebSocket handles real-time)")
                await self?.refreshTables()
            }
        }
    }
    
    func refreshTables() async {
        if let t = try? await APIService.shared.fetchTables() {
            tables = t.filter { $0.active }
            for table in tables.prefix(3) {
                print("[Tables] #\(table.number) status=\(table.status) activeOrder=\(table.activeOrder?.status ?? "nil")")
            }
        } else {
            print("[Tables] fetchTables failed or returned nil")
        }
        if let readyIds = try? await APIService.shared.fetchTablesWithReadyItems() {
            tablesWithReadyItems = readyIds
        }
        if let orders = try? await APIService.shared.fetchDeliveryOrders() {
            separateDeliveryOrders(orders)
        }
    }
    
    private func refreshReadyItemsAndDelivery() async {
        print("🔄 [refreshReadyItemsAndDelivery] Checking for ready items...")
        if let readyIds = try? await APIService.shared.fetchTablesWithReadyItems() {
            print("✅ [refreshReadyItemsAndDelivery] Tables with ready items: \(readyIds)")
            tablesWithReadyItems = readyIds
        } else {
            print("❌ [refreshReadyItemsAndDelivery] Failed to fetch ready items")
        }
        if let orders = try? await APIService.shared.fetchDeliveryOrders() {
            separateDeliveryOrders(orders)
        }
    }
    
    // MARK: - Data Fetch
    
    func fetchData() async {
        loading = true
        
        // Fetch each independently so one failure doesn't block the rest
        // On success: save to offline cache. On failure: load from offline cache.
        
        if let t = try? await APIService.shared.fetchTables() {
            tables = t.filter { $0.active }
        } else {
            print("[POS] Error fetching tables")
        }
        
        if let c = try? await APIService.shared.fetchCategories() {
            categories = c.filter { $0.active }.sorted { $0.sortOrder < $1.sortOrder }
            OfflineDataStore.shared.saveCategories(c)
        } else {
            categories = OfflineDataStore.shared.loadCategories()
            print("[POS] Loaded \(categories.count) categories from offline cache")
        }
        
        if let p = try? await APIService.shared.fetchProducts() {
            products = p
            OfflineDataStore.shared.saveProducts(p)
        } else {
            products = OfflineDataStore.shared.loadProducts()
            print("[POS] Loaded \(products.count) products from offline cache")
        }
        
        if let f = try? await APIService.shared.fetchFrostings() {
            frostings = f.filter { $0.active }
        } else {
            print("[POS] Error fetching frostings")
        }
        
        if let tp = try? await APIService.shared.fetchToppings() {
            toppings = tp.filter { $0.active }
        } else {
            print("[POS] Error fetching toppings")
        }
        
        if let e = try? await APIService.shared.fetchExtras() {
            extras = e.filter { $0.active }
        } else {
            print("[POS] Error fetching extras")
        }
        
        if let pr = try? await APIService.shared.fetchActivePromotions() {
            activePromotions = pr
        } else {
            print("[POS] Error fetching promotions")
        }
        
        if let d = try? await APIService.shared.fetchAvailableDiscounts() {
            availableDiscounts = d
        } else {
            print("[POS] Error fetching discounts")
        }
        
        if let del = try? await APIService.shared.fetchDeliveryOrders() {
            separateDeliveryOrders(del)
        } else {
            print("[POS] Error fetching delivery orders")
        }
        
        if let ready = try? await APIService.shared.fetchTablesWithReadyItems() {
            tablesWithReadyItems = ready
        } else {
            print("[POS] Error fetching ready items")
        }
        
        // Fetch employees
        if let emp = try? await APIService.shared.fetchEmployees() {
            employees = emp.filter { $0.active != false }
        } else {
            print("[POS] Error fetching employees")
        }
        
        // Fetch active employee order IDs for indicator badges
        if let empOrders = try? await APIService.shared.fetchAllEmployeeOrders() {
            employeeIdsWithActiveOrders = Set(empOrders.compactMap { $0.userId })
        }
        
        loading = false
    }
    
    private func separateDeliveryOrders(_ orders: [Order]) {
        var regular: [Order] = []
        var platform: [Order] = []
        
        // Exclude employee orders from delivery list
        let filtered = orders.filter { $0.source != "employee" }
        
        // Group by customerName to merge related orders
        var grouped: [String: [Order]] = [:]
        for order in filtered {
            let key = order.customerName ?? "Delivery_\(order.id)"
            grouped[key, default: []].append(order)
        }
        
        for (_, orders) in grouped {
            guard let first = orders.first else { continue }
            if first.isPlatformDelivery {
                // Merge items from multiple platform orders into one
                if orders.count > 1 {
                    var mergedItems: [OrderItem] = []
                    for o in orders {
                        mergedItems.append(contentsOf: o.items ?? [])
                    }
                    // Use first order as base
                    platform.append(first)
                } else {
                    platform.append(first)
                }
            } else {
                if orders.count > 1 {
                    regular.append(first)
                } else {
                    regular.append(first)
                }
            }
        }
        
        deliveryOrders = regular
        platformDeliveryOrders = platform
    }
    
    // MARK: - Table Selection
    
    func handleSelectTable(_ table: Table) {
        lastActivity = Date()
        
        print("🏠 handleTableSelect: table=\(table.id) (\(table.number)), status=\(table.status)")
        // Reset payment state for new table/order
        resetPaymentState()
        selectedEmployee = nil
        isEmployeeOrder = false
        isHomeDelivery = false
        customerName = ""
        
        if table.isOccupied {
            // Load existing order for this table
            Task {
                loading = true
                selectedTable = table
                cart = [] // Clear cart to avoid stale data from previous table
                currentOrderId = nil
                guestCount = table.guestCount ?? 1
                activeSeat = guestCount > 0 ? "A1" : "C"
                
                do {
                    print("✅ Cargando órdenes para mesa: \(table.id) (\(table.number))")
                    let orders = try await APIService.shared.fetchOrdersByTable(tableId: table.id)
                    print("📊 Total órdenes recibidas: \(orders.count)")
                    
                    // Log all orders with their tableId
                    for (idx, order) in orders.enumerated() {
                        print("  Orden[\(idx)]: id=\(order.id), tableId=\(order.tableId ?? "nil"), customerName=\(order.customerName ?? "nil"), items=\(order.items?.count ?? 0)")
                    }
                    
                    // Filter only active orders (not paid/completed)
                    let activeOrders = orders.filter { $0.paymentStatus != "paid" && $0.status != "completed" }
                    print("✅ Órdenes activas filtradas: \(activeOrders.count)")
                    
                    if let mainOrder = activeOrders.first {
                        currentOrderId = mainOrder.id
                        print("🎯 currentOrderId establecido: \(mainOrder.id)")
                        
                        // Merge items from all active orders
                        var allItems: [CartItem] = []
                        for order in activeOrders {
                            if let items = order.items {
                                print("  ➕ Agregando \(items.count) items de orden \(order.id)")
                                for item in items where !(item.voided ?? false) {
                                    var cartItem = CartItem.fromOrderItem(item, orderId: order.id)
                                    cartItem.orderStatus = order.status
                                    if let cm = item.customModifiers {
                                        print("    📎 Item \(item.productName) customModifiers: \(cm)")
                                    } else {
                                        print("    ⚠️ Item \(item.productName) customModifiers: nil")
                                    }
                                    allItems.append(cartItem)
                                }
                            }
                        }
                        cart = allItems
                        applyPromotions()
                        guestCount = mainOrder.guestCount ?? 1
                        print("🛒 Cart final: \(cart.count) items, guestCount: \(guestCount)")
                    } else {
                        print("⚠️ No hay órdenes activas para esta mesa")
                    }
                } catch {
                    print("❌ Error loading table orders: \(error)")
                }
                
                currentScreen = .pos
                loading = false
            }
        } else if table.isReserved {
            print("🏠 Mesa RESERVADA - estableciendo selectedTable")
            selectedTable = table
            guestCount = table.guestCount ?? 1
            tempGuestCount = guestCount
            
            // Clear cart and reset state for reserved table
            cart = []
            currentOrderId = nil
            activeCourse = 1
            activeSeat = guestCount > 0 ? "A1" : "C"
            
            print("✅ selectedTable ahora es: \(selectedTable?.id ?? "nil")")
            currentScreen = .pos
        } else {
            // Available table — ask for guest count
            print("🏠 Mesa DISPONIBLE - estableciendo selectedTable y mostrando diálogo")
            selectedTable = table
            tempGuestCount = table.guestCount ?? 2
            print("✅ selectedTable ahora es: \(selectedTable?.id ?? "nil")")
            showInitialGuestDialog = true
        }
    }
    
    func confirmInitialGuestCount() {
        print("✅ confirmInitialGuestCount: guestCount=\(tempGuestCount), selectedTable=\(selectedTable?.id ?? "nil")")
        guestCount = tempGuestCount
        activeSeat = "A1"
        showInitialGuestDialog = false
        
        // Clear cart and reset state for new empty table
        cart = []
        currentOrderId = nil
        activeCourse = 1
        
        print("✅ Navegando a POS con selectedTable=\(selectedTable?.id ?? "nil")")
        currentScreen = .pos
        
        if let table = selectedTable {
            Task {
                let _ = try? await APIService.shared.updateTable(tableId: table.id, body: ["guestCount": tempGuestCount])
            }
        }
        showToast("Mesa \(selectedTable?.number ?? "") — \(tempGuestCount) persona\(tempGuestCount > 1 ? "s" : "")")
    }
    
    func confirmGuestCount() {
        guestCount = tempGuestCount
        let validSeats = (1...max(1, tempGuestCount)).map { "A\($0)" } + ["C"]
        if !validSeats.contains(activeSeat) {
            activeSeat = "A\(min(tempGuestCount, 1))"
        }
        showGuestCountDialog = false
        showToast("Número de personas actualizado: \(tempGuestCount)")
        
        if let table = selectedTable {
            Task {
                if let updated = try? await APIService.shared.updateTable(tableId: table.id, body: ["guestCount": tempGuestCount]) {
                    selectedTable = updated
                }
                // Also update active order if exists
                if let orderId = currentOrderId {
                    try? await APIService.shared.updateOrder(orderId: orderId, body: ["guestCount": tempGuestCount])
                }
            }
        }
    }
    
    // MARK: - Employee Orders
    
    func fetchEmployees() async {
        if let emp = try? await APIService.shared.fetchEmployees() {
            employees = emp.filter { $0.active != false }
        }
    }
    
    func refreshEmployeeActiveOrders() async {
        if let empOrders = try? await APIService.shared.fetchAllEmployeeOrders() {
            employeeIdsWithActiveOrders = Set(empOrders.compactMap { $0.userId })
        }
    }
    
    func handleSelectEmployee(_ employee: Employee) {
        lastActivity = Date()
        resetPaymentState()
        isHomeDelivery = false
        
        selectedEmployee = employee
        selectedTable = nil
        isEmployeeOrder = true
        employeeOrderTab = 0
        customerName = "Empleado: \(employee.name)"
        guestCount = 1
        activeSeat = "C"
        activeCourse = 1
        
        Task {
            loading = true
            do {
                let activeOrders = try await APIService.shared.fetchActiveEmployeeOrder(userId: employee.id)
                
                if let existingOrder = activeOrders.first {
                    print("📦 [handleSelectEmployee] Loaded order: \(existingOrder.id), items: \(existingOrder.items?.count ?? 0)")
                    currentOrderId = existingOrder.id
                    var items: [CartItem] = []
                    if let orderItems = existingOrder.items {
                        for item in orderItems where !(item.voided ?? false) {
                            var cartItem = CartItem.fromOrderItem(item, orderId: existingOrder.id)
                            cartItem.orderStatus = existingOrder.status
                            items.append(cartItem)
                        }
                    }
                    cart = items
                    applyPromotions()
                    guestCount = existingOrder.guestCount ?? 1
                } else {
                    print("📦 [handleSelectEmployee] No active order found for employee: \(employee.id)")
                    currentOrderId = nil
                    cart = []
                }
            } catch {
                print("❌ [handleSelectEmployee] Error loading employee order: \(error)")
                currentOrderId = nil
                cart = []
            }
            currentScreen = .pos
            loading = false
        }
    }
    
    func fetchEmployeeOrderHistory() async {
        guard let employee = selectedEmployee else { return }
        do {
            employeeOrderHistory = try await APIService.shared.fetchEmployeeOrders(userId: employee.id)
        } catch {
            print("Error fetching employee order history: \(error)")
        }
    }
    
    // MARK: - Delivery Orders
    
    func handleNewDeliveryOrder() {
        resetPaymentState()
        isCreatingPlatformDelivery = false
        isPlatformDelivery = false
        isHomeDelivery = false
        deliveryPlatform = ""
        platformOrderDigits = ""
        deliveryCustomerName = ""
        customerName = ""
        selectedTable = nil
        selectedEmployee = nil
        isEmployeeOrder = false
        cart = []
        currentOrderId = nil
        activeCourse = 1
        activeSeat = "C"
        guestCount = 1
        showCustomerNameDialog = true
    }
    
    func handleNewPlatformDeliveryOrder() {
        resetPaymentState()
        isCreatingPlatformDelivery = true
        isPlatformDelivery = true
        deliveryPlatform = ""
        platformOrderDigits = ""
        deliveryCustomerName = ""
        customerName = ""
        selectedTable = nil
        cart = []
        currentOrderId = nil
        activeCourse = 1
        activeSeat = "C"
        guestCount = 1
        showCustomerNameDialog = true
    }
    
    func handleConfirmCustomerName() {
        if isPlatformDelivery {
            guard !deliveryPlatform.isEmpty, !platformOrderDigits.isEmpty else {
                showToast("Completa plataforma y dígitos de orden", isError: true)
                return
            }
            let fullName = "\(deliveryPlatform) \(platformOrderDigits)\(customerName.isEmpty ? "" : " - \(customerName)")"
            customerName = fullName
        } else {
            guard !customerName.trimmingCharacters(in: .whitespaces).isEmpty else {
                showToast("Ingresa el nombre del cliente", isError: true)
                return
            }
        }
        
        showCustomerNameDialog = false
        selectedTable = nil
        cart = []
        currentOrderId = nil
        activeSeat = "C"
        activeCourse = 1
        currentScreen = .pos
    }
    
    func handleSelectDeliveryOrder(_ order: Order) {
        lastActivity = Date()
        
        // Reset payment state for new order
        resetPaymentState()
        
        let rawName = order.customerName ?? "Delivery"
        // Restore home delivery flag from persisted tag
        if rawName.contains("[ENVIO]") {
            isHomeDelivery = true
            customerName = rawName.replacingOccurrences(of: " [ENVIO]", with: "")
        } else {
            isHomeDelivery = false
            customerName = rawName
        }
        selectedTable = nil
        currentOrderId = order.id
        
        // Load items
        var items: [CartItem] = []
        if let orderItems = order.items {
            for item in orderItems where !(item.voided ?? false) {
                var cartItem = CartItem.fromOrderItem(item, orderId: order.id)
                cartItem.orderStatus = order.status
                items.append(cartItem)
            }
        }
        cart = items
        applyPromotions()
        guestCount = order.guestCount ?? 1
        currentScreen = .pos
    }
    
    // MARK: - Product Selection
    
    func handleProductClick(_ product: Product) {
        lastActivity = Date()
        
        if product.hasVariants && product.variants != nil {
            selectedProductForVariant = product
            showVariantDialog = true
            return
        }
        
        // Check product flow (hybrid: product-specific or inherited from category)
        Task {
            let flow = try? await APIService.shared.fetchProductFlow(productId: product.id)
            print("🎯 Flow decision for \(product.name):")
            print("   - Has flow: \(flow != nil)")
            print("   - Use default: \(flow?.useDefaultFlow ?? true)")
            print("   - Steps count: \(flow?.steps.count ?? 0)")
            
            if let flow = flow, !flow.useDefaultFlow, !flow.steps.isEmpty {
                print("   ✅ Using flow with \(flow.steps.count) steps")
                print("📊 Detalles de los steps:")
                for (idx, step) in flow.steps.enumerated() {
                    print("     Step[\(idx)]: id=\(step.id), name=\(step.stepName), type=\(step.stepType), options=\(step.options?.count ?? 0)")
                }
                categoryFlow = flow
                selectedProduct = product
                currentStepIndex = 0
                stepSelections = [:]
            } else {
                print("   ⏭️ Adding product directly (no flow)")
                // No flow — add directly
                addProductDirectly(product)
            }
        }
    }
    
    private func addProductDirectly(_ product: Product) {
        let isPlatform = customerName.hasPrefix("Uber") || customerName.hasPrefix("Rappi") || customerName.hasPrefix("Didi")
        let price = isPlatform ? product.numericPlatformPrice : product.numericPrice
        let isBev = product.category?.isBeverage ?? false
        
        let newItem = CartItem(
            productId: product.id,
            productName: product.name,
            unitPrice: price,
            quantity: 1,
            notes: "",
            seat: activeSeat,
            course: activeCourse,
            sentToKitchen: false,
            isBeverage: isBev,
            deliveredToTable: false,
            variantName: nil,
            isGuest: false
        )
        
        pendingCartItem = newItem
        tempNotes = ""
        showNotesDialog = true
    }
    
    func handleAddVariant(_ variantName: String, price: String, platformPrice: String?) {
        guard let product = selectedProductForVariant else { return }
        showVariantDialog = false
        
        let isPlatform = customerName.hasPrefix("Uber") || customerName.hasPrefix("Rappi") || customerName.hasPrefix("Didi")
        let variantPrice: Double
        if isPlatform, let pp = platformPrice, let ppVal = Double(pp) {
            variantPrice = ppVal
        } else {
            variantPrice = Double(price) ?? 0
        }
        
        let isBev = product.category?.isBeverage ?? false
        let displayName = "\(product.name) - \(variantName)"
        
        // Check for product flow (hybrid: product-specific or inherited from category)
        Task {
            let flow = try? await APIService.shared.fetchProductFlow(productId: product.id)
            print("🎯 Variant flow decision for \(product.name) - \(variantName):")
            print("   - Has flow: \(flow != nil)")
            print("   - Use default: \(flow?.useDefaultFlow ?? true)")
            print("   - Steps count: \(flow?.steps.count ?? 0)")
            
            if let flow = flow, !flow.useDefaultFlow, !flow.steps.isEmpty {
                print("   ✅ Using flow with \(flow.steps.count) steps")
                categoryFlow = flow
                selectedProduct = product
                currentStepIndex = 0
                stepSelections = [:]
                // Store variant info for later
                stepSelections["_variantName"] = variantName as Any
                stepSelections["_variantPrice"] = variantPrice as Any
                stepSelections["_displayName"] = displayName as Any
                return
            }
            
            print("   ⏭️ Adding variant directly (no flow)")
            
            let newItem = CartItem(
                productId: product.id,
                productName: displayName,
                unitPrice: variantPrice,
                quantity: 1,
                notes: "",
                seat: activeSeat,
                course: activeCourse,
                sentToKitchen: false,
                isBeverage: isBev,
                deliveredToTable: false,
                variantName: variantName,
                isGuest: false
            )
            pendingCartItem = newItem
            tempNotes = ""
            showNotesDialog = true
        }
    }
    
    // MARK: - Modifier Flow
    
    func handleStepSelection(_ selection: Any?) {
        guard let flow = categoryFlow, currentStepIndex < flow.steps.count else { return }
        let step = flow.steps[currentStepIndex]
        
        // Support multi-select for custom/category/products/extra steps
        if (step.stepType == "custom" || step.stepType == "category" || step.stepType == "products" || step.stepType == "extra") && step.allowMultiple {
            var current = (stepSelections[step.id] as? [ModifierOption]) ?? []
            if let opt = selection as? ModifierOption {
                if current.contains(where: { $0.id == opt.id }) {
                    current.removeAll { $0.id == opt.id }
                } else {
                    current.append(opt)
                }
                stepSelections[step.id] = current
            } else if selection == nil {
                stepSelections[step.id] = nil
            }
            return // Don't auto-advance for multi-select
        }
        
        stepSelections[step.id] = selection
        
        let nextIndex = currentStepIndex + 1
        if nextIndex < flow.steps.count {
            currentStepIndex = nextIndex
        } else {
            prepareFlowItemAndShowNotes()
        }
    }
    
    func advanceToNextStep() {
        guard let flow = categoryFlow, currentStepIndex < flow.steps.count else { return }
        let nextIndex = currentStepIndex + 1
        if nextIndex < flow.steps.count {
            currentStepIndex = nextIndex
        } else {
            prepareFlowItemAndShowNotes()
        }
    }
    
    func handleBackInFlow() {
        if currentStepIndex > 0 {
            currentStepIndex -= 1
        } else {
            resetFlow()
        }
    }
    
    func resetFlow() {
        currentStepIndex = -1
        categoryFlow = nil
        selectedProduct = nil
        stepSelections = [:]
        selectedFrosting = nil
        selectedTopping = nil
        selectedExtras = []
        productNotes = ""
    }
    
    private func buildFlowCartItem() -> CartItem? {
        guard let product = selectedProduct else { return nil }
        
        let isPlatform = customerName.hasPrefix("Uber") || customerName.hasPrefix("Rappi") || customerName.hasPrefix("Didi")
        var price: Double
        var displayName: String
        
        if let variantPrice = stepSelections["_variantPrice"] as? Double,
           let vName = stepSelections["_displayName"] as? String {
            price = variantPrice
            displayName = vName
        } else {
            price = isPlatform ? product.numericPlatformPrice : product.numericPrice
            displayName = product.name
        }
        
        var frostId: String?, frostName: String?
        var topId: String?, topName: String?
        var extId: String?, extName: String?
        var customMods: String?
        var customModsDict: [String: Any] = [:]
        
        if let flow = categoryFlow {
            for step in flow.steps {
                if let sel = stepSelections[step.id] {
                    switch step.stepType {
                    case "frosting":
                        if let f = sel as? Frosting {
                            frostId = f.id; frostName = f.name
                        } else if let opt = sel as? ModifierOption {
                            frostId = opt.id; frostName = opt.name
                            price += opt.numericPrice
                        } else if let opts = sel as? [ModifierOption], let first = opts.first {
                            frostId = first.id; frostName = opts.map { $0.name }.joined(separator: ", ")
                            price += opts.reduce(0.0) { $0 + $1.numericPrice }
                        }
                    case "topping":
                        if let t = sel as? DryTopping {
                            topId = t.id; topName = t.name
                        } else if let opt = sel as? ModifierOption {
                            topId = opt.id; topName = opt.name
                            price += opt.numericPrice
                        } else if let opts = sel as? [ModifierOption], let first = opts.first {
                            topId = first.id; topName = opts.map { $0.name }.joined(separator: ", ")
                            price += opts.reduce(0.0) { $0 + $1.numericPrice }
                        }
                    case "extra":
                        if let exts = sel as? [Extra], !exts.isEmpty {
                            let names = exts.map { $0.name }.joined(separator: ", ")
                            extId = exts.first?.id; extName = names
                            let extrasPrice = exts.reduce(0.0) { $0 + $1.numericPrice }
                            price += extrasPrice
                        } else if let opt = sel as? ModifierOption {
                            extId = opt.id; extName = opt.name
                            price += opt.numericPrice
                        } else if let opts = sel as? [ModifierOption], let first = opts.first {
                            extId = first.id; extName = opts.map { $0.name }.joined(separator: ", ")
                            price += opts.reduce(0.0) { $0 + $1.numericPrice }
                        }
                    case "custom", "category", "products":
                        if let opts = sel as? [ModifierOption], !opts.isEmpty {
                            customModsDict[step.id] = [
                                "stepName": step.stepName,
                                "stepType": step.stepType,
                                "options": opts.map { ["id": $0.id, "name": $0.name, "price": $0.price] }
                            ]
                            price += opts.reduce(0.0) { $0 + $1.numericPrice }
                        } else if let opt = sel as? ModifierOption {
                            customModsDict[step.id] = [
                                "stepName": step.stepName,
                                "stepType": step.stepType,
                                "options": [["id": opt.id, "name": opt.name, "price": opt.price]]
                            ]
                            price += opt.numericPrice
                        }
                    default: break
                    }
                }
            }
        }
        
        if !customModsDict.isEmpty {
            if let data = try? JSONSerialization.data(withJSONObject: customModsDict),
               let str = String(data: data, encoding: .utf8) {
                customMods = str
            }
        }
        
        let isBev = product.category?.isBeverage ?? false
        let variantName = stepSelections["_variantName"] as? String
        
        return CartItem(
            productId: product.id,
            productName: displayName,
            unitPrice: price,
            quantity: 1,
            notes: productNotes,
            frostingId: frostId,
            frostingName: frostName,
            dryToppingId: topId,
            dryToppingName: topName,
            extraId: extId,
            extraName: extName,
            customModifiers: customMods,
            seat: activeSeat,
            course: activeCourse,
            sentToKitchen: false,
            isBeverage: isBev,
            deliveredToTable: false,
            variantName: variantName,
            isGuest: false
        )
    }
    
    func prepareFlowItemAndShowNotes() {
        guard let item = buildFlowCartItem() else { return }
        pendingCartItem = item
        tempNotes = productNotes
        showNotesDialog = true
    }
    
    func finishFlowAndAddToCart() {
        guard let item = buildFlowCartItem() else { return }
        addToCart(item)
        resetFlow()
    }
    
    // MARK: - Notes
    
    func handleConfirmNotes() {
        guard var item = pendingCartItem else { return }
        item.notes = tempNotes
        addToCart(item)
        showNotesDialog = false
        pendingCartItem = nil
        tempNotes = ""
        // If this came from a custom flow, reset it
        if categoryFlow != nil {
            resetFlow()
        }
    }
    
    func handleCancelNotes() {
        showNotesDialog = false
        // Only clear pending item if not in a custom flow (so user can go back)
        if categoryFlow == nil {
            pendingCartItem = nil
            tempNotes = ""
        }
    }
    
    // MARK: - Cart Operations
    
    private func addToCart(_ item: CartItem) {
        // Try to combine with existing identical item
        if let idx = cart.firstIndex(where: {
            !$0.sentToKitchen &&
            $0.productId == item.productId &&
            $0.unitPrice == item.unitPrice &&
            $0.frostingId == item.frostingId &&
            $0.dryToppingId == item.dryToppingId &&
            $0.extraId == item.extraId &&
            $0.customModifiers == item.customModifiers &&
            $0.seat == item.seat &&
            $0.course == item.course &&
            $0.notes == item.notes &&
            $0.isGuest == item.isGuest
        }) {
            cart[idx].quantity += item.quantity
        } else {
            cart.append(item)
        }
        applyPromotions()
    }
    
    func updateQuantity(at index: Int, delta: Int) {
        guard index < cart.count else { return }
        if cart[index].sentToKitchen {
            showToast("No se puede modificar un item ya enviado a cocina", isError: true)
            return
        }
        let newQty = cart[index].quantity + delta
        if newQty <= 0 {
            removeFromCart(at: index)
        } else {
            cart[index].quantity = newQty
            applyPromotions()
        }
    }
    
    func removeFromCart(at index: Int) {
        guard index < cart.count else { return }
        if cart[index].sentToKitchen {
            voidItemIndex = index
            voidReason = ""
            showVoidDialog = true
            return
        }
        cart.remove(at: index)
        applyPromotions()
    }
    
    func updateCartQuantity(at index: Int, delta: Int) {
        guard index < cart.count else { return }
        let item = cart[index]
        
        // Don't allow changing quantity of items already sent to kitchen
        if item.sentToKitchen {
            showToast("No se puede modificar cantidad de items enviados a cocina", isError: true)
            return
        }
        
        let newQuantity = item.quantity + delta
        if newQuantity < 1 {
            // Remove item if quantity goes below 1
            cart.remove(at: index)
        } else {
            cart[index].quantity = newQuantity
        }
        applyPromotions()
    }
    
    func handleVoidItem() {
        guard let index = voidItemIndex, index < cart.count else { return }
        let item = cart[index]
        
        Task {
            if let itemId = item.itemId, let orderId = item.orderId {
                try? await APIService.shared.voidItem(orderId: orderId, itemId: itemId, reason: voidReason.isEmpty ? "Sin razón" : voidReason, voidedBy: employeeId)
            }
            cart.remove(at: index)
            showToast("Item eliminado: \(item.productName)")
            showVoidDialog = false
            voidItemIndex = nil
            voidReason = ""
        }
    }
    
    func handleMarkAsDelivered(at index: Int) {
        guard index < cart.count else { return }
        let item = cart[index]
        guard let orderId = item.orderId, let itemId = item.itemId else { return }
        
        Task {
            try? await APIService.shared.markItemDelivered(orderId: orderId, itemId: itemId)
            cart[index].deliveredToTable = true
            showToast("Marcado como entregado")
        }
    }
    
    // MARK: - Change Item (swap product globally in DB)
    
    func openChangeItemDialog(at index: Int) {
        changeItemIndex = index
        showChangeItemDialog = true
    }
    
    func confirmChangeItem(newProduct: Product, quantityToChange: Int = 1) {
        guard let index = changeItemIndex, index < cart.count else {
            showChangeItemDialog = false
            return
        }
        let item = cart[index]
        guard let itemId = item.itemId, let orderId = item.orderId else {
            showChangeItemDialog = false
            showToast("Solo items ya enviados pueden cambiarse en BD", isError: true)
            return
        }
        
        let isPlatform = customerName.hasPrefix("Uber") || customerName.hasPrefix("Rappi") || customerName.hasPrefix("Didi")
        let newPrice = isPlatform ? newProduct.numericPlatformPrice : newProduct.numericPrice
        let clampedQty = min(max(quantityToChange, 1), item.quantity)
        let remainingQty = item.quantity - clampedQty
        let changeNote = "Cambio de \(item.productName) a \(newProduct.name)"
        print("🔄 [confirmChangeItem] item=\"\(item.productName)\" qty=\(item.quantity) newProduct=\"\(newProduct.name)\" newPrice=\(newPrice) clampedQty=\(clampedQty) remainingQty=\(remainingQty) isPlatform=\(isPlatform) product.price=\(newProduct.price) product.platformPrice=\(newProduct.platformPrice ?? "nil")")
        
        Task {
            do {
                if remainingQty == 0 {
                    // Replace entire item
                    try await APIService.shared.updateOrderItem(
                        itemId: itemId,
                        productId: newProduct.id,
                        productName: newProduct.name,
                        unitPrice: newPrice,
                        notes: changeNote
                    )
                    let updatedItem = CartItem(
                        productId: newProduct.id,
                        productName: newProduct.name,
                        unitPrice: newPrice,
                        quantity: clampedQty,
                        notes: changeNote,
                        frostingId: nil, frostingName: nil,
                        dryToppingId: nil, dryToppingName: nil,
                        extraId: nil, extraName: nil,
                        customModifiers: nil,
                        seat: item.seat,
                        course: item.course,
                        sentToKitchen: item.sentToKitchen,
                        orderId: item.orderId,
                        itemId: item.itemId,
                        isBeverage: newProduct.category?.isBeverage ?? false,
                        orderStatus: item.orderStatus,
                        deliveredToTable: item.deliveredToTable,
                        variantName: nil,
                        isGuest: item.isGuest
                    )
                    cart[index] = updatedItem
                } else {
                    // Split: reduce original quantity, create new item with new product
                    try await APIService.shared.updateOrderItemQuantity(itemId: itemId, quantity: remainingQty, unitPrice: item.unitPrice)
                    
                    let newOrder: Order = try await APIService.shared.addItemsToOrder(orderId: orderId, items: [[
                        "productId": newProduct.id,
                        "productName": newProduct.name,
                        "quantity": clampedQty,
                        "unitPrice": newPrice,
                        "notes": changeNote,
                        "seat": item.seat,
                        "course": item.course,
                        "isGuest": item.isGuest
                    ]])
                    
                    // Update original in cart with reduced quantity
                    var reduced = item
                    cart[index] = CartItem(
                        productId: item.productId,
                        productName: item.productName,
                        unitPrice: item.unitPrice,
                        quantity: remainingQty,
                        notes: item.notes,
                        frostingId: item.frostingId, frostingName: item.frostingName,
                        dryToppingId: item.dryToppingId, dryToppingName: item.dryToppingName,
                        extraId: item.extraId, extraName: item.extraName,
                        customModifiers: item.customModifiers,
                        seat: item.seat,
                        course: item.course,
                        sentToKitchen: item.sentToKitchen,
                        orderId: item.orderId,
                        itemId: item.itemId,
                        isBeverage: item.isBeverage,
                        orderStatus: item.orderStatus,
                        deliveredToTable: item.deliveredToTable,
                        variantName: nil,
                        isGuest: item.isGuest
                    )
                    
                    // Add new item to cart (get itemId from returned order)
                    if let newOrderItem = newOrder.items?.last(where: { $0.productId == newProduct.id }) {
                        let newCartItem = CartItem(
                            productId: newProduct.id,
                            productName: newProduct.name,
                            unitPrice: newPrice,
                            quantity: clampedQty,
                            notes: changeNote,
                            frostingId: nil, frostingName: nil,
                            dryToppingId: nil, dryToppingName: nil,
                            extraId: nil, extraName: nil,
                            customModifiers: nil,
                            seat: item.seat,
                            course: item.course,
                            sentToKitchen: true,
                            orderId: orderId,
                            itemId: newOrderItem.id,
                            isBeverage: newProduct.category?.isBeverage ?? false,
                            orderStatus: item.orderStatus,
                            deliveredToTable: false,
                            variantName: nil,
                            isGuest: item.isGuest
                        )
                        cart.append(newCartItem)
                    }
                    _ = reduced
                }
                showToast("\(clampedQty)× cambiado a \(newProduct.name)")
            } catch {
                showToast("Error al cambiar item", isError: true)
            }
            showChangeItemDialog = false
            changeItemIndex = nil
        }
    }
    
    func cancelChangeItem() {
        showChangeItemDialog = false
        changeItemIndex = nil
    }
    
    // MARK: - Change Seat/Course
    
    func changeSeat(at index: Int, to newSeat: String) {
        guard index < cart.count else { return }
        cart[index].seat = newSeat
        showToast("Asiento cambiado a \(newSeat)")
    }
    
    func changeCourse(at index: Int, to newCourse: Int) {
        guard index < cart.count else { return }
        cart[index].course = newCourse
        showToast("Tiempo cambiado a T\(newCourse)")
    }
    
    // MARK: - Promotions
    
    func applyPromotions() {
        guard !activePromotions.isEmpty else { return }
        // Reset promotions first
        for i in cart.indices {
            if let origPrice = cart[i].originalPrice {
                cart[i].unitPrice = origPrice
            }
            cart[i].promotionId = nil
            cart[i].promotionName = nil
            cart[i].originalPrice = nil
            cart[i].promotionDiscount = nil
        }
        let productCategoryMap = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.categoryId) })
        cart = PromotionEngine.applyPromotions(cartItems: cart, promotions: activePromotions, productCategoryMap: productCategoryMap)
    }
    
    // MARK: - Remove Promotion from Group
    
    func removePromotionFromGroup(promotionId: String) {
        // Find all items with this promotion and restore their original price
        for i in cart.indices {
            if cart[i].promotionId == promotionId {
                if let origPrice = cart[i].originalPrice {
                    cart[i].unitPrice = origPrice
                }
                cart[i].promotionId = nil
                cart[i].promotionName = nil
                cart[i].originalPrice = nil
                cart[i].promotionDiscount = nil
            }
        }
        showToast("Promoción removida")
    }
    
    // MARK: - Remove Item from Promotion
    
    func removeItemFromPromotion(at index: Int) {
        guard index < cart.count else { return }
        if cart[index].sentToKitchen {
            showToast("No se puede modificar un item ya enviado a cocina", isError: true)
            return
        }
        
        // Restore original price
        if let origPrice = cart[index].originalPrice {
            cart[index].unitPrice = origPrice
        }
        cart[index].promotionId = nil
        cart[index].promotionName = nil
        cart[index].originalPrice = nil
        cart[index].promotionDiscount = nil
        
        // Re-apply promotions to the rest of the cart
        applyPromotions()
        showToast("Item removido de la promoción")
    }
    
    // MARK: - Refresh Order (remove paid items)
    
    func refreshCurrentOrder() async {
        guard let table = selectedTable else { return }
        
        do {
            let orders = try await APIService.shared.fetchOrdersByTable(tableId: table.id)
            // Filter only active orders (not paid/completed)
            let activeOrders = orders.filter { $0.paymentStatus != "paid" && $0.status != "completed" }
            
            if let mainOrder = activeOrders.first {
                currentOrderId = mainOrder.id
                // Merge items from all active orders
                var allItems: [CartItem] = []
                for order in activeOrders {
                    if let items = order.items {
                        for item in items where !(item.voided ?? false) {
                            var cartItem = CartItem.fromOrderItem(item, orderId: order.id)
                            cartItem.orderStatus = order.status
                            allItems.append(cartItem)
                        }
                    }
                }
                cart = allItems
                applyPromotions()
                guestCount = mainOrder.guestCount ?? 1
            } else {
                // No active orders, clear cart
                cart = []
                currentOrderId = nil
            }
        } catch {
            print("Error refreshing order: \(error)")
        }
    }
    
    // MARK: - Send to Kitchen
    
    func handleSendToKitchen() {
        guard !submitting else {
            print("⚠️ handleSendToKitchen: already submitting, ignoring")
            return
        }
        
        let unsentItems = cart.filter { !$0.sentToKitchen }
        guard !unsentItems.isEmpty else { return }
        
        print("🔥 handleSendToKitchen: currentOrderId=\(currentOrderId ?? "nil"), selectedTable=\(selectedTable?.id ?? "nil"), items=\(unsentItems.count)")
        
        submitting = true
        Task {
            do {
                if let orderId = currentOrderId {
                    // Add items to existing order
                    let itemDicts = unsentItems.map { itemToDict($0) }
                    let updated = try await APIService.shared.addItemsToOrder(orderId: orderId, items: itemDicts)
                    
                    // Send to kitchen (mark as preparing)
                    try await APIService.shared.sendToKitchen(orderId: orderId)
                    
                    // Mark all unsent as sent
                    for i in cart.indices {
                        if !cart[i].sentToKitchen {
                            cart[i].sentToKitchen = true
                            cart[i].orderId = orderId
                            // Try to match itemId from response
                            if let updatedItems = updated.items {
                                for dbItem in updatedItems {
                                    if dbItem.productId == cart[i].productId && cart[i].itemId == nil {
                                        cart[i].itemId = dbItem.id
                                        break
                                    }
                                }
                            }
                        }
                    }
                    
                    await printComanda(items: unsentItems, orderId: orderId)
                } else {
                    // Create new order
                    print("🔥 Creating NEW order - tableId=\(selectedTable?.id ?? "nil")")
                    print("🔥 selectedTable object: \(String(describing: selectedTable))")
                    print("🔥 isEmployeeOrder: \(isEmployeeOrder), isHomeDelivery: \(isHomeDelivery)")
                    let itemDicts = unsentItems.map { itemToDict($0) }
                    var body: [String: Any] = [
                        "items": itemDicts,
                        "status": "preparing",
                        "employeeId": employeeId ?? "",
                        "orderType": "dine_in"
                    ]
                    if let table = selectedTable {
                        body["tableId"] = table.id
                        print("✅ tableId agregado al body: \(table.id)")
                    } else {
                        print("❌❌❌ selectedTable is nil - order will be takeaway!")
                    }
                    if !customerName.isEmpty {
                        let nameToSend = isHomeDelivery ? "\(customerName) [ENVIO]" : customerName
                        body["customerName"] = nameToSend
                    }
                    if let loyaltyId = loyaltyCard?.id { body["loyaltyCardId"] = loyaltyId }
                    body["guestCount"] = guestCount
                    if isEmployeeOrder { body["source"] = "employee" }
                    if isEmployeeOrder, let empId = selectedEmployee?.id { body["userId"] = empId }
                    
                    let order = try await APIService.shared.createOrder(body: body)
                    currentOrderId = order.id
                    
                    if let table = selectedTable {
                        try? await APIService.shared.updateTableStatus(tableId: table.id, status: "occupied")
                    }
                    
                    for i in cart.indices {
                        if !cart[i].sentToKitchen {
                            cart[i].sentToKitchen = true
                            cart[i].orderId = order.id
                        }
                    }
                    
                    await printComanda(items: unsentItems, orderId: order.id)
                }
                
                showToast("Enviado a cocina (\(unsentItems.count) items)")
            } catch let error as APIError where error == .offlineQueued {
                // Offline: items are queued for sync, mark local state
                for i in cart.indices {
                    if !cart[i].sentToKitchen {
                        cart[i].sentToKitchen = true
                    }
                }
                showToast("📴 Guardado offline — se enviará a cocina automáticamente")
            } catch {
                print("❌ [handleSendToKitchen] ERROR: \(error)")
                print("❌ [handleSendToKitchen] ERROR localized: \(error.localizedDescription)")
                showToast("Error enviando a cocina", isError: true)
            }
            submitting = false
        }
    }
    
    private func itemToDict(_ item: CartItem) -> [String: Any] {
        var dict: [String: Any] = [
            "productId": item.productId,
            "productName": item.productName,
            "quantity": item.quantity,
            "unitPrice": item.unitPrice,
            "seat": item.seat,
            "course": item.course
        ]
        if !item.notes.isEmpty { dict["notes"] = item.notes }
        if let v = item.frostingId { dict["frostingId"] = v }
        if let v = item.frostingName { dict["frostingName"] = v }
        if let v = item.dryToppingId { dict["dryToppingId"] = v }
        if let v = item.dryToppingName { dict["dryToppingName"] = v }
        if let v = item.extraId { dict["extraId"] = v }
        if let v = item.extraName { dict["extraName"] = v }
        if let v = item.customModifiers { dict["customModifiers"] = v }
        if item.isGuest { dict["isGuest"] = true }
        return dict
    }
    
    private func printComanda(items: [CartItem], orderId: String) async {
        print("🖨️ printComanda called — orderId=\(orderId) items=\(items.count) printServerURL=\(APIService.shared.printServerURL)")
        // Group items for comanda
        let comandaItems: [[String: Any]] = items.map { item in
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "seat": item.seat,
                "course": item.course
            ]
            if !item.notes.isEmpty { dict["notes"] = item.notes }
            if let f = item.frostingName { dict["frosting"] = f }
            if let t = item.dryToppingName { dict["topping"] = t }
            if let e = item.extraName { dict["extra"] = e }
            // Include flow steps (category, products, custom) in kitchen ticket
            if let cm = item.customModifiers,
               let data = cm.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                var flowSelections: [[String: Any]] = []
                for (_, value) in json {
                    if let stepData = value as? [String: Any],
                       let stepName = stepData["stepName"] as? String,
                       let options = stepData["options"] as? [[String: Any]] {
                        for opt in options {
                            if let optName = opt["name"] as? String {
                                flowSelections.append([
                                    "stepName": stepName,
                                    "name": optName
                                ])
                            }
                        }
                    }
                }
                if !flowSelections.isEmpty {
                    dict["flowSteps"] = flowSelections
                }
            }
            dict["isBeverage"] = item.isBeverage
            return dict
        }
        
        await PrintService.shared.printComanda(
            tableNumber: selectedTable?.number,
            orderNumber: String(orderId.prefix(8)),
            customerName: customerName.isEmpty ? nil : customerName,
            items: comandaItems,
            isDelivery: selectedTable == nil,
            guestCount: guestCount
        )
    }
    
    // MARK: - Checkout / Payment
    
    func handleCheckout() {
        guard !cart.isEmpty else {
            showToast("El carrito está vacío", isError: true)
            return
        }
        guard employeeId != nil else {
            showToast("No hay empleado autenticado", isError: true)
            return
        }
        guard selectedTable != nil || !customerName.isEmpty else {
            showToast("No hay mesa ni cliente seleccionado", isError: true)
            return
        }
        
        if let orderId = currentOrderId {
            // Existing order — add unsent items then go to payment
            let unsentItems = cart.filter { !$0.sentToKitchen && $0.itemId == nil }
            if !unsentItems.isEmpty {
                Task {
                    let itemDicts = unsentItems.map { itemToDict($0) }
                    let _ = try? await APIService.shared.addItemsToOrder(orderId: orderId, items: itemDicts)
                    for i in cart.indices {
                        if !cart[i].sentToKitchen && cart[i].itemId == nil {
                            cart[i].sentToKitchen = true
                            cart[i].orderId = orderId
                        }
                    }
                    
                    if !itemAssignments.isEmpty {
                        paymentStep = "split-assign"
                    } else {
                        paymentStep = "payment"
                    }
                    showingPayment = true
                }
            } else {
                if !itemAssignments.isEmpty {
                    paymentStep = "split-assign"
                } else {
                    paymentStep = "payment"
                }
                showingPayment = true
            }
            return
        }
        
        // No order exists — create one
        submitting = true
        Task {
            do {
                let itemDicts = cart.map { itemToDict($0) }
                var body: [String: Any] = [
                    "items": itemDicts,
                    "employeeId": employeeId ?? "",
                    "paymentStatus": "pending"
                ]
                if let table = selectedTable { body["tableId"] = table.id }
                if !customerName.isEmpty { body["customerName"] = customerName }
                if let loyaltyId = loyaltyCard?.id { body["loyaltyCardId"] = loyaltyId }
                
                let order = try await APIService.shared.createOrder(body: body)
                currentOrderId = order.id
                
                if let table = selectedTable {
                    try? await APIService.shared.updateTableStatus(tableId: table.id, status: "occupied")
                }
                
                for i in cart.indices {
                    cart[i].orderId = order.id
                    cart[i].sentToKitchen = true
                }
                
                paymentStep = "payment"
                showingPayment = true
            } catch let error as APIError where error == .offlineQueued {
                // Offline: order queued for sync
                paymentStep = "payment"
                showingPayment = true
                showToast("📴 Orden guardada offline — se sincronizará automáticamente")
            } catch {
                showToast("Error creando orden", isError: true)
            }
            submitting = false
        }
    }
    
    // MARK: - Payment Methods
    
    func handlePayCash() {
        guard let orderId = currentOrderId else { return }
        processing = true
        Task {
            do {
                try await APIService.shared.payOrder(orderId: orderId, body: [
                    "paymentMethod": "cash",
                    "loyaltyCardId": loyaltyCard?.id ?? "",
                    "loyaltyStamps": 1,
                    "employeeId": employeeId ?? "",
                    "tip": tipWithDelivery,
                    "tipPaymentMethod": tipPaymentMethod ?? "cash",
                    "subtotal": cartTotalWithDiscount,
                    "discount": totalDiscount,
                    "discountName": selectedDiscount?.name ?? "Descuento",
                    "discountId": selectedDiscount?.id ?? ""
                ])
                paymentCompleted = true
                await handlePrint(paymentMethod: "cash")
                try? await APIService.shared.openCashDrawer()
                showToast("Pago en efectivo registrado")
            } catch {
                showToast("Error procesando pago", isError: true)
            }
            processing = false
        }
    }
    
    func handlePayTransfer() {
        guard let orderId = currentOrderId else { return }
        processing = true
        Task {
            do {
                try await APIService.shared.payOrder(orderId: orderId, body: [
                    "paymentMethod": "transfer",
                    "loyaltyCardId": loyaltyCard?.id ?? "",
                    "loyaltyStamps": 1,
                    "employeeId": employeeId ?? "",
                    "tip": tipWithDelivery,
                    "tipPaymentMethod": tipPaymentMethod ?? "transfer",
                    "subtotal": cartTotalWithDiscount,
                    "discount": totalDiscount,
                    "discountName": selectedDiscount?.name ?? "Descuento",
                    "discountId": selectedDiscount?.id ?? ""
                ])
                paymentCompleted = true
                await handlePrint(paymentMethod: "transfer")
                showToast("Pago por transferencia registrado")
            } catch {
                showToast("Error procesando pago", isError: true)
            }
            processing = false
        }
    }
    
    func handlePayTerminal() {
        guard let orderId = currentOrderId else { return }
        processing = true
        Task {
            do {
                try await APIService.shared.payOrder(orderId: orderId, body: [
                    "paymentMethod": "terminal_mercadopago",
                    "loyaltyCardId": loyaltyCard?.id ?? "",
                    "loyaltyStamps": 1,
                    "employeeId": employeeId ?? "",
                    "tip": tipWithDelivery,
                    "tipPaymentMethod": tipPaymentMethod ?? "terminal_mercadopago",
                    "subtotal": cartTotalWithDiscount,
                    "discount": totalDiscount,
                    "discountName": selectedDiscount?.name ?? "Descuento",
                    "discountId": selectedDiscount?.id ?? ""
                ])
                paymentCompleted = true
                await handlePrint(paymentMethod: "card")
                showToast("Pago con tarjeta registrado")
            } catch {
                showToast("Error procesando pago", isError: true)
            }
            processing = false
        }
    }
    
    func handlePaySplit() {
        guard let orderId = currentOrderId else { return }
        guard !splitPayments.isEmpty else { return }
        processing = true
        Task {
            do {
                let paymentsData = splitPayments.map { payment in
                    var dict: [String: Any] = [
                        "paymentMethod": payment.paymentMethod,
                        "amount": payment.amount,
                        "tip": payment.tip,
                        "sequenceNumber": payment.sequenceNumber
                    ]
                    if let tipMethod = payment.tipPaymentMethod {
                        dict["tipPaymentMethod"] = tipMethod
                    }
                    return dict
                }
                
                try await APIService.shared.payOrderSplit(
                    orderId: orderId,
                    payments: paymentsData,
                    employeeId: employeeId,
                    discount: totalDiscount > 0 ? totalDiscount : nil,
                    discountName: selectedDiscount?.name,
                    discountId: selectedDiscount?.id,
                    subtotal: cartTotalWithDiscount > 0 ? cartTotalWithDiscount : nil
                )
                paymentCompleted = true
                await handlePrint()
                showToast("Pago dividido registrado")
            } catch {
                showToast("Error procesando pago dividido", isError: true)
            }
            processing = false
        }
    }
    
    func handleDeliverToDriver() {
        guard let orderId = currentOrderId else { return }
        processing = true
        Task {
            do {
                let subtotal = cart.reduce(0.0) { sum, item in
                    let basePrice = item.originalPrice ?? item.unitPrice
                    let promoDiscount = item.promotionDiscount ?? 0
                    return sum + (basePrice * Double(item.quantity) - promoDiscount)
                }
                try await APIService.shared.payOrder(orderId: orderId, body: [
                    "paymentMethod": "platform_delivery",
                    "subtotal": cartTotalWithDiscount,
                    "tip": 0,
                    "employeeId": employeeId ?? "",
                    "discount": totalDiscount,
                    "discountName": selectedDiscount?.name ?? "Descuento",
                    "discountId": selectedDiscount?.id ?? ""
                ])
                await handlePrint()
                showToast("Orden entregada a repartidor")
                paymentCompleted = true
                handleConfirmOrder()
            } catch {
                showToast("Error entregando orden", isError: true)
            }
            processing = false
        }
    }
    
    // MARK: - Split Bill Init
    
    func initSplitBySeat() {
        var assignments: [Int: [Int]] = [:]
        var payments: [Int: IndividualPayment] = [:]
        var tips: [Int: IndividualTip] = [:]
        for i in 0..<guestCount {
            assignments[i] = []
            payments[i] = IndividualPayment()
            tips[i] = IndividualTip()
        }
        for (cartIndex, item) in cart.enumerated() {
            guard item.seat != "C" else { continue }
            if item.seat.hasPrefix("A"), let seatNum = Int(item.seat.dropFirst()), seatNum >= 1, seatNum <= guestCount {
                assignments[seatNum - 1, default: []].append(cartIndex)
            }
        }
        itemAssignments = assignments
        individualPayments = payments
        individualTips = tips
        splitBillType = "by-seat"
    }
    
    func initSplitCustom() {
        var assignments: [Int: [Int]] = [:]
        var payments: [Int: IndividualPayment] = [:]
        var tips: [Int: IndividualTip] = [:]
        for i in 0..<guestCount {
            assignments[i] = []
            payments[i] = IndividualPayment()
            tips[i] = IndividualTip()
        }
        itemAssignments = assignments
        individualPayments = payments
        individualTips = tips
        splitBillType = "custom"
    }
    
    // MARK: - Split Bill Payment
    
    func handleSplitPayPerson() {
        let pIdx = selectedSplitPersonIndex
        let assignedItems = itemAssignments[pIdx] ?? []
        let tipData = individualTips[pIdx] ?? IndividualTip()
        let personTotal = assignedItems.reduce(0.0) { sum, ci in
            guard ci < cart.count else { return sum }
            let item = cart[ci]
            let basePrice = item.originalPrice ?? item.unitPrice
            let promoDiscount = item.promotionDiscount ?? 0
            return sum + (basePrice * Double(item.quantity) - promoDiscount)
        }
        let tipAmt = tipData.showCustom ? (Double(tipData.custom) ?? 0) : personTotal * Double(tipData.percentage) / 100
        let finalTotal = personTotal + tipAmt
        
        let discountAmt = splitPersonDiscountAmount
        let actualTotal = finalTotal - discountAmt
        individualPayments[pIdx] = IndividualPayment(
            paid: true,
            method: splitPaymentMethod,
            amount: actualTotal,
            tipAmount: tipAmt,
            tipPaymentMethod: splitTipPaymentMethod,
            discountAmount: discountAmt,
            discountName: splitPersonDiscountName
        )
        
        // Print individual ticket
        Task {
            await printSplitPersonTicket(personIndex: pIdx, items: assignedItems, tip: tipAmt, total: finalTotal)
        }
        
        showToast("Persona \(pIdx + 1) - Pago registrado: \(formatCurrency(finalTotal))")
        paymentStep = "split-overview"
    }
    
    func handleFinalizeSplitBill() {
        guard let orderId = currentOrderId else { return }
        confirmingOrder = true
        Task {
            do {
                let paymentsData = (0..<guestCount).compactMap { i -> [String: Any]? in
                    guard let payment = individualPayments[i], payment.paid else { return nil }
                    var dict: [String: Any] = [
                        "paymentMethod": payment.method ?? "cash",
                        "amount": payment.amount - payment.tipAmount,
                        "tip": payment.tipAmount,
                        "sequenceNumber": i + 1
                    ]
                    if let tipMethod = payment.tipPaymentMethod {
                        dict["tipPaymentMethod"] = tipMethod
                    }
                    return dict
                }
                
                try await APIService.shared.payOrderSplit(
                    orderId: orderId,
                    payments: paymentsData,
                    discount: totalDiscount > 0 ? totalDiscount : nil,
                    discountName: selectedDiscount?.name,
                    discountId: selectedDiscount?.id,
                    subtotal: cartTotalWithDiscount > 0 ? cartTotalWithDiscount : nil
                )
                paymentCompleted = true
                await handlePrint()
                showToast("Pago dividido completado")
                withAnimation(.easeInOut(duration: 0.3)) {
                    paymentStep = "done"
                }
            } catch {
                showToast("Error procesando pago dividido", isError: true)
            }
            confirmingOrder = false
        }
    }
    
    // MARK: - Print Ticket
    
    func handlePrint(paymentMethod: String? = nil) async {
        let sentItems = cart.filter { $0.sentToKitchen }
        let itemsToPrint = sentItems.isEmpty ? cart : sentItems
        print("🖨️ handlePrint called — sentItems=\(sentItems.count) totalCart=\(cart.count) itemsToPrint=\(itemsToPrint.count)")
        guard !itemsToPrint.isEmpty else { return }
        
        // Group by seat then product
        var seatGroups: [String: [String: TicketItem]] = [:]
        for item in itemsToPrint {
            let seat = item.seat.isEmpty ? "C" : item.seat
            if seatGroups[seat] == nil { seatGroups[seat] = [:] }
            let key = "\(item.productId)-\(item.unitPrice)-\(item.promotionId ?? "none")"
            if var existing = seatGroups[seat]?[key] {
                existing.qty += item.quantity
                existing.total = Double(existing.qty) * (existing.originalPrice ?? existing.price)
                if let pd = item.promotionDiscount {
                    existing.promotionDiscount = (existing.promotionDiscount ?? 0) + pd
                }
                seatGroups[seat]?[key] = existing
            } else {
                seatGroups[seat]?[key] = TicketItem(
                    name: item.productName,
                    qty: item.quantity,
                    price: item.unitPrice,
                    total: Double(item.quantity) * (item.originalPrice ?? item.unitPrice),
                    promotionName: item.promotionName,
                    promotionDiscount: item.promotionDiscount,
                    originalPrice: item.originalPrice,
                    isGuest: item.isGuest
                )
            }
        }
        
        // Calculate subtotal from original prices, promo discounts as global line
        let subtotal = seatGroups.values.flatMap { $0.values }.filter { !($0.isGuest ?? false) }.reduce(0.0) { sum, item in
            return sum + ((item.originalPrice ?? item.price) * Double(item.qty))
        }
        let totalPromoDiscount = seatGroups.values.flatMap { $0.values }.filter { !($0.isGuest ?? false) }.reduce(0.0) { sum, item in
            return sum + (item.promotionDiscount ?? 0)
        }
        
        let manualDiscountAmt = selectedDiscount != nil ? Int(flexibleDiscountAmount) : 0
        let discountData: [String: Any]? = manualDiscountAmt > 0 ? ["name": selectedDiscount?.name ?? "Descuento", "amount": manualDiscountAmt] : nil
        
        let subWithDiscount = subtotal - totalPromoDiscount - Double(manualDiscountAmt)
        let tip = showCustomTip ? (Double(customTip) ?? 0) : subWithDiscount * Double(tipPercentage) / 100
        let tipPlusDelivery = tip + deliveryFeeAmount
        let total = subWithDiscount + tipPlusDelivery
        
        var itemsBySeat: [String: [[String: Any]]] = [:]
        for (seat, items) in seatGroups {
            itemsBySeat[seat] = items.values.map { item in
                let originalTotal = Int((item.originalPrice ?? item.price) * Double(item.qty))
                var dict: [String: Any] = [
                    "name": item.name,
                    "qty": item.qty,
                    "total": originalTotal
                ]
                if let pn = item.promotionName { dict["promotionName"] = pn }
                if let pd = item.promotionDiscount, pd > 0 { dict["promotionDiscount"] = pd }
                if let ig = item.isGuest, ig { dict["isGuest"] = true }
                return dict
            }
        }
        
        let isSplit = !splitPayments.isEmpty
        let paymentMethodToShow = isSplit ? "Dividido" : paymentMethod
        let splitPaymentsData: [[String: Any]]? = isSplit ? splitPayments.map { p in
            var dict: [String: Any] = [
                "method": p.displayMethod,
                "amount": p.amount
            ]
            if p.tip > 0 {
                dict["tip"] = p.tip
                dict["tipMethod"] = p.tipPaymentMethod ?? p.paymentMethod
            }
            return dict
        } : nil
        
        await PrintService.shared.printTicket(
            customerName: customerName,
            orderNumber: String((sentItems.first?.orderId ?? "N/A").prefix(8)),
            items: itemsBySeat,
            subtotal: Int(subtotal),
            tip: Int(tipPlusDelivery),
            total: Int(total),
            tableNumber: selectedTable?.number ?? "",
            isDelivery: selectedTable == nil,
            discount: discountData,
            paymentMethod: paymentMethodToShow,
            tipPaymentMethod: tipPaymentMethod,
            splitPayments: splitPaymentsData,
            deliveryFee: Int(deliveryFeeAmount)
        )
    }
    
    func handlePrintPreTicket() async {
        // Imprimir todos los items del carrito (incluso los no enviados a cocina)
        guard !cart.isEmpty else { return }
        
        var itemsBySeat: [String: [[String: Any]]] = [:]
        for item in cart {
            let seat = item.seat.isEmpty ? "C" : item.seat
            if itemsBySeat[seat] == nil { itemsBySeat[seat] = [] }
            // Show original price, discount will be shown as a global line
            let originalTotal = Int(Double(item.quantity) * (item.originalPrice ?? item.unitPrice))
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "total": originalTotal
            ]
            if let pn = item.promotionName { dict["promotionName"] = pn }
            if let pd = item.promotionDiscount, pd > 0 { dict["promotionDiscount"] = pd }
            itemsBySeat[seat]?.append(dict)
        }
        
        let subtotal = cart.filter { !$0.isGuest }.reduce(0.0) { sum, item in
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity))
        }
        let totalDiscount = cart.filter { !$0.isGuest }.reduce(0.0) { sum, item in
            return sum + (item.promotionDiscount ?? 0)
        }
        let preTicketTotal = subtotal - totalDiscount + deliveryFeeAmount
        
        await PrintService.shared.printTicket(
            customerName: customerName,
            orderNumber: "PRE-TICKET",
            items: itemsBySeat,
            subtotal: Int(subtotal),
            tip: Int(deliveryFeeAmount),
            total: Int(preTicketTotal),
            tableNumber: selectedTable?.number ?? "",
            isDelivery: selectedTable == nil,
            discount: nil,
            paymentMethod: nil,
            deliveryFee: Int(deliveryFeeAmount)
        )
    }
    
    func handlePrintPreTicketPDF() async {
        // Generar PDF y compartir
        guard !cart.isEmpty else { return }
        
        let pdfData = generatePreTicketPDF()
        
        // Guardar PDF temporalmente
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("pre-ticket-\(Date().timeIntervalSince1970).pdf")
        
        do {
            try pdfData.write(to: tempURL)
            
            // Mostrar share sheet en el main thread
            await MainActor.run {
                let activityVC = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
                
                // Para iPad - necesita popover
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let window = windowScene.windows.first,
                   let rootVC = window.rootViewController {
                    
                    if let popover = activityVC.popoverPresentationController {
                        popover.sourceView = window
                        popover.sourceRect = CGRect(x: window.bounds.midX, y: window.bounds.midY, width: 0, height: 0)
                        popover.permittedArrowDirections = []
                    }
                    
                    rootVC.present(activityVC, animated: true)
                }
            }
        } catch {
            showToast("Error generando PDF", isError: true)
        }
    }
    
    private func generatePreTicketPDF() -> Data {
        let pdfMetaData = [
            kCGPDFContextCreator: "Bruma POS",
            kCGPDFContextTitle: "Pre-Ticket"
        ]
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = pdfMetaData as [String: Any]
        
        // Tamaño de ticket térmico (80mm = ~227 puntos)
        let pageWidth: CGFloat = 227
        let pageHeight: CGFloat = 800  // Altura variable
        let pageRect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        
        let renderer = UIGraphicsPDFRenderer(bounds: pageRect, format: format)
        
        let data = renderer.pdfData { (context) in
            context.beginPage()
            
            let titleFont = UIFont.boldSystemFont(ofSize: 18)
            let largeFont = UIFont.boldSystemFont(ofSize: 14)
            let bodyFont = UIFont.systemFont(ofSize: 9)  // Más pequeño (era 10)
            let smallFont = UIFont.systemFont(ofSize: 7)  // Más pequeño (era 8)
            
            let margin: CGFloat = 10
            var yPosition: CGFloat = 10
            
            // Logo (si existe en el bundle)
            if let logoImage = UIImage(named: "logo") {
                let logoHeight: CGFloat = 120  // Doble de grande (era 60)
                let logoWidth = logoImage.size.width * (logoHeight / logoImage.size.height)
                let logoX = (pageWidth - logoWidth) / 2
                logoImage.draw(in: CGRect(x: logoX, y: yPosition, width: logoWidth, height: logoHeight))
                yPosition += logoHeight + 5
            } else {
                // Fallback: texto BRUMA
                let titleAttributes: [NSAttributedString.Key: Any] = [.font: titleFont]
                let title = "BRUMA"
                let titleSize = title.size(withAttributes: titleAttributes)
                title.draw(at: CGPoint(x: (pageWidth - titleSize.width) / 2, y: yPosition), withAttributes: titleAttributes)
                yPosition += titleSize.height + 5
            }
            
            // Dirección centrada
            let addressAttributes: [NSAttributedString.Key: Any] = [.font: smallFont]
            let address1 = "Av. Panamericana Casa B14"
            let address2 = "Col. Pedregal de Carrasco, CDMX"
            let addr1Size = address1.size(withAttributes: addressAttributes)
            let addr2Size = address2.size(withAttributes: addressAttributes)
            address1.draw(at: CGPoint(x: (pageWidth - addr1Size.width) / 2, y: yPosition), withAttributes: addressAttributes)
            yPosition += addr1Size.height + 2
            address2.draw(at: CGPoint(x: (pageWidth - addr2Size.width) / 2, y: yPosition), withAttributes: addressAttributes)
            yPosition += addr2Size.height + 10
            
            // Fecha y hora centrada
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "dd/MM/yyyy HH:mm"
            let dateStr = dateFormatter.string(from: Date())
            let dateSize = dateStr.size(withAttributes: addressAttributes)
            dateStr.draw(at: CGPoint(x: (pageWidth - dateSize.width) / 2, y: yPosition), withAttributes: addressAttributes)
            yPosition += dateSize.height + 10
            
            // Mesa/Para Llevar y # de Orden
            let labelAttributes: [NSAttributedString.Key: Any] = [.font: largeFont]
            let label = selectedTable != nil ? "MESA \(selectedTable!.number)" : "PARA LLEVAR"
            let orderNum = "#PRE"
            label.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: labelAttributes)
            let orderSize = orderNum.size(withAttributes: labelAttributes)
            orderNum.draw(at: CGPoint(x: pageWidth - margin - orderSize.width, y: yPosition), withAttributes: labelAttributes)
            yPosition += 20
            
            // Línea separadora
            let linePath = UIBezierPath()
            linePath.move(to: CGPoint(x: margin, y: yPosition))
            linePath.addLine(to: CGPoint(x: pageWidth - margin, y: yPosition))
            UIColor.black.setStroke()
            linePath.lineWidth = 0.5
            linePath.stroke()
            yPosition += 8
            
            // Items grouped by promotion
            let itemAttributes: [NSAttributedString.Key: Any] = [.font: bodyFont]
            let promoAttributes: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: UIColor.gray]
            let discountAttributes: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: UIColor.red]
            var subtotal: Double = 0
            var totalDiscount: Double = 0
            
            for item in cart {
                let originalTotal = Double(item.quantity) * (item.originalPrice ?? item.unitPrice)
                let itemDiscount = item.promotionDiscount ?? 0
                
                subtotal += originalTotal
                totalDiscount += itemDiscount
                
                // Show item line with original price
                let qtyName = "\(item.quantity)x \(item.productName)"
                let price = formatCurrency(originalTotal)
                qtyName.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: itemAttributes)
                let priceSize = price.size(withAttributes: itemAttributes)
                price.draw(at: CGPoint(x: pageWidth - margin - priceSize.width, y: yPosition), withAttributes: itemAttributes)
                yPosition += 15
                
                // Show promo name if applicable
                if item.promotionId != nil && item.promotionName != nil {
                    let promoLine = "  > \(item.promotionName!)"
                    promoLine.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: promoAttributes)
                    yPosition += 12
                }
                
                // Notas
                if !item.notes.isEmpty {
                    let noteAttributes: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: UIColor.gray]
                    let note = "  ↳ \(item.notes)"
                    note.draw(at: CGPoint(x: margin + 5, y: yPosition), withAttributes: noteAttributes)
                    yPosition += 10
                }
            }
            
            yPosition += 5
            
            // Línea separadora
            let linePath2 = UIBezierPath()
            linePath2.move(to: CGPoint(x: margin, y: yPosition))
            linePath2.addLine(to: CGPoint(x: pageWidth - margin, y: yPosition))
            UIColor.black.setStroke()
            linePath2.lineWidth = 0.5
            linePath2.stroke()
            yPosition += 8
            
            // Subtotal (original price before discounts)
            let totalAttributes: [NSAttributedString.Key: Any] = [.font: largeFont]
            let subtotalLabel = "SUBTOTAL:"
            let subtotalPrice = formatCurrency(subtotal)
            subtotalLabel.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: totalAttributes)
            let subtotalPriceSize = subtotalPrice.size(withAttributes: totalAttributes)
            subtotalPrice.draw(at: CGPoint(x: pageWidth - margin - subtotalPriceSize.width, y: yPosition), withAttributes: totalAttributes)
            yPosition += 18
            
            // Promotion discount line
            if totalDiscount > 0 {
                let discountLabelAttributes: [NSAttributedString.Key: Any] = [.font: bodyFont, .foregroundColor: UIColor.red]
                let discountLabel = "Desc. Promos:"
                let discountPrice = "-\(formatCurrency(totalDiscount))"
                discountLabel.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: discountLabelAttributes)
                let discountPriceSize = discountPrice.size(withAttributes: discountLabelAttributes)
                discountPrice.draw(at: CGPoint(x: pageWidth - margin - discountPriceSize.width, y: yPosition), withAttributes: discountLabelAttributes)
                yPosition += 16
            }
            
            let finalSubtotal = subtotal - totalDiscount
            
            // Envío a domicilio
            if isHomeDelivery {
                let deliveryAttributes: [NSAttributedString.Key: Any] = [.font: bodyFont]
                let deliveryLabel = "Envío a domicilio:"
                let deliveryPrice = formatCurrency(homeDeliveryFee)
                deliveryLabel.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: deliveryAttributes)
                let deliveryPriceSize = deliveryPrice.size(withAttributes: deliveryAttributes)
                deliveryPrice.draw(at: CGPoint(x: pageWidth - margin - deliveryPriceSize.width, y: yPosition), withAttributes: deliveryAttributes)
                yPosition += 18
                
                // Total con envío y descuentos
                let grandTotalLabel = "TOTAL:"
                let grandTotalPrice = formatCurrency(finalSubtotal + homeDeliveryFee)
                grandTotalLabel.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: totalAttributes)
                let grandTotalPriceSize = grandTotalPrice.size(withAttributes: totalAttributes)
                grandTotalPrice.draw(at: CGPoint(x: pageWidth - margin - grandTotalPriceSize.width, y: yPosition), withAttributes: totalAttributes)
                yPosition += 18
            } else {
                // Total con descuentos (sin envío)
                let grandTotalLabel = "TOTAL:"
                let grandTotalPrice = formatCurrency(finalSubtotal)
                grandTotalLabel.draw(at: CGPoint(x: margin, y: yPosition), withAttributes: totalAttributes)
                let grandTotalPriceSize = grandTotalPrice.size(withAttributes: totalAttributes)
                grandTotalPrice.draw(at: CGPoint(x: pageWidth - margin - grandTotalPriceSize.width, y: yPosition), withAttributes: totalAttributes)
                yPosition += 18
            }
            yPosition += 7
            
            // Footer
            let footerAttributes: [NSAttributedString.Key: Any] = [.font: smallFont, .foregroundColor: UIColor.gray]
            let footer = "Este es un pre-ticket."
            let footer2 = "No es válido como comprobante de pago."
            let footerSize = footer.size(withAttributes: footerAttributes)
            let footer2Size = footer2.size(withAttributes: footerAttributes)
            footer.draw(at: CGPoint(x: (pageWidth - footerSize.width) / 2, y: yPosition), withAttributes: footerAttributes)
            yPosition += footerSize.height + 2
            footer2.draw(at: CGPoint(x: (pageWidth - footer2Size.width) / 2, y: yPosition), withAttributes: footerAttributes)
        }
        
        return data
    }
    
    func printSplitPersonTicket(personIndex: Int, items: [Int], tip: Double, total: Double) async {
        guard !items.isEmpty else { return }
        
        var ticketItems: [[String: Any]] = []
        for itemIndex in items {
            guard itemIndex < cart.count else { continue }
            let item = cart[itemIndex]
            let originalTotal = Int(Double(item.quantity) * (item.originalPrice ?? item.unitPrice))
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "price": item.originalPrice ?? item.unitPrice,
                "total": originalTotal
            ]
            if let pn = item.promotionName { dict["promotionName"] = pn }
            ticketItems.append(dict)
        }
        
        let subtotal = items.reduce(0.0) { sum, ci in
            guard ci < cart.count else { return sum }
            let item = cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity))
        }
        
        let discountAmt = splitPersonDiscountAmount
        let discountData: [String: Any]? = discountAmt > 0 ? ["name": splitPersonDiscountName.isEmpty ? "Descuento" : splitPersonDiscountName, "amount": discountAmt] : nil
        
        await PrintService.shared.printSeatBill(
            tableNumber: selectedTable?.number,
            orderNumber: currentOrderId?.prefix(8).description ?? "",
            seatLabel: "Asiento \(personIndex + 1)",
            items: ticketItems,
            subtotal: subtotal,
            tip: tip,
            discount: discountData,
            total: total - discountAmt,
            paymentMethod: splitPaymentMethod
        )
    }
    
    func printSeatPreAccount(seatIndex: Int) async {
        let assignedIndices = itemAssignments[seatIndex] ?? []
        guard !assignedIndices.isEmpty else { return }
        
        var ticketItems: [[String: Any]] = []
        for ci in assignedIndices {
            guard ci < cart.count else { continue }
            let item = cart[ci]
            let originalTotal = Int(Double(item.quantity) * (item.originalPrice ?? item.unitPrice))
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "price": item.originalPrice ?? item.unitPrice,
                "total": originalTotal
            ]
            if let pn = item.promotionName { dict["promotionName"] = pn }
            ticketItems.append(dict)
        }
        
        let subtotal = assignedIndices.reduce(0.0) { sum, ci in
            guard ci < cart.count else { return sum }
            let item = cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0))
        }
        
        await PrintService.shared.printSeatBill(
            tableNumber: selectedTable?.number,
            orderNumber: currentOrderId?.prefix(8).description ?? "",
            seatLabel: "Asiento \(seatIndex + 1)",
            items: ticketItems,
            subtotal: subtotal,
            tip: 0,
            discount: nil,
            total: subtotal,
            paymentMethod: nil
        )
    }
    
    // MARK: - Confirm / Reset Order
    
    func handleConfirmOrder() {
        showToast("Orden completada")
        
        cart = []
        activeCourse = 1
        loyaltyCard = nil
        showingPayment = false
        showingLoyaltyStep = false
        paymentStep = "payment"
        paymentMethod = "cash"
        cashReceived = ""
        currentOrderId = nil
        paymentCompleted = false
        selectedTable = nil
        customerName = ""
        tipPercentage = 0
        customTip = ""
        showCustomTip = false
        tipPaymentMethod = nil
        splitPayments = []
        splitBillMode = false
        splitBillType = "by-seat"
        itemAssignments = [:]
        individualPayments = [:]
        individualTips = [:]
        splitPaymentMethod = nil
        splitTipPaymentMethod = nil
        splitPersonDiscountAmount = 0
        splitPersonDiscountName = ""
        splitCashReceived = ""
        selectedDiscount = nil
        guestItemsSelection = []
        
        currentScreen = .tableSelection
        Task { await refreshTables() }
    }
    
    func handleChangeTable() {
        showTransferTableDialog = true
    }
    
    func toggleRush() {
        guard let orderId = currentOrderId else { return }
        Task {
            do {
                let order = try await APIService.shared.fetchOrder(orderId: orderId)
                let isRush = order.priority == 1
                if isRush {
                    try await APIService.shared.unrushOrder(orderId: orderId)
                    showToast("Rush desactivado")
                } else {
                    try await APIService.shared.rushOrder(orderId: orderId)
                    showToast("🔥 Rush activado")
                }
            } catch {
                showToast("Error al cambiar rush", isError: true)
            }
        }
    }
    
    @Published var showingHoldConfirmation = false
    
    func toggleHold() {
        guard let orderId = currentOrderId else { return }
        let isOnHold = isCurrentOrderOnHold
        if !isOnHold {
            showingHoldConfirmation = true
            return
        }
        Task {
            do {
                try await APIService.shared.unholdOrder(orderId: orderId)
                showToast("Orden reanudada")
            } catch {
                showToast("Error al reanudar orden", isError: true)
            }
        }
    }
    
    func executeHold() {
        guard let orderId = currentOrderId else { return }
        Task {
            do {
                try await APIService.shared.holdOrder(orderId: orderId)
                showToast("⏸️ Orden pausada en cocina")
            } catch {
                showToast("Error al pausar orden", isError: true)
            }
        }
    }
    
    func transferToTable(_ targetTable: Table) async {
        guard let currentTable = selectedTable else { return }
        guard let orderId = currentOrderId else { return }
        
        // Check if target table is occupied
        if targetTable.status == "occupied" {
            showToast("La mesa \(targetTable.number) ya está ocupada", isError: true)
            return
        }
        
        // Transfer order to new table
        do {
            try await APIService.shared.transferOrder(orderId: orderId, newTableId: targetTable.id)
            
            // Update local state
            selectedTable = targetTable
            showTransferTableDialog = false
            
            // Refresh tables
            await refreshTables()
            
            showToast("Orden transferida a Mesa \(targetTable.number)")
        } catch {
            showToast("Error al transferir orden", isError: true)
        }
    }
    
    func handleReleaseTable() {
        print("🔥 handleReleaseTable() called - cart.count=\(cart.count), currentOrderId=\(currentOrderId ?? "nil")")
        let orderType = selectedTable != nil ? "Mesa \(selectedTable!.number)" : "Orden Para Llevar"
        
        // Confirmar si hay items en el carrito
        if !cart.isEmpty {
            print("🛒 Cart not empty (\(cart.count) items), showing confirmation dialog")
            showingReleaseConfirmation = true
            return
        }
        
        print("🛒 Cart empty, calling executeReleaseTable directly")
        // Si no hay items, liberar directamente
        executeReleaseTable()
    }
    
    func executeReleaseTable() {
        print("🔥 executeReleaseTable() started")
        Task {
            do {
                // 1. Eliminar la orden de la BD si existe
                if let orderId = currentOrderId {
                    print("🗑️ Deleting order \(orderId)")
                    try await APIService.shared.deleteOrder(orderId: orderId)
                    print("✅ Orden \(orderId) eliminada de la BD")
                } else {
                    print("⚠️ No currentOrderId to delete")
                }
                
                // 2. Si hay mesa, actualizar estado a "available"
                if let table = selectedTable {
                    try await APIService.shared.updateTableStatus(
                        tableId: table.id,
                        status: "available"
                    )
                }
                
                let orderType = selectedTable != nil ? "Mesa \(selectedTable!.number)" : "Orden"
                showToast("\(orderType) liberada")
                
                // 3. Resetear estado
                selectedTable = nil
                cart = []
                activeCourse = 1
                activeSeat = "C"
                customerName = ""
                currentOrderId = nil
                guestCount = 1
                
                // 4. Recargar mesas
                await refreshTables()
                
                // 5. Navegar de regreso al selector de mesas
                await MainActor.run {
                    currentScreen = .tableSelection
                    selectedTab = 0 // Tab 0 = Mesas
                }
                
            } catch {
                print("❌ Error liberando mesa/orden:", error)
                showToast("Error liberando mesa/orden", isError: true)
            }
        }
    }
    
    // MARK: - Loyalty
    
    func handleQRCodeDetected(_ code: String) {
        guard !code.trimmingCharacters(in: .whitespaces).isEmpty else {
            showToast("Código QR inválido", isError: true)
            return
        }
        loadingCard = true
        Task {
            do {
                let card = try await APIService.shared.searchLoyaltyCard(barcode: code)
                loyaltyCard = card
                qrDialogOpen = false
                qrCode = ""
                showToast("Cliente: \(card.customerName)")
            } catch {
                showToast("Tarjeta no encontrada", isError: true)
                qrCode = ""
            }
            loadingCard = false
        }
    }
    
    func handleManualStampSubmit() {
        guard !manualBarcodeInput.trimmingCharacters(in: .whitespaces).isEmpty else {
            showToast("Ingresa el código de barras", isError: true)
            return
        }
        loadingCard = true
        Task {
            do {
                let card = try await APIService.shared.fetchLoyaltyCardByBarcode(manualBarcodeInput)
                let _ = try await APIService.shared.addStamp(cardId: card.id)
                showToast("Sello agregado a \(card.customerName)")
                manualStampDialogOpen = false
                manualBarcodeInput = ""
            } catch {
                showToast("Error al procesar sello", isError: true)
            }
            loadingCard = false
        }
    }
    
    // MARK: - Guest / Courtesy
    
    func handleGuestProductSubmit() {
        guard !guestProductCart.isEmpty else { return }
        Task {
            do {
                let items: [[String: Any]] = guestProductCart.map { item in
                    [
                        "productId": item.productId,
                        "productName": item.name,
                        "quantity": item.qty,
                        "unitPrice": item.price,
                        "notes": "Cortesía",
                        "isGuest": true,
                        "seat": "C",
                        "course": 1
                    ]
                }
                
                let order = try await APIService.shared.createOrder(body: [
                    "items": items,
                    "status": "preparing",
                    "customerName": "Cortesía Casa"
                ])
                
                try? await APIService.shared.payOrder(orderId: order.id, body: [
                    "paymentMethod": "cash",
                    "cashReceived": 0,
                    "tip": 0,
                    "discount": 0
                ])
                
                await PrintService.shared.printGuestTicket(
                    items: guestProductCart.map { ["name": $0.name, "qty": $0.qty] },
                    orderNumber: String(order.id.prefix(8))
                )
                
                showToast("Cortesía registrada (\(guestProductCart.count) productos)")
                guestProductCart = []
                showGuestProductDialog = false
            } catch {
                showToast("Error registrando cortesía", isError: true)
            }
        }
    }
    
    func markItemsAsGuest() {
        for index in guestItemsSelection {
            guard index < cart.count else { continue }
            cart[index].isGuest = true
        }
        showToast("\(guestItemsSelection.count) producto(s) marcado(s) como invitado")
        guestItemsSelection = []
    }
    
    func unmarkItemAsGuest(at index: Int) {
        guard index < cart.count else { return }
        cart[index].isGuest = false
        showToast("Producto desinvitado")
    }
}

// MARK: - Supporting Types

struct IndividualPayment {
    var paid: Bool = false
    var method: String?
    var amount: Double = 0
    var tipAmount: Double = 0
    var tipPaymentMethod: String? = nil
    var discountAmount: Double = 0
    var discountName: String = ""

    var methodDisplay: String {
        switch method {
        case "cash": return "Efectivo"
        case "card": return "Tarjeta"
        case "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return method ?? ""
        }
    }
}

struct IndividualTip {
    var percentage: Int = 0
    var custom: String = ""
    var showCustom: Bool = false
}

struct GuestProductItem: Identifiable {
    let id = UUID()
    let productId: String
    let name: String
    let price: Double
    var qty: Int
}

struct TicketItem {
    let name: String
    var qty: Int
    let price: Double
    var total: Double
    var promotionName: String?
    var promotionDiscount: Double?
    var originalPrice: Double?
    var isGuest: Bool?
}
