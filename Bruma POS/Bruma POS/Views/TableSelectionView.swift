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
                        
                        // MESAS SECTION
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
                                        TableCardView(table: table, hasReadyItems: vm.tablesWithReadyItems.contains(table.id), currentTime: currentTime) {
                                            vm.handleSelectTable(table)
                                        }
                                    }
                                }
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
        }
        .sheet(isPresented: $vm.showInitialGuestDialog) {
            InitialGuestCountDialog(vm: vm)
                .presentationDetents([.height(400)])
                .presentationDragIndicator(.visible)
        }
        .onReceive(timer) { _ in
            currentTime = Date()
        }
        .sheet(isPresented: $vm.showCustomerNameDialog) {
            CustomerNameSheet(vm: vm)
                .presentationDetents([.height(380)])
                .presentationDragIndicator(.visible)
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
    
    // MARK: - Customer Name Sheet (for Para Llevar)
    
    struct CustomerNameSheet: View {
        @ObservedObject var vm: POSViewModel
        
        var body: some View {
            ZStack {
                Color(red: 0.08, green: 0.08, blue: 0.08).ignoresSafeArea()
                
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("Nueva Orden Para Llevar")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                    }
                    
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nombre del Cliente")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        TextField("Ej: Juan Pérez", text: $vm.customerName)
                            .foregroundColor(.white)
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color(white: 0.06))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                            )
                            .onSubmit { vm.handleConfirmCustomerName() }
                    }
                    
                    // Home delivery checkbox
                    Button {
                        vm.isHomeDelivery.toggle()
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: vm.isHomeDelivery ? "checkmark.square.fill" : "square")
                                .font(.title3)
                                .foregroundColor(vm.isHomeDelivery ? .blue : .gray)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Envío a domicilio")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundColor(.white)
                                Text("+\(vm.formatCurrency(vm.homeDeliveryFee))")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                            
                            Spacer()
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(vm.isHomeDelivery ? Color.blue.opacity(0.08) : Color(white: 0.06))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(vm.isHomeDelivery ? Color.blue.opacity(0.3) : Color(white: 0.2)))
                        )
                    }
                    .buttonStyle(.plain)
                    
                    HStack(spacing: 12) {
                        Button {
                            vm.showCustomerNameDialog = false
                        } label: {
                            Text("Cancelar")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color(white: 0.12))
                                .cornerRadius(12)
                        }
                        
                        Button {
                            vm.handleConfirmCustomerName()
                        } label: {
                            Text("Continuar")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.blue)
                                .cornerRadius(12)
                        }
                    }
                }
                .padding(24)
            }
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
                Image(systemName: "person.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.white.opacity(0.7))
                
                Text(vm.employeeName ?? "Usuario")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                
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
    
    // MARK: - Search Bar
    
    private var tableSearchBar: some View {
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
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.white.opacity(0.1), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 4)
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
            Text("ÓRDENES")
                .font(.caption.weight(.bold))
                .foregroundColor(.gray)
                .padding(.horizontal, 16)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    // New Para Llevar
                    paraLlevarCompactCard
                    
                    // New Platform Delivery
                    platformDeliveryCompactCard
                    
                    // Active Para Llevar orders
                    ForEach(vm.deliveryOrders) { order in
                        DeliveryCompactCard(order: order, iconColor: .green) {
                            vm.handleSelectDeliveryOrder(order)
                        }
                    }
                    
                    // Active Platform Delivery orders
                    ForEach(vm.platformDeliveryOrders) { order in
                        DeliveryCompactCard(order: order, iconColor: .purple) {
                            vm.handleSelectDeliveryOrder(order)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
    
    // MARK: - Compact Delivery Cards
    
    private var paraLlevarCompactCard: some View {
        Button {
            vm.handleNewDeliveryOrder()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "bag.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.blue)
                
                VStack(alignment: .leading, spacing: 3) {
                    Text("Para Llevar")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text("Nueva")
                        .font(.caption)
                        .foregroundColor(.blue.opacity(0.8))
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .frame(width: 200, height: 64)
        .buttonStyle(.plain)
    }
    
    private var platformDeliveryCompactCard: some View {
        Button {
            vm.handleNewPlatformDeliveryOrder()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.purple)
                
                VStack(alignment: .leading, spacing: 3) {
                    Text("Delivery")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text("Uber/Rappi")
                        .font(.caption)
                        .foregroundColor(.purple.opacity(0.8))
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.purple.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.purple.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .frame(width: 200, height: 64)
        .buttonStyle(.plain)
    }
}

// MARK: - Table Card (clean style like Bruma_waitress)

struct TableCardView: View {
    let table: Table
    let hasReadyItems: Bool
    let currentTime: Date
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            ZStack {
                VStack(spacing: 6) {
                    HStack {
                        Text(table.number)
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Spacer()
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
                        Text("\(activeOrder.itemCount ?? 0) items")
                            .font(.caption2)
                            .foregroundColor(.orange.opacity(0.8))
                    } else {
                        Text(table.name ?? "Mesa")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                    
                    HStack(spacing: 4) {
                        Circle()
                            .fill(tableStatusColor(table))
                            .frame(width: 6, height: 6)
                        Text(tableStatusLabel(table))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(tableStatusColor(table))
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
                
                // Prominent ready badge
                if hasReadyItems {
                    VStack {
                        HStack {
                            Spacer()
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 10))
                                Text("Listo")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color(red: 1.0, green: 0.45, blue: 0.0))
                            .clipShape(Capsule())
                        }
                        Spacer()
                    }
                    .padding(6)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 115)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(tableBackgroundColor(table))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(tableBorderColor(table), lineWidth: hasReadyItems ? 2 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
    
    private func tableStatusColor(_ table: Table) -> Color {
        switch table.status {
        case "available": return .green
        case "occupied": return Color(red: 1.0, green: 0.45, blue: 0.0)
        case "reserved": return .purple
        default: return .gray
        }
    }
    
    private func tableStatusLabel(_ table: Table) -> String {
        switch table.status {
        case "available": return "Libre"
        case "occupied": return "Ocupada"
        case "reserved": return "Reservada"
        default: return table.status
        }
    }
    
    private func tableBackgroundColor(_ table: Table) -> Color {
        switch table.status {
        case "occupied": return Color.orange.opacity(0.08)
        case "reserved": return Color.purple.opacity(0.08)
        default: return Color.white.opacity(0.05)
        }
    }
    
    private func tableBorderColor(_ table: Table) -> Color {
        switch table.status {
        case "occupied": return Color(red: 1.0, green: 0.45, blue: 0.0).opacity(0.4)
        case "reserved": return Color.purple.opacity(0.3)
        default: return Color.white.opacity(0.1)
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

// MARK: - Delivery Card (clean style)

struct DeliveryCompactCard: View {
    let order: Order
    var iconColor: Color = .green
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: order.customerName?.hasPrefix("Uber") == true || order.customerName?.hasPrefix("Rappi") == true || order.customerName?.hasPrefix("Didi") == true ? "shippingbox.fill" : "bag.fill")
                    .font(.system(size: 24))
                    .foregroundColor(iconColor)
                
                VStack(alignment: .leading, spacing: 3) {
                    Text((order.customerName ?? "Sin Nombre").replacingOccurrences(of: " [ENVIO]", with: ""))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text("#\(order.orderNumber) - \(order.items?.count ?? 0) items")
                        .font(.caption)
                        .foregroundColor(iconColor.opacity(0.8))
                        .lineLimit(1)
                }
                
                Spacer()
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(iconColor)
                        .frame(width: 6, height: 6)
                    Text("Activa")
                        .font(.caption.weight(.medium))
                        .foregroundColor(iconColor)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(iconColor.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(iconColor.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .frame(width: 200, height: 64)
        .buttonStyle(.plain)
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
