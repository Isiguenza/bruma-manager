import SwiftUI

struct TableSelectionView: View {
    @ObservedObject var tablesVM: TablesViewModel
    let onTableSelected: () -> Void
    
    @State private var loadingTableId: String?
    
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 4) {
                Text("Seleccionar Mesa")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Text("Elige una mesa o crea una orden para llevar")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .padding(.top, 16)
            .padding(.bottom, 12)
            
            if tablesVM.loading {
                Spacer()
                ProgressView()
                    .tint(.white)
                Spacer()
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: columns, spacing: 12) {
                        // Para Llevar - Nueva Orden card
                        Button(action: { tablesVM.selectParaLlevar() }) {
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
                        
                        // Active Para Llevar orders
                        ForEach(tablesVM.deliveryOrders) { order in
                            Button(action: {
                                handleDeliveryOrderTap(order)
                            }) {
                                VStack(spacing: 6) {
                                    HStack {
                                        Image(systemName: "bag.fill")
                                            .font(.caption)
                                            .foregroundColor(.green)
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
                                                .foregroundColor(.green.opacity(0.8))
                                        }
                                    }
                                    
                                    Spacer()
                                    
                                    HStack(spacing: 4) {
                                        Circle()
                                            .fill(Color.green)
                                            .frame(width: 6, height: 6)
                                        Text("Activa")
                                            .font(.caption2.weight(.medium))
                                            .foregroundColor(.green)
                                    }
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity)
                                .frame(height: 120)
                                .background(
                                    RoundedRectangle(cornerRadius: 14)
                                        .fill(Color.green.opacity(0.08))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14)
                                                .stroke(Color.green.opacity(0.3), lineWidth: 1)
                                        )
                                )
                            }
                        }
                        
                        // Table cards
                        ForEach(tablesVM.tables) { table in
                            Button(action: {
                                handleTableTap(table)
                            }) {
                                VStack(spacing: 8) {
                                    if loadingTableId == table.id {
                                        ProgressView()
                                            .tint(.white)
                                            .frame(height: 38)
                                    } else {
                                        Text(table.number)
                                            .font(.system(size: 32, weight: .bold, design: .rounded))
                                            .foregroundColor(.white)
                                    }
                                    
                                    Text("Mesa")
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
                                .opacity(table.isReserved ? 0.5 : 1)
                            }
                            .disabled(table.isReserved || loadingTableId != nil)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 100)
                }
            }
        }
        .task {
            await tablesVM.fetchTables()
            await tablesVM.fetchDeliveryOrders()
        }
        .onAppear {
            Task {
                await tablesVM.fetchTables()
                await tablesVM.fetchDeliveryOrders()
            }
        }
        // Customer name dialog
        .alert("Nombre del Cliente", isPresented: $tablesVM.showCustomerNameDialog) {
            TextField("Nombre (opcional)", text: $tablesVM.customerName)
            Button("Continuar") {
                tablesVM.confirmParaLlevar()
                onTableSelected()
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Ingresa el nombre para la orden")
        }
        // Guest count dialog
        .sheet(isPresented: $tablesVM.showGuestCountDialog) {
            GuestCountSheet(
                guestCount: $tablesVM.guestCount,
                onConfirm: {
                    tablesVM.confirmGuestCount()
                    onTableSelected()
                }
            )
            .presentationDetents([.height(300)])
            .presentationDragIndicator(.visible)
        }
    }
    
    // MARK: - Actions
    
    private func handleTableTap(_ table: Table) {
        if table.isOccupied {
            // Fetch full detail (with activeOrder) then open
            loadingTableId = table.id
            Task {
                do {
                    let detail = try await APIService.shared.fetchTableDetail(tableId: table.id)
                    tablesVM.selectedTable = detail
                    tablesVM.isParaLlevar = false
                    loadingTableId = nil
                    onTableSelected()
                } catch {
                    // Fallback: open with basic table data
                    tablesVM.selectedTable = table
                    tablesVM.isParaLlevar = false
                    loadingTableId = nil
                    onTableSelected()
                }
            }
        } else if table.isAvailable {
            tablesVM.selectTable(table)
        }
    }
    
    private func handleDeliveryOrderTap(_ order: Order) {
        // Open existing Para Llevar order
        tablesVM.selectedTable = nil
        tablesVM.isParaLlevar = true
        tablesVM.customerName = order.customerName ?? ""
        onTableSelected()
    }
    
    // MARK: - Helpers
    
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

// MARK: - Guest Count Sheet

struct GuestCountSheet: View {
    @Binding var guestCount: Int
    let onConfirm: () -> Void
    
    var body: some View {
        ZStack {
            Color(red: 0.08, green: 0.08, blue: 0.08).ignoresSafeArea()
            
            VStack(spacing: 24) {
                Text("¿Cuántas personas?")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                
                HStack(spacing: 20) {
                    if #available(iOS 26.0, *) {
                        Button(action: { if guestCount > 1 { guestCount -= 1 } }) {
                            Image(systemName: "minus")
                                .font(.title.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                        }
                        .buttonStyle(.glass)
                        .clipShape(Circle())
                    } else {
                        Button(action: { if guestCount > 1 { guestCount -= 1 } }) {
                            Image(systemName: "minus")
                                .font(.title.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }

                    Text("\(guestCount)")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(width: 80)

                    if #available(iOS 26.0, *) {
                        Button(action: { if guestCount < 20 { guestCount += 1 } }) {
                            Image(systemName: "plus")
                                .font(.title.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                        }
                        .buttonStyle(.glassProminent)
                        .tint(.blue)
                        .clipShape(Circle())
                    } else {
                        Button(action: { if guestCount < 20 { guestCount += 1 } }) {
                            Image(systemName: "plus")
                                .font(.title.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                                .background(Color.blue)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                
                Group {
                    if #available(iOS 26.0, *) {
                        Button(action: onConfirm) {
                            Text("Confirmar")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.glassProminent)
                        .tint(.blue)
                    } else {
                        Button(action: onConfirm) {
                            Text("Confirmar")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.blue)
                                .cornerRadius(14)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 32)
            }
            .padding()
        }
    }
}
