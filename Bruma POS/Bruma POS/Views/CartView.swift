import SwiftUI

struct CartView: View {
    @ObservedObject var vm: POSViewModel

    @State private var showCartRejectDialog = false
    @State private var cartRejectReason = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header (back, tableInfoPill, guestCount)
            if vm.selectedTable != nil || !vm.customerName.isEmpty {
                headerButtons
                    .padding(12)
            }

            // Tickets separados de esta mesa — cada uno se cobra por su cuenta.
            if let tickets = vm.tableTickets, !tickets.isEmpty {
                splitTicketsBar(tickets)
            }

            // Main content
            mainCartContent
        }
        .background(Color(uiColor: .systemGray6).opacity(0.4))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .alert("Rechazar pedido en línea", isPresented: $showCartRejectDialog) {
            TextField("Motivo (opcional)", text: $cartRejectReason)
            Button("Cancelar", role: .cancel) {}
            Button("Rechazar", role: .destructive) {
                vm.rejectOnlineOrderFromCart(reason: cartRejectReason)
                cartRejectReason = ""
            }
        } message: {
            Text("Si ya se autorizó el pago, se libera la retención (no se cobra nada). Si ya se había cobrado, se reembolsa.")
        }
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
        HStack(spacing: 8) {
            Button {
                vm.emitCustomerDisplayState(mode: "idle", force: true)
                vm.handleBackToTables()
            } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(.flatCircleNeutral)

            Menu {
                contactMenuSection
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
            .buttonStyle(.flatCapsuleNeutral)

            if vm.currentOrderAddress != nil {
                Button {
                    vm.showLocationModal = true
                } label: {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundStyle(.blue)
                        .font(.footnote)
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            } else {
                Button {
                    vm.tempGuestCount = vm.guestCount
                    vm.showGuestCountDialog = true
                } label: {
                    Label("\(vm.guestCount)", systemImage: "person.2.fill")
                        .foregroundStyle(.blue)
                        .font(.footnote)
                        .padding(.horizontal, 10)
                        .frame(height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
        }
    }
    
    /// Barra de tickets separados de la mesa — cada pill es una orden
    /// independiente (de "dividir en tickets separados"); tocarla la carga
    /// en el carrito para verla/cobrarla con el flujo normal de pago.
    @ViewBuilder
    private func splitTicketsBar(_ tickets: [Order]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tickets) { ticket in
                    let isSelected = vm.currentOrderId == ticket.id
                    let isPaid = ticket.paymentStatus == "paid"
                    Button {
                        vm.selectSplitTicket(ticket)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: isPaid ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                                .foregroundColor(isPaid ? .green : .white.opacity(0.6))
                            Text("Ticket #\(ticket.orderNumber)")
                                .font(.caption.weight(.semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .modifier(FlatPill(isSelected: isSelected, color: isPaid ? .green : .blue))
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.bottom, 8)
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
                                            Spacer()
                                            courseSendButton(firstItem.course)
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
                                            Spacer()
                                            Text(vm.formatCurrency(vm.seatSubtotal(firstItem.seat)))
                                                .font(.caption.weight(.bold))
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
                                            Spacer()
                                            courseSendButton(item.course)
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
                                            Spacer()
                                            Text(vm.formatCurrency(vm.seatSubtotal(item.seat)))
                                                .font(.caption.weight(.bold))
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
    
    /// Botón para disparar a cocina solo ese Tiempo (coursing). Aparece únicamente
    /// cuando el tiempo tiene items sin enviar.
    @ViewBuilder
    private func courseSendButton(_ course: Int) -> some View {
        if vm.hasUnsentItems(inCourse: course) {
            Button {
                vm.handleSendToKitchen(course: course)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "paperplane.fill").font(.caption2)
                    Text("Enviar").font(.caption2.weight(.bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(vm.submitting)
        }
    }

    /// Info de contacto del pedido (nombre + teléfono) para el menú ⋯.
    @ViewBuilder
    private var contactMenuSection: some View {
        if !vm.customerName.isEmpty || vm.currentOrderPhone != nil {
            Section(vm.customerName.isEmpty ? "Contacto" : vm.customerName) {
                if let phone = vm.currentOrderPhone {
                    Button {
                        if let url = URL(string: "tel://\(phone.filter { $0.isNumber })") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Label(phone, systemImage: "phone.fill")
                    }
                }
            }
            Divider()
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
                if vm.currentOrderPaymentStatus == "paid" {
                    
                }
                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.6))
            }
            
        }
        .frame(height: 42)
        .frame(maxWidth: .infinity)
        .padding(.horizontal)

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

            if vm.currentOrderSource == "web" && (vm.currentOrderStatus ?? "") == "pending" {
                pendingOnlineOrderActions
            } else {
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
                        .frame(width: 52, height: 52)
                } primaryAction: {
                    Task { await vm.handlePrint() }
                }
                .disabled(vm.cart.isEmpty)
                .buttonStyle(.flatCircleNeutral)

                // Morphing button: Kitchen Send / Pay / Marcar listo / Marcar en camino / Finalize
                let hasUnsentItems = !vm.cart.isEmpty && vm.cart.contains(where: { !$0.sentToKitchen })
                // "authorized" = pedido web con captura manual de Stripe, ya
                // aceptado y en cocina, tarjeta retenida pero aún sin cobrar
                // (el cobro real pasa hasta "Marcar listo") — cuenta igual que
                // "paid" para efectos de este botón, si no se quedaría
                // mostrando "Pagar" en vez de avanzar el pedido.
                let isPaidTakeout = vm.selectedTable == nil
                    && (vm.currentOrderPaymentStatus == "paid" || vm.currentOrderPaymentStatus == "authorized")
                let isWebOrder = vm.currentOrderSource == "web"
                let isDeliveryOrder = vm.currentOrderAddress != nil
                let webStatus = vm.currentOrderStatus ?? "preparing"
                // Pedidos web: antes de "Finalizar orden" hay que avisarle al cliente
                // por WhatsApp que está listo (y, si es domicilio, que va en camino).
                let needsReadyStep = isWebOrder && isPaidTakeout && !hasUnsentItems
                    && !["ready", "delivered", "completed"].contains(webStatus)
                let needsDeliveringStep = isWebOrder && isPaidTakeout && !hasUnsentItems
                    && isDeliveryOrder && webStatus == "ready"

                Button {
                    if hasUnsentItems {
                        vm.handleSendToKitchen()
                    } else if needsReadyStep {
                        vm.handleMarkWebOrderStatus("ready")
                    } else if needsDeliveringStep {
                        vm.handleMarkWebOrderStatus("delivered")
                    } else if isPaidTakeout {
                        vm.handleFinalizeOrder()
                    } else {
                        vm.showingPayment = true
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: hasUnsentItems ? "frying.pan.fill" : needsReadyStep ? "bell.badge.fill" : needsDeliveringStep ? "bicycle" : (isPaidTakeout ? "checkmark.circle.fill" : "creditcard.fill"))
                            .font(.callout)
                            .contentTransition(.symbolEffect(.replace))

                        Text(hasUnsentItems ? "Enviar a Cocina" : needsReadyStep ? "Marcar listo" : needsDeliveringStep ? "Marcar en camino" : (isPaidTakeout ? "Finalizar orden" : "Pagar"))
                            .font(.callout.weight(.semibold))
                            .contentTransition(.numericText())
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                }
                .buttonStyle(.flatCapsule(hasUnsentItems ? Color.orange : needsReadyStep ? Color.blue : needsDeliveringStep ? Color.purple : (isPaidTakeout ? Color.green : Color.blue)))
                .disabled(vm.cart.isEmpty)
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasUnsentItems || isPaidTakeout || needsReadyStep || needsDeliveringStep)
            }
            }
        }

    }

    /// Pedido en línea que llegó como "pending" (la pantalla verde no se atendió
    /// o nunca salió) y se abrió aquí desde la lista de delivery. En vez de
    /// "Marcar listo", ofrece Confirmar / Rechazar apilados.
    private var pendingOnlineOrderActions: some View {
        VStack(spacing: 8) {
            Button {
                vm.confirmOnlineOrderFromCart()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                    Text("Confirmar pedido").font(.callout.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(Color.green))
            .disabled(vm.processing)

            Button(role: .destructive) {
                showCartRejectDialog = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "xmark.circle.fill")
                    Text("Rechazar pedido").font(.callout.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(Color.red))
            .disabled(vm.processing)
        }
    }
}

// MARK: - Previews

/// Helpers para armar estados de ejemplo del CartView sin backend.
private enum CartPreview {
    static func item(
        _ name: String,
        _ price: Double,
        qty: Int = 1,
        seat: String = "C",
        course: Int = 1,
        sent: Bool = false,
        notes: String = "",
        variant: String? = nil
    ) -> CartItem {
        CartItem(
            productId: UUID().uuidString,
            productName: name,
            unitPrice: price,
            quantity: qty,
            notes: notes,
            frostingId: nil, frostingName: nil,
            dryToppingId: nil, dryToppingName: nil,
            extraId: nil, extraName: nil,
            customModifiers: nil,
            seat: seat,
            course: course,
            sentToKitchen: sent,
            orderId: nil, itemId: nil,
            isBeverage: false,
            orderStatus: nil,
            deliveredToTable: false,
            variantName: variant,
            promotionId: nil, promotionName: nil,
            originalPrice: nil, promotionDiscount: nil,
            isGuest: false
        )
    }

    /// Envuelve el CartView con el ancho y fondo reales del POS.
    @MainActor
    static func stage(_ vm: POSViewModel) -> some View {
        CartView(vm: vm)
            .frame(width: 340)
            .frame(maxHeight: .infinity)
            .background(Color.black)
            .preferredColorScheme(.dark)
    }

    /// Categorías + productos de ejemplo, para que ProductGridView/CategorySidebarView
    /// tengan algo que mostrar en el preview.
    static func seedMenu(_ vm: POSViewModel) {
        vm.categories = [
            Category(id: "c1", name: "Entradas", description: nil, color: "#22C55E", icon: "leaf.fill", sortOrder: 0, active: true, isBeverage: false, subcategories: nil),
            Category(id: "c2", name: "Fuertes", description: nil, color: "#3B82F6", icon: "flame.fill", sortOrder: 1, active: true, isBeverage: false, subcategories: nil),
            Category(id: "c3", name: "Postres", description: nil, color: "#EC4899", icon: "birthday.cake.fill", sortOrder: 2, active: true, isBeverage: false, subcategories: nil),
            Category(id: "c4", name: "Bebidas", description: nil, color: "#F59E0B", icon: "cup.and.saucer.fill", sortOrder: 3, active: true, isBeverage: true, subcategories: nil)
        ]
        vm.selectedCategory = "c2"
        vm.products = [
            Product(id: "p1", name: "Ensalada César", description: "Lechuga, parmesano, aderezo de la casa", price: "180", platformPrice: nil, categoryId: "c1", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p2", name: "Ribeye 400g", description: "Corte premium a la parrilla", price: "620", platformPrice: nil, categoryId: "c2", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p3", name: "Burger Bruma", description: "Doble carne, queso, tocino", price: "210", platformPrice: nil, categoryId: "c2", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p4", name: "Alitas BBQ", description: "8 piezas, salsa BBQ o buffalo", price: "190", platformPrice: nil, categoryId: "c2", subcategoryId: nil, groupId: nil, hasVariants: true, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p5", name: "Pasta Alfredo", description: "Fettuccine, crema, parmesano", price: "220", platformPrice: nil, categoryId: "c2", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p6", name: "Molten Chocolate", description: "Centro líquido, helado de vainilla", price: "145", platformPrice: nil, categoryId: "c3", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p7", name: "Limonada", description: nil, price: "55", platformPrice: nil, categoryId: "c4", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil),
            Product(id: "p8", name: "Refresco", description: nil, price: "45", platformPrice: nil, categoryId: "c4", subcategoryId: nil, groupId: nil, hasVariants: false, variants: nil, active: true, category: nil, imageUrl: nil)
        ]
    }

    /// Réplica de MainPOSView (carrito + categorías + productos) para diseñar
    /// la pantalla completa sin backend.
    @MainActor
    static func fullScreen(_ vm: POSViewModel) -> some View {
        seedMenu(vm)
        return ZStack {
            Color.black.ignoresSafeArea()
            HStack(spacing: 12) {
                CartView(vm: vm)
                    .frame(width: 320)

                HStack(spacing: 12) {
                    CategorySidebarView(vm: vm)
                        .frame(width: 220)
                        .background(Color(uiColor: .systemGray6).opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    ProductGridView(vm: vm)
                        .frame(maxWidth: .infinity)
                        .background(Color(uiColor: .systemGray6).opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.trailing, 12)
                }
                .padding(.vertical, 12)
            }
        }
        .preferredColorScheme(.dark)
    }

    /// Réplica de MainPOSView en modo pago (carrito + PaymentView).
    @MainActor
    static func fullScreenPayment(_ vm: POSViewModel) -> some View {
        seedMenu(vm)
        vm.showingPayment = true
        return ZStack {
            Color.black.ignoresSafeArea()
            HStack(spacing: 12) {
                CartView(vm: vm)
                    .frame(width: 320)

                PaymentView(vm: vm)
                    .frame(maxWidth: .infinity)
                    .background(Color(uiColor: .systemGray6).opacity(0.4))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.trailing, 12)
                    .padding(.vertical, 12)
            }
        }
        .preferredColorScheme(.dark)
    }

    // 1) Pedido en mesa (dine-in): asientos + tiempos.
    @MainActor
    static func dineIn() -> POSViewModel {
        let vm = POSViewModel()
        vm.selectedTable = Table(
            id: "t5", number: "5", name: nil, capacity: 4,
            status: "occupied", active: true, activeOrder: nil,
            guestCount: 2, nextReservation: nil
        )
        vm.guestCount = 2
        vm.activeSeat = "A1"
        vm.activeCourse = 1
        vm.cart = [
            item("Ribeye 400g", 620, seat: "A1", course: 1, sent: true),
            item("Ensalada César", 180, seat: "A2", course: 1, sent: true),
            item("Papas al romero", 120, seat: "C", course: 1),
            item("Molten chocolate", 145, seat: "C", course: 2)
        ]
        return vm
    }

    // 2) Pedido para llevar (takeout): sin mesa, con nombre.
    @MainActor
    static func takeout() -> POSViewModel {
        let vm = POSViewModel()
        vm.selectedTable = nil
        vm.customerName = "Iñaki"
        vm.activeCourse = 1
        vm.cart = [
            item("Burger Bruma", 210, qty: 2),
            item("Orden de alitas", 190, variant: "BBQ"),
            item("Limonada", 55, qty: 2)
        ]
        return vm
    }

    // 3) Pedido web pagado (online / envío a domicilio): dirección + "Pagado".
    @MainActor
    static func webOrder() -> POSViewModel {
        let vm = POSViewModel()
        vm.selectedTable = nil
        vm.customerName = "María López"
        vm.currentOrderPhone = "5544332211"
        vm.currentOrderAddress = "Av. Panamericana Casa B14, Col. Pedregal de Carrasco, 04700, Coyoacán, CDMX"
        vm.currentOrderLat = "19.3081"
        vm.currentOrderLng = "-99.1799"
        vm.currentOrderPaymentStatus = "paid"
        vm.activeCourse = 1
        vm.cart = [
            item("Pizza Margherita", 240, sent: true),
            item("Pasta Alfredo", 220, sent: true),
            item("Tiramisú", 130, sent: true)
        ]
        return vm
    }
}

#Preview("Mesa (dine-in)") {
    CartPreview.stage(CartPreview.dineIn())
}

#Preview("Para llevar") {
    CartPreview.stage(CartPreview.takeout())
}

#Preview("Web (pagado)") {
    CartPreview.stage(CartPreview.webOrder())
}

// MARK: - Previews de pantalla completa (carrito + categorías + productos)

#Preview("Full · Mesa + Menú", traits: .landscapeLeft) {
    CartPreview.fullScreen(CartPreview.dineIn())
}

#Preview("Full · Para llevar + Menú", traits: .landscapeLeft) {
    CartPreview.fullScreen(CartPreview.takeout())
}

#Preview("Full · Web + Menú", traits: .landscapeLeft) {
    CartPreview.fullScreen(CartPreview.webOrder())
}

// MARK: - Previews de pasarela de pago (carrito + PaymentView)

#Preview("Pago · Mesa", traits: .landscapeLeft) {
    CartPreview.fullScreenPayment(CartPreview.dineIn())
}

#Preview("Pago · Para llevar", traits: .landscapeLeft) {
    CartPreview.fullScreenPayment(CartPreview.takeout())
}

#Preview("Pago · Web", traits: .landscapeLeft) {
    CartPreview.fullScreenPayment(CartPreview.webOrder())
}
