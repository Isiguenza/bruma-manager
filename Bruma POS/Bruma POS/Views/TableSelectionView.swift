import SwiftUI

// Clean, minimal design inspired by Bruma_waitress
struct TableSelectionView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header — same as /bar
                header
                
                // Grid — 3 columns
                ScrollView {
                    VStack(spacing: 0) {
                        // DELIVERY SECTION
                        VStack(alignment: .leading, spacing: 12) {
                            Text("DELIVERY")
                                .font(.caption.weight(.bold))
                                .foregroundColor(.gray)
                                .padding(.horizontal, 16)
                                .padding(.top, 16)
                            
                            LazyVGrid(columns: [
                                GridItem(.flexible(), spacing: 12),
                                GridItem(.flexible(), spacing: 12),
                                GridItem(.flexible(), spacing: 12)
                            ], spacing: 12) {
                                // 1. Para Llevar button (always first)
                                paraLlevarCard
                                
                                // 2. Platform Delivery button (always second)
                                platformDeliveryCard
                                
                                // 3. Active Para Llevar orders
                                ForEach(vm.deliveryOrders) { order in
                                    DeliveryCardView(order: order, iconColor: .green, bgColor: .green) {
                                        vm.handleSelectDeliveryOrder(order)
                                    }
                                }
                                
                                // 4. Active Platform Delivery orders
                                ForEach(vm.platformDeliveryOrders) { order in
                                    DeliveryCardView(order: order, iconColor: .purple, bgColor: .purple) {
                                        vm.handleSelectDeliveryOrder(order)
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        
                        // Divider
                        if !vm.tables.isEmpty {
                            Rectangle()
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 1)
                                .padding(.vertical, 20)
                                .padding(.horizontal, 16)
                        }
                        
                        // MESAS SECTION
                        if !vm.tables.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("MESAS")
                                    .font(.caption.weight(.bold))
                                    .foregroundColor(.gray)
                                    .padding(.horizontal, 16)
                                
                                LazyVGrid(columns: [
                                    GridItem(.flexible(), spacing: 12),
                                    GridItem(.flexible(), spacing: 12),
                                    GridItem(.flexible(), spacing: 12)
                                ], spacing: 12) {
                                    ForEach(vm.tables) { table in
                                        TableCardView(table: table, hasReadyItems: vm.tablesWithReadyItems.contains(table.id)) {
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
    
    // MARK: - Para Llevar (clean style)
    
    private var paraLlevarCard: some View {
        Button {
            vm.handleNewDeliveryOrder()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: "bag.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.blue)
                Text("Para Llevar")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                Text("Nueva Orden")
                    .font(.caption2)
                    .foregroundColor(.blue.opacity(0.8))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 120)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.blue.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Platform Delivery (clean style)
    
    private var platformDeliveryCard: some View {
        Button {
            vm.handleNewPlatformDeliveryOrder()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.purple)
                Text("Delivery")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                Text("Uber/Rappi/Didi")
                    .font(.caption2)
                    .foregroundColor(.purple.opacity(0.8))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 120)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.purple.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.purple.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Table Card (clean style like Bruma_waitress)

struct TableCardView: View {
    let table: Table
    let hasReadyItems: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Text(table.number)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                
                Text(table.name ?? "Mesa")
                    .font(.caption2)
                    .foregroundColor(.gray)
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(tableStatusColor(table))
                        .frame(width: 6, height: 6)
                    Text(tableStatusLabel(table))
                        .font(.caption2.weight(.medium))
                        .foregroundColor(tableStatusColor(table))
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
                
                if hasReadyItems {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                        Text("Platillos listos")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(.green)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 120)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(tableBackgroundColor(table))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(tableBorderColor(table), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
    
    private func tableStatusColor(_ table: Table) -> Color {
        switch table.status {
        case "available": return .green
        case "occupied": return .orange
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
        case "occupied": return Color.orange.opacity(0.3)
        case "reserved": return Color.purple.opacity(0.3)
        default: return Color.white.opacity(0.1)
        }
    }
}

// MARK: - Delivery Card (clean style)

struct DeliveryCardView: View {
    let order: Order
    var iconColor: Color = .green
    var bgColor: Color = .green
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                HStack {
                    Image(systemName: order.customerName?.hasPrefix("Uber") == true || order.customerName?.hasPrefix("Rappi") == true || order.customerName?.hasPrefix("Didi") == true ? "shippingbox.fill" : "bag.fill")
                        .font(.caption)
                        .foregroundColor(iconColor)
                    Text(order.customerName ?? "Sin Nombre")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                }
                
                HStack {
                    Text("#\(order.orderNumber)")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Spacer()
                    if let itemCount = order.items?.count {
                        Text("\(itemCount) items")
                            .font(.caption2)
                            .foregroundColor(iconColor.opacity(0.8))
                    }
                }
                
                Spacer()
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(iconColor)
                        .frame(width: 6, height: 6)
                    Text("Activa")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(iconColor)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .frame(height: 120)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(bgColor.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(bgColor.opacity(0.3), lineWidth: 1)
                    )
            )
        }
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
