import SwiftUI
import Combine

// Clean, minimal design inspired by Bruma_waitress
struct TableSelectionView: View {
    @ObservedObject var vm: POSViewModel
    @Namespace private var filterNamespace
    @State private var currentTime = Date()
    let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()
    
    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header — same as /bar
                header
                
                // Search bar
                tableSearchBar
                
                // Filter bar
                filterBar
                
                // Scroll content
                ScrollView {
                    VStack(spacing: 0) {
                        // DELIVERY ROW — horizontal, always visible
                        deliveryRow
                            .padding(.top, 16)
                        
                        // Divider
                        if !vm.filteredTables.isEmpty {
                            Rectangle()
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 1)
                                .padding(.vertical, 20)
                                .padding(.horizontal, 16)
                        }

                        if vm.tableViewMode == .cards {
                            // MESAS SECTION (cards)
                            if !vm.filteredTables.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text("MESAS")
                                            .font(.caption.weight(.bold))
                                            .foregroundColor(.gray)
                                        Spacer()
                                        Text("\(vm.filteredTables.count) mesas")
                                            .font(.caption2)
                                            .foregroundColor(.gray)
                                    }
                                    .padding(.horizontal, 16)

                                    LazyVGrid(columns: [
                                        GridItem(.flexible(), spacing: 10),
                                        GridItem(.flexible(), spacing: 10),
                                        GridItem(.flexible(), spacing: 10),
                                        GridItem(.flexible(), spacing: 10)
                                    ], spacing: 10) {
                                        ForEach(vm.filteredTables) { table in
                                            TableCardView(
                                                table: table,
                                                hasReadyItems: vm.tablesWithReadyItems.contains(table.id),
                                                currentTime: currentTime,
                                                action: { vm.handleSelectTable(table) },
                                                onRush: {
                                                    Task {
                                                        guard let orderId = table.activeOrder?.id else { return }
                                                        do {
                                                            let order = try await APIService.shared.fetchOrder(orderId: orderId)
                                                            if order.priority == 1 {
                                                                try await APIService.shared.unrushOrder(orderId: orderId)
                                                            } else {
                                                                try await APIService.shared.rushOrder(orderId: orderId)
                                                            }
                                                        } catch {
                                                            print("❌ Error toggling rush: \(error)")
                                                        }
                                                    }
                                                },
                                                onHold: {
                                                    Task {
                                                        guard let orderId = table.activeOrder?.id else { return }
                                                        do {
                                                            let order = try await APIService.shared.fetchOrder(orderId: orderId)
                                                            if order.onHold == true {
                                                                try await APIService.shared.unholdOrder(orderId: orderId)
                                                            } else {
                                                                try await APIService.shared.holdOrder(orderId: orderId)
                                                            }
                                                        } catch {
                                                            print("❌ Error toggling hold: \(error)")
                                                        }
                                                    }
                                                }
                                            )
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                }
                            }
                        } else {
                            // MESAS SECTION (mapa)
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Text("MAPA DE MESAS")
                                        .font(.caption.weight(.bold))
                                        .foregroundColor(.gray)
                                    Spacer()
                                    Text("\(vm.placedTables.count) mesas")
                                        .font(.caption2)
                                        .foregroundColor(.gray)
                                }
                                .padding(.horizontal, 16)

