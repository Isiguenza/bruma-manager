import Foundation

struct POSConfig: Codable {
    var deliveryEnabled: Bool
    var takeoutEnabled: Bool
    var disabledTableIds: [String]
    
    static let `default` = POSConfig(
        deliveryEnabled: true,
        takeoutEnabled: true,
        disabledTableIds: []
    )
    
    static private let key = "pos_config"
    
    static func load() -> POSConfig {
        guard let data = UserDefaults.standard.data(forKey: key),
              let config = try? JSONDecoder().decode(POSConfig.self, from: data) else {
            return .default
        }
        return config
    }
    
    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: POSConfig.key)
        }
    }
}
