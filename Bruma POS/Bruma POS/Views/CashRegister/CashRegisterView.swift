import SwiftUI

struct CashRegisterView: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if vm.loading {
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
        .preferredColorScheme(.dark)
        .task {
            await vm.loadData()
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
                
                // Metrics Cards
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ], spacing: 12) {
                    metricCard(title: "Efectivo Inicial", value: vm.formatCurrency(register.initialCash), icon: "banknote.fill")
                    
                    metricCard(title: "Ventas Totales", value: vm.formatCurrency(vm.actualTotalSales), subtitle: "\(vm.paidOrders.count) órdenes", icon: "chart.line.uptrend.xyaxis")
                    
                    metricCard(title: "Efectivo Esperado", value: vm.formatCurrency(vm.expectedCash), icon: "dollarsign.circle.fill")
                    
                    metricCard(title: "Abierta desde", value: formatTime(register.openedAt), subtitle: formatDate(register.openedAt), icon: "clock.fill")
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
                
                // Orders Table
                if !vm.paidOrders.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Órdenes Pagadas")
                            .font(.headline.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                        
                        VStack(spacing: 8) {
                            ForEach(vm.paidOrders) { order in
                                orderRow(order)
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                
                Spacer(minLength: 100)
            }
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
    }
    
    private func metricCard(title: String, value: String, subtitle: String? = nil, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(.white)
                Spacer()
            }
            
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
            
            Text(value)
                .font(.title2.bold())
                .foregroundColor(.white)
            
            // Placeholder para mantener altura consistente
            Group {
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.gray)
                } else {
                    Text(" ")
                        .font(.caption2)
                        .foregroundColor(.clear)
                }
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
    
    private func orderRow(_ order: Order) -> some View {
        HStack(spacing: 12) {
            // Order info
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
            }
            
            Spacer()
            
            // Total
            Text(vm.formatCurrency(order.total ?? "0"))
                .font(.headline.bold())
                .foregroundColor(.white)
            
            // Actions
            Menu {
                Button {
                    Task { await reprintOrder(order) }
                } label: {
                    Label("Reimprimir", systemImage: "printer")
                }
                
                Button(role: .destructive) {
                    // TODO: Delete order
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
    }
    
    private func paymentMethodText(_ method: String) -> String {
        switch method {
        case "cash": return "Efectivo"
        case "card", "terminal_mercadopago": return "Terminal"
        case "transfer": return "Transferencia"
        default: return method
        }
    }
    
    private func reprintOrder(_ order: Order) async {
        let itemsBySeat: [String: [[String: Any]]] = ["A1": (order.items ?? []).map { item in
            [
                "name": item.productName,
                "qty": item.quantity,
                "total": Double(item.subtotal ?? "0") ?? 0
            ]
        }]
        
        let discountData: [String: Any]? = {
            if let discountAmt = order.discountAmount, let amt = Double(discountAmt), amt > 0 {
                return [
                    "name": order.discountName ?? "Descuento",
                    "amount": Int(amt)
                ]
            }
            return nil
        }()
        
        let printData: [String: Any] = [
            "customerName": order.customerName ?? "",
            "orderNumber": String(order.orderNumber),
            "items": itemsBySeat,
            "subtotal": Double(order.subtotal ?? "0") ?? 0,
            "tip": Double(order.tip ?? "0") ?? 0,
            "total": Double(order.total ?? "0") ?? 0,
            "tableNumber": order.tableNumber ?? "",
            "isDelivery": order.tableId == nil,
            "paymentMethod": order.paymentMethod ?? "",
            "discount": discountData as Any
        ]
        
        guard let url = URL(string: "\(APIService.shared.printServerURL)/print") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: printData)
        
        do {
            _ = try await URLSession.shared.data(for: request)
            vm.showToast("Ticket reimpreso")
        } catch {
            vm.showToast("Error al reimprimir", isError: true)
        }
    }
    
    private func formatTime(_ dateString: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        guard let date = isoFormatter.date(from: dateString) else {
            // Intentar sin fracciones de segundo
            isoFormatter.formatOptions = [.withInternetDateTime]
            guard let date = isoFormatter.date(from: dateString) else { return "N/A" }
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            formatter.locale = Locale(identifier: "es_MX")
            formatter.timeZone = TimeZone.current
            return formatter.string(from: date)
        }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.locale = Locale(identifier: "es_MX")
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }
    
    private func formatDate(_ dateString: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        guard let date = isoFormatter.date(from: dateString) else {
            // Intentar sin fracciones de segundo
            isoFormatter.formatOptions = [.withInternetDateTime]
            guard let date = isoFormatter.date(from: dateString) else { return "" }
            let formatter = DateFormatter()
            formatter.dateFormat = "dd MMM yyyy"
            formatter.locale = Locale(identifier: "es_MX")
            formatter.timeZone = TimeZone.current
            return formatter.string(from: date)
        }
        
        let formatter = DateFormatter()
        formatter.dateFormat = "dd MMM yyyy"
        formatter.locale = Locale(identifier: "es_MX")
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }
    
    private func printSummary(register: CashRegister) async {
        // Calcular totales por método de pago
        let totalTips = vm.paidOrders.reduce(0.0) { sum, order in
            sum + (Double(order.tip ?? "0") ?? 0)
        }
        
        // Agrupar productos vendidos
        var productSales: [String: Int] = [:]
        for order in vm.paidOrders {
            if let items = order.items {
                for item in items {
                    productSales[item.productName] = (productSales[item.productName] ?? 0) + item.quantity
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
