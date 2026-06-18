import Foundation

struct POSConfig: Codable {
    var deliveryEnabled: Bool
    var takeoutEnabled: Bool
    var disabledTableIds: [String]
    var customerDisplayEnabled: Bool
    var bankCLABE: String
    var bankName: String
    var bankBank: String

    enum CodingKeys: String, CodingKey {
        case deliveryEnabled
        case takeoutEnabled
        case disabledTableIds
        case customerDisplayEnabled
        case bankCLABE
        case bankName
        case bankBank
    }

    init(deliveryEnabled: Bool, takeoutEnabled: Bool, disabledTableIds: [String], customerDisplayEnabled: Bool, bankCLABE: String, bankName: String, bankBank: String) {
        self.deliveryEnabled = deliveryEnabled
        self.takeoutEnabled = takeoutEnabled
        self.disabledTableIds = disabledTableIds
        self.customerDisplayEnabled = customerDisplayEnabled
        self.bankCLABE = bankCLABE
        self.bankName = bankName
        self.bankBank = bankBank
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        deliveryEnabled = try container.decodeIfPresent(Bool.self, forKey: .deliveryEnabled) ?? true
        takeoutEnabled = try container.decodeIfPresent(Bool.self, forKey: .takeoutEnabled) ?? true
        disabledTableIds = try container.decodeIfPresent([String].self, forKey: .disabledTableIds) ?? []
        customerDisplayEnabled = try container.decodeIfPresent(Bool.self, forKey: .customerDisplayEnabled) ?? false
        bankCLABE = try container.decodeIfPresent(String.self, forKey: .bankCLABE) ?? ""
        bankName = try container.decodeIfPresent(String.self, forKey: .bankName) ?? ""
        bankBank = try container.decodeIfPresent(String.self, forKey: .bankBank) ?? ""
    }

    static let `default` = POSConfig(
        deliveryEnabled: true,
        takeoutEnabled: true,
        disabledTableIds: [],
        customerDisplayEnabled: false,
        bankCLABE: "",
        bankName: "",
        bankBank: ""
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
