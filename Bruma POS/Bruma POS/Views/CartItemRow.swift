import SwiftUI

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

/// Rama que baja del platillo padre y dobla hacia cada hijo del paquete.
/// Sube `reach` puntos por encima del renglón para cruzar el espacio entre
/// tarjetas, y si no es el último hijo sigue de largo hacia el siguiente.
private struct PackageConnector: Shape {
    let isLast: Bool
    let reach: CGFloat
    /// Hasta dónde llega el brazo horizontal: justo antes del borde de la tarjeta hija.
    let endX: CGFloat

    func path(in rect: CGRect) -> Path {
        let x: CGFloat = 13
        let radius: CGFloat = 8
        let midY = rect.midY
        var path = Path()
        path.move(to: CGPoint(x: x, y: -reach))
        path.addLine(to: CGPoint(x: x, y: midY - radius))
        path.addQuadCurve(to: CGPoint(x: x + radius, y: midY), control: CGPoint(x: x, y: midY))
        path.addLine(to: CGPoint(x: endX, y: midY))
        if !isLast {
            path.move(to: CGPoint(x: x, y: midY - radius))
            path.addLine(to: CGPoint(x: x, y: rect.maxY))
        }
        return path
    }
}

struct CartItemRow: View {
    /// Azul sólido: el naranja ya significa "pendiente de enviar" en este carrito.
    private static let packageColor = Color.blue
    /// Gris sólido (sin transparencia): la rama une, el color lo pone la tarjeta.
    private static let connectorColor = Color(white: 0.42)
    private static let packageHeaderHeight: CGFloat = 30
    /// Ancho del canal donde corre la rama, a la izquierda de cada hijo.
    private static let packageIndent: CGFloat = 30
    /// Igual al `spacing` del LazyVStack del carrito (CartView).
    private static let rowSpacing: CGFloat = 8

    let item: CartItem
    let index: Int
    @ObservedObject var vm: POSViewModel
    var isInsidePromotionGroup: Bool = false

    private var isPackageChild: Bool { item.parentLocalId != nil }
    /// Solo el padre del paquete lleva franja; un hijo nunca.
    private var packageHeaderLabel: String? { isPackageChild ? nil : item.packageLabel }
    private var packageParentName: String? { vm.packageParentName(for: item) }

    /// Dónde cae este hijo dentro de su paquete. La línea conectora solo tiene
    /// sentido si arriba está su padre o un hermano; si el carrito los separó,
    /// se cae al texto "Paquete: …".
    private var packageLink: (attached: Bool, isLast: Bool) {
        // No se mira la vecindad en `vm.cart`: al reabrir una orden vienen todos los
        // padres y luego todos los hijos. `cartRenderElements` es quien pinta a
        // cada hijo justo debajo de su padre, en este mismo orden de hermanos.
        guard let parentId = item.parentLocalId, vm.cart.contains(where: { $0.id == parentId }) else { return (false, true) }
        let lastSibling = vm.cart.last(where: { $0.parentLocalId == parentId })
        return (true, lastSibling?.id == item.id)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: isPackageChild ? 4 : 8) {
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

                    if isPackageChild && !packageLink.attached {
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
            
            // Notes
            if !item.notes.isEmpty {
                HStack(spacing: 4) {
                    Text("↳")
                        .font(.caption2)
                        .foregroundColor(.orange.opacity(0.8))
                    Text(item.notes)
                        .italic()
                        .font(.caption2)
                        .foregroundColor(.orange.opacity(0.9))
                }
            }
            
            // When inside a promotion group, show original price (discount is shown at group level)
            let itemTotal = isInsidePromotionGroup
                ? item.unitPrice * Double(item.quantity)
                : item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
            
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
                        Image(systemName: "minus")
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
        .padding(isPackageChild ? 8 : 12)
        // Mismo patrón que la tarjeta de promoción: franja de color arriba con el nombre.
        .padding(.top, packageHeaderLabel == nil ? 0 : Self.packageHeaderHeight)
        .background(backgroundColor)
        .overlay(alignment: .top) {
            if let packageHeaderLabel {
                HStack(spacing: 6) {
                    Image(systemName: "shippingbox.fill")
                    Text(packageHeaderLabel)
                    Spacer()
                }
                .font(.caption.weight(.semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .frame(height: Self.packageHeaderHeight)
                .background(Self.packageColor.opacity(0.28))
            }
        }
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(borderColor, lineWidth: packageHeaderLabel == nil ? 1 : 1.5))
        // La sangría va DESPUÉS del fondo: la tarjeta del hijo arranca donde termina
        // la rama, no debajo de ella.
        .padding(.leading, isPackageChild ? Self.packageIndent : 0)
        .overlay {
            if isPackageChild && packageLink.attached {
                PackageConnector(isLast: packageLink.isLast, reach: Self.rowSpacing, endX: Self.packageIndent - 3)
                    .stroke(Self.connectorColor, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .allowsHitTesting(false)
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
        // El paquete se lee por la línea que une al padre con sus hijos, no por
        // pintar todo de naranja: el hijo queda como un renglón más ligero.
        if isPackageChild {
            return Color.white.opacity(0.02)
        }
        if isInsidePromotionGroup {
            return Color.white.opacity(0.02)
        }
        return Color.white.opacity(0.04)
    }
    
    private var borderColor: Color {
        if isPackageChild {
            return Self.packageColor.opacity(0.3)
        }
        if item.packageLabel != nil {
            return Self.packageColor.opacity(0.5)
        }
        if isInsidePromotionGroup {
            return Color.clear
        }
        return Color.white.opacity(0.08)
    }
}
