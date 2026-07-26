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

    /// - `scoped` entries are either a bare `productId` (applies to the whole product /
    ///   all its variants) or `"\(productId)::\(variantName)"` (applies only to that variant).
    func applies(toProductId productId: String?, variantName: String? = nil) -> Bool {
        let scoped = parsedProductIds
        if scoped.isEmpty { return true }
        guard let productId = productId else { return false }
        if scoped.contains(productId) { return true }
        if let variantName = variantName, scoped.contains("\(productId)::\(variantName)") { return true }
        return false
    }
}
