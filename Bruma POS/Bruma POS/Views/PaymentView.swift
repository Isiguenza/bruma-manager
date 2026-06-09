import SwiftUI

struct PaymentView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            Color(white: 0.03).ignoresSafeArea()
            
            switch vm.paymentStep {
            case "summary":
                paymentSummary
            case "payment":
                paymentMethodSelection
            case "confirmation":
                paymentConfirmation
            case "done":
                paymentDone
            case "split-payment":
                SplitPaymentView(vm: vm)
            case "split-assign":
                SplitAssignView(vm: vm)
            case "split-overview":
                SplitOverviewView(vm: vm)
            case "split-pay-person":
                SplitPayPersonView(vm: vm)
            default:
                paymentSummary
            }
        }
    }
    
    // MARK: - Summary
    
    private var paymentSummary: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Text("Cobrar")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    vm.resetPaymentState()
                    vm.showingPayment = false
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Volver")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(10)
                }
            }
            
            // Discount selector
            if !vm.availableDiscounts.isEmpty {
                discountSelector
            }
            
            // Totals card (clean style)
            VStack(spacing: 12) {
                HStack {
                    Text("Subtotal")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.cartSubtotalBeforeDiscounts))
                        .font(.headline)
                        .foregroundColor(.white)
                }
                
                if vm.selectedDiscount != nil {
                    HStack {
                        Text(vm.selectedDiscount?.name ?? "Descuento")
                            .font(.subheadline)
                            .foregroundColor(.yellow)
                        Spacer()
                        Text("-\(vm.formatCurrency(vm.flexibleDiscountAmount))")
                            .font(.headline)
                            .foregroundColor(.yellow)
                    }
                    
                    Divider().background(Color.white.opacity(0.1))
                    
                    HStack {
                        Text("Total")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                        Spacer()
                        Text(vm.formatCurrency(vm.cartTotalWithDiscount))
                            .font(.title3.weight(.bold))
                            .foregroundColor(.green)
                    }
                } else {
                    Divider().background(Color.white.opacity(0.1))
                    
                    HStack {
                        Text("Total")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                        Spacer()
                        Text(vm.formatCurrency(vm.cartTotal))
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)
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
            
            // Action buttons
            VStack(spacing: 12) {
                // Cobrar Todo
                Button {
                    vm.paymentStep = "payment"
                    vm.paymentMethod = nil
                    vm.cashReceived = ""
                    vm.splitPayments = []
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.fill")
                        Text("Cobrar Todo")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Color.green.opacity(0.2))
                    .foregroundColor(.green)
                    .cornerRadius(14)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.green.opacity(0.4), lineWidth: 1.5))
                }
                
                // Pago Dividido (multiple methods)
                Button {
                    vm.paymentStep = "split-payment"
                    vm.splitPayments = []
                    vm.paymentMethod = nil
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.and.123")
                        Text("Pago Dividido")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Color.purple.opacity(0.15))
                    .foregroundColor(.purple)
                    .cornerRadius(14)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.purple.opacity(0.3), lineWidth: 1))
                }
                
                // Dividir Cuenta
                if vm.guestCount > 1 {
                    Button {
                        if vm.itemAssignments.isEmpty {
                            var assignments: [Int: [Int]] = [:]
                            var payments: [Int: IndividualPayment] = [:]
                            var tips: [Int: IndividualTip] = [:]
                            for i in 0..<vm.guestCount {
                                assignments[i] = []
                                payments[i] = IndividualPayment()
                                tips[i] = IndividualTip()
                            }
                            vm.itemAssignments = assignments
                            vm.individualPayments = payments
                            vm.individualTips = tips
                        }
                        vm.currentPersonIndex = 0
                        vm.paymentStep = "split-assign"
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "person.2.fill")
                            Text("Dividir Cuenta")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.blue.opacity(0.15))
                        .foregroundColor(.blue)
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.blue.opacity(0.3), lineWidth: 1))
                    }
                }
            }
        }
        .frame(maxWidth: 380)
        .padding(24)
    }
    
    // MARK: - Discount Selector
    
    private var discountSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Descuento")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            Menu {
                Button("Sin descuento") { vm.selectedDiscount = nil }
                ForEach(vm.availableDiscounts) { discount in
                    Button {
                        if discount.type == "flexible" {
                            vm.selectedDiscount = discount
                            vm.showFlexibleDiscountDialog = true
                        } else {
                            vm.selectedDiscount = discount
                        }
                    } label: {
                        Text("\(discount.name) (\(discountLabel(discount)))")
                    }
                }
            } label: {
                HStack {
                    Text(vm.selectedDiscount?.name ?? "Sin descuento")
                        .foregroundColor(.white)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
    
    private func discountLabel(_ d: Discount) -> String {
        switch d.type {
        case "percentage": return "\(Int(d.value))%"
        case "fixed_amount": return "$\(Int(d.value))"
        default: return "Flexible"
        }
    }
    
    // MARK: - Payment Method Selection
    
    private var paymentMethodSelection: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                // Header
                HStack {
                    Text("Método de Pago")
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
                
                // Tip selector
                tipSelector
                
                // Total card
                totalWithTipCard
                
                // Platform delivery or payment methods
                if vm.customerName.hasPrefix("Uber") || vm.customerName.hasPrefix("Rappi") || vm.customerName.hasPrefix("Didi") {
                    platformDeliveryPayment
                } else {
                    // Payment methods
                    paymentMethodButtons
                    
                    // Tip payment method selector (when not cash and tip > 0)
                    if vm.paymentMethod != nil && vm.paymentMethod != "cash" && vm.tipAmount > 0 {
                        tipPaymentMethodSelector
                    }
                    
                    // Cash input
                    if vm.paymentMethod == "cash" {
                        cashInput
                    }
                    
                    // Continue button
                    if vm.paymentMethod != nil {
                        Button {
                            vm.paymentStep = "confirmation"
                        } label: {
                            HStack(spacing: 8) {
                                Text("Continuar")
                                Image(systemName: "arrow.right")
                            }
                            .font(.headline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(canProceed ? Color.blue.opacity(0.2) : Color.white.opacity(0.05))
                            .foregroundColor(canProceed ? .blue : .gray)
                            .cornerRadius(14)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(canProceed ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1.5))
                        }
                        .disabled(!canProceed)
                    }
                }
            }
            .frame(maxWidth: 420)
            .padding(24)
        }
    }
    
    private var canProceed: Bool {
        if vm.paymentMethod == "cash" {
            return (Double(vm.cashReceived) ?? 0) >= vm.totalWithTip
        }
        return true
    }
    
    // MARK: - Tip Selector
    
    private var tipSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Propina (opcional)")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            HStack(spacing: 10) {
                ForEach([0, 10, 15, 20], id: \.self) { pct in
                    Button {
                        vm.tipPercentage = pct
                        vm.customTip = ""
                        vm.showCustomTip = false
                    } label: {
                        Text(pct == 0 ? "Sin" : "\(pct)%")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(
                                vm.tipPercentage == pct && !vm.showCustomTip
                                ? Color.blue.opacity(0.2)
                                : Color.white.opacity(0.05)
                            )
                            .foregroundColor(vm.tipPercentage == pct && !vm.showCustomTip ? .blue : .white)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(vm.tipPercentage == pct && !vm.showCustomTip ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1)
                            )
                    }
                }
                
                Button {
                    vm.showCustomTip = true
                    vm.tipPercentage = 0
                } label: {
                    Text("Otro")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(vm.showCustomTip ? Color.blue.opacity(0.2) : Color.white.opacity(0.05))
                        .foregroundColor(vm.showCustomTip ? .blue : .white)
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(vm.showCustomTip ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1))
                }
            }
            
            if vm.showCustomTip {
                TextField("0.00", text: $vm.customTip)
                    .keyboardType(.decimalPad)
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.white.opacity(0.05))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
    
    // MARK: - Total with Tip Card
    
    private var totalWithTipCard: some View {
        VStack(spacing: 10) {
            HStack {
                Text("Subtotal")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                Spacer()
                Text(vm.formatCurrency(vm.cartTotalWithDiscount))
                    .font(.headline)
                    .foregroundColor(.white)
            }
            
            if vm.tipAmount > 0 {
                HStack {
                    Text("Propina")
                        .font(.subheadline)
                        .foregroundColor(.blue)
                    Spacer()
                    Text(vm.formatCurrency(vm.tipAmount))
                        .font(.headline)
                        .foregroundColor(.blue)
                }
            }
            
            Divider().background(Color.white.opacity(0.1))
            
            HStack {
                Text("Total a Pagar")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                Spacer()
                Text(vm.formatCurrency(vm.totalWithTip))
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
    
    // MARK: - Payment Method Buttons
    
    private var paymentMethodButtons: some View {
        HStack(spacing: 12) {
            paymentMethodCard(method: "cash", icon: "banknote.fill", label: "Efectivo", color: .green)
            paymentMethodCard(method: "terminal_mercadopago", icon: "creditcard.fill", label: "Terminal", color: .blue)
            paymentMethodCard(method: "transfer", icon: "building.columns.fill", label: "Transferencia", color: .purple)
        }
    }
    
    private func paymentMethodCard(method: String, icon: String, label: String, color: Color) -> some View {
        Button {
            vm.paymentMethod = method
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(vm.paymentMethod == method ? color : color.opacity(0.6))
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundColor(vm.paymentMethod == method ? .white : .gray)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 80)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(vm.paymentMethod == method ? color.opacity(0.15) : Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(vm.paymentMethod == method ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Tip Payment Method Selector
    
    private var tipPaymentMethodSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("¿Cómo se pagará la propina?")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            HStack(spacing: 12) {
                tipMethodCard(method: vm.paymentMethod ?? "terminal_mercadopago", label: "En tarjeta", icon: "creditcard.fill", color: .blue)
                tipMethodCard(method: "cash", label: "En efectivo", icon: "banknote.fill", color: .green)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
    
    private func tipMethodCard(method: String, label: String, icon: String, color: Color) -> some View {
        Button {
            vm.tipPaymentMethod = method
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod) ? color : color.opacity(0.6))
                Text(label)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod) ? .white : .gray)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod) ? color.opacity(0.15) : Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod) ? color.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
    
    // MARK: - Cash Input
    
    private var cashInput: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Efectivo recibido")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            TextField("0.00", text: $vm.cashReceived)
                .keyboardType(.decimalPad)
                .font(.title2.weight(.bold))
                .foregroundColor(.white)
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            
            if let cash = Double(vm.cashReceived), cash > 0 {
                HStack {
                    Text("Cambio")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.changeAmount))
                        .font(.title3.weight(.bold))
                        .foregroundColor(vm.cashSufficient ? .green : .red)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.03))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.08), lineWidth: 1))
                )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
    
    // MARK: - Platform Delivery Payment
    
    private var platformDeliveryPayment: some View {
        VStack(spacing: 16) {
            // Info card
            HStack(spacing: 12) {
                Image(systemName: "shippingbox.fill")
                    .font(.title2)
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Orden de Delivery")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text("Pago manejado por \(vm.deliveryPlatform.isEmpty ? "la plataforma" : vm.deliveryPlatform)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                Spacer()
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.orange.opacity(0.08))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.orange.opacity(0.25), lineWidth: 1))
            )
            
            // Confirm button
            Button {
                vm.handleDeliverToDriver()
            } label: {
                HStack(spacing: 8) {
                    if vm.processing {
                        ProgressView().tint(.orange)
                    }
                    Image(systemName: "checkmark.circle.fill")
                    Text("Entregar a Repartidor")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.orange.opacity(0.15))
                .foregroundColor(.orange)
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.orange.opacity(0.4), lineWidth: 1.5))
            }
            .disabled(vm.processing)
        }
    }
    
    // MARK: - Confirmation
    
    private var paymentConfirmation: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Text("Confirmar Pago")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    vm.paymentStep = "payment"
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
            
            // Summary card
            VStack(spacing: 12) {
                HStack {
                    Text("Subtotal")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.cartTotalWithDiscount))
                        .font(.headline)
                        .foregroundColor(.white)
                }
                
                if vm.tipAmount > 0 {
                    HStack {
                        Text("Propina")
                            .font(.subheadline)
                            .foregroundColor(.blue)
                        Spacer()
                        Text(vm.formatCurrency(vm.tipAmount))
                            .font(.headline)
                            .foregroundColor(.blue)
                    }
                }
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Total")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.white)
                    Spacer()
                    Text(vm.formatCurrency(vm.totalWithTip))
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                }
                
                HStack(spacing: 8) {
                    Text("Método")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(paymentMethodLabel)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.blue.opacity(0.15))
                        .foregroundColor(.blue)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.blue.opacity(0.3), lineWidth: 1))
                }
                
                if vm.paymentMethod == "cash", let cash = Double(vm.cashReceived), cash > 0 {
                    HStack {
                        Text("Cambio")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        Spacer()
                        Text(vm.formatCurrency(max(0, cash - vm.totalWithTip)))
                            .font(.headline.weight(.bold))
                            .foregroundColor(.green)
                    }
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
            
            // Slide to confirm
            SlideToConfirmView {
                Task {
                    if vm.paymentMethod == "cash" {
                        vm.handlePayCash()
                    } else if vm.paymentMethod == "transfer" {
                        vm.handlePayTransfer()
                    } else if vm.paymentMethod == "terminal_mercadopago" {
                        vm.handlePayTerminal()
                    }
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    vm.paymentStep = "done"
                }
            }
            .disabled(vm.processing)
        }
        .frame(maxWidth: 420)
        .padding(24)
    }
    
    private var paymentMethodLabel: String {
        switch vm.paymentMethod {
        case "cash": return "Efectivo"
        case "transfer": return "Transferencia"
        case "terminal_mercadopago": return "Terminal"
        default: return ""
        }
    }
    
    // MARK: - Done
    
    private var paymentDone: some View {
        VStack(spacing: 24) {
            // Success card
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(.green)
                
                Text("Pago Completado")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                
                Text(paymentMethodLabel)
                    .font(.subheadline)
                    .foregroundColor(.gray)
                
                Text(vm.formatCurrency(vm.totalWithTip))
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.green.opacity(0.08))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.green.opacity(0.25), lineWidth: 1))
            )
            
            // Finish button
            Button {
                vm.handleConfirmOrder()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark")
                    Text("Finalizar")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.green.opacity(0.2))
                .foregroundColor(.green)
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.green.opacity(0.4), lineWidth: 1.5))
            }
        }
        .frame(maxWidth: 420)
        .padding(24)
    }
    
    // MARK: - Helper (deprecated - use inline buttons instead)
    
    private func backButton(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                Text("Regresar")
            }
            .font(.subheadline.bold())
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(white: 0.1))
            .foregroundColor(.white)
            .cornerRadius(10)
        }
    }
}

