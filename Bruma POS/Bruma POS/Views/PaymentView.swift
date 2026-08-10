import SwiftUI

struct PaymentView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            // Subtle dark gradient background
            LinearGradient(
                colors: [Color(white: 0.02), Color(white: 0.05), Color(white: 0.02)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            
            ZStack {
                switch vm.paymentStep {
                case "payment", "confirmation":
                    mainPaymentView
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .leading)), removal: .opacity.combined(with: .move(edge: .trailing))))
                case "done":
                    paymentDone
                        .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.95)), removal: .opacity))
                case "split-payment":
                    SplitPaymentView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-bill-mode":
                    SplitBillModeView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-assign":
                    SplitAssignView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-seat-assign":
                    SplitSeatView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-overview":
                    SplitOverviewView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-pay-person":
                    SplitPayPersonView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-confirmation":
                    splitConfirmationView
                        .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.95)), removal: .opacity))
                case "split-bill-confirmation":
                    splitBillConfirmationView
                        .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.95)), removal: .opacity))
                default:
                    mainPaymentView
                        .transition(.opacity)
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.82), value: vm.paymentStep)
        }
    }
    
    private func discountLabel(_ d: Discount) -> String {
        switch d.type {
        case "percentage": return "\(Int(d.value))%"
        case "fixed_amount": return "$\(Int(d.value))"
        default: return "Flexible"
        }
    }
    
    // MARK: - Main Payment View
    
    private var paymentBodyContent: some View {
        Group {
            if vm.paymentStep == "confirmation" {
                confirmationSummary
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
            } else {
                VStack(spacing: 12) {
                    if vm.customerName.hasPrefix("Uber") || vm.customerName.hasPrefix("Rappi") || vm.customerName.hasPrefix("Didi") {
                        platformDeliveryPayment
                    } else {
                        methodSegmentedPicker
                        tipSelector
                        
                        if vm.paymentMethod == "cash" {
                            cashInputPanel
                        }
                        
                        if vm.showCustomTip {
                            customTipPanel
                        }
                        
                        if vm.paymentMethod != nil && vm.paymentMethod != "cash" && vm.tipAmount > 0 {
                            tipPaymentMethodSelector
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .leading)), removal: .opacity.combined(with: .move(edge: .trailing))))
            }
        }
    }

    private var mainPaymentView: some View {
        VStack(spacing: 0) {
            paymentHeader
                .animation(.easeInOut(duration: 0.3), value: vm.paymentStep)

            ScrollView(showsIndicators: false) {
                paymentBodyContent
                    .frame(maxWidth: .infinity, alignment: .top)
                    .padding(.bottom, 12)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
            .safeAreaInset(edge: .bottom) {
                paymentFooter
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .animation(.easeInOut(duration: 0.3), value: vm.paymentStep)
            }


           
        }
    }
    
    // MARK: - Header
    
    @ViewBuilder
    private var paymentHeader: some View {
        if vm.paymentStep == "confirmation" {
            HStack(spacing: 12) {
                Text("Confirmar Pago")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        vm.paymentStep = "payment"
                    }
                    vm.emitCustomerDisplayState(mode: "active")
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
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)
        } else {
            HStack(spacing: 12) {
                Text("Cobrar")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer(minLength: 12)
                headerActions
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)
        }
    }

    /// Botones secundarios del header ("Pago Completo", Descuento, Cajón,
    /// Minimizar, Cerrar). Con muchos botones a la vez (p. ej. hay descuentos
    /// disponibles) el texto de las pills se rompía a dos líneas por falta de
    /// espacio; `ViewThatFits` cae a la variante compacta (solo íconos) en
    /// vez de dejar que el texto se envuelva.
    private var headerActions: some View {
        ViewThatFits(in: .horizontal) {
            headerActionsFull
            headerActionsCompact
        }
    }

    private var headerActionsFull: some View {
        HStack(spacing: 12) {
            moreOptionsMenu
            if !vm.availableDiscounts.isEmpty {
                discountPill
            }
            headerPillButton(icon: "lock.open.fill", label: "Cajón") {
                Task { try? await APIService.shared.openCashDrawer() }
            }
            if vm.paymentMethod == "cash" {
                headerPillButton(icon: "rectangle.compress.vertical", label: "Minimizar") {
                    vm.parkCurrentPaymentIfNeeded()
                    vm.showingPayment = false
                }
            }
            headerPillButton(icon: "xmark", label: "Cerrar") {
                vm.resetPaymentState()
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private var headerActionsCompact: some View {
        HStack(spacing: 8) {
            moreOptionsMenuCompact
            if !vm.availableDiscounts.isEmpty {
                discountCircleButton
            }
            GlassCircleButton(
                systemImage: "lock.open.fill",
                action: { Task { try? await APIService.shared.openCashDrawer() } },
                isActive: false,
                activeColor: .blue
            )
            if vm.paymentMethod == "cash" {
                GlassCircleButton(
                    systemImage: "rectangle.compress.vertical",
                    action: {
                        vm.parkCurrentPaymentIfNeeded()
                        vm.showingPayment = false
                    },
                    isActive: false,
                    activeColor: .blue
                )
            }
            GlassCircleButton(
                systemImage: "xmark",
                action: { vm.resetPaymentState() },
                isActive: false,
                activeColor: .blue
            )
        }
    }

    private func headerPillButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                Text(label).lineLimit(1)
            }
            .font(.subheadline.weight(.medium))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .fixedSize()
        }
        .buttonStyle(.glass)
        .clipShape(Capsule())
    }
    
    @ViewBuilder
    private var discountPill: some View {
        if vm.selectedDiscount != nil {
            discountPillContent
                .buttonStyle(.glassProminent)
                .tint(.orange)
        } else {
            discountPillContent
                .buttonStyle(.glass)
        }
    }

    private var discountPillContent: some View {
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
            HStack(spacing: 4) {
                Image(systemName: "tag.fill")
                    .font(.caption)
                Text(vm.selectedDiscount?.name ?? "Descuento")
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .fixedSize()
        }
    }

    /// Icono-only: mismo menú de descuentos, para el header compacto.
    private var discountCircleButton: some View {
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
            Image(systemName: "tag.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(vm.selectedDiscount != nil ? Color.orange : .white)
                .frame(width: 48, height: 48)
                .modifier(GlassCircle(isActive: vm.selectedDiscount != nil, color: .orange))
        }
    }

    private var moreOptionsMenu: some View {
        Menu {
            Button {
                vm.paymentStep = "split-payment"
                vm.splitPayments = []
                vm.paymentMethod = nil
            } label: {
                Label("Pago Dividido", systemImage: "creditcard.arrow.trianglehead.2.clockwise.rotate.90")
            }
            
            if vm.guestCount > 1 {
                Button {
                    vm.currentPersonIndex = 0
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-bill-mode"
                    }
                } label: {
                    Label("Dividir Cuenta", systemImage: "person.2.fill")
                }
            }
        } label: {
            HStack(spacing: 12) {
                Label("Pago Completo", systemImage: "creditcard.and.numbers")
                    .foregroundColor(.white)
                    .lineLimit(1)

                Image(systemName: "chevron.down")
                    .foregroundStyle(.gray)
                    .font(.footnote)
            }
            .padding(.vertical, 8)
            .fixedSize()
        }
        .buttonStyle(.glass)
    }

    /// Icono-only: mismo menú de "Pago Completo"/"Pago Dividido"/"Dividir Cuenta",
    /// para el header compacto.
    private var moreOptionsMenuCompact: some View {
        Menu {
            Button {
                vm.paymentStep = "split-payment"
                vm.splitPayments = []
                vm.paymentMethod = nil
            } label: {
                Label("Pago Dividido", systemImage: "creditcard.arrow.trianglehead.2.clockwise.rotate.90")
            }

            if vm.guestCount > 1 {
                Button {
                    vm.currentPersonIndex = 0
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-bill-mode"
                    }
                } label: {
                    Label("Dividir Cuenta", systemImage: "person.2.fill")
                }
            }
        } label: {
            Image(systemName: "creditcard.and.numbers")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .modifier(GlassCircle(isActive: false, color: .blue))
        }
    }

    // MARK: - Segmented Method Picker
    
    private var methodSegmentedPicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Método de pago")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            HStack(spacing: 10) {
                methodButton(method: "cash", icon: "banknote.fill", label: "Efectivo", color: Color(red: 0, green: 137/255, blue: 50/255))
                methodButton(method: "terminal_mercadopago", icon: "creditcard.fill", label: "Terminal", color: Color(red: 30/255, green: 110/255, blue: 244/255))
                methodButton(method: "transfer", icon: "building.columns.fill", label: "Transferencia", color: Color(red: 86/255, green: 74/255, blue: 222/255))
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }
    
    private func methodButton(method: String, icon: String, label: String, color: Color) -> some View {
        Button {
            vm.paymentMethod = method
            if method != "cash" {
                vm.cashReceived = ""
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.body)
                Text(label)
                    .font(.body.weight(.semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.glassProminent)
        .tint(vm.paymentMethod == method ? color : Color(.systemGray6))
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
                        vm.activeNumericField = nil
                    } label: {
                        Text(pct == 0 ? "Sin" : "\(pct)%")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(vm.tipPercentage == pct && !vm.showCustomTip ? .blue : Color(.systemGray5))
                }

                Button {
                    vm.showCustomTip = true
                    vm.tipPercentage = 0
                } label: {
                    Text("Otro")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .foregroundStyle(.white)
                }
                .buttonStyle(.glassProminent)
                .tint(vm.showCustomTip ? .blue : Color(.systemGray5))
                
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }
    
    // MARK: - Cash Input Panel
    
    private var cashInputPanel: some View {
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
                        .fill(Color.white.opacity(0.03))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08), lineWidth: 1))
                )
            
            if let cash = Double(vm.cashReceived), cash > 0 {
                HStack {
                    Text("Cambio")
                        .font(.subheadline)
                        .foregroundColor(.white)
                    Spacer()
                    Text(vm.formatCurrency(vm.changeAmount))
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                }
                .padding(12)
                .modifier(
                    vm.cashSufficient
                    ? GlassCardTinted(color: .green)
                    : GlassCardTinted(color: .red)
                )
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }
    
    // MARK: - Custom Tip Panel
    
    private var customTipPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Propina personalizada")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
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
        .padding(16)
        .modifier(GlassCard())
    }
    
    // MARK: - Confirmation Summary

    private var confirmationSummary: some View {
        VStack(spacing: 16) {
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
                        .foregroundStyle(.white)
                        .modifier(GlassCardTinted(color: .blue))
                }

                if vm.paymentMethod == "cash", let cash = Double(vm.cashReceived), cash > 0 {
                    HStack {
                        Text("Efectivo recibido")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        Spacer()
                        Text(vm.formatCurrency(cash))
                            .font(.headline)
                            .foregroundColor(.white)
                    }

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
            .modifier(GlassCard())
            
            // Loyalty card
            loyaltyCardView
        }
    }
    
    private var loyaltyCardView: some View {
        VStack(spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "star.fill")
                    .foregroundColor(.yellow)
                Text("Acumular Sellos Lealtad")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(.white)
                Spacer()
            }
            
            if vm.loyaltyCard == nil {
                HStack(spacing: 12) {
                    Button {
                        vm.qrDialogOpen = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "qrcode.viewfinder")
                            Text("Leer Pase")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.blue)
                    
                    Button {
                        vm.showLoyaltyEmailDialog = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "envelope.fill")
                            Text("Añadir por Correo")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.purple)
                }
            } else if let card = vm.loyaltyCard {
                VStack(spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                            Text("\(card.stamps)/\(card.stampsPerReward) sellos")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        Button {
                            vm.loyaltyCard = nil
                            vm.loyaltyStampsToAdd = 1
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                    }
                    
                    // Stamp progress bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white.opacity(0.08))
                                .frame(height: 8)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.yellow)
                                .frame(width: geo.size.width * CGFloat(card.stamps) / CGFloat(card.stampsPerReward), height: 8)
                        }
                    }
                    .frame(height: 8)
                    
                    // Stepper
                    HStack(spacing: 16) {
                        Text("Sellos a agregar:")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Spacer()
                        Button {
                            vm.loyaltyStampsToAdd = max(1, vm.loyaltyStampsToAdd - 1)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.title3)
                                .foregroundColor(.blue)
                        }
                        Text("\(vm.loyaltyStampsToAdd)")
                            .font(.headline.weight(.bold))
                            .foregroundColor(.white)
                            .frame(minWidth: 32)
                        Button {
                            vm.loyaltyStampsToAdd += 1
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                                .foregroundColor(.blue)
                        }
                        Button {
                            vm.addLoyaltyStamps()
                        } label: {
                            Text("Agregar")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(Color.blue))
                        }
                    }
                    
                    // Reward available
                    if card.rewardsAvailable > 0 {
                        Button {
                            vm.showLoyaltyRewardDialog = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "gift.fill")
                                    .foregroundColor(.yellow)
                                Text("Premio disponible: Canjear")
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            .foregroundColor(.white)
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.yellow.opacity(0.12))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.yellow.opacity(0.3), lineWidth: 1))
                            )
                        }
                    }
                }
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }

    // MARK: - Payment Footer

    @ViewBuilder
    private var paymentFooter: some View {
        if vm.paymentStep == "confirmation" {
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
                    withAnimation(.easeInOut(duration: 0.3)) {
                        vm.paymentStep = "done"
                    }
                }
            }
            .disabled(vm.processing)
            .transition(.opacity.combined(with: .scale))
        } else {
            VStack(spacing: 10) {
                HStack {
                    Text("Subtotal")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.cartSubtotalBeforeDiscounts))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                }

                if vm.selectedDiscount != nil {
                    HStack {
                        Text(vm.selectedDiscount?.name ?? "Descuento")
                            .font(.caption)
                            .foregroundColor(.yellow)
                        Spacer()
                        Text("-\(vm.formatCurrency(vm.flexibleDiscountAmount))")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.yellow)
                    }
                }

                if vm.tipAmount > 0 {
                    HStack {
                        Text("Propina")
                            .font(.caption)
                            .foregroundColor(.blue)
                        Spacer()
                        Text(vm.formatCurrency(vm.tipAmount))
                            .font(.caption.weight(.semibold))
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

                Button {
                    guard vm.paymentMethod != nil else { return }
                    if vm.paymentMethod == "cash" && !canProceed { return }
                    withAnimation(.easeInOut(duration: 0.3)) {
                        vm.paymentStep = "confirmation"
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.fill")
                        Text("Cobrar")
                            .font(.headline.weight(.semibold))
                        Text(vm.formatCurrency(vm.totalWithTip))
                            .font(.headline.weight(.bold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(canProceed && vm.paymentMethod != nil ? .white : .gray)
                }
                .buttonStyle(.glassProminent)
                .tint(canProceed && vm.paymentMethod != nil ? .green : .gray)
                .disabled(vm.paymentMethod == nil || (vm.paymentMethod == "cash" && !canProceed))
            }
            .padding(16)
            .modifier(GlassCard())
            .transition(.opacity.combined(with: .scale))
        }
    }
    
    // MARK: - Tip Payment Method Selector
    
    private var tipPaymentMethodSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("¿Cómo se pagará la propina?")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.gray)
            
            HStack(spacing: 12) {
                if vm.paymentMethod == "transfer" {
                    tipMethodCard(method: "transfer", label: "En transferencia", icon: "building.columns.fill", color: .purple)
                } else {
                    tipMethodCard(method: vm.paymentMethod ?? "terminal_mercadopago", label: "En tarjeta", icon: "creditcard.fill", color: .blue)
                }
                tipMethodCard(method: "cash", label: "En efectivo", icon: "banknote.fill", color: .green)
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }
    
    @ViewBuilder
    private func tipMethodCard(method: String, label: String, icon: String, color: Color) -> some View {
        let isSelected = vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod)
        Button {
            vm.tipPaymentMethod = method
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(label)
                    .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.glassProminent)
        .tint(isSelected ? color : Color(.systemGray5))
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
                        .fill(Color.white.opacity(0.03))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08), lineWidth: 1))
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
                .modifier(
                    vm.cashSufficient
                    ? GlassCardTinted(color: .green)
                    : GlassCardTinted(color: .red)
                )
            }
        }
        .padding(16)
        .modifier(GlassCard())
    }
    
    // MARK: - Platform Delivery Payment
    
    private var platformDeliveryPayment: some View {
        VStack(spacing: 16) {
            // Info card — glass tinted orange
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
            .modifier(GlassCardTinted(color: .orange))
            
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
                .foregroundStyle(.orange)
            }
            .buttonStyle(.glassProminent)
            .tint(.orange)
            .disabled(vm.processing)
        }
    }
    
    // MARK: - Confirmation
    
    private var paymentConfirmation: some View {
        VStack(spacing: 20) {
            // Header with glass back button
            HStack {
                Text("Confirmar Pago")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    vm.paymentStep = "payment"
                    vm.emitCustomerDisplayState(mode: "active")
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
            
            // Summary card — glass
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
                        .foregroundStyle(.blue)
                        .modifier(GlassCardTinted(color: .blue))
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
            .modifier(GlassCard())
            
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
    
    // MARK: - Split Confirmation

    private var splitConfirmationView: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Confirmar Pago Dividido")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-payment"
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
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    // Payments list
                    ForEach(vm.splitPayments) { payment in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(payment.displayMethod)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)
                                if payment.tip > 0 {
                                    Text("Propina \(vm.formatCurrency(payment.tip))")
                                        .font(.caption)
                                        .foregroundColor(.blue)
                                }
                            }
                            Spacer()
                            Text(vm.formatCurrency(payment.amount))
                                .font(.headline.weight(.bold))
                                .foregroundColor(.white)
                        }
                        .padding(14)
                        .modifier(GlassCard())
                    }

                    // Totals
                    VStack(spacing: 10) {
                        if (vm.splitPayments.reduce(0) { $0 + $1.tip }) > 0 {
                            HStack {
                                Text("Total propinas")
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                Spacer()
                                Text(vm.formatCurrency(vm.splitPayments.reduce(0) { $0 + $1.tip }))
                                    .font(.subheadline.weight(.semibold))
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
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Slide to confirm
                    SlideToConfirmView {
                        Task {
                            vm.handlePaySplit()
                            try? await Task.sleep(nanoseconds: 1_500_000_000)
                            withAnimation(.easeInOut(duration: 0.3)) {
                                vm.paymentStep = "done"
                            }
                        }
                    }
                    .disabled(vm.processing)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .padding(.horizontal, 24)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }

    // MARK: - Split Bill Confirmation

    private var splitBillConfirmationView: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Confirmar Cuenta Dividida")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-overview"
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
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    // Seat payments list
                    let seatCount = vm.guestCount
                    ForEach(Array(0..<seatCount), id: \.self) { idx in
                        if let payment = vm.individualPayments[idx], payment.paid {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Asiento \(idx + 1)")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                    Text(payment.methodDisplay)
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                    if payment.tipAmount > 0 {
                                        Text("Propina \(vm.formatCurrency(payment.tipAmount))")
                                            .font(.caption)
                                            .foregroundColor(.blue)
                                    }
                                }
                                Spacer()
                                Text(vm.formatCurrency(payment.amount))
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(.white)
                            }
                            .padding(14)
                            .modifier(GlassCard())
                        }
                    }

                    // Totals
                    VStack(spacing: 10) {
                        let totalTip = vm.individualPayments.values.reduce(0.0) { $0 + $1.tipAmount }
                        if totalTip > 0 {
                            HStack {
                                Text("Total propinas")
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                Spacer()
                                Text(vm.formatCurrency(totalTip))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.blue)
                            }
                        }
                        Divider().background(Color.white.opacity(0.1))
                        HStack {
                            Text("Total")
                                .font(.title3.weight(.semibold))
                                .foregroundColor(.white)
                            Spacer()
                            Text(vm.formatCurrency(vm.cartTotal))
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Slide to confirm
                    SlideToConfirmView {
                        vm.handleFinalizeSplitBill()
                    }
                    .disabled(vm.confirmingOrder)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .padding(.horizontal, 24)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }

    // MARK: - Done

    private var paymentDone: some View {
        VStack(spacing: 32) {
            Spacer()

            // Success ring + checkmark
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.12))
                    .frame(width: 120, height: 120)
                Circle()
                    .stroke(Color.green.opacity(0.3), lineWidth: 2)
                    .frame(width: 120, height: 120)
                AnimatedCheckmark()
            }

            VStack(spacing: 6) {
                Text("Pago Completado")
                    .font(.title.weight(.bold))
                    .foregroundColor(.white)
                Text(vm.formatCurrency(vm.totalWithTip))
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                
                if let cash = Double(vm.cashReceived), cash > vm.totalWithTip {
                    let change = cash - vm.totalWithTip
                    Text("Cambio: \(vm.formatCurrency(change))")
                        .font(.title2.weight(.semibold))
                        .foregroundColor(.green)
                }
            }

            Spacer()

            Button {
                vm.handleConfirmOrder()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right.circle.fill")
                    Text("Finalizar")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .foregroundStyle(.white)
            }
            .buttonStyle(.glassProminent)
            .tint(.green)
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: 420)
    }
    
}

