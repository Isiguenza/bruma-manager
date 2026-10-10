import SwiftUI

/// Respuesta al tocar, no al soltar.
private struct PackagePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

private struct StepperButton: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                Circle()
                    .fill(Color.white.opacity(0.06))
                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
    }
}

struct CartItemRow: View {
    let item: CartItem
    let index: Int
    @ObservedObject var vm: POSViewModel
    var isInsidePromotionGroup: Bool = false

/// Plegado del paquete. Vive en CartView (no en @State de este renglón)
    /// porque el LazyVStack recicla renglones al hacer scroll y lo olvidaría.
    var isCollapsed: Binding<Bool> = .constant(false)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isPackageChild: Bool { item.parentLocalId != nil }
    private var packageParentName: String? { vm.packageParentName(for: item) }
    /// Los incluidos de este platillo, en el orden del carrito.
    private var packageChildren: [CartItem] {
        isPackageChild ? [] : vm.cart.filter { $0.parentLocalId == item.id }
    }
    private var isPackage: Bool { !isPackageChild && (item.packageLabel != nil || !packageChildren.isEmpty) }

    // When inside a promotion group, show original price (discount is shown at group level)
    private var itemTotal: Double {
        isInsidePromotionGroup
            ? item.unitPrice * Double(item.quantity)
            : item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
    }

