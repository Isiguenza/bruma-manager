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
        var itemsBySeat: [String: [(index: Int, item: CartItem)]] = [:]
        for (index, item) in cartItems.enumerated() {
            let productKey = "\(item.productId)_\(item.unitPrice)_\(item.seat)"
            itemsByProduct[productKey, default: []].append((index, item))
            itemsBySeat[item.seat, default: []].append((index, item))
        }
        
        var updatedItems = cartItems
        
        // Track which combos have been applied per seat (only one combo per seat)
        var comboAppliedSeats: Set<String> = []
        
        for (_, items) in itemsByProduct {
            guard let firstItem = items.first else { continue }
            let realProductId = firstItem.item.productId
            let productCategoryId = productCategoryMap[realProductId] ?? nil
            let seat = firstItem.item.seat
            
            // Find applicable promotions (non-combo first)
            let nonComboPromos = promotions.filter { promo in
                if promo.type == "combo" { return false }
                if promo.applyTo == "all_products" { return true }
                if promo.applyTo == "specific_products" {
                    return promo.parsedProductIds.contains(realProductId)
                }
                if promo.applyTo == "category" {
                    return productCategoryId != nil && promo.categoryId == productCategoryId
                }
                return false
            }
            
            if let promo = nonComboPromos.sorted(by: { ($0.priority ?? 0) > ($1.priority ?? 0) }).first {
                let totalQty = items.reduce(0) { $0 + $1.item.quantity }
                switch promo.type {
                case "buy_x_get_y":
                    applyBuyXGetY(promo: promo, items: items, totalQty: totalQty, updatedItems: &updatedItems)
                case "percentage_discount":
                    applyPercentageDiscount(promo: promo, items: items, updatedItems: &updatedItems)
                case "fixed_discount":
                    applyFixedDiscount(promo: promo, items: items, updatedItems: &updatedItems)
                default:
                    break
                }
            }
            
            // Apply combo if not already applied to this seat
            if !comboAppliedSeats.contains(seat) {
                let seatItems = itemsBySeat[seat] ?? []
                let comboPromos = promotions.filter { $0.type == "combo" }
                if let combo = comboPromos.sorted(by: { ($0.priority ?? 0) > ($1.priority ?? 0) }).first {
                    applyCombo(promo: combo, items: seatItems, updatedItems: &updatedItems, productCategoryMap: productCategoryMap)
                    comboAppliedSeats.insert(seat)
                }
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
            
            let productIds = rule.allProductIds
            let categoryIds = rule.allCategoryIds
            
            if !productIds.isEmpty {
                // Rule requires specific product(s) — any of them (OR logic)
                // Filter by variant names if specified
                var allProductItems: [(index: Int, item: CartItem)] = []
                for pid in productIds {
                    if let itemsForProduct = qtyByProduct[pid] {
                        if let variantNames = rule.variantNames, !variantNames.isEmpty {
                            let filtered = itemsForProduct.filter { entry in
                                guard let itemVariant = entry.item.variantName else { return false }
                                return variantNames.contains(itemVariant)
                            }
                            allProductItems.append(contentsOf: filtered)
                        } else {
                            allProductItems.append(contentsOf: itemsForProduct)
                        }
                    }
                }
                guard !allProductItems.isEmpty else { return }
                
                var totalAvailable = allProductItems.reduce(0) { $0 + $1.item.quantity }
                for consumed in consumedItems {
                    if allProductItems.contains(where: { $0.index == consumed.index }) {
                        totalAvailable -= consumed.qty
                    }
                }
                guard totalAvailable >= remainingNeeded else { return }
                
                // Consume from cheapest first across all matching products
                let sorted = allProductItems.sorted { $0.item.unitPrice < $1.item.unitPrice }
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
            } else if !categoryIds.isEmpty {
                // Rule requires items from category(s) — any of them (OR logic)
                let categoryItems = items.filter { entry in
                    guard let catIdOpt = productCategoryMap[entry.item.productId],
                          let catId = catIdOpt else { return false }
                    return categoryIds.contains(catId)
                }
                guard !categoryItems.isEmpty else { return }
                
                var totalAvailable = categoryItems.reduce(0) { $0 + $1.item.quantity }
                for consumed in consumedItems {
                    if categoryItems.contains(where: { $0.index == consumed.index }) {
                        totalAvailable -= consumed.qty
                    }
                }
                guard totalAvailable >= remainingNeeded else { return }
                
                // Consume from cheapest first across all matching categories
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
