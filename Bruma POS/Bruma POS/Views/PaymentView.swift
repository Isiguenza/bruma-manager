import SwiftUI

private enum PaymentSheetKind: Identifiable, Equatable {
    case tip, cash, confirm, discount
    var id: Self { self }
}

struct PaymentView: View {
    @ObservedObject var vm: POSViewModel
    @State private var activeSheet: PaymentSheetKind?

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
                case "payment":
                    mainPaymentView
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .leading)), removal: .opacity.combined(with: .move(edge: .trailing))))
                case "done":
                    paymentDone
                        .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.95)), removal: .opacity))
                case "split-bill-mode":
                    SplitBillModeView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-assign":
                    SplitAssignView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-seat-assign":
                    SplitSeatView(vm: vm)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
                case "split-tickets-confirm":
                    splitTicketsConfirmView
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
    //
    // Pantalla compacta, sin scroll: total + método + una fila de propina
    // (y de efectivo si aplica) + botón "Cobrar". La propina, el efectivo
    // recibido y la confirmación viven en sheets aparte — se abren solo
    // cuando hacen falta, no se quedan apiladas en la misma pantalla.

    private var mainPaymentView: some View {
        ZStack {
            VStack(spacing: 0) {
                paymentHeader

                if vm.customerName.hasPrefix("Uber") || vm.customerName.hasPrefix("Rappi") || vm.customerName.hasPrefix("Didi") {
                    ScrollView(showsIndicators: false) {
                        platformDeliveryPayment
                            .padding(24)
                    }
                } else {
                    VStack(spacing: 26) {
                        heroTotal
                        methodRow
                        VStack(spacing: 10) {
                            tipRowPill
                            if vm.paymentMethod == "cash" {
                                cashRowPill
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)

                    Spacer(minLength: 12)

                    VStack(spacing: 8) {
                        cobrarButton
                        Text(cobrarHint)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
                }
            }

        }
        // Scrim + las 4 hojas, contenidas en este panel — no es un .sheet()
        // del sistema (eso oscurecería toda la pantalla, incluido el
        // carrito, y aparecería centrado en iPad).
        //
        // Las 4 (tip/cash/confirm/discount) están SIEMPRE montadas desde el
        // primer render, cada una con su propio offset — a propósito no se
        // arma con un `switch` que decide "cuál sheet mostrar", porque eso
        // crea/destruye la vista activa la primera vez que cambia de un tipo
        // a otro (una identidad nueva no anima, aparece de golpe = el fade
        // que solo se veía la primera vez que se abría cada modal). Con las
        // 4 ya montadas desde el principio, abrir cualquiera siempre es solo
        // animar un offset sobre una vista que ya existía.
        .overlay {
            Color.black.opacity(activeSheet != nil ? 0.55 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(activeSheet != nil)
                .onTapGesture(perform: closeSheet)
                .animation(Self.sheetAnimation, value: activeSheet)
        }
        .overlay { sheetSlot(.tip) { tipSheet } }
        .overlay { sheetSlot(.cash) { cashSheet } }
        .overlay { sheetSlot(.confirm) { confirmSheet } }
        .overlay { sheetSlot(.discount) { discountSheet } }
    }

    private static let sheetAnimation = Animation.spring(response: 0.42, dampingFraction: 0.84)

    @ViewBuilder
    private func sheetSlot<Content: View>(_ kind: PaymentSheetKind, @ViewBuilder content: () -> Content) -> some View {
        let isOpen = activeSheet == kind
        VStack {
            Spacer()
            content()
        }
        .offset(y: isOpen ? 0 : 700)
        .allowsHitTesting(isOpen)
        .animation(Self.sheetAnimation, value: isOpen)
    }

    private func openSheet(_ kind: PaymentSheetKind) {
        Haptics.tap()
        activeSheet = kind
    }

    private func closeSheet() {
        activeSheet = nil
    }

    private var cobrarHint: String {
        guard vm.paymentMethod != nil else { return "Elige un método de pago" }
        if vm.paymentMethod == "cash" && !canProceed { return "Falta ingresar el efectivo recibido" }
        return " "
    }

    // MARK: - Header

    private var paymentHeader: some View {
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

    /// Botones secundarios del header ("Pago Completo", Descuento, Cajón,
    /// Minimizar, Cerrar) — siempre colapsados en bolita (solo íconos), sin
    /// variante de texto expandido.
    private var headerActions: some View {
        HStack(spacing: 8) {
            moreOptionsMenuCompact
            if !vm.availableDiscounts.isEmpty {
                discountCircleButton
            }
            Button {
                Task { try? await APIService.shared.openCashDrawer() }
            } label: {
                Image(systemName: "lock.open.fill")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.flatCircleNeutral)

            if vm.paymentMethod == "cash" {
                Button {
                    vm.parkCurrentPaymentIfNeeded()
                    vm.showingPayment = false
                } label: {
                    Image(systemName: "rectangle.compress.vertical")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.flatCircleNeutral)
            }

            Button {
                vm.resetPaymentState()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.flatCircleNeutral)
        }
    }

    /// Icono-only: menú de descuentos.
    private var discountCircleButton: some View {
        Menu {
            Button("Sin descuento") { vm.selectedDiscount = nil }
            ForEach(vm.availableDiscounts) { discount in
                Button {
                    if discount.type == "flexible" {
                        vm.selectedDiscount = discount
                        openSheet(.discount)
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
                .modifier(FlatCircle(isActive: vm.selectedDiscount != nil, color: .orange))
        }
    }

    /// Icono-only: menú de "Pago Completo" / dividir en tickets.
    private var moreOptionsMenuCompact: some View {
        Menu {
            if vm.guestCount > 1 {
                Button {
                    vm.currentPersonIndex = 0
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-bill-mode"
                    }
                } label: {
                    Label("Dividir en Tickets", systemImage: "person.2.fill")
                }
            }
        } label: {
            Image(systemName: "creditcard.and.numbers")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .modifier(FlatCircle())
        }
    }

    // MARK: - Hero total + método

    private var heroTotal: some View {
        VStack(spacing: 2) {
            Text("TOTAL")
                .font(.caption.weight(.bold))
                .foregroundColor(.gray)
                .tracking(1.4)
            Text(vm.formatCurrency(vm.totalWithTip))
                .font(.system(size: 52, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
                .contentTransition(.numericText())
                .animation(.snappy, value: vm.totalWithTip)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private var methodRow: some View {
        HStack(spacing: 10) {
            methodButton(method: "cash", icon: "banknote.fill", label: "Efectivo", color: Color(red: 0, green: 137/255, blue: 50/255))
            methodButton(method: "terminal_mercadopago", icon: "creditcard.fill", label: "Terminal", color: Color(red: 30/255, green: 110/255, blue: 244/255))
            methodButton(method: "transfer", icon: "building.columns.fill", label: "Transferencia", color: Color(red: 86/255, green: 74/255, blue: 222/255))
        }
    }

    @ViewBuilder
    private func methodButton(method: String, icon: String, label: String, color: Color) -> some View {
        let isSelected = vm.paymentMethod == method
        Button {
            Haptics.tap()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                vm.paymentMethod = method
            }
            if method != "cash" {
                vm.cashReceived = ""
            }
        } label: {
            VStack(spacing: 7) {
                Image(systemName: icon)
                    .font(.body)
                Text(label)
                    .font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 64)
            .scaleEffect(isSelected ? 1.03 : 1.0)
        }
        .buttonStyle(FlatCapsuleStyle(fill: isSelected ? color : FlatCapsuleStyle.neutralFill, bordered: !isSelected))
    }

    private var canProceed: Bool {
        if vm.paymentMethod == "cash" {
            return (Double(vm.cashReceived) ?? 0) >= vm.totalWithTip
        }
        return true
    }

    private var tipSummaryLabel: String {
        if vm.showCustomTip {
            let amt = Double(vm.customTip) ?? 0
            return amt > 0 ? vm.formatCurrency(amt) : "Personalizada"
        }
        return vm.tipPercentage == 0 ? "Sin propina" : "\(vm.tipPercentage)% · \(vm.formatCurrency(vm.tipAmount))"
    }

    private var tipRowPill: some View {
        Button {
            openSheet(.tip)
        } label: {
            HStack {
                HStack(spacing: 10) {
                    Image(systemName: "timer").foregroundStyle(.gray)
                    Text("Propina").foregroundStyle(.gray)
                }
                Spacer()
                Text(tipSummaryLabel).fontWeight(.semibold)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.gray)
            }
            .padding(.horizontal, 18)
            .frame(height: 54)
        }
        .buttonStyle(.flatCapsuleNeutral)
    }

    private var cashRowPill: some View {
        Button {
            openSheet(.cash)
        } label: {
            HStack {
                HStack(spacing: 10) {
                    Image(systemName: "banknote.fill").foregroundStyle(.gray)
                    Text("Efectivo recibido").foregroundStyle(.gray)
                }
                Spacer()
                if let cash = Double(vm.cashReceived), cash > 0 {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(vm.formatCurrency(cash)).fontWeight(.semibold)
                        Text("Cambio \(vm.formatCurrency(vm.changeAmount))")
                            .font(.caption2)
                            .foregroundStyle(vm.cashSufficient ? .green : .red)
                    }
                } else {
                    Text("Toca para ingresar").foregroundStyle(.gray)
                }
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.gray)
            }
            .padding(.horizontal, 18)
            .frame(height: 54)
        }
        .buttonStyle(.flatCapsuleNeutral)
    }

    private var cobrarButton: some View {
        Button {
            guard vm.paymentMethod != nil else { return }
            if vm.paymentMethod == "cash" && !canProceed { return }
            openSheet(.confirm)
        } label: {
            HStack(spacing: 8) {
                Text("Cobrar")
                Text(vm.formatCurrency(vm.totalWithTip))
                    .contentTransition(.numericText())
                    .animation(.snappy, value: vm.totalWithTip)
            }
            .font(.headline.weight(.bold))
            .frame(maxWidth: .infinity)
            .frame(height: 58)
        }
        .buttonStyle(.flatCapsule(.blue))
        .disabled(vm.paymentMethod == nil || (vm.paymentMethod == "cash" && !canProceed))
    }

    // MARK: - Sheets

    /// Envoltura común de las hojas del panel de pago — delega en el
    /// `BottomSheetCard` compartido (mismo look/arrastre en todo el POS).
    private func sheetCard<Content: View>(maxHeight: CGFloat? = nil, @ViewBuilder content: @escaping () -> Content) -> some View {
        BottomSheetCard(maxHeight: maxHeight, onDismiss: closeSheet, content: content)
    }

    private var tipSheet: some View {
        sheetCard {
            Text("Propina")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            HStack(spacing: 8) {
                ForEach([0, 10, 15, 20], id: \.self) { pct in
                    let isSelected = vm.tipPercentage == pct && !vm.showCustomTip
                    Button {
                        Haptics.tap()
                        vm.tipPercentage = pct
                        vm.customTip = ""
                        vm.showCustomTip = false
                    } label: {
                        Text(pct == 0 ? "Sin" : "\(pct)%")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                    }
                    .buttonStyle(FlatCapsuleStyle(fill: isSelected ? .blue : FlatCapsuleStyle.neutralFill, bordered: !isSelected))
                }
                Button {
                    Haptics.tap()
                    vm.showCustomTip = true
                } label: {
                    Text("Otro")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                }
                .buttonStyle(FlatCapsuleStyle(fill: vm.showCustomTip ? .blue : FlatCapsuleStyle.neutralFill, bordered: !vm.showCustomTip))
            }

            if vm.showCustomTip {
                HStack(spacing: 8) {
                    Text("$")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.gray)
                    TextField("0.00", text: $vm.customTip)
                        .keyboardType(.decimalPad)
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 18)
                .frame(height: 52)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.12)))
                )
            }

            if vm.paymentMethod != nil, vm.paymentMethod != "cash", vm.tipAmount > 0 {
                Text("¿Cómo se pagó la propina?")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                    .textCase(.uppercase)
                    .padding(.top, 4)
                HStack(spacing: 10) {
                    if vm.paymentMethod == "transfer" {
                        tipMethodCard(method: "transfer", label: "En transferencia", icon: "building.columns.fill", color: .purple)
                    } else {
                        tipMethodCard(method: vm.paymentMethod ?? "terminal_mercadopago", label: "En tarjeta", icon: "creditcard.fill", color: .blue)
                    }
                    tipMethodCard(method: "cash", label: "En efectivo", icon: "banknote.fill", color: .green)
                }
            }

            Button {
                closeSheet()
            } label: {
                Text("Listo")
                    .font(.headline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(.blue))
            .padding(.top, 6)
        }
    }

    @ViewBuilder
    private func tipMethodCard(method: String, label: String, icon: String, color: Color) -> some View {
        let isSelected = vm.tipPaymentMethod == method || (vm.tipPaymentMethod == nil && method == vm.paymentMethod)
        Button {
            Haptics.tap()
            vm.tipPaymentMethod = method
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                Text(label)
                    .font(.subheadline.weight(.medium))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
        }
        .buttonStyle(FlatCapsuleStyle(fill: isSelected ? color : FlatCapsuleStyle.neutralFill, bordered: !isSelected))
    }

    private var cashSheet: some View {
        sheetCard {
            Text("Efectivo recibido")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            TextField("0.00", text: $vm.cashReceived)
                .keyboardType(.decimalPad)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .frame(height: 64)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.05))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                )

            if let cash = Double(vm.cashReceived), cash > 0 {
                HStack {
                    Text("Cambio")
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.changeAmount))
                        .font(.title3.weight(.bold))
                        .foregroundColor(vm.cashSufficient ? .green : .red)
                }
                .padding(.horizontal, 20)
                .frame(height: 52)
                .background(
                    Capsule().fill((vm.cashSufficient ? Color.green : Color.red).opacity(0.14))
                )
            }

            Button {
                closeSheet()
            } label: {
                Text("Listo")
                    .font(.headline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(.blue))
            .padding(.top, 6)
        }
    }

    private var confirmSheet: some View {
        sheetCard {
            Text("Confirmar cobro")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            VStack(spacing: 0) {
                confirmRow("Subtotal", vm.formatCurrency(vm.cartSubtotalBeforeDiscounts))
                if vm.selectedDiscount != nil {
                    confirmRow(vm.selectedDiscount?.name ?? "Descuento", "-\(vm.formatCurrency(vm.flexibleDiscountAmount))", color: .yellow)
                }
                if vm.tipAmount > 0 {
                    confirmRow("Propina", vm.formatCurrency(vm.tipAmount), color: .blue)
                }
                if vm.paymentMethod == "cash", let cash = Double(vm.cashReceived), cash > 0 {
                    confirmRow("Efectivo recibido", vm.formatCurrency(cash))
                    confirmRow("Cambio", vm.formatCurrency(max(0, cash - vm.totalWithTip)), color: .green)
                }
                HStack {
                    Text("Total").font(.title3.weight(.semibold)).foregroundColor(.white)
                    Spacer()
                    Text(vm.formatCurrency(vm.totalWithTip)).font(.title2.weight(.bold)).foregroundColor(.white)
                }
                .padding(.top, 12)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
                }
            }

            loyaltyRow

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
                    activeSheet = nil
                    withAnimation(.easeInOut(duration: 0.3)) {
                        vm.paymentStep = "done"
                    }
                }
            }
            .disabled(vm.processing)
            .padding(.top, 4)
        }
    }

    private func confirmRow(_ label: String, _ value: String, color: Color = .gray) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundColor(color)
            Spacer()
            Text(value).font(.headline).foregroundColor(color == .gray ? .white : color)
        }
        .padding(.vertical, 5)
    }

    /// Descuento "flexible" (porcentaje o monto libre) — mismo sheet inferior
    /// que propina/efectivo/confirmar, en vez del diálogo centrado de antes.
    private var discountSheet: some View {
        sheetCard {
            Text("Descuento")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            HStack(spacing: 8) {
                Button {
                    Haptics.tap()
                    vm.flexibleDiscountType = "percentage"
                    vm.flexibleDiscountValue = 10
                } label: {
                    Text("Porcentaje")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                }
                .buttonStyle(FlatCapsuleStyle(fill: vm.flexibleDiscountType == "percentage" ? .orange : FlatCapsuleStyle.neutralFill, bordered: vm.flexibleDiscountType != "percentage"))

                Button {
                    Haptics.tap()
                    vm.flexibleDiscountType = "fixed"
                    vm.customFlexibleAmount = ""
                } label: {
                    Text("Monto Fijo")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                }
                .buttonStyle(FlatCapsuleStyle(fill: vm.flexibleDiscountType == "fixed" ? .orange : FlatCapsuleStyle.neutralFill, bordered: vm.flexibleDiscountType != "fixed"))
            }

            if vm.flexibleDiscountType == "percentage" {
                HStack(spacing: 8) {
                    ForEach([10, 20, 30, 50, 60], id: \.self) { pct in
                        let isSelected = vm.flexibleDiscountValue == Double(pct)
                        Button {
                            Haptics.tap()
                            vm.flexibleDiscountValue = Double(pct)
                        } label: {
                            Text("\(pct)%")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                        }
                        .buttonStyle(FlatCapsuleStyle(fill: isSelected ? .orange : FlatCapsuleStyle.neutralFill, bordered: !isSelected))
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Text("$")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.gray)
                    TextField("0.00", text: $vm.customFlexibleAmount)
                        .keyboardType(.decimalPad)
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 20)
                .frame(height: 56)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.05))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                )
            }

            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .foregroundColor(.orange)
                Text(vm.flexibleDiscountType == "percentage"
                     ? "Descuento del \(Int(vm.flexibleDiscountValue))% sobre el subtotal"
                     : "Descuento de $\(vm.customFlexibleAmount.isEmpty ? "0" : vm.customFlexibleAmount) en pesos")
                    .font(.caption)
                    .foregroundColor(.orange.opacity(0.85))
            }
            .padding(.horizontal, 18)
            .frame(height: 44)
            .modifier(FlatCardTinted(color: .orange))

            HStack(spacing: 10) {
                Button {
                    vm.selectedDiscount = nil
                    closeSheet()
                } label: {
                    Text("Quitar")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                }
                .buttonStyle(.flatCapsuleNeutral)

                Button {
                    closeSheet()
                } label: {
                    Text("Aplicar Descuento")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                }
                .buttonStyle(.flatCapsule(.orange))
            }
            .padding(.top, 6)
        }
    }

    // MARK: - Platform Delivery Payment

    private var platformDeliveryPayment: some View {
        VStack(spacing: 16) {
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
            .modifier(FlatCardTinted(color: .orange))

            Button {
                vm.handleDeliverToDriver()
            } label: {
                HStack(spacing: 8) {
                    if vm.processing {
                        ProgressView().tint(.white)
                    }
                    Image(systemName: "checkmark.circle.fill")
                    Text("Entregar a Repartidor")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
            }
            .buttonStyle(.flatCapsule(.orange))
            .disabled(vm.processing)
        }
    }

    // MARK: - Loyalty (dentro del sheet de confirmar)

    /// Fila única — abre un menú (sin tarjeta) o el modal de sellos/premio
    /// (con tarjeta ya leída), en vez del bloque grande de antes.
    @ViewBuilder
    private var loyaltyRow: some View {
        if let card = vm.loyaltyCard {
            Button {
                vm.showLoyaltyStampsDialog = true
            } label: {
                HStack {
                    HStack(spacing: 10) {
                        Image(systemName: "star.fill").foregroundStyle(.yellow)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(card.displayName).foregroundStyle(.white).fontWeight(.semibold)
                            Text("\(card.stamps)/\(card.stampsPerReward) sellos")
                                .font(.caption2)
                                .foregroundStyle(.gray)
                        }
                    }
                    Spacer()
                    if card.rewardsAvailable > 0 {
                        Text("Premio disponible")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.yellow)
                    }
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.gray)
                }
                .padding(.horizontal, 18)
                .frame(height: 54)
            }
            .buttonStyle(.flatCapsuleNeutral)
        } else {
            Menu {
                Button {
                    vm.qrDialogOpen = true
                } label: {
                    Label("Leer Pase", systemImage: "qrcode.viewfinder")
                }
                Button {
                    vm.showLoyaltyEmailDialog = true
                } label: {
                    Label("Añadir por Correo", systemImage: "envelope.fill")
                }
            } label: {
                HStack {
                    HStack(spacing: 10) {
                        Image(systemName: "star.fill").foregroundStyle(.yellow)
                        Text("Acumular Sellos Lealtad").foregroundStyle(.white)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.gray)
                }
                .padding(.horizontal, 18)
                .frame(height: 54)
            }
            .buttonStyle(.flatCapsuleNeutral)
        }
    }

    // MARK: - Split Tickets Confirm

    /// Vista previa de los tickets a crear a partir de vm.itemAssignments —
    /// al confirmar, cada asiento con items se vuelve una orden nueva
    /// independiente que se cobra después con el flujo normal de pago.
    private var splitTicketsConfirmView: some View {
        let ticketSeats = (0..<vm.guestCount).filter { !(vm.itemAssignments[$0] ?? [:]).isEmpty }

        func seatTotal(_ idx: Int) -> Double {
            (vm.itemAssignments[idx] ?? [:]).reduce(0.0) { sum, entry in
                let (ci, qty) = entry
                guard ci < vm.cart.count else { return sum }
                let item = vm.cart[ci]
                guard item.quantity > 0 else { return sum }
                let lineTotal = (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)
                return sum + (lineTotal / Double(item.quantity)) * Double(qty)
            }
        }

        return VStack(spacing: 0) {
            // Header
            HStack {
                Text("Confirmar Tickets")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = vm.splitBillType == "by-seat" ? "split-seat-assign" : "split-assign"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Editar")
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    Text("Se crearán \(ticketSeats.count) ticket\(ticketSeats.count == 1 ? "" : "s") separado\(ticketSeats.count == 1 ? "" : "s"). Cada uno se cobra por su cuenta, con el método de pago que elijas.")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    ForEach(ticketSeats, id: \.self) { idx in
                        let items = vm.itemAssignments[idx] ?? [:]
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Ticket · Asiento \(idx + 1)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)
                                Spacer()
                                Text(vm.formatCurrency(seatTotal(idx)))
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(.green)
                            }
                            ForEach(items.keys.sorted(), id: \.self) { ci in
                                if ci < vm.cart.count {
                                    HStack {
                                        Text("\(items[ci] ?? 0)x \(vm.cart[ci].productName)")
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                        Spacer()
                                    }
                                }
                            }
                        }
                        .padding(14)
                        .modifier(FlatCard())
                    }

                    // Slide to confirm
                    SlideToConfirmView {
                        vm.handleCreateSplitTickets()
                    }
                    .disabled(vm.confirmingOrder || ticketSeats.isEmpty)
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
            }
            .buttonStyle(.flatCapsule(.green))
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
    private let thumbSize: CGFloat = 54
    private let trackPadding: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            let maxOffset = max(0, geo.size.width - thumbSize - trackPadding * 2)

            ZStack(alignment: .leading) {
                // Track — plano, sin material glass encima del fill.
                RoundedRectangle(cornerRadius: 28)
                    .fill(Color.white.opacity(0.06))
                    .overlay(RoundedRectangle(cornerRadius: 28).stroke(Color.white.opacity(0.12), lineWidth: 1))

                // Label
                Text(confirmed ? "Confirmado" : "Desliza para confirmar →")
                    .font(.subheadline.bold())
                    .foregroundColor(confirmed ? .green : .gray)
                    .frame(maxWidth: .infinity)

                // Thumb
                Circle()
                    .fill(confirmed ? Color.green : Color.blue)
                    .frame(width: thumbSize, height: thumbSize)
                    .overlay(
                        Image(systemName: confirmed ? "checkmark" : "chevron.right.2")
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(.white)
                    )
                    .shadow(color: (confirmed ? Color.green : Color.blue).opacity(0.4), radius: 8, x: 0, y: 0)
                    .offset(x: trackPadding + offset)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                guard !disabled && !confirmed else { return }
                                offset = min(max(0, value.translation.width), maxOffset)
                            }
                            .onEnded { _ in
                                guard !disabled && !confirmed else { return }
                                if offset > maxOffset * 0.8 {
                                    withAnimation(.spring()) { offset = maxOffset }
                                    confirmed = true
                                    Haptics.success()
                                    onConfirm()
                                } else {
                                    withAnimation(.spring()) { offset = 0 }
                                    Haptics.tap()
                                }
                            }
                    )
            }
        }
        .frame(height: 62)
        .opacity(disabled ? 0.5 : 1)
    }
}

// MARK: - Animated Checkmark

private struct AnimatedCheckmark: View {
    @State private var showCheck = false
    @State private var pulse = false

    var body: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 44, weight: .bold))
            .foregroundColor(.green)
            .opacity(showCheck ? 1 : 0)
            .scaleEffect(showCheck ? (pulse ? 1.12 : 1.0) : 0.3)
            .animation(.spring(response: 0.5, dampingFraction: 0.6), value: showCheck)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: pulse)
            .task {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                showCheck = true
                Haptics.success()
                try? await Task.sleep(nanoseconds: 200_000_000)
                pulse = true
                try? await Task.sleep(nanoseconds: 180_000_000)
                pulse = false
            }
    }
}