    var body: some View {
        Group {
            if isPackage {
                packageCard
            } else {
                VStack(alignment: .leading, spacing: isPackageChild ? 4 : 8) {
                    titleRow
                    modifierLines(for: item)
                    noteLine(for: item)
                    footerRow
                }
                .padding(isPackageChild ? 8 : 12)
                .background(backgroundColor)
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(borderColor, lineWidth: 1))
            }
        }
        .contextMenu {
            if isPackageChild {
                Text("Componente del paquete")
                    .foregroundColor(.gray)
            } else if item.sentToKitchen {
                Text("Item ya enviado a cocina")
                    .foregroundColor(.gray)
            } else if isInsidePromotionGroup {
                Button {
                    vm.togglePromoExclusion(for: item)
                } label: {
                    Label("Quitar de promoción", systemImage: "person.crop.circle.badge.xmark")
                }
            } else {
                // Item previously opted out of promos — offer to re-enable.
                if vm.isPromoExcluded(item) {
                    Button {
                        vm.togglePromoExclusion(for: item)
                    } label: {
                        Label("Aplicar promoción", systemImage: "tag.fill")
                    }
                    Divider()
                }
                // Change seat submenu
                if vm.selectedTable != nil && vm.guestCount > 0 {
                    Menu {
                        ForEach(1...vm.guestCount, id: \.self) { seatNum in
                            Button {
                                vm.changeSeat(at: index, to: "A\(seatNum)")
                            } label: {
                                HStack {
                                    Text("Asiento A\(seatNum)")
                                    if item.seat == "A\(seatNum)" {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                        Button {
                            vm.changeSeat(at: index, to: "C")
                        } label: {
                            HStack {
                                Text("Centro (compartido)")
                                if item.seat == "C" {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    } label: {
                        Label("Cambiar Asiento", systemImage: "person.fill")
                    }
                }
                
                // Change course submenu
                Menu {
                    ForEach(1...5, id: \.self) { courseNum in
                        Button {
                            vm.changeCourse(at: index, to: courseNum)
                        } label: {
                            HStack {
                                Text("Tiempo \(courseNum)")
                                if item.course == courseNum {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Label("Cambiar Tiempo", systemImage: "clock.fill")
                }
                
                Divider()
                
                Button(role: .destructive) {
                    vm.removeFromCart(at: index)
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            }
        }
    }
    
    // MARK: - Pieces

    @ViewBuilder
    private var titleRow: some View {
        // Row 1: Product name + badges + price + trash
        HStack(alignment: .top, spacing: 8) {
            if !isPackageChild {
                Text("\(item.quantity)×")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.gray)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(item.productName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)

                if isPackageChild {
                    Label(packageParentName.map { "Paquete: \($0)" } ?? "Componente del paquete", systemImage: "arrow.turn.down.right")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(.gray)
                }
                
                // Promotion badge
                if let promoName = item.promotionName {
                    HStack(spacing: 4) {
                        promoBadge
                        Text(promoName)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(promoColor)
                    }
                }
            }
            
            Spacer()
            
            // Price per unit
            if !isInsidePromotionGroup && !isPackageChild {
                if item.isGuest {
                    Text(vm.formatCurrency(0) + " c/u")
                        .font(.caption2)
                        .foregroundColor(.gray)
                } else {
                    Text(vm.formatCurrency(item.unitPrice) + " c/u")
                        .font(.caption2)
                        .foregroundColor(Color(white: 0.4))
                }
            }
        }
    }

    @ViewBuilder
    private func modifierLines(for item: CartItem) -> some View {
        // Modifiers
        if let f = item.frostingName {
            HStack(spacing: 4) {
                Text("↳").foregroundColor(.gray)
                Text(f)
            }.font(.caption2).foregroundColor(Color(white: 0.55))
        }
        if let t = item.dryToppingName {
            HStack(spacing: 4) {
                Text("↳").foregroundColor(.gray)
                Text(t)
            }.font(.caption2).foregroundColor(Color(white: 0.55))
        }
        if let e = item.extraName {
            HStack(spacing: 4) {
                Text("↳").foregroundColor(.gray)
                Text(e)
            }.font(.caption2).foregroundColor(Color(white: 0.55))
        }
        
        // Custom modifiers
        if let cm = item.customModifiers,
           let data = cm.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            ForEach(Array(json.keys.sorted()), id: \.self) { key in
                if let stepDict = json[key] as? [String: Any],
                   let options = stepDict["options"] as? [[String: Any]] {
                    ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                        if let name = opt["name"] as? String {
                            HStack(spacing: 4) {
                                Text("↳").foregroundColor(.gray)
                                Text(name)
                                let price = (opt["price"] as? String).flatMap(Double.init) ?? (opt["price"] as? Double) ?? 0
                                if price != 0 {
                                    Text("+\(vm.formatCurrency(price))")
                                        .foregroundColor(.orange.opacity(0.9))
                                }
                            }.font(.caption2).foregroundColor(Color(white: 0.55))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func noteLine(for item: CartItem) -> some View {
        if !item.notes.isEmpty {
            HStack(alignment: .top, spacing: 4) {
                Text("↳")
                    .font(.caption2)
                    .foregroundColor(.orange.opacity(0.8))
                Text(item.notes)
                    .italic()
                    .font(.caption2)
                    .foregroundColor(.orange.opacity(0.9))
            }
        }
    }

    @ViewBuilder
    private var footerRow: some View {
        // Status + price for sent items
        if item.sentToKitchen && !isPackageChild {
            HStack(spacing: 8) {
                if item.deliveredToTable {
                    Label("Entregado", systemImage: "checkmark.circle.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.blue)
                } else if item.orderStatus == "ready" {
                    Label("Listo", systemImage: "checkmark.circle.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.green)
                } else {
                    Label("En cocina", systemImage: "frying.pan")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.orange)
                }
                
                Spacer()
                
                if item.isGuest {
                    Text(vm.formatCurrency(0))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.gray)
                        .strikethrough()
                } else {
                    Text(vm.formatCurrency(itemTotal))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(priceColor)
                }
            }
        }

        // Quantity controls + price for unsent items
        if !item.sentToKitchen && !isPackageChild {
            HStack(spacing: 8) {
                Button {
                    vm.updateCartQuantity(at: index, delta: -1)
                } label: {
                    Image(systemName: item.quantity <= 1 ? "trash" : "minus")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                }
                .modifier(StepperButton())
                
                Text("\(item.quantity)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .frame(minWidth: 24)
                
                Button {
                    vm.updateCartQuantity(at: index, delta: 1)
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                }
                .modifier(StepperButton())
                
                Spacer()
                
                // Price total aligned with controls
                VStack(alignment: .trailing, spacing: 2) {
                    if item.isGuest {
                        Text(vm.formatCurrency(itemTotal))
                            .font(.caption2)
                            .foregroundColor(Color(white: 0.4))
                            .strikethrough()
                        Text(vm.formatCurrency(0))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.gray)
                    } else if !isInsidePromotionGroup, let origPrice = item.originalPrice, (item.promotionDiscount ?? 0) > 0 {
                        Text(vm.formatCurrency(origPrice * Double(item.quantity)))
                            .font(.caption2)
                            .foregroundColor(Color(white: 0.4))
                            .strikethrough()
                        Text(vm.formatCurrency(itemTotal))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(priceColor)
                    } else {
                        Text(vm.formatCurrency(itemTotal))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(priceColor)
                    }
                }
            }
        }
    }

    // MARK: - Paquete: una sola tarjeta

    /// Un paquete es UN platillo con cosas adentro: lo que se cobra arriba, lo
    /// que incluye en un pozo hundido, y la cantidad y el precio cerrando al pie.
    /// CartView ya no pinta a los hijos como renglones aparte.
    private var packageCard: some View {
        let children = packageChildren
        let collapsed = isCollapsed.wrappedValue && !children.isEmpty
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 20, height: 20)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.blue)
                    )
                Text(item.packageLabel ?? "Paquete")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if !children.isEmpty {
                    Button {
                        Haptics.tap()
                        // No lo lanza un gesto, así que se asienta sin rebote.
                        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.36, dampingFraction: 1)) {
                            isCollapsed.wrappedValue.toggle()
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text(children.count == 1 ? "1 incluido" : "\(children.count) incluidos")
                                .monospacedDigit()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                                .rotationEffect(.degrees(collapsed ? -90 : 0))
                        }
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Color(white: 0.62))
                        .padding(.leading, 10)
                        .padding(.trailing, 8)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.white.opacity(0.07)))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(PackagePressStyle())
                    .accessibilityLabel(collapsed ? "Mostrar incluidos" : "Ocultar incluidos")
                }
            }
            .padding(.leading, 12)
            .padding(.trailing, 10)
            .padding(.top, 10)

            VStack(alignment: .leading, spacing: 6) {
                titleRow
                modifierLines(for: item)
                noteLine(for: item)
                if collapsed {
                    // Plegada sigue diciendo qué trae, en una línea.
                    Text(children.map(\.productName).joined(separator: " · "))
                        .font(.caption2)
                        .foregroundColor(Color(white: 0.6))
                        .lineLimit(1)
                        // Entra tarde y sale pronto: nunca convive con la lista a medio cerrar.
                        .transition(.asymmetric(
                            insertion: .opacity.animation(.easeOut(duration: 0.18).delay(0.12)),
                            removal: .opacity.animation(.easeOut(duration: 0.08))
                        ))
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 12)

            if !children.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(children.enumerated()), id: \.element.id) { position, child in
                        if position > 0 {
                            Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                        }
                        includedRow(child)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.black.opacity(0.3)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.04), lineWidth: 1))
                .padding(.horizontal, 8)
                .padding(.bottom, 10)
                // Se cierra como una persiana: el pozo se queda quieto y la tarjeta lo
                // va tapando desde abajo. Antes se insertaba/quitaba con un `move`, y
                // los incluidos subían encimándose al nombre del platillo.
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: collapsed ? 0 : nil, alignment: .top)
                .clipped()
                .opacity(collapsed ? 0 : 1)
                .allowsHitTesting(!collapsed)
                .accessibilityHidden(collapsed)
            }

            footerRow
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.02))
                .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1) }
        }
        .background(Color(red: 0.09, green: 0.09, blue: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(Color.blue.opacity(0.45), lineWidth: 1)
        )
    }

    private func includedRow(_ child: CartItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: child.isBeverage ? "cup.and.saucer.fill" : "fork.knife")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(white: 0.8))
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.07)))
            VStack(alignment: .leading, spacing: 2) {
                Text(child.productName)
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
                modifierLines(for: child)
                noteLine(for: child)
            }
            .frame(minHeight: 26, alignment: .center)
            Spacer(minLength: 6)
            includedStatus(child)
                .frame(height: 26)
        }
        .padding(.vertical, 9)
    }

    /// Cada componente se marca por separado en el Pase, así que su estado es propio.
    @ViewBuilder
    private func includedStatus(_ child: CartItem) -> some View {
        if child.sentToKitchen && child.deliveredToTable {
            Image(systemName: "checkmark.circle.fill").font(.caption).foregroundColor(.blue)
                .accessibilityLabel("Entregado")
        } else if child.sentToKitchen && child.orderStatus == "ready" {
            Image(systemName: "checkmark.circle.fill").font(.caption).foregroundColor(.green)
                .accessibilityLabel("Listo")
        } else {
            Text("Incluido").font(.caption2).foregroundColor(Color(white: 0.38))
        }
    }

    // MARK: - Helpers
    
    private var promoBadge: some View {
        let text: String
        let color: Color
        
        if item.unitPrice == 0 {
            text = "GRATIS"
            color = .green
        } else if let discount = item.promotionDiscount, discount > 0 {
            text = "PROMO"
            color = .blue
        } else {
            text = "PROMO"
            color = .orange
        }
        
        return Text(text)
            .font(.caption2.weight(.bold))
            .foregroundColor(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .cornerRadius(4)
    }
    
    private var promoColor: Color {
        if item.unitPrice == 0 {
            return .green
        } else if let discount = item.promotionDiscount, discount > 0 {
            return .blue
        }
        return .orange
    }
    
    private var priceColor: Color {
        if item.isGuest {
            return .gray
        }
        if item.unitPrice == 0 {
            return .green
        }
        return .white
    }
    
    private var backgroundColor: Color {
        // Un hijo solo se pinta como renglón propio si quedó huérfano de su padre.
        if isPackageChild {
            return Color.white.opacity(0.02)
        }
        if isInsidePromotionGroup {
            return Color.white.opacity(0.02)
        }
        return Color.white.opacity(0.04)
    }
    
    private var borderColor: Color {
        if isInsidePromotionGroup {
            return Color.clear
        }
        return Color.white.opacity(0.08)
    }
}
