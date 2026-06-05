import Foundation

enum CartRenderElement: Identifiable {
    case promotionGroup(PromotionGroup, showCourseHeader: Bool, showSeatHeader: Bool)
    case item(Int, CartItem, showCourseHeader: Bool, showSeatHeader: Bool)
    
    var id: String {
        switch self {
        case .promotionGroup(let group, _, _):
            return "promo_\(group.promotionId)"
        case .item(let index, let item, _, _):
            return "item_\(index)_\(item.productId)_\(item.course)_\(item.seat)"
        }
    }
}
