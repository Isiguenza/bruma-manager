import Foundation

/// Cache local de productos y categorías para funcionar sin internet
class OfflineDataStore {
    static let shared = OfflineDataStore()
    
    private let productsKey = "offline_products"
    private let categoriesKey = "offline_categories"
    private let lastSyncKey = "offline_last_sync"
    
    private init() {}
    
    // MARK: - Products
    
    func saveProducts(_ products: [Product]) {
        if let data = try? JSONEncoder().encode(products) {
            UserDefaults.standard.set(data, forKey: productsKey)
        }
    }
    
    func loadProducts() -> [Product] {
        guard let data = UserDefaults.standard.data(forKey: productsKey),
              let products = try? JSONDecoder().decode([Product].self, from: data) else {
            return []
        }
        return products
    }
    
    // MARK: - Categories
    
    func saveCategories(_ categories: [Category]) {
        if let data = try? JSONEncoder().encode(categories) {
            UserDefaults.standard.set(data, forKey: categoriesKey)
        }
    }
    
    func loadCategories() -> [Category] {
        guard let data = UserDefaults.standard.data(forKey: categoriesKey),
              let categories = try? JSONDecoder().decode([Category].self, from: data) else {
            return []
        }
        return categories
    }
    
    // MARK: - Last Sync
    
    func markSynced() {
        UserDefaults.standard.set(Date(), forKey: lastSyncKey)
    }
    
    func lastSyncDate() -> Date? {
        UserDefaults.standard.object(forKey: lastSyncKey) as? Date
    }
    
    var hasData: Bool {
        !loadProducts().isEmpty && !loadCategories().isEmpty
    }
}
