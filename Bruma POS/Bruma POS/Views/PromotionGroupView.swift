import SwiftUI

struct PromotionGroup: Identifiable {
    let id: String
    let promotionId: String
    let name: String
    let type: String // "buy_x_get_y", "percentage_discount", "fixed_discount", "combo"
    let course: Int
    let seat: String
    let items: [(index: Int, item: CartItem)]
    let totalSavings: Double
}

struct PromotionGroupView: View {
    let group: PromotionGroup
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: promoIcon)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(promoColor)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(group.name)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                    
                    Text("Ahorras \(vm.formatCurrency(group.totalSavings))")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(.green)
                }
                
                Spacer()
                
                // Total del grupo (con descuento aplicado)
                let groupTotal = group.items.reduce(0) { $0 + ($1.item.unitPrice * Double($1.item.quantity)) } - group.totalSavings
                Text(vm.formatCurrency(groupTotal))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(promoColor.opacity(0.08))
            .cornerRadius(10, corners: [.topLeft, .topRight])
            
            // Items
            VStack(spacing: 6) {
                ForEach(Array(group.items.enumerated()), id: \.offset) { _, element in
                    CartItemRow(
                        item: element.item,
                        index: element.index,
                        vm: vm,
                        isInsidePromotionGroup: true
                    )
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.02))
            .cornerRadius(10, corners: [.bottomLeft, .bottomRight])
        }
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(promoColor.opacity(0.3), lineWidth: 1.5)
        )
        .cornerRadius(10)
        .contextMenu {
            // Quitar promo de todos los items
            Button {
                vm.removePromotionFromGroup(promotionId: group.promotionId)
            } label: {
                Label("Quitar promo", systemImage: "xmark.circle")
                    .foregroundColor(.red)
            }
            
            Divider()
            
            // Opciones por item
            ForEach(Array(group.items.enumerated()), id: \.offset) { _, element in
                Button {
                    vm.removeItemFromPromotion(at: element.index)
                } label: {
                    Label("Quitar '\(element.item.productName)' de promo", systemImage: "person.crop.circle.badge.xmark")
                }
            }
        }
    }
    
    private var promoColor: Color {
        switch group.type {
        case "buy_x_get_y": return .green
        case "percentage_discount": return .blue
        case "fixed_discount": return .orange
        case "combo": return .purple
        default: return .gray
        }
    }
    
    private var promoIcon: String {
        switch group.type {
        case "buy_x_get_y": return "2.square.fill"
        case "percentage_discount": return "percent"
        case "fixed_discount": return "tag.fill"
        case "combo": return "bag.fill"
        default: return "star.fill"
        }
    }
}

// MARK: - Corner Radius Helper

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}
