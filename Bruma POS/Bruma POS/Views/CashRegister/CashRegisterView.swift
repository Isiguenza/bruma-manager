import SwiftUI

struct CashRegisterView: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    // Reutiliza la lógica del Corte (backend) para alimentar los cards y barras
    // con los mismos números que muestra el botón "Corte". No se toca su lógica.
    @StateObject private var corteVM = CorteViewModel()

    @State private var showEditPayment = false

    /// Selector del header: Corte y Resumen ocupan la pantalla completa de la
    /// tab en vez de abrirse como sheet angosto.
    enum Section: String, CaseIterable {
        case caja = "Caja", corte = "Corte", resumen = "Resumen"
    }
    @State private var section: Section = .caja

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if !vm.isAuthenticated {
                pinAuthView
            } else if vm.loading {
                ProgressView("Cargando...")
                    .tint(.white)
                    .foregroundColor(.white)
            } else if let register = vm.register {
                openRegisterView(register)
            } else {
                closedRegisterView
            }
            
            // Toast
            if let toast = vm.toastMessage {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Image(systemName: vm.toastIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundColor(vm.toastIsError ? .red : .green)
                        Text(toast)
                            .foregroundColor(.white)
                    }
                    .padding()
                    .background(Color(white: 0.15))
                    .cornerRadius(10)
                    .padding(.bottom, 100)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // simultaneousGesture (no onTapGesture) para que también cuenten los
        // toques sobre botones y hojas inferiores, no solo sobre el fondo.
        .simultaneousGesture(TapGesture().onEnded { vm.resetInactivityTimer() })
        .preferredColorScheme(.dark)
    }
    
    // MARK: - Inline PIN Auth
    
    @State private var pinInput = ""
    
    private var pinAuthView: some View {
        VStack(spacing: 32) {
            VStack(spacing: 12) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 64))
                    .foregroundColor(.blue)
                
                Text("Acceso a Caja")
                    .font(.title.bold())
                    .foregroundColor(.white)
                
                Text("Ingresa tu código de administrador")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            
            // PIN dots
            HStack(spacing: 16) {
                ForEach(0..<4) { index in
                    Circle()
                        .fill(index < pinInput.count ? Color.blue : Color(white: 0.15))
                        .frame(width: 20, height: 20)
                        .overlay(
                            Circle()
                                .stroke(Color(white: 0.3), lineWidth: 1)
                        )
                }
            }
            
            if !vm.pinError.isEmpty {
                Text(vm.pinError)
                    .font(.subheadline)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }
            
            // Numpad
            PinNumpadView(
                onNumber: { digit in
                    guard pinInput.count < 4 else { return }
                    pinInput += digit
                    vm.pinError = ""
                    if pinInput.count == 4 {
                        Task {
                            _ = await vm.verifyPin(pinInput)
                            pinInput = ""
                        }
                    }
                },
                onClear: {
                    pinInput = ""
                    vm.pinError = ""
                },
                onBackspace: {
                    if !pinInput.isEmpty {
                        pinInput.removeLast()
                        vm.pinError = ""
                    }
                }
            )
            .padding(.horizontal, 40)
            
            Spacer()
        }
        .padding(.top, 80)
        .overlay {
            if vm.verifyingPin {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)
            }
        }
    }
    
    private var closedRegisterView: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.open.fill")
                .font(.system(size: 64))
                .foregroundColor(.gray)
            
            Text("No hay caja abierta")
                .font(.title.bold())
                .foregroundColor(.white)
            
            Text("Abre la caja para comenzar a registrar ventas")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
            
            Button {
                vm.showOpenDialog = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "lock.open.fill")
                    Text("Abrir Caja")
                        .font(.headline)
                }
                .padding(.horizontal, 32)
                .frame(height: 54)
            }
            .buttonStyle(.flatCapsule(.blue))
        }
        .padding(40)
        .sheet(isPresented: $vm.showOpenDialog) {
            OpenCashRegisterModal(vm: vm, posVM: posVM)
        }
    }
    
    private func openRegisterView(_ register: CashRegister) -> some View {
        VStack(spacing: 16) {

            // Header
            HStack(spacing: 12) {
                Text("Caja Registradora")
                    .font(.title.bold())
                    .foregroundColor(.white)

                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                    Text("Abierta")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 12)
                .frame(height: 30)
                .background(Capsule().fill(Color.white.opacity(0.1)))

                Spacer()

                Picker("Sección", selection: $section) {
                    ForEach(Section.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(width: 340)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            switch section {
            case .caja:
                cajaColumns(register)
            case .corte:
                CorteView(
                    vm: corteVM,
                    registerId: register.id,
                    employeeNames: Dictionary(posVM.employees.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first }),
                    printedBy: posVM.employeeName,
                    showToast: { message, isError in vm.showToast(message, isError: isError) },
                    onCloseRegister: { vm.showCloseDialog = true }
                )
            case .resumen:
                ResumenView(
                    vm: vm,
                    categoryByProduct: resumenCategories,
                    printedBy: posVM.employeeName
                )
            }
        }
        .task(id: register.id) {
            await corteVM.loadCorte(registerId: register.id)
        }
        .sheet(isPresented: $showReportes) {
            ReportesView(registerId: register.id)
        }
        .sheet(item: $vm.selectedOrder, onDismiss: { showEditPayment = false }) { order in
            orderDetailSheet(order)
        }
        .sheet(isPresented: $vm.showQuickCount) {
            quickCashCountSheet(register: register)
        }
        .fullScreenCover(isPresented: $vm.showCloseDialog) {
            CloseCashRegisterView(vm: vm, posVM: posVM, corteVM: corteVM, register: register)
        }
        // Hojas inferiores (mismo patrón que el cobro), ancladas a la tab.
        .bottomSheet(isPresented: vm.showDepositDialog, onDismiss: { vm.showDepositDialog = false }) {
            CashMovementSheet(kind: .deposit, isPresented: vm.showDepositDialog, vm: vm, registerId: register.id, userId: posVM.employeeId) {
                vm.showDepositDialog = false
            }
        }
        .bottomSheet(isPresented: vm.showWithdrawDialog, onDismiss: { vm.showWithdrawDialog = false }) {
            CashMovementSheet(kind: .withdrawal, isPresented: vm.showWithdrawDialog, vm: vm, registerId: register.id, userId: posVM.employeeId) {
                vm.showWithdrawDialog = false
            }
        }
        .bottomSheet(isPresented: showDeleteConfirm, onDismiss: closeRefundSheet) {
            RefundOrderSheet(
                order: orderToDelete,
                isPresented: showDeleteConfirm,
                formatCurrency: vm.formatCurrency,
                onConfirm: { reason, pin in
                    guard let order = orderToDelete else { return false }
                    let ok = await vm.refundOrder(orderId: order.id, reason: reason, pin: pin)
                    if ok {
                        closeRefundSheet()
                        await corteVM.loadCorte(registerId: register.id)
                    }
                    return ok
                },
                onDismiss: closeRefundSheet
            )
        }
        .bottomSheet(isPresented: showTipDialog, onDismiss: closeTipSheet) {
            AddTipSheet(
                order: orderForTip,
                isPresented: showTipDialog,
                methodName: paymentMethodText(orderForTip?.paymentMethod ?? "cash").lowercased(),
                formatCurrency: vm.formatCurrency,
                onSave: { tip in
                    guard let order = orderForTip else { return false }
                    let ok = await vm.addTip(orderId: order.id, tip: tip, tipPaymentMethod: order.paymentMethod ?? "cash")
                    if ok {
                        closeTipSheet()
                        await corteVM.loadCorte(registerId: register.id)
                    }
                    return ok
                },
                onDismiss: closeTipSheet
            )
        }
    }

    private func closeRefundSheet() {
        showDeleteConfirm = false
    }

    private func closeTipSheet() {
        showTipDialog = false
    }

    /// Vista "Caja": órdenes (izq, ancha) + ventas y acciones (der, angosta).
    private func cajaColumns(_ register: CashRegister) -> some View {
            HStack(alignment: .top, spacing: 12) {

                // Izquierda: barras por método de pago (arriba) + lista de órdenes
                ScrollView {
                    VStack(spacing: 16) {
                        paymentMethodBars
                        ordersSection
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(uiColor: .systemGray6).opacity(0.4))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
                .refreshable {
                    await vm.loadData()
                    await corteVM.loadCorte(registerId: register.id)
                }

                // Derecha: Ventas Netas (arriba) + acciones (abajo)
                ScrollView {
                    VStack(spacing: 16) {
                        Button {
                            section = .corte
                        } label: {
                            heroCard
                        }
                        .buttonStyle(.plain)
                        actionButtonsGrid
                        transactionsSection
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
                .frame(width: 380)
                .frame(maxHeight: .infinity)
                .background(Color(uiColor: .systemGray6).opacity(0.4))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }

    // Acciones de caja — grid de 3 columnas para el panel derecho.
    private var actionButtonsGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10)
        ], spacing: 10) {
            actionButton(title: "Cajón", subtitle: "Abrir cajón", icon: "lock.open.fill", iconColor: .cyan) {
                Task {
                    try? await APIService.shared.openCashDrawer()
                }
            }

            actionButton(title: "Depósito", subtitle: "Ingresar efectivo", icon: "arrow.down.circle.fill", iconColor: .green) {
                vm.showDepositDialog = true
            }

            actionButton(title: "Sangría", subtitle: "Retirar efectivo", icon: "arrow.up.circle.fill", iconColor: .orange) {
                vm.showWithdrawDialog = true
            }

            actionButton(title: "Reportes", subtitle: "Empleado/producto/hora", icon: "chart.bar.fill", iconColor: .purple) {
                showReportes = true
            }

            // No abre el cierre directo: lleva al Corte, que es donde se cierra,
            // para que nadie cierre sin haber revisado el corte.
            actionButton(title: "Cerrar", subtitle: "Revisar y cerrar", icon: "lock.fill", iconColor: .red) {
                section = .corte
            }
        }
    }

    private func actionButton(title: String, subtitle: String, icon: String, iconColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(iconColor.opacity(0.18))
                        .frame(width: 40, height: 40)
                    Image(systemName: icon)
                        .font(.headline)
                        .foregroundColor(iconColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .modifier(FlatCard())
        }
        .buttonStyle(.plain)
    }
    
    /// productId → categoría (nombre y orden del menú) para el resumen impreso.
    private var resumenCategories: [String: (name: String, sort: Int)] {
        let categories = Dictionary(posVM.categories.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var result: [String: (name: String, sort: Int)] = [:]
        for product in posVM.products {
            guard let categoryId = product.categoryId, let category = categories[categoryId] else { continue }
            result[product.id] = (category.name, category.sortOrder)
        }
        return result
    }

    // MARK: - Hero (Ventas Netas del Corte)

    private var heroCard: some View {
        let data = corteVM.corteData
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("VENTAS NETAS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white.opacity(0.6))
                    .tracking(1)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white.opacity(0.35))
            }
            Text(data == nil ? "…" : corteVM.formatCurrency(corteVM.totalNetSales))
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .contentTransition(.numericText())
            if let data {
                Text("Bruto \(corteVM.formatCurrency(data.sales.total)) · \(data.summary.totalOrders) órdenes")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.55))
            } else {
                Text("Cargando corte…")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            LinearGradient(colors: [Color.green.opacity(0.22), Color(white: 0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.green.opacity(0.25), lineWidth: 1))
    }

    // MARK: - Payment Method Bars

    private var paymentMethodBars: some View {
        let data = corteVM.corteData
        // Directo del Corte: ventas + propinas por método (efectivo, tarjeta, transfer).
        let cash = data.map { $0.sales.cash + $0.tips.cash } ?? (vm.actualCashSales + vm.actualCashTips)
        let card = data.map { $0.sales.card + $0.tips.card } ?? vm.actualTerminalSales
        let transfer = data.map { $0.sales.transfer + $0.tips.transfer } ?? vm.actualTransferSales
        let total = max(cash + card + transfer, 0.01)
        return VStack(spacing: 8) {
            HStack(spacing: 12) {
                paymentBar(label: "Efectivo", value: cash, total: total, color: .green)
                paymentBar(label: "Tarjeta", value: card, total: total, color: .blue)
                paymentBar(label: "Transfer", value: transfer, total: total, color: .purple)
            }
        }
    }
    
    private func paymentBar(label: String, value: Double, total: Double, color: Color) -> some View {
        let pct = total > 0 ? value / total : 0
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.caption2.bold())
                    .foregroundColor(color)
                Spacer()
                Text(vm.formatCurrency(value))
                    .font(.caption2.bold())
                    .foregroundColor(.white)
            }
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(white: 0.15))
                    .overlay(
                        HStack {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(color)
                                .frame(width: geo.size.width * CGFloat(pct))
                            Spacer()
                        }
                    )
            }
            .frame(height: 6)
        }
    }
    
    // MARK: - Transactions Section
    
    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Movimientos")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                Spacer()
                Text("\(vm.cashMovements.count) movimientos")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            if vm.loadingTransactions {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else if vm.cashMovements.isEmpty {
                Text("No hay movimientos registrados")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
            } else {
                VStack(spacing: 6) {
                    ForEach(vm.cashMovements.prefix(5)) { tx in
                        transactionRow(tx)
                    }
                    if vm.cashMovements.count > 5 {
                        Text("+\(vm.cashMovements.count - 5) más")
                            .font(.caption2)
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 4)
                    }
                }
            }
        }
        .padding(16)
        .modifier(FlatCard())
    }

    private func transactionRow(_ tx: CashRegisterTransaction) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: tx.type == "deposit" ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                        .foregroundColor(tx.type == "deposit" ? .green : .orange)
                    Text(tx.type == "deposit" ? "Depósito" : "Sangría")
                        .font(.subheadline)
                        .foregroundColor(.white)
                }
                if let desc = tx.description, !desc.isEmpty {
                    Text(desc)
                        .font(.caption2)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 2) {
                Text(vm.formatCurrency(tx.amount))
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Text(vm.formatDateTime(tx.createdAt))
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 6)
    }
    
    // MARK: - Orders Section with Filters
    
    private var ordersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with count
            HStack {
                Text("Órdenes Pagadas")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                Spacer()
                Text("\(vm.filteredOrders.count) de \(vm.paidOrders.count)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            // Search + Filter
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Buscar orden...", text: $vm.orderSearchQuery)
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 14)
                .frame(height: 42)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )

                Menu {
                    ForEach(PaymentMethodFilter.allCases, id: \.self) { filter in
                        Button {
                            vm.paymentFilter = filter
                        } label: {
                            HStack {
                                Text(filter.rawValue)
                                if vm.paymentFilter == filter {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(vm.paymentFilter.rawValue)
                            .font(.caption.bold())
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 14)
                    .frame(height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
            
            if vm.loadingOrders {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else if vm.filteredOrders.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.gray)
                    Text("No hay órdenes")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            } else {
                // Grouped by payment method
                VStack(spacing: 16) {
                    ForEach(vm.ordersByPaymentMethod, id: \.method) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Circle()
                                    .fill(group.color)
                                    .frame(width: 8, height: 8)
                                Text(group.label)
                                    .font(.caption.bold())
                                    .foregroundColor(group.color)
                                Spacer()
                                Text(vm.formatCurrency(group.orders.reduce(0) { $0 + (Double($1.total ?? "0") ?? 0) }))
                                    .font(.caption.bold())
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 4)
                            
                            VStack(spacing: 6) {
                                ForEach(group.orders) { order in
                                    orderRow(order)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Order Row
    
    private func orderRow(_ order: Order) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("#\(order.orderNumber)")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    if order.isSplitPayment {
                        Text("Dividida")
                            .font(.caption2.bold())
                            .foregroundColor(.orange)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.orange.opacity(0.15)))
                    } else if let method = order.paymentMethod {
                        Text(paymentMethodText(method))
                            .font(.caption2.bold())
                            .foregroundColor(.white.opacity(0.6))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.white.opacity(0.1)))
                    }
                }
                
                Text(order.tableId != nil ? "Mesa \(order.tableNumber ?? "")" : "Para Llevar")
                    .font(.caption)
                    .foregroundColor(.gray)
                
                if let createdAt = order.createdAt {
                    Text(formatOrderTime(createdAt))
                        .font(.caption2)
                        .foregroundColor(.gray.opacity(0.7))
                }
            }
            
            Spacer()
            
            Text(vm.formatCurrency(order.total ?? "0"))
                .font(.headline.bold())
                .foregroundColor(.white)
            
            Menu {
                Button {
                    Task { await PrintService.shared.reprintOrder(order) }
                } label: {
                    Label("Reimprimir", systemImage: "printer")
                }

                Button {
                    orderForTip = order
                    showTipDialog = true
                } label: {
                    Label("Editar propina", systemImage: "heart.fill")
                }

                Button(role: .destructive) {
                    orderToDelete = order
                    showDeleteConfirm = true
                } label: {
                    Label("Reembolsar", systemImage: "arrow.uturn.backward")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline)
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.flatCircleNeutral)
        }
        .padding(12)
        .modifier(FlatCard())
        .contentShape(Rectangle())
        .onTapGesture {
            vm.selectedOrder = order
        }
    }
    
    // MARK: - Order Detail Sheet
    
    private func orderDetailSheet(_ order: Order) -> some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Orden #\(order.orderNumber)")
                                .font(.title2.bold())
                            Text(order.tableId != nil ? "Mesa \(order.tableNumber ?? "")" : "Para Llevar")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        if order.isSplitPayment {
                            Text("Dividida")
                                .font(.caption.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .foregroundColor(.orange)
                                .background(Capsule().fill(Color.orange.opacity(0.2)))
                        } else {
                            Text(paymentMethodText(order.paymentMethod ?? ""))
                                .font(.caption.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(Color.blue.opacity(0.2)))
                        }
                    }
                    
                    Divider()
                    
                    // Payment methods detail (for split payments)
                    if order.isSplitPayment, let payments = order.payments, !payments.isEmpty {
                        Text("Pagos")
                            .font(.headline)
                        
                        VStack(spacing: 8) {
                            ForEach(payments) { payment in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("#\(payment.sequenceNumber) \(payment.displayMethod)")
                                            .font(.subheadline.bold())
                                        if let tip = payment.tip, let tipValue = Double(tip), tipValue > 0 {
                                            let tipMethodText = paymentMethodText(payment.tipPaymentMethod ?? payment.paymentMethod)
                                            Text("Propina \(tipMethodText): \(vm.formatCurrency(tip))")
                                                .font(.caption2)
                                                .foregroundColor(.gray)
                                        }
                                    }
                                    Spacer()
                                    let paymentTotal = (Double(payment.amount) ?? 0) + (Double(payment.tip ?? "0") ?? 0)
                                    Text(vm.formatCurrency(String(paymentTotal)))
                                        .font(.subheadline)
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        
                        Divider()
                    }
                    
                    // Items
                    Text("Productos")
                        .font(.headline)
                    
                    if let items = order.items, !items.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(items, id: \.id) { item in
                                HStack {
                                    Text("\(item.quantity)x \(item.productName)")
                                        .font(.subheadline)
                                    Spacer()
                                    Text(vm.formatCurrency(item.subtotal ?? "0"))
                                        .font(.subheadline)
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                    } else {
                        Text("Sin productos")
                            .foregroundColor(.gray)
                    }
                    
                    Divider()
                    
                    // Totals
                    VStack(spacing: 8) {
                        totalRow(label: "Subtotal", value: order.subtotal ?? "0")
                        if let tip = order.tip, Double(tip) ?? 0 > 0 {
                            let tipLabel = (order.tipPaymentMethod == "cash" && order.paymentMethod != "cash")
                                ? "Propina (en efectivo)" : "Propina"
                            totalRow(label: tipLabel, value: tip)
                        }
                        if let discount = order.discountAmount, Double(discount) ?? 0 > 0 {
                            totalRow(label: order.discountName ?? "Descuento", value: discount, isNegative: true)
                        }
                        totalRow(label: "Total", value: order.total ?? "0", isTotal: true)
                    }

                    if EditOrderPaymentSheet.isEditable(order) {
                        Button {
                            showEditPayment = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "pencil")
                                Text("Editar método de pago y propina")
                                    .font(.subheadline.bold())
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Capsule().fill(Color.orange.opacity(0.9)))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 8)
                    }
                }
                .padding()
            }
            }
            .navigationTitle("Detalle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") {
                        vm.selectedOrder = nil
                    }
                }
            }
            .sheet(isPresented: $showEditPayment) {
                EditOrderPaymentSheet(vm: vm, order: order, onSaved: {
                    showEditPayment = false
                    vm.selectedOrder = nil
                })
            }
        }
        .preferredColorScheme(.dark)
    }
    
    private func totalRow(label: String, value: String, isNegative: Bool = false, isTotal: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(isTotal ? .headline.bold() : .subheadline)
            Spacer()
            Text((isNegative ? "-" : "") + vm.formatCurrency(value))
                .font(isTotal ? .headline.bold() : .subheadline)
                .foregroundColor(isNegative ? .red : (isTotal ? .white : .gray))
        }
    }
    
    // MARK: - Quick Cash Count Sheet
    
    private func quickCashCountSheet(register: CashRegister) -> some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Efectivo Esperado")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Text(vm.formatCurrency(vm.expectedCash))
                        .font(.title.bold())
                }
                
                HStack {
                    Text("Contado")
                        .font(.headline)
                    Spacer()
                    TextField("$0.00", text: $vm.quickCashInput)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .font(.title2.bold())
                        .frame(width: 160)
                        .padding(8)
                        .background(Color(white: 0.1))
                        .cornerRadius(8)
                }
                .padding(.horizontal, 20)
                
                if !vm.quickCashInput.isEmpty {
                    let diff = vm.quickCashDifference
                    HStack {
                        Text("Diferencia")
                            .font(.headline)
                        Spacer()
                        Text(vm.formatCurrency(abs(diff)))
                            .font(.title2.bold())
                            .foregroundColor(diff >= 0 ? Color.accentColor : .red)
                    }
                    .padding(.horizontal, 20)
                    
                    Text(diff >= 0 ? "Sobra \(vm.formatCurrency(diff))" : "Faltan \(vm.formatCurrency(abs(diff)))")
                        .font(.subheadline)
                        .foregroundColor(diff >= 0 ? Color.accentColor : .red)
                }
                
                Spacer()
            }
            .padding(.top, 40)
            }
            .navigationTitle("Conteo Rápido")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") {
                        vm.showQuickCount = false
                        vm.quickCashInput = ""
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
    
    // MARK: - Share Summary
    
    private func shareSummary(register: CashRegister) {
        let totalTips = vm.paidOrders.reduce(0.0) { sum, order in
            sum + (Double(order.tip ?? "0") ?? 0)
        }
        
        var productSales: [String: Int] = [:]
        for order in vm.paidOrders {
            if let items = order.items {
                for item in items {
                    productSales[item.productName] = (productSales[item.productName] ?? 0) + item.quantity
                }
            }
        }
        
        let productLines = productSales
            .sorted { $0.value > $1.value }
            .map { "  \($0.value)x \($0.key)" }
            .joined(separator: "\n")
        
        let text = """
        Resumen de Caja - \(register.id.prefix(8).uppercased())
        \(Date().formatted(date: .abbreviated, time: .shortened))
        
        Ventas Totales: \(vm.formatCurrency(vm.actualTotalSales))
        Efectivo: \(vm.formatCurrency(vm.actualCashSales))
        Terminal: \(vm.formatCurrency(vm.actualTerminalSales))
        Transferencia: \(vm.formatCurrency(vm.actualTransferSales))
        Propinas: \(vm.formatCurrency(totalTips))
        
        Productos vendidos:
        \(productLines.isEmpty ? "N/A" : productLines)
        
        Órdenes: \(vm.paidOrders.count)
        """
        
        let activityVC = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = rootVC.view
                popover.sourceRect = CGRect(x: rootVC.view.bounds.midX, y: rootVC.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            rootVC.present(activityVC, animated: true)
        }
    }
    
    // Delete order state
    @State private var orderToDelete: Order?
    @State private var showDeleteConfirm = false

    // Editar propina de orden pagada
    @State private var orderForTip: Order?
    @State private var showTipDialog = false

    // Desglose de ventas (sheet al tocar el hero)

    // Reportes (empleado/producto/hora)
    @State private var showReportes = false
    
    private func paymentMethodText(_ method: String) -> String {
        switch method {
        case "cash": return "Efectivo"
        case "card", "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return method
        }
    }
    
    // Delete order handler
    private func formatTimeOnly(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
    
    private func formatOrderTime(_ dateString: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = isoFormatter.date(from: dateString) else {
            isoFormatter.formatOptions = [.withInternetDateTime]
            guard let date = isoFormatter.date(from: dateString) else { return "" }
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            formatter.locale = Locale(identifier: "es_MX")
            return formatter.string(from: date)
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date)
    }
    
}