                                TableMapView(vm: vm)
                                    .padding(.horizontal, 16)
                            }
                        }
                    }
                    .padding(.bottom, 50)
                }
                .refreshable {
                    await vm.fetchData()
                }
            }
            
            // New Order Dialog overlay
            if vm.showCustomerNameDialog {
                Color.black.opacity(0.6)
                    .ignoresSafeArea()
                    .onTapGesture { vm.showCustomerNameDialog = false }
                
                CustomerNameDialog(vm: vm)
                    .frame(maxWidth: 440)
                    .contentShape(Rectangle())
                    .onTapGesture {}
            }
        }
        .sheet(isPresented: $vm.showInitialGuestDialog) {
            InitialGuestCountDialog(vm: vm)
                .presentationDetents([.height(400)])
                .presentationDragIndicator(.visible)
        }
        .onReceive(timer) { _ in
            currentTime = Date()
        }
        .sheet(isPresented: $vm.showReservations, onDismiss: {
            vm.pendingReservationsCount = 0
        }) {
            UpcomingReservationsView()
        }
        .fullScreenCover(isPresented: $vm.showSettings) {
            SettingsView(vm: vm)
                .presentationBackground(.clear)
        }
    }
    
    // MARK: - Initial Guest Count Dialog
    
    struct InitialGuestCountDialog: View {
        @ObservedObject var vm: POSViewModel
        
        var body: some View {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("¿Cuántas personas?")
                        .font(.title2.bold())
                        .foregroundColor(.white)
                    
                    if let table = vm.selectedTable {
                        Text(table.displayName)
                            .font(.subheadline)
                            .foregroundColor(Color(white: 0.6))
                    }
                }
                
                HStack(spacing: 16) {
                    Button {
                        if vm.tempGuestCount > 1 {
                            vm.tempGuestCount -= 1
                        }
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 44))
                            .foregroundColor(vm.tempGuestCount > 1 ? .blue : Color(white: 0.3))
                    }
                    .disabled(vm.tempGuestCount <= 1)
                    
                    Text("\(vm.tempGuestCount)")
                        .font(.system(size: 56, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 100)
                    
                    Button {
                        if vm.tempGuestCount < 20 {
                            vm.tempGuestCount += 1
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 44))
                            .foregroundColor(.blue)
                    }
                }
                
                Button {
                    vm.confirmInitialGuestCount()
                } label: {
                    Text("Confirmar")
                        .font(.headline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(
                            LinearGradient(colors: [Color.blue, Color.blue.opacity(0.8)], startPoint: .top, endPoint: .bottom)
                        )
                        .cornerRadius(14)
                        .shadow(color: Color.blue.opacity(0.3), radius: 8, y: 4)
                }
                .padding(.horizontal, 32)
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(red: 0.04, green: 0.04, blue: 0.05))
        }
    }
    
    
    
    // MARK: - Header (clean style)
    
    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Seleccionar Mesa")
                    .font(.title2.weight(.bold))
               
                    .foregroundColor(.white)
                Text("Elige una mesa o crea una orden para llevar")
                    .font(.caption)
                    .foregroundColor(.gray)
                    
            }
            
            Spacer()

            HStack(spacing: 12) {
                viewModeToggle

                Image(systemName: "person.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.white.opacity(0.7))

                Text(vm.employeeName ?? "Usuario")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)

                Button(action: {
                    vm.showReservations = true
                }) {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "calendar")
                            .font(.system(size: 18))
                            .foregroundColor(.white.opacity(0.7))
                            .padding(8)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(8)

                        if vm.pendingReservationsCount > 0 {
                            Text("\(vm.pendingReservationsCount)")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.purple)
                                .clipShape(Capsule())
                                .offset(x: 6, y: -6)
                        }
                    }
                }

                Button(action: {
                    vm.showSettings = true
                }) {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(8)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(8)
                }
                
                Button(action: {
                    vm.clearSession()
                }) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 18))
                        .foregroundColor(.red.opacity(0.8))
                        .padding(8)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }
    
    // MARK: - Cards / Mapa toggle

    private var viewModeToggle: some View {
        HStack(spacing: 2) {
            viewModeButton(mode: .cards, systemImage: "square.grid.2x2.fill")
            viewModeButton(mode: .mapa, systemImage: "map.fill")
        }
        .padding(3)
        .background {
            Capsule().fill(Color.white.opacity(0.08))
        }
    }

    private func viewModeButton(mode: POSViewModel.TableViewMode, systemImage: String) -> some View {
        let isActive = vm.tableViewMode == mode
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                vm.tableViewMode = mode
            }
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(isActive ? .white : Color(white: 0.5))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background {
                    if isActive {
                        Capsule().fill(Color.blue.opacity(0.7))
                    }
                }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Search Bar
    
    private var tableSearchBar: some View {
        GlassEffectContainer{
            HStack(spacing: 10) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Buscar mesa...", text: $vm.tableSearchQuery)
                        .foregroundColor(.white)
                    
                    if !vm.tableSearchQuery.isEmpty {
                        Button {
                            vm.tableSearchQuery = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .glassEffect(.regular.interactive(), in: .capsule)
                
                if vm.config.takeoutEnabled || vm.config.deliveryEnabled {
                    nuevaOrdenMenu
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 4)
        }
    }
    
    @ViewBuilder
    private var nuevaOrdenMenu: some View {
        let menuContent = Menu {
            if vm.config.takeoutEnabled {
                Button {
                    vm.handleNewDeliveryOrder()
                } label: {
                    Label("Para llevar", systemImage: "bag")
                }
            }
            if vm.config.deliveryEnabled {
                Button {
                    vm.handleNewPlatformDeliveryOrder()
                } label: {
                    Label("Delivery", systemImage: "bicycle")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.caption.weight(.bold))
                Text("Nueva Orden")
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        
        menuContent
            .buttonStyle(.glassProminent)
            .clipShape(Capsule())
    }
    
    // MARK: - Filter Bar
    
    private var filterBar: some View {
        HStack(spacing: 4) {
            ForEach(Array(POSViewModel.TableFilter.allCases.enumerated()), id: \.element) { _, filter in
                let isActive = vm.tableFilter == filter
                let count: Int = {
                    switch filter {
                    case .all: return vm.tables.count
                    case .available: return vm.tables.filter { $0.isAvailable }.count
                    case .occupied: return vm.tables.filter { $0.isOccupied }.count
                    case .reserved: return vm.tables.filter { $0.isReserved }.count
                    }
                }()
                
                Button(action: {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                        vm.tableFilter = filter
                    }
                }) {
                    Text("\(filter.rawValue) (\(count))")
                        .font(.caption.weight(.medium))
                        .foregroundColor(isActive ? .white : Color(white: 0.6))
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background {
                    if isActive {
                        Capsule()
                            .fill(Color.blue.opacity(0.7))
                            .glassEffect(.regular.interactive(), in: Capsule())
                            .matchedGeometryEffect(id: "activeFilter", in: filterNamespace)
                    }
                }
            }
        }
        .padding(4)
        .background {
            Capsule()
                .fill(.thinMaterial)
                .opacity(0.5)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
    
    // MARK: - Delivery Row (horizontal scroll)
    
    private var deliveryRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("ÓRDENES")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                Spacer()
                let totalOrders = vm.deliveryOrders.count + vm.platformDeliveryOrders.count
                if totalOrders > 0 {
                    Text("\(totalOrders) activas")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            .padding(.horizontal, 16)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(vm.deliveryOrders) { order in
                        DeliveryCompactCard(
                            order: order,
                            source: "Para Llevar",
                            action: { vm.handleSelectDeliveryOrder(order) },
                            onRush: {
                                Task {
                                    do {
                                        let fetched = try await APIService.shared.fetchOrder(orderId: order.id)
                                        if fetched.priority == 1 {
                                            try await APIService.shared.unrushOrder(orderId: order.id)
                                        } else {
                                            try await APIService.shared.rushOrder(orderId: order.id)
                                        }
                                    } catch {
                                        print("❌ Error toggling rush: \(error)")
                                    }
                                }
                            },
                            onHold: {
                                Task {
                                    do {
                                        let fetched = try await APIService.shared.fetchOrder(orderId: order.id)
                                        if fetched.onHold == true {
                                            try await APIService.shared.unholdOrder(orderId: order.id)
                                        } else {
                                            try await APIService.shared.holdOrder(orderId: order.id)
                                        }
                                    } catch {
                                        print("❌ Error toggling hold: \(error)")
                                    }
                                }
                            }
                        )
                    }
                    
                    ForEach(vm.platformDeliveryOrders) { order in
                        DeliveryCompactCard(
                            order: order,
                            source: order.detectedPlatform ?? "Delivery",
                            action: { vm.handleSelectDeliveryOrder(order) },
                            onRush: {
                                Task {
                                    do {
                                        let fetched = try await APIService.shared.fetchOrder(orderId: order.id)
                                        if fetched.priority == 1 {
                                            try await APIService.shared.unrushOrder(orderId: order.id)
                                        } else {
                                            try await APIService.shared.rushOrder(orderId: order.id)
                                        }
                                    } catch {
                                        print("❌ Error toggling rush: \(error)")
                                    }
                                }
                            },
                            onHold: {
                                Task {
                                    do {
                                        let fetched = try await APIService.shared.fetchOrder(orderId: order.id)
                                        if fetched.onHold == true {
                                            try await APIService.shared.unholdOrder(orderId: order.id)
                                        } else {
                                            try await APIService.shared.holdOrder(orderId: order.id)
                                        }
                                    } catch {
                                        print("❌ Error toggling hold: \(error)")
                                    }
                                }
                            }
                        )
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
    
    // MARK: - Compact Delivery Cards
}

// MARK: - Minimalist Order Card

struct DeliveryCompactCard: View {
    let order: Order
    let source: String
    let action: () -> Void
    var onRush: (() -> Void)?
    var onHold: (() -> Void)?
    
    private var statusColor: Color {
        switch order.status {
        case "pending": return .orange
        case "preparing": return .blue
        case "ready": return .green
        case "delivered": return Color(.systemBlue)
        case "cancelled": return .red
        default: return .gray
        }
    }
    
    private var statusLabel: String {
        switch order.status {
        case "pending": return "Pendiente"
        case "preparing": return "Preparando"
        case "ready": return "Listo"
        case "delivered": return "Entregado"
        case "cancelled": return "Cancelado"
        default: return order.status
        }
    }
    
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                // Top row: Name + Order # + badges
                HStack(alignment: .top) {
                    Text(order.displayName.replacingOccurrences(of: " [ENVIO]", with: ""))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    Spacer()
                    
                    HStack(spacing: 4) {
                        if order.onHold == true {
                            HStack(spacing: 2) {
                                Image(systemName: "pause.fill")
                                    .font(.system(size: 8))
                                Text("EN ESPERA")
                                    .font(.system(size: 8, weight: .black))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.85))
                            .clipShape(Capsule())
                        }
                        if order.priority == 1 {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 8))
                                Text("RUSH")
                                    .font(.system(size: 8, weight: .black))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.85))
                            .clipShape(Capsule())
                        }
                        Text("#\(order.orderNumber)")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.gray)
                    }
                }
                
                // Middle row: items + source
                HStack(spacing: 4) {
                    Text("\(order.items?.count ?? 0) items")
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    Text("•")
                        .font(.caption)
                        .foregroundColor(Color(white: 0.35))
                    
                    Text(source)
                        .font(.caption.weight(.medium))
                        .foregroundColor(Color(white: 0.6))
                }
                
                // Status pill
                HStack {
                    Text(statusLabel)
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(statusColor)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(statusColor.opacity(0.12))
                        )
                    
                    Spacer()
                }
            }
            .frame(width: 200, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(order.onHold == true ? Color.red.opacity(0.08) : Color.white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(
                                order.onHold == true ? Color.red.opacity(0.4) :
                                order.priority == 1 ? Color.orange.opacity(0.4) :
                                Color.white.opacity(0.08),
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                onRush?()
            } label: {
                Label(order.priority == 1 ? "Quitar Rush" : "Rush Orden", systemImage: "flame.fill")
            }
            Button {
                onHold?()
            } label: {
                Label(order.onHold == true ? "Reanudar Orden" : "Pausar Orden", systemImage: "pause.fill")
            }
        }
    }
}

