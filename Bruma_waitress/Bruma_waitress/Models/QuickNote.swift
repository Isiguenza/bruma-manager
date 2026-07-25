import Foundation

struct QuickNote: Codable, Identifiable {
    let id: String
    let label: String
    let productIds: String? // JSON string of product ID array; nil/empty = applies to all products
    let sortOrder: Int
    let active: Bool

    var parsedProductIds: [String] {
        guard let productIds = productIds,
              let data = productIds.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }

    func applies(toProductId productId: String?) -> Bool {
        let scoped = parsedProductIds
        if scoped.isEmpty { return true }
        guard let productId = productId else { return false }
        return scoped.contains(productId)
    }
}
