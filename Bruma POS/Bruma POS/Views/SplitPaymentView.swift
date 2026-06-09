import SwiftUI

struct SplitPaymentView: View {
    @ObservedObject var vm: POSViewModel
    @State private var showingAddPayment = false
    @State private var editingPayment: SplitPayment?
    
    private var remainingAmount: Double {
        let totalPaid = vm.splitPayments.reduce(0) { $0 + $1.amount }
        return max(0, vm.totalWithTip - totalPaid)
    }
    
    private var totalPaid: Double {
        vm.splitPayments.reduce(0) { $0 + $1.amount }
    }
    
    private var totalTip: Double {
        vm.splitPayments.reduce(0) { $0 + $1.tip }
    }
    
    private var isComplete: Bool {
        abs(totalPaid - vm.totalWithTip) < 0.01 && vm.splitPayments.count > 0
    }
    
    var body: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Text("Pago Dividido")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    vm.paymentStep = "summary"
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(10)
                }
            }
            
            // Total card
            VStack(spacing: 12) {
                HStack {
                    Text("Total a pagar")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.totalWithTip))
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                }
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Pagado")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(totalPaid))
                        .font(.headline)
                        .foregroundColor(.green)
                }
                
                HStack {
                    Text("Restante")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(remainingAmount))
                        .font(.headline)
                        .foregroundColor(remainingAmount > 0 ? .orange : .green)
                }
                
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 8)
                        
                        if vm.totalWithTip > 0 {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(isComplete ? Color.green : Color.blue)
                                .frame(width: geo.size.width * min(1, totalPaid / vm.totalWithTip), height: 8)
                        }
                    }
                }
                .frame(height: 8)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
            
            // Payments list
            if vm.splitPayments.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "creditcard.and.123")
                        .font(.system(size: 48))
                        .foregroundColor(.gray.opacity(0.5))
                    Text("Agrega pagos para dividir la cuenta")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(vm.splitPayments) { payment in
                            paymentRow(payment)
                        }
                    }
                }
            }
            
            Spacer()
            
            // Action buttons
            VStack(spacing: 12) {
                if remainingAmount > 0 {
                    Button {
                        showingAddPayment = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus.circle.fill")
                            Text("Agregar Pago")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.blue.opacity(0.2))
                        .foregroundColor(.blue)
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.blue.opacity(0.4), lineWidth: 1.5))
                    }
                }
                
                if isComplete {
                    Button {
                        Task {
                            vm.handlePaySplit()
                            try? await Task.sleep(nanoseconds: 1_500_000_000)
                            vm.paymentStep = "done"
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Confirmar Pago")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.green.opacity(0.2))
                        .foregroundColor(.green)
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.green.opacity(0.4), lineWidth: 1.5))
                    }
                    .disabled(vm.processing)
                }
            }
        }
        .frame(maxWidth: 420)
        .padding(24)
        .sheet(isPresented: $showingAddPayment) {
            AddSplitPaymentSheet(vm: vm, maxAmount: remainingAmount, onAdd: { payment in
                vm.splitPayments.append(payment)
            })
        }
        .sheet(item: $editingPayment) { payment in
            EditSplitPaymentSheet(vm: vm, payment: payment, maxAmount: remainingAmount + payment.amount, onUpdate: { updated in
                if let index = vm.splitPayments.firstIndex(where: { $0.id == payment.id }) {
                    vm.splitPayments[index] = updated
                }
            }, onDelete: {
                vm.splitPayments.removeAll { $0.id == payment.id }
            })
        }
    }
    
    private func paymentRow(_ payment: SplitPayment) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(payment.displayMethod)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                if payment.tip > 0 {
                    Text("Propina: \(vm.formatCurrency(payment.tip))")
                        .font(.caption)
                        .foregroundColor(.blue)
                    if let tipMethod = payment.displayTipMethod, tipMethod != payment.displayMethod {
                        Text("(en \(tipMethod))")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
            }
            
            Spacer()
            
            Text(vm.formatCurrency(payment.amount))
                .font(.headline)
                .foregroundColor(.white)
            
            Button {
                editingPayment = payment
            } label: {
                Image(systemName: "pencil.circle")
                    .font(.title3)
                    .foregroundColor(.blue)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
}

// MARK: - Add Split Payment Sheet

struct AddSplitPaymentSheet: View {
    @ObservedObject var vm: POSViewModel
    let maxAmount: Double
    let onAdd: (SplitPayment) -> Void
    @Environment(\.dismiss) var dismiss
    
    @State private var amount = ""
    @State private var tip = ""
    @State private var paymentMethod = "cash"
    @State private var tipPaymentMethod: String?
    @State private var showTipSelector = false
    
    private var amountValue: Double {
        Double(amount.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    
    private var tipValue: Double {
        Double(tip.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    
    private var isValid: Bool {
        amountValue > 0 && amountValue <= maxAmount + 0.01
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(white: 0.03).ignoresSafeArea()
                
                VStack(spacing: 20) {
                    // Amount
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Monto")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.gray)
                        TextField("0.00", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.title2.weight(.bold))
                            .foregroundColor(.white)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color.white.opacity(0.05))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                            )
                        Text("Máximo: \(vm.formatCurrency(maxAmount))")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    // Payment method
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Método de pago")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.gray)
                        HStack(spacing: 10) {
                            methodButton("cash", "Efectivo", "banknote.fill", .green)
                            methodButton("terminal_mercadopago", "Terminal", "creditcard.fill", .blue)
                            methodButton("transfer", "Transferencia", "building.columns.fill", .purple)
                        }
                    }
                    
                    // Tip
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle("Agregar propina", isOn: $showTipSelector)
                            .foregroundColor(.white)
                        
                        if showTipSelector {
                            TextField("0.00", text: $tip)
                                .keyboardType(.decimalPad)
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.white.opacity(0.05))
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1), lineWidth: 1))
                                )
                            
                            if paymentMethod != "cash" {
                                Text("Método de la propina")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                HStack(spacing: 10) {
                                    tipMethodButton(paymentMethod, "Mismo método", .blue)
                                    tipMethodButton("cash", "Efectivo", .green)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.white.opacity(0.05))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    )
                    
                    Spacer()
                    
                    Button {
                        let payment = SplitPayment(
                            paymentMethod: paymentMethod,
                            amount: amountValue,
                            tip: tipValue,
                            tipPaymentMethod: showTipSelector ? (tipPaymentMethod ?? paymentMethod) : nil,
                            sequenceNumber: vm.splitPayments.count + 1
                        )
                        onAdd(payment)
                        dismiss()
                    } label: {
                        Text("Agregar Pago")
                            .font(.headline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(isValid ? Color.blue.opacity(0.2) : Color.white.opacity(0.05))
                            .foregroundColor(isValid ? .blue : .gray)
                            .cornerRadius(14)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(isValid ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1.5))
                    }
                    .disabled(!isValid)
                }
                .padding(24)
            }
            .navigationTitle("Nuevo Pago")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancelar") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
    
    private func methodButton(_ method: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        Button {
            paymentMethod = method
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(paymentMethod == method ? color : color.opacity(0.6))
                Text(label)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(paymentMethod == method ? .white : .gray)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 70)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(paymentMethod == method ? color.opacity(0.15) : Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(paymentMethod == method ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
    
    private func tipMethodButton(_ method: String, _ label: String, _ color: Color) -> some View {
        Button {
            tipPaymentMethod = method
        } label: {
            Text(label)
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? color.opacity(0.15) : Color.white.opacity(0.05))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
                )
                .foregroundColor(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? .white : .gray)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Edit Split Payment Sheet

struct EditSplitPaymentSheet: View {
    @ObservedObject var vm: POSViewModel
    let payment: SplitPayment
    let maxAmount: Double
    let onUpdate: (SplitPayment) -> Void
    let onDelete: () -> Void
    @Environment(\.dismiss) var dismiss
    
    @State private var amount: String
    @State private var tip: String
    @State private var paymentMethod: String
    @State private var tipPaymentMethod: String?
    @State private var showTipSelector: Bool
    
    init(vm: POSViewModel, payment: SplitPayment, maxAmount: Double, onUpdate: @escaping (SplitPayment) -> Void, onDelete: @escaping () -> Void) {
        self.vm = vm
        self.payment = payment
        self.maxAmount = maxAmount
        self.onUpdate = onUpdate
        self.onDelete = onDelete
        _amount = State(initialValue: String(format: "%.2f", payment.amount))
        _tip = State(initialValue: String(format: "%.2f", payment.tip))
        _paymentMethod = State(initialValue: payment.paymentMethod)
        _tipPaymentMethod = State(initialValue: payment.tipPaymentMethod)
        _showTipSelector = State(initialValue: payment.tip > 0)
    }
    
    private var amountValue: Double {
        Double(amount.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    
    private var tipValue: Double {
        Double(tip.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    
    private var isValid: Bool {
        amountValue > 0 && amountValue <= maxAmount + 0.01
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(white: 0.03).ignoresSafeArea()
                
                VStack(spacing: 20) {
                    // Amount
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Monto")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.gray)
                        TextField("0.00", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.title2.weight(.bold))
                            .foregroundColor(.white)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color.white.opacity(0.05))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                            )
                        Text("Máximo: \(vm.formatCurrency(maxAmount))")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    // Payment method
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Método de pago")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.gray)
                        HStack(spacing: 10) {
                            methodButton("cash", "Efectivo", "banknote.fill", .green)
                            methodButton("terminal_mercadopago", "Terminal", "creditcard.fill", .blue)
                            methodButton("transfer", "Transferencia", "building.columns.fill", .purple)
                        }
                    }
                    
                    // Tip
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle("Agregar propina", isOn: $showTipSelector)
                            .foregroundColor(.white)
                        
                        if showTipSelector {
                            TextField("0.00", text: $tip)
                                .keyboardType(.decimalPad)
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.white.opacity(0.05))
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1), lineWidth: 1))
                                )
                            
                            if paymentMethod != "cash" {
                                Text("Método de la propina")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                HStack(spacing: 10) {
                                    tipMethodButton(paymentMethod, "Mismo método", .blue)
                                    tipMethodButton("cash", "Efectivo", .green)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.white.opacity(0.05))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    )
                    
                    Spacer()
                    
                    VStack(spacing: 12) {
                        Button {
                            var updated = payment
                            updated.amount = amountValue
                            updated.tip = tipValue
                            updated.paymentMethod = paymentMethod
                            updated.tipPaymentMethod = showTipSelector ? (tipPaymentMethod ?? paymentMethod) : nil
                            onUpdate(updated)
                            dismiss()
                        } label: {
                            Text("Actualizar Pago")
                                .font(.headline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 56)
                                .background(isValid ? Color.blue.opacity(0.2) : Color.white.opacity(0.05))
                                .foregroundColor(isValid ? .blue : .gray)
                                .cornerRadius(14)
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(isValid ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1.5))
                        }
                        .disabled(!isValid)
                        
                        Button {
                            onDelete()
                            dismiss()
                        } label: {
                            Text("Eliminar Pago")
                                .font(.headline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 56)
                                .background(Color.red.opacity(0.1))
                                .foregroundColor(.red)
                                .cornerRadius(14)
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.red.opacity(0.3), lineWidth: 1.5))
                        }
                    }
                }
                .padding(24)
            }
            .navigationTitle("Editar Pago")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancelar") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
    
    private func methodButton(_ method: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        Button {
            paymentMethod = method
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(paymentMethod == method ? color : color.opacity(0.6))
                Text(label)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(paymentMethod == method ? .white : .gray)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 70)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(paymentMethod == method ? color.opacity(0.15) : Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(paymentMethod == method ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
    
    private func tipMethodButton(_ method: String, _ label: String, _ color: Color) -> some View {
        Button {
            tipPaymentMethod = method
        } label: {
            Text(label)
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? color.opacity(0.15) : Color.white.opacity(0.05))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
                )
                .foregroundColor(tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod) ? .white : .gray)
        }
        .buttonStyle(.plain)
    }
}