// MARK: - Table Card (clean style like Bruma_waitress)

struct TableCardView: View {
    let table: Table
    let hasReadyItems: Bool
    let currentTime: Date
    let action: () -> Void
    var onRush: (() -> Void)?
    var onHold: (() -> Void)?
    
    var body: some View {
        Button(action: action) {
            ZStack {
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        Text(table.number)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Spacer()
                        
                        // Hold badge
                        if table.activeOrder?.onHold == true {
                            HStack(spacing: 3) {
                                Image(systemName: "pause.fill")
                                    .font(.system(size: 9))
                                Text("EN ESPERA")
                                    .font(.system(size: 9, weight: .black))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.red.opacity(0.85))
                            .clipShape(Capsule())
                        }
                        
                        // Rush badge
                        if table.activeOrder?.priority == 1 {
                            HStack(spacing: 3) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 9))
                                Text("RUSH")
                                    .font(.system(size: 9, weight: .black))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.orange.opacity(0.85))
                            .clipShape(Capsule())
                        }
                        
                        if hasReadyItems {
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 10))
                                Text("Listo")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(.green)
                            .clipShape(Capsule())
                        }
                        if table.isAvailable {
                            Image(systemName: "chair.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.green.opacity(0.6))
                        } else if table.isOccupied, let guestCount = table.guestCount, guestCount > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "person.fill")
                                    .font(.system(size: 10))
                                Text("\(guestCount)")
                                    .font(.system(size: 12, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.white.opacity(0.12))
                            .clipShape(Capsule())
                        }
                    }
                    
                    if table.isOccupied, let activeOrder = table.activeOrder {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Table.kitchenStatusColor(activeOrder.status))
                                .frame(width: 5, height: 5)
                            Text(kitchenStatusLabel(activeOrder.status))
                                .font(.caption2.weight(.medium))
                                .foregroundColor(Table.kitchenStatusColor(activeOrder.status))
                        }
                    } else {
                        Text(table.name ?? "Mesa")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }

                    HStack(spacing: 4) {
                        Circle()
                            .fill(table.statusColor)
                            .frame(width: 6, height: 6)
                        Text(table.statusLabel)
                            .font(.caption2.weight(.medium))
                            .foregroundColor(table.statusColor)
                        if table.isOccupied, let elapsed = occupancyTime(table) {
                            Text("· \(elapsed)")
                                .font(.caption2)
                                .foregroundColor(.gray)
                        }
                    }
                    
                    if let reservation = table.nextReservation {
                        HStack(spacing: 4) {
                            Image(systemName: "calendar")
                                .font(.caption2)
                                .foregroundColor(.purple)
                            Text("Reservada - \(reservation.reservationTime)")
                                .font(.caption2.weight(.medium))
                                .foregroundColor(.purple)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(10)
                
            }
            .frame(maxWidth: .infinity)
            .frame(height: 115)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(table.backgroundColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(table.borderColor, lineWidth: hasReadyItems ? 2 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            if table.isOccupied, let activeOrder = table.activeOrder {
                Button {
                    onRush?()
                } label: {
                    Label(activeOrder.priority == 1 ? "Quitar Rush" : "Rush Orden", systemImage: "flame.fill")
                }
                Button {
                    onHold?()
                } label: {
                    Label(activeOrder.onHold == true ? "Reanudar Orden" : "Pausar Orden", systemImage: "pause.fill")
                }
            }
        }
    }
    
    private func kitchenStatusLabel(_ status: String) -> String {
        switch status {
        case "pending": return "Sin enviar"
        case "preparing": return "En cocina"
        case "ready": return "Listo"
        case "delivered": return "Entregado"
        case "completed": return "Completado"
        default: return status
        }
    }
    
    private func occupancyTime(_ table: Table) -> String? {
        guard let createdAt = table.activeOrder?.createdAt else { return nil }
        
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = isoFormatter.date(from: createdAt) else {
            isoFormatter.formatOptions = [.withInternetDateTime]
            guard let date = isoFormatter.date(from: createdAt) else { return nil }
            let elapsed = currentTime.timeIntervalSince(date)
            return formatElapsedTime(elapsed)
        }
        let elapsed = currentTime.timeIntervalSince(date)
        return formatElapsedTime(elapsed)
    }
    
    private func formatElapsedTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let hours = minutes / 60
        let days = hours / 24
        let remainingHours = hours % 24
        let remainingMinutes = minutes % 60
        
        if days > 0 {
            if remainingHours > 0 {
                return "\(days)d \(remainingHours)h"
            } else {
                return "\(days)d"
            }
        } else if hours > 0 {
            return "\(hours)h \(remainingMinutes)m"
        } else {
            return "\(minutes)m"
        }
    }
}

// MARK: - Scale Button Style (hover:scale-[1.02] equivalent)

struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.02 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}
