import Foundation

class PromotionEngine {
    
    static func applyPromotions(cartItems: [CartItem], promotions: [Promotion]) -> [CartItem] {
        if promotions.isEmpty { return cartItems }
        
        // Group items by product + price + seat so promos are evaluated independently per seat
        var itemsByProduct: [String: [(index: Int, item: CartItem)]] = [:]
        for (index, item) in cartItems.enumerated() {
            let key = "\(item.productId)_\(item.unitPrice)_\(item.seat)"
            itemsByProduct[key, default: []].append((index, item))
        }
        
        var updatedItems = cartItems
        
        for (_, items) in itemsByProduct {
            guard let firstItem = items.first else { continue }
            let realProductId = firstItem.item.productId
            
            // Find applicable promotions
            let applicablePromos = promotions.filter { promo in
                if promo.applyTo == "all_products" { return true }
                if promo.applyTo == "specific_products" {
                    return promo.parsedProductIds.contains(realProductId)
                }
                return false
            }
            
            guard let promo = applicablePromos.sorted(by: { ($0.priority ?? 0) > ($1.priority ?? 0) }).first else { continue }
            
            let totalQty = items.reduce(0) { $0 + $1.item.quantity }
            
            if promo.type == "buy_x_get_y" {
                let buyQty = promo.buyQuantity ?? 2
                let getQty = promo.getQuantity ?? 1
                
                if totalQty >= buyQty {
                    let completeSets = totalQty / buyQty
                    let freeItems = min(completeSets * getQty, totalQty)
                    
                    if freeItems > 0 {
                        let sortedItems = items.sorted { $0.item.unitPrice < $1.item.unitPrice }
                        var remainingFree = freeItems
                        
                        for entry in sortedItems {
                            if remainingFree > 0 {
                                let freeQty = min(entry.item.quantity, remainingFree)
                                let discountPerItem = entry.item.unitPrice
                                let totalDiscount = discountPerItem * Double(freeQty)
                                
                                var updated = updatedItems[entry.index]
                                updated.promotionId = promo.id
                                updated.promotionName = promo.name
                                updated.originalPrice = entry.item.unitPrice
                                updated.promotionDiscount = totalDiscount
                                if entry.item.quantity == freeQty {
                                    updated.unitPrice = 0
                                }
                                updatedItems[entry.index] = updated
                                
                                remainingFree -= freeQty
                            }
                        }
                    }
                }
            } else if promo.type == "percentage_discount" {
                let discountPercent = promo.discountPercentage ?? 0
                
                for entry in items {
                    let discountAmount = (entry.item.unitPrice * discountPercent) / 100
                    let newPrice = entry.item.unitPrice - discountAmount
                    
                    var updated = updatedItems[entry.index]
                    updated.promotionId = promo.id
                    updated.promotionName = promo.name
                    updated.originalPrice = entry.item.unitPrice
                    updated.promotionDiscount = discountAmount * Double(entry.item.quantity)
                    updated.unitPrice = newPrice
                    updatedItems[entry.index] = updated
                }
            } else if promo.type == "fixed_discount" {
                let discountAmt = promo.discountAmount ?? 0
                
                for entry in items {
                    let newPrice = max(0, entry.item.unitPrice - discountAmt)
                    let actualDiscount = entry.item.unitPrice - newPrice
                    
                    var updated = updatedItems[entry.index]
                    updated.promotionId = promo.id
                    updated.promotionName = promo.name
                    updated.originalPrice = entry.item.unitPrice
                    updated.promotionDiscount = actualDiscount * Double(entry.item.quantity)
                    updated.unitPrice = newPrice
                    updatedItems[entry.index] = updated
                }
            }
        }
        
        return updatedItems
    }
    
    static func calculateDiscount(subtotal: Double, discountType: String, discountValue: Double) -> Double {
        switch discountType {
        case "percentage":
            return (subtotal * discountValue) / 100
        case "fixed_amount":
            return min(discountValue, subtotal)
        default: // flexible
            return min(discountValue, subtotal)
        }
    }
}
