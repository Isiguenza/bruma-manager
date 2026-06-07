import SwiftUI

struct CashRegisterView: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    
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
        .onTapGesture {
            vm.resetInactivityTimer()
        }
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
            VStack(spacing: 12) {
                ForEach(0..<3) { row in
                    HStack(spacing: 12) {
                        ForEach(1...3, id: \.self) { col in
                            let number = row * 3 + col
                            pinNumpadButton(String(number))
                        }
                    }
                }
                
                HStack(spacing: 12) {
                    pinNumpadButton("", systemImage: "xmark") {
                        pinInput = ""
                        vm.pinError = ""
                    }
                    pinNumpadButton("0")
                    pinNumpadButton("", systemImage: "delete.left") {
                        if !pinInput.isEmpty {
                            pinInput.removeLast()
                            vm.pinError = ""
                        }
                    }
                }
            }
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
    
    private func pinNumpadButton(_ text: String, systemImage: String? = nil, action: (() -> Void)? = nil) -> some View {
        Button {
            if let customAction = action {
                customAction()
            } else if pinInput.count < 4 {
                pinInput += text
                vm.pinError = ""
                
                if pinInput.count == 4 {
                    Task {
                        _ = await vm.verifyPin(pinInput)
                        pinInput = ""
                    }
                }
            }
        } label: {
            Group {
                if let image = systemImage {
                    Image(systemName: image)
                        .font(.title2)
                } else {
                    Text(text)
                        .font(.title.bold())
                }
            }
            .foregroundColor(.white)
            .frame(width: 80, height: 80)
            .background(Color(white: 0.15))
            .cornerRadius(40)
            .overlay(
                Circle()
                    .stroke(Color(white: 0.25), lineWidth: 1)
            )
        }
        .disabled(text.isEmpty && systemImage == nil)
        .opacity(text.isEmpty && systemImage == nil ? 0 : 1)
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
                .foregroundColor(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 16)
                .background(Color.blue)
                .cornerRadius(12)
            }
        }
        .padding(40)
        .sheet(isPresented: $vm.showOpenDialog) {
            OpenCashRegisterModal(vm: vm, posVM: posVM)
        }
    }
    
    private func openRegisterView(_ register: CashRegister) -> some View {
        ScrollView {
            VStack(spacing: 24) {

                // Header
                HStack {
                    Text("Caja Registradora")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)
                        Text("Abierta")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                
                // Payment method bars
                paymentMethodBars
                    .padding(.horizontal, 20)
                
                // Metrics Cards
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    metricCard(title: "Efectivo Inicial", value: vm.formatCurrency(register.initialCash), icon: "banknote.fill", accent: .green)
                    
                    metricCard(title: "Ventas Totales", value: vm.formatCurrency(vm.actualTotalSales), subtitle: "\(vm.paidOrders.count) órdenes", icon: "chart.line.uptrend.xyaxis", accent: .blue)
                    
                    metricCard(title: "Efectivo Esperado", value: vm.formatCurrency(vm.expectedCash), icon: "dollarsign.circle.fill", accent: .orange)
                    
                    metricCard(title: "Abierta desde", value: vm.formatDateTime(register.openedAt), subtitle: "Actualizado: \(vm.lastUpdated.map { formatTimeOnly($0) } ?? "N/A")", icon: "clock.fill", accent: .purple)
                }
                .padding(.horizontal, 20)
                
                // Action Buttons
                HStack(spacing: 12) {
                    actionButton(title: "Depósito", icon: "arrow.down.circle.fill", iconColor: .green) {
                        vm.showDepositDialog = true
                    }
                    
                    actionButton(title: "Sangría", icon: "arrow.up.circle.fill", iconColor: .orange) {
                        vm.showWithdrawDialog = true
                    }
                    
                    actionButton(title: "Contar", icon: "number.circle.fill", iconColor: .cyan) {
                        vm.showQuickCount = true
                    }
                    
                    actionButton(title: "Compartir", icon: "square.and.arrow.up.fill", iconColor: .indigo) {
                        shareSummary(register: register)
                    }
                    
                    actionButton(title: "Resumen", icon: "printer.fill", iconColor: .blue) {
                        Task {
                            await printSummary(register: register)
                        }
                    }
                    
                    actionButton(title: "Cerrar", icon: "lock.fill", iconColor: .red) {
                        vm.showCloseDialog = true
                    }
                }
                .padding(.horizontal, 20)
                
                // Movimientos (Transactions)
                transactionsSection
                    .padding(.horizontal, 20)
                
                // Orders Section with Filters
                ordersSection
                    .padding(.horizontal, 20)
                
                Spacer(minLength: 100)
            }
        }
        .refreshable {
            await vm.loadData()
        }
        .sheet(isPresented: $vm.showDepositDialog) {
            DepositModal(vm: vm, posVM: posVM, registerId: register.id)
        }
        .sheet(isPresented: $vm.showWithdrawDialog) {
            WithdrawModal(vm: vm, posVM: posVM, registerId: register.id)
        }
        .sheet(isPresented: $vm.showCloseDialog) {
            CloseCashRegisterModal(vm: vm, posVM: posVM, register: register)
        }
        .sheet(item: $vm.selectedOrder) { order in
            orderDetailSheet(order)
        }
        .sheet(isPresented: $vm.showQuickCount) {
            quickCashCountSheet(register: register)
        }
        .alert("Eliminar Orden", isPresented: $showDeleteConfirm) {
            TextField("Motivo de eliminación", text: $deleteReason)
            Button("Cancelar", role: .cancel) {
                orderToDelete = nil
                deleteReason = ""
            }
            Button("Eliminar", role: .destructive) {
                handleDeleteOrder()
            }
        } message: {
            if let order = orderToDelete {
                Text("¿Eliminar orden #\(order.orderNumber)? Esta acción no se puede deshacer.")
            }
        }
    }
    
    private func metricCard(title: String, value: String, subtitle: String? = nil, icon: String, accent: Color = .blue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(accent)
                Spacer()
            }
            
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
            
            Text(value)
                .font(.title2.bold())
                .foregroundColor(.white)
            
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
        .padding(16)
        .background(Color(white: 0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(white: 0.15), lineWidth: 1)
        )
    }
    
    private func actionButton(title: String, icon: String, iconColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(iconColor)
                Text(title)
                    .font(.caption.bold())
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(white: 0.08))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(white: 0.15), lineWidth: 1)
            )
        }
    }
    
    // MARK: - Payment Method Bars
    
    private var paymentMethodBars: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                paymentBar(label: "Efectivo", value: vm.actualCashSales, total: vm.actualTotalSales, color: .green)
                paymentBar(label: "Terminal", value: vm.actualTerminalSales, total: vm.actualTotalSales, color: .blue)
                paymentBar(label: "Transfer", value: vm.actualTransferSales, total: vm.actualTotalSales, color: .purple)
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
                Text("\(vm.transactions.count) movimientos")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            if vm.loadingTransactions {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else if vm.transactions.isEmpty {
                Text("No hay movimientos registrados")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
            } else {
                VStack(spacing: 6) {
                    ForEach(vm.transactions.prefix(5)) { tx in
                        transactionRow(tx)
                    }
                    if vm.transactions.count > 5 {
                        Text("+\(vm.transactions.count - 5) más")
                            .font(.caption2)
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 4)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(white: 0.06))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(white: 0.12), lineWidth: 1)
        )
    }
    
    private func transactionRow(_ tx: CashRegisterTransaction) -> some View {
        HStack {
            HStack(spacing: 6) {
                Image(systemName: tx.type == "deposit" ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                    .foregroundColor(tx.type == "deposit" ? .green : .orange)
                Text(tx.type == "deposit" ? "Depósito" : "Sangría")
                    .font(.subheadline)
                    .foregroundColor(.white)
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
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color(white: 0.08))
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color(white: 0.15), lineWidth: 1)
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
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(white: 0.08))
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(white: 0.15), lineWidth: 1)
                    )
                }
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
                    
                    if let method = order.paymentMethod {
                        Text(paymentMethodText(method))
                            .font(.caption2.bold())
                            .foregroundColor(.white.opacity(0.6))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(4)
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
                
                Button(role: .destructive) {
                    orderToDelete = order
                    showDeleteConfirm = true
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline)
                    .foregroundColor(.gray)
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.05))
                    .cornerRadius(8)
            }
        }
        .padding(12)
        .background(Color(white: 0.08))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(white: 0.12), lineWidth: 1)
        )
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
                        Text(paymentMethodText(order.paymentMethod ?? ""))
                            .font(.caption.bold())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.blue.opacity(0.2))
                            .cornerRadius(6)
                    }
                    
                    Divider()
                    
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
                            totalRow(label: "Propina", value: tip)
                        }
                        if let discount = order.discountAmount, Double(discount) ?? 0 > 0 {
                            totalRow(label: order.discountName ?? "Descuento", value: discount, isNegative: true)
                        }
                        totalRow(label: "Total", value: order.total ?? "0", isTotal: true)
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
    @State private var deleteReason = ""
    
    private func paymentMethodText(_ method: String) -> String {
        switch method {
        case "cash": return "Efectivo"
        case "card", "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return method
        }
    }
    
    // Delete order handler
    private func handleDeleteOrder() {
        guard let order = orderToDelete, !deleteReason.isEmpty else { return }
        Task {
            let success = await vm.deleteOrder(orderId: order.id, reason: deleteReason)
            if success {
                orderToDelete = nil
                deleteReason = ""
            }
        }
    }
    
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
    
    private func printSummary(register: CashRegister) async {
        // Calcular totales por método de pago
        let totalTips = vm.paidOrders.reduce(0.0) { sum, order in
            sum + (Double(order.tip ?? "0") ?? 0)
        }
        
        // Agrupar productos vendidos (incluyendo variantes)
        var productSales: [String: Int] = [:]
        for order in vm.paidOrders {
            if let items = order.items {
                for item in items {
                    let displayName = item.productName
                    productSales[displayName] = (productSales[displayName] ?? 0) + item.quantity
                }
            }
        }
        
        let productList = productSales.map { ["name": $0.key, "qty": $0.value] }
            .sorted { ($0["qty"] as? Int ?? 0) > ($1["qty"] as? Int ?? 0) }
        
        let summaryData: [String: Any] = [
            "date": ISO8601DateFormatter().string(from: Date()),
            "registerName": "Caja \(register.id.prefix(8))",
            "totalOrders": vm.paidOrders.count,
            "cashTotal": vm.actualCashSales,
            "cardTotal": vm.actualTerminalSales,
            "transferTotal": vm.actualTransferSales,
            "totalTips": totalTips,
            "grandTotal": vm.actualTotalSales,
            "products": productList
        ]
        
        guard let url = URL(string: "\(APIService.shared.printServerURL)/print-summary") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: summaryData)
        
        do {
            _ = try await URLSession.shared.data(for: request)
            vm.showToast("Resumen impreso")
        } catch {
            vm.showToast("Error imprimiendo resumen", isError: true)
        }
    }
}
