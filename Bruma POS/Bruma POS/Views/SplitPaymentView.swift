import SwiftUI

struct SplitPaymentView: View {
    @ObservedObject var vm: POSViewModel
    
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
        ZStack {
            VStack(spacing: 20) {
                // Header
                HStack {
                    Text("Pago Dividido")
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "payment"
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Regresar")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.glass)
                    .clipShape(Capsule())
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
            .modifier(GlassCard())
            
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
                        vm.showAddSplitPayment = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus.circle.fill")
                            Text("Agregar Pago")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.blue)
                }

                if isComplete {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-confirmation"
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Confirmar Pago")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.green)
                }
            }
            }
            .frame(maxWidth: 420)
            .padding(24)
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
                vm.editingSplitPayment = payment
            } label: {
                Image(systemName: "pencil.circle")
                    .font(.title3)
                    .foregroundColor(.blue)
            }
        }
        .padding(14)
        .modifier(GlassCard())
    }
}

// MARK: - Split Payment Modal

struct SplitPaymentModal: View {
    @ObservedObject var vm: POSViewModel
    let title: String
    var initialAmount: String = ""
    var initialTip: String = "0.00"
    var initialMethod: String = "cash"
    var initialTipMethod: String? = nil
    let maxAmount: Double
    var deleteAction: (() -> Void)? = nil
    let onDismiss: () -> Void
    let onConfirm: (SplitPayment) -> Void

    @State private var amount: String = ""
    @State private var tip: String = "0.00"
    @State private var paymentMethod: String = "cash"
    @State private var tipPaymentMethod: String? = nil
    @State private var showTip = false
    @State private var dragOffset: CGFloat = 0

    private var amountValue: Double {
        Double(amount.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    private var tipValue: Double {
        Double(tip.replacingOccurrences(of: ",", with: "")) ?? 0
    }
    private var isValid: Bool {
        amountValue > 0.005 && amountValue <= maxAmount + 0.01
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 0) {
                // Title
                Text(title)
                    .font(.title2.bold())
                    .foregroundColor(.white)
                    .padding(.bottom, 20)

                // Amount field
                VStack(alignment: .leading, spacing: 6) {
                    Text("Monto")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.white.opacity(0.5))
                    TextField("0.00", text: $amount)
                        .keyboardType(.decimalPad)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, 14)
                        .padding(.horizontal, 16)
                        .background(
                            Capsule().fill(Color.white.opacity(0.07))
                                .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                        )
                    Text("Máximo: \(vm.formatCurrency(maxAmount))")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.4))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(.bottom, 16)

