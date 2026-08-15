import Foundation
import SwiftUI
import Combine
import AVFoundation

@MainActor
class POSViewModel: ObservableObject {
    // MARK: - Pedidos en línea (pantalla verde)
    @Published var incomingOnlineOrder: Order?
    private var onlineOrderAudioPlayer: AVAudioPlayer?
    
    // MARK: - WebSocket & Network
    private let socketService = SocketService.shared
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - App State
    enum AppScreen { case dashboard, tableSelection, pos, customerDisplay }
    @Published var currentScreen: AppScreen = POSConfig.load().customerDisplayEnabled ? .customerDisplay : .dashboard
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
    @Published var employeeRole: String?
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
    @Published var pendingReservationsCount: Int = 0
    @Published var showReservations: Bool = false

    // MARK: - Floor-plan map
    enum TableViewMode: String { case cards, mapa }
    @Published var tableViewMode: TableViewMode = .cards {
        didSet { UserDefaults.standard.set(tableViewMode.rawValue, forKey: "pos_tableViewMode") }
    }
    @Published var editingLayout: Bool = false
    @Published var mergeModeActive: Bool = false
    @Published var selectedForMerge: Set<String> = []
    // The first table picked (the merge "anchor") — becomes the primary that
    // keeps its position and order, unless another selected table holds the
    // active order (which must always win to avoid orphaning it).
    @Published var mergeAnchorId: String?
    @Published var showMergeConfirmation: Bool = false
    @Published var isMerging: Bool = false
    @Published var showUnplacedTablesTray: Bool = false
    @Published var mapFixtures: [MapFixture] = []
    // Kept in sync by TableMapView from its live GeometryReader size, so grid
    // math here always matches what's actually rendered on this device.
    @Published var mapMetrics = MapGridMetrics(columns: 20, rows: 14, cellSize: 50)

    var canEditLayout: Bool { employeeRole == "admin" }

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
        