// MARK: - Slide To Confirm

struct SlideToConfirmView: View {
    let onConfirm: () -> Void
    var disabled: Bool = false
    
    @State private var offset: CGFloat = 0
    @State private var confirmed = false
    private let trackWidth: CGFloat = 400
    private let thumbSize: CGFloat = 64
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Track — glass
            RoundedRectangle(cornerRadius: 28)
                .fill(Color(white: 0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 28)
                        .stroke(Color(white: 0.2))
                )
                .frame(height: thumbSize)
                .modifier(GlassTrack())
            
            // Label
            Text(confirmed ? "Confirmado" : "Desliza para confirmar →")
                .font(.subheadline.bold())
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity)
            
            // Thumb — glass with glow
            Circle()
                .fill(confirmed ? Color.green : Color.blue)
                .frame(width: thumbSize, height: thumbSize)
                .overlay(
                    Image(systemName: confirmed ? "checkmark" : "chevron.right.2")
                        .font(.headline)
                        .foregroundColor(.white)
                )
                .shadow(
                    color: (confirmed ? Color.green : Color.blue).opacity(0.4),
                    radius: 8,
                    x: 0,
                    y: 0
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

// MARK: - Animated Checkmark

private struct AnimatedCheckmark: View {
    @State private var showCheck = false

    var body: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 44, weight: .bold))
            .foregroundColor(.green)
            .opacity(showCheck ? 1 : 0)
            .scaleEffect(showCheck ? 1.0 : 0.3)
            .animation(.spring(response: 0.5, dampingFraction: 0.6), value: showCheck)
            .task {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                showCheck = true
            }
    }
}
