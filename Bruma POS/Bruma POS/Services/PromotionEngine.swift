import Foundation

class PromotionEngine {
    
    static func applyPromotions(
        cartItems: [CartItem],
        promotions: [Promotion],
        productCategoryMap: [String: String?] = [:]
    ) -> [CartItem] {
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
            let productCategoryId = productCategoryMap[realProductId] ?? nil
            
            // Find applicable promotions
            let applicablePromos = promotions.filter { promo in
                if promo.applyTo == "all_products" { return true }
                if promo.applyTo == "specific_products" {
                    return promo.parsedProductIds.contains(realProductId)
                }
                if promo.applyTo == "category" {
                    return productCategoryId != nil && promo.categoryId == productCategoryId
                }
                return false
            }
            
            guard let promo = applicablePromos.sorted(by: { ($0.priority ?? 0) > ($1.priority ?? 0) }).first else { continue }
            
            let totalQty = items.reduce(0) { $0 + $1.item.quantity }
            
            switch promo.type {
            case "buy_x_get_y":
                applyBuyXGetY(promo: promo, items: items, totalQty: totalQty, updatedItems: &updatedItems)
            case "percentage_discount":
                applyPercentageDiscount(promo: promo, items: items, updatedItems: &updatedItems)
            case "fixed_discount":
                applyFixedDiscount(promo: promo, items: items, updatedItems: &updatedItems)
            case "combo":
                applyCombo(promo: promo, items: items, totalQty: totalQty, updatedItems: &updatedItems, productCategoryMap: productCategoryMap)
            default:
                break
            }
        }
        
        return updatedItems
    }
    
    // MARK: - Individual Promo Types
    
    private static func applyBuyXGetY(
        promo: Promotion,
        items: [(index: Int, item: CartItem)],
        totalQty: Int,
        updatedItems: inout [CartItem]
    ) {
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
    }
    
    private static func applyPercentageDiscount(
        promo: Promotion,
        items: [(index: Int, item: CartItem)],
        updatedItems: inout [CartItem]
    ) {
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
    }
    
    private static func applyFixedDiscount(
        promo: Promotion,
        items: [(index: Int, item: CartItem)],
        updatedItems: inout [CartItem]
    ) {
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
    
    private static func applyCombo(
        promo: Promotion,
        items: [(index: Int, item: CartItem)],
        totalQty: Int,
        updatedItems: inout [CartItem],
        productCategoryMap: [String: String?]
    ) {
        let rules = promo.parsedComboRules
        guard rules.count >= 2 else { return }
        
        let discountPercent = promo.discountPercentage ?? 0
        let discountAmt = promo.discountAmount ?? 0
        guard discountPercent > 0 || discountAmt > 0 else { return }
        
        // Group all eligible items by productId for rule matching
        var qtyByProduct: [String: [(index: Int, item: CartItem)]] = [:]
        for entry in items {
            qtyByProduct[entry.item.productId, default: []].append(entry)
        }
        
        // Track items consumed by each rule
        var consumedItems: [(index: Int, qty: Int)] = []
        
        for rule in rules {
            let neededQty = rule.quantity
            var remainingNeeded = neededQty
            
            if let productId = rule.productId {
                // Rule requires specific product
                guard let productItems = qtyByProduct[productId] else { return }
                var totalAvailable = productItems.reduce(0) { $0 + $1.item.quantity }
                // Subtract already consumed from this product
                for consumed in consumedItems {
                    if productItems.contains(where: { $0.index == consumed.index }) {
                        totalAvailable -= consumed.qty
                    }
                }
                guard totalAvailable >= remainingNeeded else { return }
                
                // Consume from cheapest first
                let sorted = productItems.sorted { $0.item.unitPrice < $1.item.unitPrice }
                for entry in sorted {
                    if remainingNeeded <= 0 { break }
                    let alreadyConsumed = consumedItems.filter { $0.index == entry.index }.reduce(0) { $0 + $1.qty }
                    let available = entry.item.quantity - alreadyConsumed
                    let take = min(available, remainingNeeded)
                    if take > 0 {
                        consumedItems.append((index: entry.index, qty: take))
                        remainingNeeded -= take
                    }
                }
            } else if let categoryId = rule.categoryId {
                // Rule requires items from a category
                let categoryItems = items.filter { productCategoryMap[$0.item.productId] == categoryId }
                var totalAvailable = categoryItems.reduce(0) { $0 + $1.item.quantity }
                for consumed in consumedItems {
                    if categoryItems.contains(where: { $0.index == consumed.index }) {
                        totalAvailable -= consumed.qty
                    }
                }
                guard totalAvailable >= remainingNeeded else { return }
                
                let sorted = categoryItems.sorted { $0.item.unitPrice < $1.item.unitPrice }
                for entry in sorted {
                    if remainingNeeded <= 0 { break }
                    let alreadyConsumed = consumedItems.filter { $0.index == entry.index }.reduce(0) { $0 + $1.qty }
                    let available = entry.item.quantity - alreadyConsumed
                    let take = min(available, remainingNeeded)
                    if take > 0 {
                        consumedItems.append((index: entry.index, qty: take))
                        remainingNeeded -= take
                    }
                }
            }
        }
        
        // All rules satisfied — apply discount to consumed items (cheapest first)
        let sortedConsumed = consumedItems.sorted { updatedItems[$0.index].unitPrice < updatedItems[$1.index].unitPrice }
        
        for (index, qty) in sortedConsumed {
            var updated = updatedItems[index]
            let originalPrice = updated.unitPrice
            
            if discountPercent > 0 {
                let discountPerItem = (originalPrice * discountPercent) / 100
                let newPrice = originalPrice - discountPerItem
                updated.promotionDiscount = discountPerItem * Double(qty)
                updated.unitPrice = newPrice
            } else if discountAmt > 0 {
                let newPrice = max(0, originalPrice - discountAmt)
                let actualDiscount = originalPrice - newPrice
                updated.promotionDiscount = actualDiscount * Double(qty)
                updated.unitPrice = newPrice
            }
            
            updated.promotionId = promo.id
            updated.promotionName = promo.name
            updated.originalPrice = originalPrice
            updatedItems[index] = updated
        }
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
