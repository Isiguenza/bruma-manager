import SwiftUI

struct OrdersHistoryModal: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var showDeleteConfirm = false
    @State private var orderToDelete: Order?
    @State private var deleteReason = ""
    @State private var deletePin = ""
    @State private var deleting = false
    @State private var reprintingOrderId: String?

    @State private var orderToEdit: Order?

    private func isEditable(_ order: Order) -> Bool {
        !order.isSplitPayment
            && order.source != "web"
            && order.paymentMethod != "online"
            && order.paymentMethod != "platform_delivery"
    }
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Historial de Órdenes")
                            .font(.title.bold())
                            .foregroundColor(.white)
                        
                        Text("\(vm.paidOrders.count) órdenes pagadas")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    
                    Spacer()
                    
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline)
                            .foregroundColor(.gray)
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                }
                .padding(20)
                
                Rectangle()
                    .fill(Color.white.opacity(0.1))
                    .frame(height: 1)
                
                // Orders List
                if vm.loadingOrders {
                    Spacer()
                    ProgressView()
                        .tint(.white)
                    Spacer()
                } else if vm.paidOrders.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "tray.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("No hay órdenes registradas")
                            .font(.headline)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(vm.paidOrders) { order in
                                orderCard(order)
                            }
                        }
                        .padding(20)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .alert("Reembolsar Orden", isPresented: $showDeleteConfirm) {
            TextField("Motivo", text: $deleteReason)
            SecureField("PIN de gerente", text: $deletePin)
            Button("Cancelar", role: .cancel) {
                orderToDelete = nil
                deleteReason = ""
                deletePin = ""
            }
            Button("Reembolsar", role: .destructive) {
                handleDeleteOrder()
            }
        } message: {
            if let order = orderToDelete {
                Text("¿Reembolsar y anular la orden #\(order.orderNumber)? Requiere PIN de gerente. Queda registrada para auditoría.")
            }
        }
        .sheet(item: $orderToEdit) { order in
            EditOrderPaymentSheet(vm: vm, order: order)
        }
    }
    
    private func orderCard(_ order: Order) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text("#\(order.orderNumber)")
                            .font(.headline.bold())
                            .foregroundColor(.white)
                        
                        if order.isSplitPayment {
                            Text("Dividida")
                                .font(.caption2.bold())
                                .foregroundColor(.orange)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.orange.opacity(0.15))
                                .cornerRadius(6)
                        } else {
                            paymentMethodBadge(order.paymentMethod)
                        }
                    }
                    
                    Text(order.tableId != nil ? "Mesa \(order.tableNumber ?? "")" : "Para Llevar")
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    if let customerName = order.customerName, !customerName.isEmpty {
                        Text(customerName)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    Text(formatDate(order.createdAt ?? ""))
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text(vm.formatCurrency(order.total ?? "0"))
                        .font(.title3.bold())
                        .foregroundColor(.white)
                    
                    if let tip = order.tip, let tipValue = Double(tip), tipValue > 0 {
                        let tipLabel = (order.tipPaymentMethod == "cash" && order.paymentMethod != "cash")
                            ? "Propina (efectivo): \(vm.formatCurrency(tip))"
                            : "Propina: \(vm.formatCurrency(tip))"
                        Text(tipLabel)
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                }
            }
            
            // Action Buttons
            HStack(spacing: 8) {
                Button {
                    reprintOrder(order)
                } label: {
                    HStack(spacing: 4) {
                        if reprintingOrderId == order.id {
                            ProgressView()
                                .scaleEffect(0.7)
                                .tint(.white)
                        } else {
                            Image(systemName: "printer.fill")
                                .font(.caption)
                        }
                        Text("Reimprimir")
                            .font(.caption.bold())
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.blue.opacity(0.2))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.blue, lineWidth: 1)
                    )
                }
                .disabled(reprintingOrderId == order.id)

                if isEditable(order) {
                    Button {
                        orderToEdit = order
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "pencil")
                                .font(.caption)
                            Text("Editar pago")
                                .font(.caption.bold())
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.orange.opacity(0.2))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.orange, lineWidth: 1)
                        )
                    }
                }

                Button {
                    orderToDelete = order
                    showDeleteConfirm = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "trash.fill")
                            .font(.caption)
                        Text("Eliminar")
                            .font(.caption.bold())
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.2))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.red, lineWidth: 1)
                    )
                }
            }
        }
        .padding(16)
        .background(Color(white: 0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(white: 0.15), lineWidth: 1)
        )
    }
    
    private func paymentMethodBadge(_ method: String?) -> some View {
        let text: String
        let color: Color
        
        switch method {
        case "cash":
            text = "Efectivo"
            color = .green
        case "card", "terminal_mercadopago":
            text = "Terminal"
            color = .blue
        case "transfer":
            text = "Transferencia"
            color = .purple
        case "online":
            text = "Online"
            color = .teal
        default:
            text = method ?? "N/A"
            color = .gray
        }
        
        return Text(text)
            .font(.caption2.bold())
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.3))
            .cornerRadius(6)
    }
    
    private func formatDate(_ dateString: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: dateString) else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date)
    }
    
    private func reprintOrder(_ order: Order) {
        reprintingOrderId = order.id
        Task {
            await PrintService.shared.reprintOrder(order)
            reprintingOrderId = nil
        }
    }
    
    private func handleDeleteOrder() {
        guard let order = orderToDelete, !deleteReason.isEmpty, deletePin.count == 4 else { return }

        deleting = true
        Task {
            let success = await vm.refundOrder(orderId: order.id, reason: deleteReason, pin: deletePin)
            deleting = false
            if success {
                orderToDelete = nil
                deleteReason = ""
                deletePin = ""
            }
        }
    }
}