        // Sort by number numerically (not alphabetically so "10" comes after "9")
        return result.sorted {
            (Int($0.number) ?? 0) < (Int($1.number) ?? 0)
        }
    }

    var placedTables: [Table] {
        var result = tables.filter { !config.disabledTableIds.contains($0.id) && $0.isPlaced }
        // While editing the layout, always show every placed table regardless
        // of the status filter — hiding one mid-drag would be confusing.
        if !editingLayout {
            switch tableFilter {
            case .all: break
            case .available: result = result.filter { $0.isAvailable }
            case .occupied: result = result.filter { $0.isOccupied }
            case .reserved: result = result.filter { $0.isReserved }
            }
        }
        return result
    }

    var unplacedTables: [Table] {
        tables.filter { !config.disabledTableIds.contains($0.id) && !$0.isPlaced }
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
    @Published var quickNotes: [QuickNote] = []
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
    @Published var selectedQuickNoteIds: Set<String> = []
    @Published var showFreeTextNotes = false
    
    // MARK: - Cart
    @Published var cart: [CartItem] = []
    @Published var activeSeat = "C"
    @Published var activeCourse = 1
    @Published var guestCount = 1
    @Published var currentOrderId: String?
    @Published var currentOrderPaymentStatus: String?
    // Tickets separados de la mesa actual (de "dividir en tickets separados")
    // — cuando no es nil, la mesa tiene varias órdenes que se cobran cada
    // una por su cuenta, en vez de un solo carrito fusionado.
    @Published var tableTickets: [Order]? = nil
    // Datos de contacto/entrega del pedido actual (para llevar / web / delivery)
    @Published var currentOrderPhone: String?
    @Published var currentOrderAddress: String?
    @Published var currentOrderLat: String?
    @Published var currentOrderLng: String?
    @Published var currentOrderSource: String?
    @Published var currentOrderStatus: String?
    @Published var showLocationModal = false
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
    @Published var paymentStep = "payment" // payment, confirmation, done, split-bill-mode, split-assign, split-seat-assign, split-tickets-confirm
    @Published var paymentMethod: String?
    @Published var cashReceived = ""
    @Published var tipPercentage = 0
    @Published var customTip = ""
    @Published var showCustomTip = false
    @Published var tipPaymentMethod: String?
    @Published var processing = false
    @Published var paymentCompleted = false
    @Published var confirmingOrder = false
    @Published var activeNumericField: String? = nil // "cash", "tip", nil
    
    // MARK: - Cobros pendientes (parking por mesa)
    // Permite dejar un cobro en efectivo a medias (esperando propina/cambio),
    // salir a comandar otra mesa, y regresar a terminarlo sin perder nada.
    @Published var parkedPayments: [String: PendingCashPayment] = [:]

    /// Parquea el cobro en efectivo en progreso de la mesa actual (si aplica).
    func parkCurrentPaymentIfNeeded() {
        guard showingPayment,
              paymentMethod == "cash",
              !paymentCompleted,
              let table = selectedTable,
              !cashReceived.isEmpty else { return }
        parkedPayments[table.id] = PendingCashPayment(
            cashReceived: cashReceived,
            tipPercentage: tipPercentage,
            customTip: customTip,
            showCustomTip: showCustomTip,
            tipPaymentMethod: tipPaymentMethod,
            paymentStep: paymentStep,
            totalSnapshot: totalWithTip,
            changeSnapshot: changeAmount,
            tableNumber: table.number
        )
    }

    /// Restaura un cobro parqueado para la mesa (si existe) y reabre el cobro.
    func restoreParkedPaymentIfNeeded(tableId: String) {
        guard let parked = parkedPayments[tableId] else { return }
        paymentMethod = "cash"
        cashReceived = parked.cashReceived
        tipPercentage = parked.tipPercentage
        customTip = parked.customTip
        showCustomTip = parked.showCustomTip
        tipPaymentMethod = parked.tipPaymentMethod
        paymentStep = parked.paymentStep
        showingPayment = true
    }

    /// Reanuda el cobro parqueado de la mesa actual (para el chip flotante).
    func resumeParkedPaymentForCurrentTable() {
        guard let id = selectedTable?.id else { return }
        restoreParkedPaymentIfNeeded(tableId: id)
    }

    func clearParkedPayment(tableId: String?) {
        guard let tableId else { return }
        parkedPayments.removeValue(forKey: tableId)
    }

    /// Volver a la selección de mesa parqueando el cobro en progreso (si aplica),
    /// para no perderlo al salir a comandar otra mesa.
    func handleBackToTables() {
        parkCurrentPaymentIfNeeded()
        showingPayment = false
        currentScreen = .tableSelection
        Task { await refreshTables() }
    }

    /// ¿La mesa actual tiene un cobro parqueado y el panel de cobro está cerrado?
    var currentTableHasParkedPayment: Bool {
        guard let id = selectedTable?.id else { return false }
        return parkedPayments[id] != nil && !showingPayment
    }

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
        currentOrderPaymentStatus = nil
        currentOrderPhone = nil
        currentOrderAddress = nil
        currentOrderLat = nil
        currentOrderLng = nil
        currentOrderSource = nil
        currentOrderStatus = nil
        processing = false
        paymentCompleted = false
        confirmingOrder = false
        splitBillMode = false
        splitBillType = "by-seat"
        itemAssignments = [:]
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
    
    // MARK: - Split Bill (dividir en tickets separados)
    @Published var splitBillMode = false
    @Published var splitBillType: String = "by-seat" // "by-seat" | "custom"
    // asiento -> [índice de carrito: cantidad asignada] — soporta partir una
    // misma línea (cantidad > 1) entre varios tickets.
    @Published var itemAssignments: [Int: [Int: Int]] = [:]
    @Published var currentPersonIndex = 0
    
    // MARK: - Promotions & Discounts
    @Published var activePromotions: [Promotion] = []
    // Cart-item ids the user opted OUT of promotions for ("no quiere la promo").
    // Persisted only for the current cart session — kept out of the promo engine
    // so a recompute doesn't silently re-apply the discount.
    @Published var excludedPromoItemIds: Set<UUID> = []
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
    @Published var loyaltyStampsToAdd: Int = 1
    @Published var loyaltyEmailInput: String = ""
    @Published var showLoyaltyEmailDialog: Bool = false
    @Published var showLoyaltyRewardDialog: Bool = false
    @Published var loyaltyRewardMode: String = ""
    @Published var loyaltyRewardDiscountPct: String = ""
    
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
        let result: [Product]
        if !searchQuery.isEmpty {
            result = products.filter { $0.active && $0.name.localizedCaseInsensitiveContains(searchQuery) }
        } else if let catId = selectedCategory {
            result = products.filter { $0.active && $0.categoryId == catId }
        } else {
            return []
        }
        // Orden alfabético (case/acentos-insensible) al abrir una categoría o buscar.
        return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Subtotal corriendo de un asiento/comensal (excluye invitados). Se muestra
    /// en el encabezado de cada asiento en el carrito para anticipar el split.
    func seatSubtotal(_ seat: String) -> Double {
        cart.filter { $0.seat == seat && !$0.isGuest }
            .reduce(0.0) { $0 + $1.total }
    }

    /// ¿Ese Tiempo tiene items sin enviar a cocina? (para el disparo por tiempo)
    func hasUnsentItems(inCourse course: Int) -> Bool {
        cart.contains { $0.course == course && !$0.sentToKitchen }
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
        // Re-emit payment display when method or tip changes while on confirmation
        Publishers.CombineLatest3($paymentMethod, $tipPercentage, $customTip)
            .dropFirst()
            .debounce(for: .milliseconds(200), scheduler: RunLoop.main)
            .sink { [weak self] _, _, _ in
                guard let self, self.showingPayment, self.paymentStep == "confirmation", self.selectedTable == nil else { return }
                self.emitCustomerDisplayState(mode: "payment")
            }
            .store(in: &cancellables)
        
        // Emit payment display only when reaching confirmation step
        $paymentStep
            .dropFirst()
            .sink { [weak self] step in
                guard let self, step == "confirmation", self.showingPayment, self.selectedTable == nil else { return }
                self.emitCustomerDisplayState(mode: "payment")
            }
            .store(in: &cancellables)
        
        // Restore Customer Display mode if it was active
        if config.customerDisplayEnabled {
            currentScreen = .customerDisplay
        }
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

        socketService.onTableLayoutUpdated = { [weak self] arr in
            Task { @MainActor in self?.applyLayoutDeltaFromSocket(arr) }
        }

        socketService.onTableMerged = { [weak self] dict in
            Task { @MainActor in self?.applyMergedFromSocket(dict) }
        }

        socketService.onTableUnmerged = { [weak self] dict in
            Task { @MainActor in self?.applyUnmergedFromSocket(dict) }
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
                                nextReservation: table.nextReservation,
                                positionX: table.positionX,
                                positionY: table.positionY,
                                widthCells: table.widthCells,
                                heightCells: table.heightCells,
                                shape: table.shape,
                                rotation: table.rotation,
                                mergeGroupId: table.mergeGroupId,
                                isMergePrimary: table.isMergePrimary
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
                self?.emitCustomerDisplayState(mode: "idle", force: true)
                self?.showToast("Orden cobrada")
                await self?.refreshOrderFromSocket()
                await self?.refreshReadyItemsAndDelivery()
            }
        }

        socketService.onOnlineOrder = { [weak self] dict in
            Task { @MainActor in
                self?.handleIncomingOnlineOrder(dict)
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

        socketService.onReservationNew = { [weak self] in
            Task { @MainActor in
                self?.pendingReservationsCount += 1
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
    
    // MARK: - Floor-plan map actions

    /// Applies a layout change immediately (optimistic, no network round trip)
    /// so dragging/resizing never visibly "snaps back" before the server
    /// confirms, then persists it in the background.
    func saveLayout(_ updates: [TableLayoutUpdate]) {
        for u in updates {
            guard let idx = tables.firstIndex(where: { $0.id == u.id }) else { continue }
            tables[idx].positionX = u.positionX
            tables[idx].positionY = u.positionY
            tables[idx].widthCells = u.widthCells
            tables[idx].heightCells = u.heightCells
            tables[idx].rotation = u.rotation
            tables[idx].shape = u.shape
        }
        Task {
            do {
                let updated = try await APIService.shared.saveTableLayout(updates)
                // Apply ONLY the layout fields from the server response — the
                // /layout endpoint returns raw rows without merge/order
                // enrichment, so replacing the whole table would wipe
                // mergeGroupId/activeOrder that were set separately.
                for u in updated {
                    if let idx = tables.firstIndex(where: { $0.id == u.id }) {
                        tables[idx].positionX = u.positionX
                        tables[idx].positionY = u.positionY
                        tables[idx].widthCells = u.widthCells
                        tables[idx].heightCells = u.heightCells
                        tables[idx].rotation = u.rotation
                        tables[idx].shape = u.shape
                    }
                }
            } catch {
                showToast("Error guardando el mapa", isError: true)
            }
        }
    }

    func updateTableCapacity(_ table: Table, capacity: Int) {
        guard capacity > 0 else { return }
        if let idx = tables.firstIndex(where: { $0.id == table.id }) {
            tables[idx].capacity = capacity
        }
        Task {
            if let updated = try? await APIService.shared.updateTable(tableId: table.id, body: ["capacity": capacity]),
               let idx = tables.firstIndex(where: { $0.id == updated.id }) {
                tables[idx] = updated
            }
        }
    }

    private func firstFreeGridCell() -> (x: Int, y: Int) {
        var occupied = Set<Int>()
        for t in placedTables {
            let x0 = t.positionX ?? 0
            let y0 = t.positionY ?? 0
            let (w, h) = t.footprintCells
            for dx in 0..<w {
                for dy in 0..<h {
                    occupied.insert((x0 + dx) * 1000 + (y0 + dy))
                }
            }
        }
        for y in 0..<mapMetrics.rows {
            for x in 0..<mapMetrics.columns {
                if !occupied.contains(x * 1000 + y) {
                    return (x, y)
                }
            }
        }
        return (0, 0)
    }

    func placeTableOnMap(_ table: Table) {
        let cell = firstFreeGridCell()
        let update = TableLayoutUpdate(
            id: table.id,
            positionX: cell.x,
            positionY: cell.y,
            widthCells: table.effectiveWidthCells,
            heightCells: table.effectiveHeightCells,
            rotation: table.rotation ?? 0,
            shape: table.shape ?? "square"
        )
        saveLayout([update])
    }

    // MARK: - Floor-plan map fixtures (walls/bars/furniture)

    func addFixture(type: String) {
        let cell = firstFreeGridCell()
        Task {
            do {
                let fixture = try await APIService.shared.createMapFixture(
                    type: type, positionX: cell.x, positionY: cell.y, widthCells: 2, heightCells: 1
                )
                mapFixtures.append(fixture)
            } catch {
                showToast("Error agregando elemento", isError: true)
            }
        }
    }

    func saveFixtureLayout(_ update: MapFixtureLayoutUpdate) {
        if let idx = mapFixtures.firstIndex(where: { $0.id == update.id }) {
            mapFixtures[idx].positionX = update.positionX
            mapFixtures[idx].positionY = update.positionY
            mapFixtures[idx].widthCells = update.widthCells
            mapFixtures[idx].heightCells = update.heightCells
            mapFixtures[idx].rotation = update.rotation
        }
        Task {
            do {
                let updated = try await APIService.shared.updateMapFixture(id: update.id, body: [
                    "positionX": update.positionX,
                    "positionY": update.positionY,
                    "widthCells": update.widthCells,
                    "heightCells": update.heightCells,
                    "rotation": update.rotation,
                ])
                if let idx = mapFixtures.firstIndex(where: { $0.id == updated.id }) {
                    mapFixtures[idx] = updated
                }
            } catch {
                showToast("Error guardando elemento", isError: true)
            }
        }
    }

    func deleteFixture(_ fixture: MapFixture) {
        Task {
            do {
                try await APIService.shared.deleteMapFixture(id: fixture.id)
                mapFixtures.removeAll { $0.id == fixture.id }
            } catch {
                showToast("Error eliminando elemento", isError: true)
            }
        }
    }

    // MARK: - Floor-plan map merge

    func startMergeMode(preselecting table: Table? = nil) {
        mergeModeActive = true
        if let table {
            selectedForMerge = [table.id]
            mergeAnchorId = table.id
        } else {
            selectedForMerge = []
            mergeAnchorId = nil
        }
    }

    func cancelMergeMode() {
        mergeModeActive = false
        selectedForMerge = []
        mergeAnchorId = nil
        showMergeConfirmation = false
    }

    func toggleMergeSelection(_ table: Table) {
        guard mergeModeActive else { return }
        if selectedForMerge.contains(table.id) {
            selectedForMerge.remove(table.id)
            if mergeAnchorId == table.id { mergeAnchorId = nil }
            return
        }
        // Never combine two tables that both already carry an active order —
        // the second order would get orphaned inside the merged group.
        if table.activeOrder != nil,
           tables.contains(where: { selectedForMerge.contains($0.id) && $0.activeOrder != nil }) {
            showToast("No puedes unir 2 mesas con orden activa", isError: true)
            return
        }
        // Any number of tables (2+) can be combined into one group.
        selectedForMerge.insert(table.id)
        if mergeAnchorId == nil { mergeAnchorId = table.id }
    }

    /// Confirms the merge of every currently-selected table into one group.
    /// Primary priority: the table holding the active order (so it's kept),
    /// else the first-selected anchor, else the lowest table number. Only the
    /// non-primary members slide next to it — the primary (and its order) stays.
    func confirmMerge() async {
        defer {
            isMerging = false
            mergeModeActive = false
            selectedForMerge = []
            mergeAnchorId = nil
            showMergeConfirmation = false
        }
        let selected = tables.filter { selectedForMerge.contains($0.id) }
        guard selected.count >= 2 else { return }
        isMerging = true

        let primary = selected.first { $0.activeOrder != nil }
            ?? selected.first { $0.id == mergeAnchorId }
            ?? selected.min { (Int($0.number) ?? 0) < (Int($1.number) ?? 0) }!
        let members = selected
            .filter { $0.id != primary.id }
            .sorted { (Int($0.number) ?? 0) < (Int($1.number) ?? 0) }

        // Lay the members out in a row starting right after the primary.
        let baseY = primary.positionY ?? 0
        var nextX = (primary.positionX ?? 0) + primary.footprintCells.w
        var memberPayloads: [[String: Any]] = []
        var slides: [TableLayoutUpdate] = []
        for member in members {
            let newX = min(mapMetrics.columns - member.effectiveWidthCells, nextX)
            memberPayloads.append([
                "id": member.id,
                "origPositionX": member.positionX as Any,
                "origPositionY": member.positionY as Any,
                "newPositionX": newX,
                "newPositionY": baseY,
            ])
            slides.append(TableLayoutUpdate(
                id: member.id,
                positionX: newX,
                positionY: baseY,
                widthCells: member.effectiveWidthCells,
                heightCells: member.effectiveHeightCells,
                rotation: member.rotation ?? 0,
                shape: member.shape ?? "square"
            ))
            nextX = newX + member.footprintCells.w
        }

        do {
            try await APIService.shared.mergeTables(
                primaryTableId: primary.id,
                members: memberPayloads,
                orderId: primary.activeOrder?.id
            )
            // Optimistic local merge state.
            applyMergeGroup(primaryId: primary.id, memberIds: members.map { $0.id })
            if !slides.isEmpty { saveLayout(slides) }
            let numbers = ([primary] + members).map { $0.number }.joined(separator: "-")
            showToast("Mesas \(numbers) unidas")
        } catch {
            showToast("Error al unir mesas", isError: true)
        }
    }

    func unmergeTable(_ table: Table) async {
        guard let groupId = table.mergeGroupId else { return }
        // Snapshot the group before the server call so we can clear it locally.
        let memberIds = tables.filter { $0.mergeGroupId == groupId }.map { $0.id }
        do {
            try await APIService.shared.unmergeTable(tableId: table.id)
            for id in memberIds {
                if let idx = tables.firstIndex(where: { $0.id == id }) {
                    tables[idx].mergeGroupId = nil
                    tables[idx].isMergePrimary = nil
                }
            }
            showToast("Mesas separadas")
        } catch {
            showToast("Error al separar mesas", isError: true)
        }
    }

    private func applyMergeGroup(primaryId: String, memberIds: [String]) {
        if let idx = tables.firstIndex(where: { $0.id == primaryId }) {
            tables[idx].mergeGroupId = primaryId
            tables[idx].isMergePrimary = true
        }
        for id in memberIds {
            if let idx = tables.firstIndex(where: { $0.id == id }) {
                tables[idx].mergeGroupId = primaryId
                tables[idx].isMergePrimary = false
            }
        }
    }

    // MARK: - Floor-plan map socket deltas

    @MainActor
    private func applyLayoutDeltaFromSocket(_ arr: [[String: Any]]) {
        for dict in arr {
            guard let id = dict["id"] as? String,
                  let index = tables.firstIndex(where: { $0.id == id }) else { continue }
            let table = tables[index]
            tables[index] = Table(
                id: table.id,
                number: table.number,
                name: table.name,
                capacity: table.capacity,
                status: table.status,
                active: table.active,
                activeOrder: table.activeOrder,
                guestCount: table.guestCount,
                nextReservation: table.nextReservation,
                positionX: dict["positionX"] as? Int ?? table.positionX,
                positionY: dict["positionY"] as? Int ?? table.positionY,
                widthCells: dict["widthCells"] as? Int ?? table.widthCells,
                heightCells: dict["heightCells"] as? Int ?? table.heightCells,
                shape: dict["shape"] as? String ?? table.shape,
                rotation: dict["rotation"] as? Int ?? table.rotation,
                mergeGroupId: table.mergeGroupId,
                isMergePrimary: table.isMergePrimary
            )
        }
    }

    @MainActor
    private func applyMergedFromSocket(_ dict: [String: Any]) {
        guard let primaryId = dict["primaryTableId"] as? String,
              let mergedIds = dict["mergedTableIds"] as? [String] else { return }
        applyMergeGroup(primaryId: primaryId, memberIds: mergedIds)
    }

    @MainActor
    private func applyUnmergedFromSocket(_ dict: [String: Any]) {
        // Server sends one table:unmerged per dissolved pair; clear both sides.
        guard let primaryId = dict["primaryTableId"] as? String,
              let mergedId = dict["mergedTableId"] as? String else { return }
        for id in [primaryId, mergedId] {
            if let idx = tables.firstIndex(where: { $0.id == id }) {
                tables[idx].mergeGroupId = nil
                tables[idx].isMergePrimary = nil
            }
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
            nextReservation: table.nextReservation,
            positionX: table.positionX,
            positionY: table.positionY,
            widthCells: table.widthCells,
            heightCells: table.heightCells,
            shape: table.shape,
            rotation: table.rotation,
            mergeGroupId: table.mergeGroupId,
            isMergePrimary: table.isMergePrimary
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
            employeeRole = UserDefaults.standard.string(forKey: "pos_employeeRole")
            if let savedMode = UserDefaults.standard.string(forKey: "pos_tableViewMode"),
               let mode = TableViewMode(rawValue: savedMode) {
                tableViewMode = mode
            }
            currentScreen = .tableSelection
            lastActivity = Date()
            Task {
                await fetchData()
                // Sessions saved before the role was tracked (or restored from
                // an older app version) won't have pos_employeeRole yet — back
                // it off the employees list so "Editar mapa" isn't stuck hidden.
                if employeeRole == nil {
                    await backfillEmployeeRole()
                }
            }
        }
    }

    private func backfillEmployeeRole() async {
        guard let empId = employeeId,
              let employees = try? await APIService.shared.fetchEmployees(),
              let match = employees.first(where: { $0.id == empId }) else { return }
        employeeRole = match.role
        UserDefaults.standard.set(match.role, forKey: "pos_employeeRole")
    }

    func saveSession() {
        UserDefaults.standard.set(employeeId, forKey: "pos_employeeId")
        UserDefaults.standard.set(employeeName, forKey: "pos_employeeName")
        UserDefaults.standard.set(employeeRole, forKey: "pos_employeeRole")
    }

    func clearSession() {
        UserDefaults.standard.removeObject(forKey: "pos_employeeId")
        UserDefaults.standard.removeObject(forKey: "pos_employeeName")
        UserDefaults.standard.removeObject(forKey: "pos_employeeRole")
        employeeId = nil
        employeeName = nil
        employeeRole = nil
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
                handlePinSuccess(empId: emp.id, empName: emp.name, empRole: emp.role)
            } catch {
                showToast(error.localizedDescription, isError: true)
                pin = ""
            }
            authenticating = false
        }
    }
    
    func handlePinSuccess(empId: String, empName: String, empRole: String? = nil) {
        employeeId = empId
        employeeName = empName
        employeeRole = empRole
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
        // Promotions created/edited in the dashboard while a terminal's PIN
        // session stays open (the normal case for a POS) were previously only
        // picked up on next login or app relaunch — refresh them on the same
        // 60s backup poll as tables so they show up without either.
        if let pr = try? await APIService.shared.fetchActivePromotions() {
            activePromotions = pr
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
    
    func fetchPendingReservationsCount() async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        if let all = try? await APIService.shared.fetchReservations(date: today, status: "pending") {
            pendingReservationsCount = all.count
        }
    }

    func fetchData() async {
        loading = true

        // Fetch each independently so one failure doesn't block the rest
        // On success: save to offline cache. On failure: load from offline cache.

        if let t = try? await APIService.shared.fetchTables() {
            tables = t.filter { $0.active }
        } else {
            print("[POS] Error fetching tables")
        }

        if let fixtures = try? await APIService.shared.fetchMapFixtures() {
            mapFixtures = fixtures
        } else {
            print("[POS] Error fetching map fixtures")
        }

        // Load initial pending count once on startup; updates come via socket after that
        if pendingReservationsCount == 0 {
            await fetchPendingReservationsCount()
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

        if let qn = try? await APIService.shared.fetchQuickNotes() {
            quickNotes = qn.filter { $0.active }.sorted { $0.sortOrder < $1.sortOrder }
        } else {
            print("[POS] Error fetching quick notes")
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
    
    func handleSelectTable(_ tappedTable: Table) {
        lastActivity = Date()

        // If a merged member (non-primary) was tapped, operate on the group's
        // primary table instead so the whole group funnels into one order.
        var table = tappedTable
        if let groupId = table.mergeGroupId, table.isMergePrimary != true,
           let primary = tables.first(where: { $0.id == groupId }) {
            table = primary
        }

        print("🏠 handleTableSelect: table=\(table.id) (\(table.number)), status=\(table.status)")
        // Parquea el cobro en progreso de la mesa que estamos dejando (si aplica)
        parkCurrentPaymentIfNeeded()
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
                currentOrderPaymentStatus = nil
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

                    // Mesa con tickets divididos ("dividir en tickets separados") —
                    // se muestran por separado, no se fusionan en un solo carrito.
                    if activeOrders.count > 1, activeOrders.contains(where: { $0.splitGroupId != nil }) {
                        tableTickets = activeOrders.sorted { $0.orderNumber < $1.orderNumber }
                        currentOrderId = nil
                        cart = []
                        guestCount = table.guestCount ?? 1
                        print("🎟️ Mesa con \(activeOrders.count) tickets separados")
                    } else if let mainOrder = activeOrders.first {
                        tableTickets = nil
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
                        tableTickets = nil
                        print("⚠️ No hay órdenes activas para esta mesa")
                    }
                } catch {
                    print("❌ Error loading table orders: \(error)")
                }

                currentScreen = .pos
                loading = false
                // Si esta mesa tenía un cobro parqueado, reábrelo donde se dejó.
                restoreParkedPaymentIfNeeded(tableId: table.id)
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

    /// Elige un ticket de `tableTickets` para verlo/cobrarlo — cada ticket se
    /// cobra con el flujo normal de pago de una sola orden.
    func selectSplitTicket(_ order: Order) {
        currentOrderId = order.id
        currentOrderPaymentStatus = order.paymentStatus
        cart = (order.items ?? [])
            .filter { !($0.voided ?? false) }
            .map { item -> CartItem in
                var cartItem = CartItem.fromOrderItem(item, orderId: order.id)
                cartItem.orderStatus = order.status
                return cartItem
            }
        applyPromotions()
        guestCount = order.guestCount ?? 1
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
        currentOrderPaymentStatus = order.paymentStatus
        currentOrderPhone = order.customerPhone
        currentOrderAddress = order.deliveryAddress
        currentOrderLat = order.deliveryLat
        currentOrderLng = order.deliveryLng
        currentOrderSource = order.source
        currentOrderStatus = order.status

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
                            // Real extras from DB table — valid UUID
                            let names = exts.map { $0.name }.joined(separator: ", ")
                            extId = exts.first?.id; extName = names
                            let extrasPrice = exts.reduce(0.0) { $0 + $1.numericPrice }
                            price += extrasPrice
                        } else if let opt = sel as? ModifierOption {
                            // Flow step option — NOT a valid DB UUID, store in customModifiers
                            customModsDict[step.id] = [
                                "stepName": step.stepName,
                                "stepType": step.stepType,
                                "options": [["id": opt.id, "name": opt.name, "price": opt.price]]
                            ]
                            price += opt.numericPrice
                        } else if let opts = sel as? [ModifierOption], !opts.isEmpty {
                            // Flow step options — NOT valid DB UUIDs, store in customModifiers
                            customModsDict[step.id] = [
                                "stepName": step.stepName,
                                "stepType": step.stepType,
                                "options": opts.map { ["id": $0.id, "name": $0.name, "price": $0.price] }
                            ]
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
        let labels = quickNotes.filter { selectedQuickNoteIds.contains($0.id) }.map { $0.label }
        let freeText = tempNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        item.notes = (labels + (freeText.isEmpty ? [] : [freeText])).joined(separator: ", ")
        addToCart(item)
        showNotesDialog = false
        pendingCartItem = nil
        tempNotes = ""
        selectedQuickNoteIds = []
        showFreeTextNotes = false
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
            selectedQuickNoteIds = []
            showFreeTextNotes = false
        }
    }
    
    // MARK: - Cart Operations
    
    private func addToCart(_ item: CartItem) {
        // Try to combine with existing identical item
        if let idx = cart.firstIndex(where: {
            !$0.sentToKitchen &&
            $0.productId == item.productId &&
            $0.productName == item.productName &&
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
        emitCustomerDisplayState()
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
            var item = cart[index]
            item.quantity = newQty
            cart[index] = item
            applyPromotions()
            emitCustomerDisplayState()
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
        emitCustomerDisplayState()
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
            var updated = cart[index]
            updated.quantity = newQuantity
            cart[index] = updated
        }
        applyPromotions()
        emitCustomerDisplayState()
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
        // Only items the user hasn't opted out of participate in the engine;
        // excluded items stay at full price and are merged back untouched.
        let eligibleIndices = cart.indices.filter { !excludedPromoItemIds.contains(cart[$0].id) }
        guard !eligibleIndices.isEmpty else { return }
        let eligibleItems = eligibleIndices.map { cart[$0] }
        let updated = PromotionEngine.applyPromotions(cartItems: eligibleItems, promotions: activePromotions, productCategoryMap: productCategoryMap)
        for (position, cartIndex) in eligibleIndices.enumerated() {
            cart[cartIndex] = updated[position]
        }
    }

    /// Toggles whether the given cart item participates in promotions. Used by
    /// the cart's promo context menu ("Quitar promoción" / "Aplicar promoción").
    func togglePromoExclusion(for item: CartItem) {
        if excludedPromoItemIds.contains(item.id) {
            excludedPromoItemIds.remove(item.id)
            showToast("Promoción aplicada")
        } else {
            excludedPromoItemIds.insert(item.id)
            showToast("Promoción quitada")
        }
        applyPromotions()
    }

    func isPromoExcluded(_ item: CartItem) -> Bool {
        excludedPromoItemIds.contains(item.id)
    }

    /// Opts every item of a promo group out of promotions (whole card).
    func excludePromoGroup(_ itemIds: [UUID]) {
        for id in itemIds { excludedPromoItemIds.insert(id) }
        applyPromotions()
        showToast("Promoción quitada")
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
    
    // MARK: - Pedidos en línea (pantalla verde)

    /// Decodifica el pedido online recibido por socket, lo muestra y arranca el sonido.
    func handleIncomingOnlineOrder(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let order = try? JSONDecoder().decode(Order.self, from: data) else {
            print("⚠️ No se pudo decodificar el pedido online")
            return
        }
        incomingOnlineOrder = order
        startOnlineOrderSound()
    }

    /// Reproduce `delivery_sound.wav` EN LOOP mientras la pantalla verde esté visible.
    func startOnlineOrderSound() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            try? session.overrideOutputAudioPort(.speaker)
            if let url = Bundle.main.url(forResource: "delivery_sound", withExtension: "wav") {
                onlineOrderAudioPlayer = try AVAudioPlayer(contentsOf: url)
                onlineOrderAudioPlayer?.numberOfLoops = -1 // loop infinito
                onlineOrderAudioPlayer?.volume = 1.0
                onlineOrderAudioPlayer?.prepareToPlay()
                onlineOrderAudioPlayer?.play()
            }
        } catch {
            print("❌ Error reproduciendo sonido de pedido online:", error)
        }
    }

    func stopOnlineOrderSound() {
        onlineOrderAudioPlayer?.stop()
        onlineOrderAudioPlayer = nil
    }

    /// Cierra la pantalla verde y detiene el sonido.
    func dismissOnlineOrder() {
        stopOnlineOrderSound()
        incomingOnlineOrder = nil
    }

    func acceptOnlineOrder(estimatedReadyMinutes: Int? = nil) {
        guard let order = incomingOnlineOrder else { return }
        Task {
            do {
                try await APIService.shared.acceptOnlineOrder(orderId: order.id, estimatedReadyMinutes: estimatedReadyMinutes)
                await printOnlineComanda(order)   // imprime la comanda al aceptar
                showToast("Pedido aceptado — enviado a cocina")
            } catch {
                showToast("Error al aceptar el pedido", isError: true)
            }
            dismissOnlineOrder()
            await refreshOrderFromSocket()
        }
    }

    /// Imprime la comanda de un pedido en línea (se llama al aceptarlo en la
    /// pantalla verde). Reusa el print-server vía PrintService.
    private func printOnlineComanda(_ order: Order) async {
        let comandaItems: [[String: Any]] = (order.items ?? []).map { item in
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "seat": item.seat ?? "C",
                "course": item.course ?? 1,
            ]
            if let n = item.notes, !n.isEmpty { dict["notes"] = n }
            if let f = item.frostingName { dict["frosting"] = f }
            if let t = item.dryToppingName { dict["topping"] = t }
            if let e = item.extraName { dict["extra"] = e }
            if let cm = item.customModifiers,
               let data = cm.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                var flowSelections: [[String: Any]] = []
                for (_, value) in json {
                    if let stepData = value as? [String: Any],
                       let stepName = stepData["stepName"] as? String,
                       let options = stepData["options"] as? [[String: Any]] {
                        for opt in options where opt["name"] is String {
                            flowSelections.append(["stepName": stepName, "name": opt["name"] as! String])
                        }
                    }
                }
                if !flowSelections.isEmpty { dict["flowSteps"] = flowSelections }
            }
            return dict
        }

        await PrintService.shared.printComanda(
            tableNumber: nil,
            orderNumber: String(order.id.prefix(8)),
            customerName: order.customerName,
            items: comandaItems,
            isDelivery: order.deliveryType == "delivery",
            guestCount: 1
        )
    }

    func rejectOnlineOrder(reason: String) {
        guard let order = incomingOnlineOrder else { return }
        Task {
            do {
                try await APIService.shared.rejectOnlineOrder(orderId: order.id, reason: reason)
                showToast("Pedido rechazado — reembolso emitido")
            } catch {
                showToast("Error al rechazar el pedido", isError: true)
            }
            dismissOnlineOrder()
        }
    }

    /// Envía a cocina los items no enviados. Si se pasa `course` (coursing),
    /// solo dispara ese Tiempo; los demás tiempos quedan pendientes.
    func handleSendToKitchen(course: Int? = nil) {
        guard !submitting else {
            print("⚠️ handleSendToKitchen: already submitting, ignoring")
            return
        }

        let unsentItems = cart.filter { !$0.sentToKitchen && (course == nil || $0.course == course) }
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
                    
                    // Mark only the items just sent (respeta el filtro de tiempo)
                    for i in cart.indices {
                        if !cart[i].sentToKitchen && (course == nil || cart[i].course == course) {
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
                        if !cart[i].sentToKitchen && (course == nil || cart[i].course == course) {
                            cart[i].sentToKitchen = true
                            cart[i].orderId = order.id
                        }
                    }

                    await printComanda(items: unsentItems, orderId: order.id)
                }

                let scopeLabel = course.map { "Tiempo \($0)" } ?? "cocina"
                showToast("Enviado a \(scopeLabel) (\(unsentItems.count) items)")
            } catch let error as APIError where error == .offlineQueued {
                // Offline: items are queued for sync, mark local state (respeta tiempo)
                for i in cart.indices {
                    if !cart[i].sentToKitchen && (course == nil || cart[i].course == course) {
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
    
    // MARK: - Customer Display Emit
    
    func emitCustomerDisplayState(mode: String = "active", force: Bool = false) {
        guard force || selectedTable == nil else { return } // Only for takeout/delivery
        let items: [[String: Any]] = cart.map { item in
            [
                "name": item.productName,
                "qty": item.quantity,
                "unitPrice": item.unitPrice,
                "total": item.total,
                "modifiers": item.modifierSummary
            ]
        }
       
        let orderTypeLabel = selectedTable.map { "Mesa \($0.number)" } ?? (isHomeDelivery ? "Domicilio" : "Para llevar")
        var payload: [String: Any] = [
            "mode": mode,
            "customerName": customerName,
            "orderNumber": currentOrderId.map { String($0.prefix(8)) } ?? "",
            "orderType": orderTypeLabel,
            "items": items,
            "subtotal": cartTotalWithDiscount,
            "total": mode == "payment" ? totalWithTip : cartTotalWithDiscount
        ]
        if mode == "payment" {
            let method = paymentMethod ?? "cash"
            payload["paymentMethod"] = method
            payload["tipAmount"] = tipAmount
            payload["tipPercentage"] = tipPercentage
            payload["showCustomTip"] = showCustomTip
            if method == "transfer" {
                let freshConfig = POSConfig.load()
                payload["bankCLABE"] = freshConfig.bankCLABE
                payload["bankName"] = freshConfig.bankName
                payload["bankBank"] = freshConfig.bankBank
                print("📤 [CD Emit] self.config - bank: '\(self.config.bankBank)', name: '\(self.config.bankName)', clabe: '\(self.config.bankCLABE)'")
                print("📤 [CD Emit] POSConfig.load() - bank: '\(freshConfig.bankBank)', name: '\(freshConfig.bankName)', clabe: '\(freshConfig.bankCLABE)'")
            } else {
                print("📤 [CD Emit] payment method: \(method) - no bank data")
            }
        }
        print("📤 [CD Emit] payload mode=\(mode), paymentStep=\(paymentStep)")
        socketService.emitCustomerDisplayUpdate(payload)
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
        if item.deliveredToTable { dict["deliveredToTable"] = true }
        // Persist promo state so a promo that spans items across kitchen sends
        // (e.g. 2x1 where one unit was already sent) survives reload and can be
        // re-evaluated over the full cart.
        if let v = item.promotionId { dict["promotionId"] = v }
        if let v = item.promotionName { dict["promotionName"] = v }
        if let v = item.originalPrice { dict["originalPrice"] = v }
        if let v = item.promotionDiscount { dict["promotionDiscount"] = v }
        return dict
    }
    
    /// Parses an item's `customModifiers` JSON into `{name, price}` entries for display on
    /// customer-facing tickets (only priced modifiers — frosting/topping have no price and
    /// aren't stored in this JSON to begin with).
    private func parseModifiersForTicket(_ customModifiers: String?) -> [[String: Any]] {
        guard let cm = customModifiers,
              let data = cm.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        var mods: [[String: Any]] = []
        for (_, value) in json {
            if let stepData = value as? [String: Any],
               let options = stepData["options"] as? [[String: Any]] {
                for opt in options {
                    guard let name = opt["name"] as? String else { continue }
                    let price = (opt["price"] as? String).flatMap { Double($0) } ?? (opt["price"] as? Double) ?? 0
                    if price > 0 {
                        mods.append(["name": name, "price": String(format: "%.2f", price)])
                    }
                }
            }
        }
        return mods
    }

    private func printComanda(items: [CartItem], orderId: String) async {
        print("🖨️ printComanda called — orderId=\(orderId) items=\(items.count) printServerURL=\(APIService.shared.printServerURL)")
        // Group items for comanda (ad-hoc "cuenta general" charges aren't kitchen items)
        let comandaItems: [[String: Any]] = items.filter { $0.productId != POSConstants.customModifierProductId }.map { item in
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
                await handlePrint(paymentMethod: "cash", openDrawer: true)
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
        var assignments: [Int: [Int: Int]] = [:]
        for i in 0..<guestCount {
            assignments[i] = [:]
        }
        for (cartIndex, item) in cart.enumerated() {
            guard item.seat != "C" else { continue }
            if item.seat.hasPrefix("A"), let seatNum = Int(item.seat.dropFirst()), seatNum >= 1, seatNum <= guestCount {
                assignments[seatNum - 1, default: [:]][cartIndex] = item.quantity
            }
        }
        itemAssignments = assignments
        splitBillType = "by-seat"
    }

    func initSplitCustom() {
        var assignments: [Int: [Int: Int]] = [:]
        for i in 0..<guestCount {
            assignments[i] = [:]
        }
        itemAssignments = assignments
        splitBillType = "custom"
    }

    // MARK: - Split Bill → Tickets separados

    /// Convierte las asignaciones (asiento -> [índice de carrito: cantidad])
    /// en tickets/órdenes nuevas, una por asiento con productos asignados.
    /// Cada ticket se cobra después con el flujo normal de pago (un solo
    /// método por ticket) — reemplaza al viejo cobro inline por persona.
    func handleCreateSplitTickets() {
        guard let orderId = currentOrderId else { return }
        guard let table = selectedTable else { return }

        var groups: [[(orderItemId: String, quantity: Int)]] = []
        for personIndex in 0..<guestCount {
            guard let assigned = itemAssignments[personIndex], !assigned.isEmpty else { continue }
            var group: [(orderItemId: String, quantity: Int)] = []
            for (cartIndex, qty) in assigned {
                guard cartIndex < cart.count, qty > 0, let itemId = cart[cartIndex].itemId else { continue }
                group.append((orderItemId: itemId, quantity: qty))
            }
            if !group.isEmpty { groups.append(group) }
        }
        guard !groups.isEmpty else {
            showToast("No hay productos asignados a ningún ticket", isError: true)
            return
        }

        confirmingOrder = true
        Task {
            do {
                try await APIService.shared.createSplitTickets(orderId: orderId, groups: groups)
                showToast("Cuenta dividida en \(groups.count) ticket\(groups.count == 1 ? "" : "s")")
                confirmingOrder = false
                handleSelectTable(table)
            } catch {
                let message = (error as? APIError)?.errorDescription ?? "Error al dividir la cuenta en tickets"
                showToast(message, isError: true)
                confirmingOrder = false
            }
        }
    }

    // MARK: - Web order status (listo / en camino) — dispara WhatsApp al cliente

    /// Marca el pedido web actual como "ready" o "delivered" (en camino). El
    /// api-server manda el WhatsApp correspondiente al recibir el cambio.
    func handleMarkWebOrderStatus(_ status: String) {
        guard let orderId = currentOrderId else { return }
        Task {
            do {
                try await APIService.shared.updateOrderStatus(orderId: orderId, status: status)
                currentOrderStatus = status
                showToast(status == "ready" ? "Pedido marcado como listo" : "Pedido marcado en camino")
            } catch {
                showToast("Error al actualizar el pedido", isError: true)
            }
        }
    }

    // MARK: - Finalize Takeout Order

    func handleFinalizeOrder() {
        guard let orderId = currentOrderId else { return }
        processing = true
        Task {
            do {
                try await APIService.shared.completeOrder(orderId: orderId)
                showToast("Orden finalizada")
                cart = []
                currentOrderId = nil
                currentOrderPaymentStatus = nil
                selectedTable = nil
                currentScreen = .tableSelection
                emitCustomerDisplayState(mode: "idle")
            } catch {
                showToast("Error finalizando orden", isError: true)
            }
            processing = false
        }
    }
    
    // MARK: - Print Ticket
    
    func handlePrint(paymentMethod: String? = nil, openDrawer: Bool = false) async {
        let sentItems = cart.filter { $0.sentToKitchen }
        let itemsToPrint = sentItems.isEmpty ? cart : sentItems
        print("🖨️ handlePrint called — sentItems=\(sentItems.count) totalCart=\(cart.count) itemsToPrint=\(itemsToPrint.count)")
        guard !itemsToPrint.isEmpty else { return }
        
        // Group by seat then product
        var seatGroups: [String: [String: TicketItem]] = [:]
        for item in itemsToPrint {
            let seat = item.seat.isEmpty ? "C" : item.seat
            if seatGroups[seat] == nil { seatGroups[seat] = [:] }
            let key = "\(item.productId)-\(item.unitPrice)-\(item.promotionId ?? "none")-\(item.customModifiers ?? "")"
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
                    isGuest: item.isGuest,
                    customModifiers: item.customModifiers
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
                let isGuestItem = item.isGuest ?? false
                let originalTotal = isGuestItem ? 0 : Int((item.originalPrice ?? item.price) * Double(item.qty))
                let mods = parseModifiersForTicket(item.customModifiers)
                let modsUnitTotal = mods.reduce(0.0) { $0 + (Double($1["price"] as? String ?? "0") ?? 0) }
                let baseTotal = isGuestItem ? 0 : originalTotal - Int(modsUnitTotal * Double(item.qty))
                var dict: [String: Any] = [
                    "name": item.name,
                    "qty": item.qty,
                    "total": baseTotal
                ]
                if let pn = item.promotionName { dict["promotionName"] = pn }
                if let pd = item.promotionDiscount, pd > 0 { dict["promotionDiscount"] = pd }
                if isGuestItem { dict["isGuest"] = true }
                if !mods.isEmpty { dict["modifiers"] = mods }
                return dict
            }
        }

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
            paymentMethod: paymentMethod,
            tipPaymentMethod: tipPaymentMethod,
            splitPayments: nil,
            deliveryFee: Int(deliveryFeeAmount),
            openDrawer: openDrawer
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
    
    func printSeatPreAccount(seatIndex: Int) async {
        let assigned = itemAssignments[seatIndex] ?? [:]
        guard !assigned.isEmpty else { return }

        var ticketItems: [[String: Any]] = []
        for (ci, qty) in assigned.sorted(by: { $0.key < $1.key }) {
            guard ci < cart.count, qty > 0 else { continue }
            let item = cart[ci]
            let unitPrice = item.originalPrice ?? item.unitPrice
            let originalTotal = Int(Double(qty) * unitPrice)
            let mods = parseModifiersForTicket(item.customModifiers)
            let modsUnitTotal = mods.reduce(0.0) { $0 + (Double($1["price"] as? String ?? "0") ?? 0) }
            let baseTotal = originalTotal - Int(modsUnitTotal * Double(qty))
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": qty,
                "price": unitPrice,
                "total": baseTotal
            ]
            if let pn = item.promotionName { dict["promotionName"] = pn }
            if !mods.isEmpty { dict["modifiers"] = mods }
            ticketItems.append(dict)
        }

        let subtotal = assigned.reduce(0.0) { sum, entry in
            let (ci, qty) = entry
            guard ci < cart.count, cart[ci].quantity > 0 else { return sum }
            let item = cart[ci]
            let lineTotal = (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)
            return sum + (lineTotal / Double(item.quantity)) * Double(qty)
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
        emitCustomerDisplayState(mode: "idle", force: true)
        showToast("Orden completada")

        // El cobro se finalizó: quita cualquier cobro parqueado de esta mesa.
        clearParkedPayment(tableId: selectedTable?.id)

        cart = []
        activeCourse = 1
        loyaltyCard = nil
        showingPayment = false
        showingLoyaltyStep = false
        paymentStep = "payment"
        paymentMethod = "cash"
        cashReceived = ""
        currentOrderId = nil
        currentOrderPaymentStatus = nil
        paymentCompleted = false
        selectedTable = nil
        customerName = ""
        tipPercentage = 0
        customTip = ""
        showCustomTip = false
        tipPaymentMethod = nil
        splitBillMode = false
        splitBillType = "by-seat"
        itemAssignments = [:]
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
                // 1. Eliminar TODAS las órdenes activas de la mesa para que no queden huérfanas
                if let table = selectedTable {
                    if let allActiveOrders = try? await APIService.shared.fetchOrdersByTable(tableId: table.id) {
                        print("🗑️ Eliminando \(allActiveOrders.count) órdenes activas de la mesa \(table.number)")
                        for order in allActiveOrders {
                            try? await APIService.shared.deleteOrder(orderId: order.id)
                            print("✅ Orden \(order.id) eliminada")
                        }
                    }
                } else if let orderId = currentOrderId {
                    // Para llevar / web. Si es un pedido WEB pagado, "Liberar Orden"
                    // debe cancelarlo Y reembolsar por Stripe (no solo borrarlo).
                    let existing = try? await APIService.shared.fetchOrder(orderId: orderId)
                    if existing?.source == "web", existing?.paymentStatus == "paid" {
                        print("💸 Pedido web pagado — cancelar + reembolsar por Stripe")
                        try? await APIService.shared.rejectOnlineOrder(orderId: orderId, reason: "Liberado desde POS")
                    } else {
                        print("🗑️ Cancelando orden \(orderId)")
                        try await APIService.shared.deleteOrder(orderId: orderId)
                    }
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

                // Limpia cualquier cobro parqueado de esta mesa (ya se liberó).
                clearParkedPayment(tableId: selectedTable?.id)

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
                
                // 5. Enviar customer display a idle (fotos)
                emitCustomerDisplayState(mode: "idle", force: true)
                
                // 6. Navegar de regreso al selector de mesas
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
                showToast("Cliente: \(card.displayName)")
            } catch {
                showToast("Tarjeta no encontrada", isError: true)
                qrCode = ""
            }
            loadingCard = false
        }
    }
    
    func searchLoyaltyByEmail() {
        let email = loyaltyEmailInput.trimmingCharacters(in: .whitespaces)
        guard !email.isEmpty else {
            showToast("Ingresa un correo", isError: true)
            return
        }
        loadingCard = true
        Task {
            do {
                let card = try await APIService.shared.searchLoyaltyCardByEmail(email)
                loyaltyCard = card
                showLoyaltyEmailDialog = false
                loyaltyEmailInput = ""
                showToast("Cliente: \(card.displayName)")
            } catch {
                showToast("Tarjeta no encontrada", isError: true)
            }
            loadingCard = false
        }
    }
    
    func addLoyaltyStamps() {
        guard let card = loyaltyCard else { return }
        loadingCard = true
        Task {
            do {
                let updated = try await APIService.shared.addStamps(cardId: card.id, count: loyaltyStampsToAdd)
                loyaltyCard = updated
                showToast("\(loyaltyStampsToAdd) sello(s) agregado(s) a \(updated.displayName)")
                loyaltyStampsToAdd = 1
            } catch {
                showToast("Error agregando sellos", isError: true)
            }
            loadingCard = false
        }
    }
    
    func redeemLoyaltyRewardProduct(at index: Int) {
        guard let card = loyaltyCard else { return }
        guard index < cart.count else { return }
        cart[index].isGuest = true
        applyPromotions()
        emitCustomerDisplayState(mode: "payment")
        
        Task {
            do {
                try await APIService.shared.post("\(APIService.shared.baseURL)/api/loyalty-cards/\(card.id)/redeem")
                let refreshed = try await APIService.shared.searchLoyaltyCard(barcode: card.barcodeValue)
                loyaltyCard = refreshed
                showToast("Premio canjeado: \(cart[index].productName) gratis")
            } catch {
                showToast("Error canjeando premio", isError: true)
            }
        }
    }
    
    func redeemLoyaltyRewardDiscount() {
        guard let card = loyaltyCard else { return }
        let pct = Double(loyaltyRewardDiscountPct) ?? 0
        guard pct > 0 && pct <= 100 else {
            showToast("Ingresa un porcentaje válido (1-100)", isError: true)
            return
        }
        
        let discount = Discount(id: "loyalty-reward", name: "Premio Lealtad \(Int(pct))%", description: nil, type: "percentage", value: pct, requiresAuthorization: false, active: true)
        selectedDiscount = discount
        applyPromotions()
        emitCustomerDisplayState(mode: "payment")
        showLoyaltyRewardDialog = false
        loyaltyRewardDiscountPct = ""
        
        Task {
            do {
                try await APIService.shared.post("\(APIService.shared.baseURL)/api/loyalty-cards/\(card.id)/redeem")
                let refreshed = try await APIService.shared.searchLoyaltyCard(barcode: card.barcodeValue)
                loyaltyCard = refreshed
                showToast("Descuento de \(Int(pct))% aplicado")
            } catch {
                showToast("Error canjeando premio", isError: true)
            }
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
                let _ = try await APIService.shared.addStamps(cardId: card.id, count: 1)
                showToast("Sello agregado a \(card.displayName)")
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
            // Sync with backend if item already exists in DB
            if let itemId = cart[index].itemId {
                Task {
                    do {
                        _ = try await APIService.shared.updateOrderItemGuest(itemId: itemId, isGuest: true)
                    } catch {
                        print("❌ Error marking item as guest:", error)
                    }
                }
            }
        }
        showToast("\(guestItemsSelection.count) producto(s) marcado(s) como invitado")
        guestItemsSelection = []
    }
    
    func unmarkItemAsGuest(at index: Int) {
        guard index < cart.count else { return }
        cart[index].isGuest = false
        // Sync with backend if item already exists in DB
        if let itemId = cart[index].itemId {
            Task {
                do {
                    _ = try await APIService.shared.updateOrderItemGuest(itemId: itemId, isGuest: false)
                } catch {
                    print("❌ Error unmarking item as guest:", error)
                }
            }
        }
        showToast("Producto desinvitado")
    }

    // MARK: - Custom Modifier (ad-hoc, out-of-menu charge)

    /// Applies an ad-hoc priced modifier to a specific cart item, merging it into that
    /// item's `customModifiers` JSON (same shape used by the flow builder) and bumping
    /// its `unitPrice`. Syncs to the backend if the item was already sent to kitchen.
    func applyCustomModifierToItem(at index: Int, label: String, amount: Double) {
        guard index < cart.count else { return }

        var customModsDict: [String: Any] = [:]
        if let existing = cart[index].customModifiers,
           let data = existing.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            customModsDict = parsed
        }

        let stepId = "adhoc-\(UUID().uuidString)"
        customModsDict[stepId] = [
            "stepName": "Modificador Personalizado",
            "stepType": "adhoc",
            "options": [["id": stepId, "name": label, "price": String(amount)]]
        ]

        if let data = try? JSONSerialization.data(withJSONObject: customModsDict),
           let str = String(data: data, encoding: .utf8) {
            cart[index].customModifiers = str
        }
        cart[index].unitPrice += amount

        if let itemId = cart[index].itemId {
            let quantity = cart[index].quantity
            let unitPrice = cart[index].unitPrice
            let customModifiers = cart[index].customModifiers
            Task {
                do {
                    _ = try await APIService.shared.updateOrderItemCustomModifier(
                        itemId: itemId,
                        quantity: quantity,
                        unitPrice: unitPrice,
                        customModifiers: customModifiers
                    )
                } catch {
                    print("❌ Error syncing custom modifier:", error)
                }
            }
        }

        applyPromotions()
        emitCustomerDisplayState()
        showToast("Modificador agregado a \(cart[index].productName)")
    }

    /// Adds an ad-hoc priced charge as its own line item on the account (not tied to a
    /// specific product). Uses the fixed "custom modifier" placeholder product as FK anchor;
    /// `productName` carries the cashier-typed label as a free snapshot. Marked as already
    /// delivered so it never shows up as pending in KDS/Dispatch.
    func addStandaloneCharge(label: String, amount: Double) {
        let item = CartItem(
            productId: POSConstants.customModifierProductId,
            productName: label,
            unitPrice: amount,
            quantity: 1,
            notes: "",
            seat: activeSeat,
            course: activeCourse,
            sentToKitchen: false,
            isBeverage: false,
            deliveredToTable: true,
            isGuest: false
        )
        cart.append(item)
        applyPromotions()
        emitCustomerDisplayState()
        showToast("Cargo \"\(label)\" agregado a la cuenta")
    }
}

// MARK: - Supporting Types

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
    var customModifiers: String?
}
