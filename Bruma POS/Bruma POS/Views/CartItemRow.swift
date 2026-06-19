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

struct CartItemRow: View {
    let item: CartItem
    let index: Int
    @ObservedObject var vm: POSViewModel
    var isInsidePromotionGroup: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Row 1: Product name + badges + price + trash
            HStack(alignment: .top, spacing: 8) {
                Text("\(item.quantity)×")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.gray)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.productName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    
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
                if !isInsidePromotionGroup {
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
            if item.sentToKitchen {
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
            if !item.sentToKitchen {
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
        .padding(12)
        .background(backgroundColor)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(borderColor, lineWidth: 1))
        .contextMenu {
            if item.sentToKitchen {
                Text("Item ya enviado a cocina")
                    .foregroundColor(.gray)
            } else if isInsidePromotionGroup {
                Button {
                    vm.removeItemFromPromotion(at: index)
                } label: {
                    Label("Quitar de promoción", systemImage: "person.crop.circle.badge.xmark")
                }
            } else {
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