// MARK: - Editar datos de pago de una orden pagada

private struct EditOrderPaymentSheet: View {
    @ObservedObject var vm: CashRegisterViewModel
    let order: Order
    @Environment(\.dismiss) private var dismiss

    private let methods: [(String, String)] = [
        ("cash", "Efectivo"),
        ("terminal_mercadopago", "Terminal"),
        ("card", "Tarjeta"),
        ("transfer", "Transferencia"),
    ]

    @State private var paymentMethod = "cash"
    @State private var tipText = "0"
    @State private var tipMethod = "cash"
    @State private var saving = false

    private var subtotal: Double { Double(order.subtotal ?? "0") ?? 0 }
    private var tipValue: Double { Double(tipText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var newTotal: Double { subtotal + max(0, tipValue) }

    var body: some View {
        NavigationView {
            Form {
                Section {
                    LabeledContent("Subtotal", value: vm.formatCurrency(String(subtotal)))
                    LabeledContent("Total nuevo") {
                        Text(vm.formatCurrency(String(newTotal))).bold()
                    }
                }

                Section("Método de pago") {
                    Picker("Método de pago", selection: $paymentMethod) {
                        ForEach(methods, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Propina") {
                    TextField("Monto", text: $tipText)
                        .keyboardType(.decimalPad)
                    if tipValue > 0 {
                        Picker("Método de la propina", selection: $tipMethod) {
                            ForEach(methods, id: \.0) { Text($0.1).tag($0.0) }
                        }
                    }
                }
            }
            .navigationTitle("Editar pago · #\(order.orderNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") { save() }
                        .disabled(saving || tipValue < 0)
                }
            }
            .onAppear {
                paymentMethod = order.paymentMethod ?? "cash"
                tipText = String(Double(order.tip ?? "0") ?? 0)
                tipMethod = order.tipPaymentMethod ?? order.paymentMethod ?? "cash"
            }
        }
    }

    private func save() {
        saving = true
        Task {
            let ok = await vm.updateOrderPaymentDetails(
                orderId: order.id,
                paymentMethod: paymentMethod,
                tip: max(0, tipValue),
                tipPaymentMethod: tipValue > 0 ? tipMethod : paymentMethod
            )
            saving = false
            if ok { dismiss() }
        }
    }
}