// MARK: - Slide To Confirm

struct SlideToConfirmView: View {
    let onConfirm: () -> Void
    var disabled: Bool = false
    
    @State private var offset: CGFloat = 0
    @State private var confirmed = false
    private let trackWidth: CGFloat = 340
    private let thumbSize: CGFloat = 56
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Track
            RoundedRectangle(cornerRadius: 28)
                .fill(Color(white: 0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 28)
                        .stroke(Color(white: 0.2))
                )
                .frame(height: thumbSize)
            
            // Label
            Text(confirmed ? "Confirmado" : "Desliza para confirmar →")
                .font(.subheadline.bold())
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity)
            
            // Thumb
            Circle()
                .fill(confirmed ? Color.green : Color.blue)
                .frame(width: thumbSize, height: thumbSize)
                .overlay(
                    Image(systemName: confirmed ? "checkmark" : "chevron.right.2")
                        .font(.headline)
                        .foregroundColor(.white)
                )
                .offset(x: offset)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            guard !disabled && !confirmed else { return }
                            offset = min(max(0, value.translation.width), trackWidth - thumbSize)
                        }
                        .onEnded { _ in
                            guard !disabled && !confirmed else { return }
                            if offset > (trackWidth - thumbSize) * 0.8 {
                                withAnimation(.spring()) { offset = trackWidth - thumbSize }
                                confirmed = true
                                onConfirm()
                            } else {
                                withAnimation(.spring()) { offset = 0 }
                            }
                        }
                )
        }
        .frame(width: trackWidth, height: thumbSize)
        .opacity(disabled ? 0.5 : 1)
    }
}