                // Method buttons
                VStack(alignment: .leading, spacing: 8) {
                    Text("Método de pago")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.white.opacity(0.5))
                    methodPill("cash",                 "Efectivo",      "banknote.fill",         .green)
                    methodPill("terminal_mercadopago", "Terminal",      "creditcard.fill",       .blue)
                    methodPill("transfer",             "Transferencia", "building.columns.fill", .purple)
                }
                .padding(.bottom, 16)

                // Tip section
                VStack(alignment: .leading, spacing: 8) {
                    Button {
                        withAnimation(.spring(response: 0.3)) { showTip.toggle() }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: showTip ? "chevron.up.circle.fill" : "chevron.down.circle")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .frame(width: 28)
                            Text("Propina")
                                .font(.headline)
                                .foregroundStyle(.white)
                            Spacer()
                            if showTip && tipValue > 0 {
                                Text(vm.formatCurrency(tipValue))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(
                            Capsule().fill(Color.white.opacity(0.07))
                                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                        )
                    }
                    .buttonStyle(.plain)

                    if showTip {
                        TextField("0.00", text: $tip)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .padding(.vertical, 12)
                            .padding(.horizontal, 16)
                            .background(
                                Capsule().fill(Color.white.opacity(0.07))
                                    .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))

                        if paymentMethod != "cash" {
                            HStack(spacing: 8) {
                                tipMethodPill(paymentMethod, "Mismo método", .blue)
                                tipMethodPill("cash",        "Efectivo",     .green)
                            }
                            .transition(.opacity)
                        }
                    }
                }
                .padding(.bottom, 20)

                // Confirm button
                Button {
                    onConfirm(SplitPayment(
                        paymentMethod: paymentMethod,
                        amount: amountValue,
                        tip: showTip ? tipValue : 0,
                        tipPaymentMethod: showTip ? (tipPaymentMethod ?? paymentMethod) : nil,
                        sequenceNumber: vm.splitPayments.count + 1
                    ))
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text(deleteAction == nil ? "Agregar Pago" : "Actualizar Pago")
                            .font(.headline.weight(.semibold))
                    }
                    .foregroundStyle(isValid ? .white : .white.opacity(0.3))
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        Capsule().fill(isValid ? Color.blue : Color.white.opacity(0.06))
                            
                    )
                }
                .buttonStyle(.plain)
                .disabled(!isValid)

                if let del = deleteAction {
                    Button {
                        del()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "trash.fill")
                            Text("Eliminar Pago")
                                .font(.headline.weight(.semibold))
                        }
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(
                            Capsule().fill(Color.red.opacity(0.1))
                                .overlay(Capsule().stroke(Color.red.opacity(0.3), lineWidth: 1.5))
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                }

                // Cancel
                Button { onDismiss() } label: {
                    Text("Cancelar")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.5))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Capsule().fill(Color.white.opacity(0.05)))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: 400)
            .background(
                Group {
                    if #available(iOS 26.0, *) {
                        Color.clear.glassEffect(.regular.interactive(), in: .rect(cornerRadius: 24))
                    } else {
                        RoundedRectangle(cornerRadius: 24)
                            .fill(Color(white: 0.1))
                            .shadow(color: .black.opacity(0.5), radius: 24)
                    }
                }
            )
            .offset(y: max(0, dragOffset))
            .gesture(
                DragGesture()
                    .onChanged { v in
                        if v.translation.height > 0 { dragOffset = v.translation.height }
                    }
                    .onEnded { v in
                        if v.translation.height > 80 {
                            withAnimation(.easeOut(duration: 0.22)) { dragOffset = 600 }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { onDismiss() }
                        } else {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { dragOffset = 0 }
                        }
                    }
            )
            .onAppear {
                amount = initialAmount
                tip = initialTip
                paymentMethod = initialMethod
                tipPaymentMethod = initialTipMethod
                showTip = (Double(initialTip) ?? 0) > 0
            }
        }
    }

    private func methodPill(_ method: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        let selected = paymentMethod == method
        return Button { paymentMethod = method } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(selected ? color : color.opacity(0.5))
                    .frame(width: 28)
                Text(label)
                    .font(.headline)
                    .foregroundStyle(selected ? .white : .white.opacity(0.5))
                Spacer()
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(color)
                }
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                Capsule().fill(selected ? color.opacity(0.15) : Color.white.opacity(0.07))
                    .overlay(Capsule().stroke(selected ? color.opacity(0.4) : Color.white.opacity(0.1), lineWidth: selected ? 1.5 : 1))
            )
        }
        .buttonStyle(.plain)
    }

    private func tipMethodPill(_ method: String, _ label: String, _ color: Color) -> some View {
        let isSelected = tipPaymentMethod == method || (tipPaymentMethod == nil && method == paymentMethod)
        return Button { tipPaymentMethod = method } label: {
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(isSelected ? .white : .white.opacity(0.5))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    Capsule().fill(isSelected ? color.opacity(0.2) : Color.white.opacity(0.07))
                        .overlay(Capsule().stroke(isSelected ? color.opacity(0.45) : Color.white.opacity(0.1), lineWidth: isSelected ? 1.5 : 1))
                )
        }
        .buttonStyle(.plain)
    }
}
