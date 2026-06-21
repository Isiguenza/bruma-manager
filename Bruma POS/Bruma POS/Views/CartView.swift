import SwiftUI

private struct TablePillBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .capsule)
        } else {
            content
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
        }
    }
}

struct CartView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Header (back, tableInfoPill, guestCount)
            if vm.selectedTable != nil || !vm.customerName.isEmpty {
                headerButtons
                    .padding(12)
            }
            
            // Main content
            mainCartContent
        }
        .background(Color(uiColor: .systemGray6).opacity(0.4))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .alert("Liberar Mesa", isPresented: $vm.showingReleaseConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Liberar", role: .destructive) {
                print("🔥 Alert confirm: calling executeReleaseTable()")
                vm.executeReleaseTable()
            }
        } message: {
            Text("Hay \(vm.cart.count) items en el carrito que se perderán. ¿Deseas liberar la mesa?")
        }
        .alert("Pausar Orden", isPresented: $vm.showingHoldConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Pausar", role: .destructive) {
                vm.executeHold()
            }
        } message: {
            Text("Esto pausará la orden en cocina. ¿Deseas continuar?")
        }
    }
    
    private var headerButtons: some View {
        Group {
            if #available(iOS 26.0, *) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        Button {
                            vm.emitCustomerDisplayState(mode: "idle", force: true)
                            vm.currentScreen = .tableSelection
                            Task { await vm.refreshTables() }
                        } label: {
                            Image(systemName: "chevron.left")
                                .padding(8)
                        }
                        .buttonStyle(.glass)
                        .clipShape(Circle())
                        
                        Menu {
                            if vm.selectedTable != nil {
                                Button(role: .destructive) { vm.handleReleaseTable() } label: {
                                    Label("Liberar Mesa", systemImage: "door.left.hand.open")
                                }
                                Divider()
                            } else {
                                Button(role: .destructive) { vm.handleReleaseTable() } label: {
                                    Label("Liberar Orden", systemImage: "trash")
                                }
                                Divider()
                            }
                            Button { vm.handleChangeTable() } label: {
                                Label("Cambiar Mesa", systemImage: "arrow.left.arrow.right")
                            }
                            
                            Button {
                                vm.showAdminMenu = true
                            } label: {
                                Label("Menú Admin", systemImage: "gearshape.fill")
                            }
                            Divider()
                            
                            Button { vm.toggleRush() } label: {
                                Label(vm.isCurrentOrderRush ? "Quitar Rush" : "Rush Orden", systemImage: "flame.fill")
                            }
                            .tint(.orange)
                            
                            Button { vm.toggleHold() } label: {
                                Label(vm.isCurrentOrderOnHold ? "Reanudar Orden" : "Pausar Orden", systemImage: vm.isCurrentOrderOnHold ? "play.fill" : "hand.raised.fill")
                            }
                            .tint(.red)
                        } label: {
                            tableInfoPill
                        }
                        .buttonStyle(.glass)
                        
                        Button {
                            vm.tempGuestCount = vm.guestCount
                            vm.showGuestCountDialog = true
                        } label: {
                            Label("\(vm.guestCount)", systemImage: "person.2.fill")
                                .padding(8)
                                .foregroundStyle(.blue)
                                .font(.footnote)
                        }
                        .buttonStyle(.glass)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    GlassCircleButton(
                        systemImage: "chevron.left",
                        action: {
                            vm.emitCustomerDisplayState(mode: "idle", force: true)
                            vm.currentScreen = .tableSelection
                            Task { await vm.refreshTables() }
                        },
                        isActive: false,
                        activeColor: .blue
                    )
                    
                    Menu {
                        if vm.selectedTable != nil {
                            Button(role: .destructive) { vm.handleReleaseTable() } label: {
                                Label("Liberar Mesa", systemImage: "door.open")
                            }
                            Divider()
                        } else {
                            Button(role: .destructive) { vm.handleReleaseTable() } label: {
                                Label("Liberar Orden", systemImage: "trash")
                            }
                            Divider()
                        }
                        Button { vm.handleChangeTable() } label: {
                            Label("Cambiar Mesa", systemImage: "arrow.left.arrow.right")
                        }
                        Button { vm.toggleRush() } label: {
                            Label(vm.isCurrentOrderRush ? "Quitar Rush" : "Rush Orden", systemImage: "flame.fill")
                        }
                        Button { vm.toggleHold() } label: {
                            Label(vm.isCurrentOrderOnHold ? "Reanudar Orden" : "Pausar Orden", systemImage: "pause.fill")
                        }
                        Button {
                            vm.showAdminMenu = true
                        } label: {
                            Label("Menú Admin", systemImage: "gearshape.fill")
                        }
                        Button {
                            vm.tempGuestCount = vm.guestCount
                            vm.showGuestCountDialog = true
                        } label: {
                            Label("Cambiar Comensales", systemImage: "person.2")
                        }
                    } label: {
                        tableInfoPill
                    }
                    
                    GlassPillButton(
                        label: "\(vm.guestCount)",
                        systemImage: "person.2.fill",
                        action: {
                            vm.tempGuestCount = vm.guestCount
                            vm.showGuestCountDialog = true
                        },
                        isActive: true,
                        activeColor: .blue
                    )
                }
            }
        }
    }
    
    private var mainCartContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text("Orden")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.gray)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            
            // Seat selector (pill grid)
            if vm.selectedTable != nil && vm.guestCount > 0 {
                let seats = (1...vm.guestCount).map { "A\($0)" } + ["C"]
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                    ForEach(seats, id: \.self) { seat in
                        Button {
                            vm.activeSeat = seat
                        } label: {
                            Text(seat)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 32)
                                .background(
                                    Capsule()
                                        .fill(vm.activeSeat == seat ? Color.blue : Color.white.opacity(0.06))
                                )
                                .overlay(
                                    Capsule()
                                        .stroke(vm.activeSeat == seat ? Color.blue.opacity(0.3) : Color.white.opacity(0.08), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                        .animation(.easeInOut(duration: 0.15), value: vm.activeSeat)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }

            // Course selector (native segmented)
            if !vm.cart.isEmpty {
                NativeSegmentedPicker(
                    segments: (1...4).map { ("T\($0)", $0) },
                    selection: $vm.activeCourse,
                    selectedTint: UIColor(Color.green.opacity(0.7))
                )
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)
            }
            
            // Offline indicator
            if vm.isOffline {
                HStack {
                    Spacer()
                    OfflineIndicator()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            
            // Employee order tabs
            if vm.isEmployeeOrder {
                Picker("Vista", selection: Binding(
                    get: { vm.employeeOrderTab },
                    set: { newValue in
                        vm.employeeOrderTab = newValue
                        if newValue == 1 {
                            Task { await vm.fetchEmployeeOrderHistory() }
                        }
                    }
                )) {
                    Text("Orden Actual").tag(0)
                    Text("Historial").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            
            Rectangle().fill(Color(white: 0.12)).frame(height: 1)
            
            if vm.isEmployeeOrder && vm.employeeOrderTab == 1 {
                EmployeeOrderHistoryView(vm: vm)
            } else if vm.cart.isEmpty {
                Spacer()
                VStack(spacing: 14) {
                    Image(systemName: "cart.badge.plus")
                        .font(.system(size: 44, weight: .light))
                        .foregroundColor(Color(white: 0.25))
                    Text("Carrito vacío")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(white: 0.45))
                    Text("Selecciona productos del menú para comenzar")
                        .font(.caption)
                        .foregroundColor(Color(white: 0.35))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.cartRenderElements) { renderElement in
                            switch renderElement {
                            case .promotionGroup(let group, let showCourseHeader, let showSeatHeader):
                                VStack(alignment: .leading, spacing: 4) {
                                    if showCourseHeader, let firstItem = group.items.first?.item {
                                        HStack(spacing: 6) {
                                            Text("T\(firstItem.course)")
                                                .font(.caption.weight(.bold))
                                            Text("•")
                                                .foregroundColor(Color(white: 0.4))
                                            Text("Tiempo \(firstItem.course)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(.green)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(Color.green.opacity(0.1))
                                        .cornerRadius(8)
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green.opacity(0.3), lineWidth: 1))
                                    }
                                    
                                    if showSeatHeader, let firstItem = group.items.first?.item {
                                        HStack(spacing: 6) {
                                            Image(systemName: firstItem.seat == "C" ? "fork.knife" : "person.fill")
                                                .font(.caption2)
                                            Text(firstItem.seat == "C" ? "Centro (compartido)" : "Asiento \(firstItem.seat)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(firstItem.seat == "C" ? .orange : .blue)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .padding(.top, showCourseHeader ? 4 : 0)
                                    }
                                    
                                    PromotionGroupView(group: group, vm: vm)
                                        .padding(.top, 4)
                                }
                            
                            case .item(let index, let item, let showCourseHeader, let showSeatHeader):
                                VStack(alignment: .leading, spacing: 4) {
                                    if showCourseHeader {
                                        HStack(spacing: 6) {
                                            Text("T\(item.course)")
                                                .font(.caption.weight(.bold))
                                            Text("•")
                                                .foregroundColor(Color(white: 0.4))
                                            Text("Tiempo \(item.course)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(.green)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(Color.green.opacity(0.1))
                                        .cornerRadius(8)
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green.opacity(0.3), lineWidth: 1))
                                    }
                                    
                                    if showSeatHeader {
                                        HStack(spacing: 6) {
                                            Image(systemName: item.seat == "C" ? "fork.knife" : "person.fill")
                                                .font(.caption2)
                                            Text(item.seat == "C" ? "Centro (compartido)" : "Asiento \(item.seat)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(item.seat == "C" ? .orange : .blue)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .padding(.top, showCourseHeader ? 4 : 0)
                                    }
                                    
                                    CartItemRow(item: item, index: index, vm: vm)
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
            
            Rectangle().fill(Color(white: 0.12)).frame(height: 1)

            cartFooter
                .padding(16)
        }
    }
    
    private var tableInfoPill: some View {
        HStack(spacing: 8) {
            if let table = vm.selectedTable {
               /* Image(systemName: "takeoutbag.and.cup.and.straw.fill")
                    .font(.caption)
                    .foregroundStyle(.white)*/
                Text(table.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.6))
            } else {
                /*Image(systemName: "cart.fill")
                    .font(.caption)
                    .foregroundStyle(.white)*/
                VStack(alignment: .leading, spacing: 2) {
                    Text("Llevar")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                    if !vm.customerName.isEmpty {
                        Text(vm.customerName)
                            .font(.caption2)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .foregroundStyle(Color(white: 0.6))
                    }
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.6))
            }
            
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        
    }

    private var cartFooter: some View {
        VStack(spacing: 12) {
            // Home delivery toggle (only for Para Llevar orders)
            if vm.selectedTable == nil && !vm.isEmployeeOrder && !vm.isPlatformDelivery && !vm.cart.isEmpty {
                HStack(spacing: 8) {
                    Text("Envío a domicilio")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.white)

                    Spacer()

                    

                    Toggle("", isOn: Binding(
                        get: { vm.isHomeDelivery },
                        set: { _ in vm.toggleHomeDelivery() }
                    ))
                    .tint(.blue)
                    .labelsHidden()
                    .scaleEffect(0.85)
                }
                .padding(.horizontal, 4)
            }

            // Show delivery fee in subtotal breakdown
            if vm.isHomeDelivery && !vm.cart.isEmpty {
                HStack {
                    Text("Envío a domicilio")
                        .font(.caption)
                        .foregroundColor(.blue)
                    Spacer()
                    Text("+\(vm.formatCurrency(vm.homeDeliveryFee))")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.blue)
                }
                .padding(.horizontal, 4)
            }

            // Total display
            HStack {
                Text("Total")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.gray)
                Spacer()
                Text(vm.formatCurrency(vm.cartTotal))
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
            }

            HStack(spacing: 12) {
                // Print button with context menu
                Menu {
                    Button {
                        Task { await vm.handlePrint() }
                    } label: {
                        Label("Ticket Cuenta", systemImage: "doc.text")
                    }

                    Button {
                        Task { await vm.handlePrintPreTicket() }
                    } label: {
                        Label("Pre-Ticket", systemImage: "doc.plaintext")
                    }

                    Button {
                        Task { await vm.handlePrintPreTicketPDF() }
                    } label: {
                        Label("Pre-Ticket PDF", systemImage: "square.and.arrow.up")
                    }
                } label: {
                    Image(systemName: "printer.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(8)
                        
                } primaryAction: {
                    Task { await vm.handlePrint() }
                }
                .disabled(vm.cart.isEmpty)
                .opacity(vm.cart.isEmpty ? 0.3 : 1)
                .buttonStyle(.glass)

                // Morphing button: Kitchen Send / Pay
                let hasUnsentItems = !vm.cart.isEmpty && vm.cart.contains(where: { !$0.sentToKitchen })
                
                Button {
                    if hasUnsentItems {
                        vm.handleSendToKitchen()
                    } else {
                        vm.showingPayment = true
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: hasUnsentItems ? "frying.pan.fill" : "creditcard.fill")
                            .font(.callout)
                            .contentTransition(.symbolEffect(.replace))
                            
                        Text(hasUnsentItems ? "Enviar a Cocina" : "Pagar")
                            .font(.callout.weight(.semibold))
                            .contentTransition(.numericText())
                    }
                    .foregroundStyle(vm.cart.isEmpty ? Color(white: 0.4) : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical,8)
                }
               
                .buttonStyle(.glassProminent)
                .tint(hasUnsentItems ? Color.orange : Color.blue)
                .disabled(vm.cart.isEmpty)
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasUnsentItems)
            }
        }
        
    }
}
