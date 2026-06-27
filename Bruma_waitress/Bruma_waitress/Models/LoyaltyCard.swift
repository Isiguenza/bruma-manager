import Foundation

struct LoyaltyCard: Codable, Identifiable {
    let id: String
    let customerName: String
    let customerLastName: String?
    let customerEmail: String?
    let customerPhone: String?
    let stamps: Int
    let stampsPerReward: Int
    let totalStamps: Int
    let rewardsAvailable: Int
    let rewardsRedeemed: Int
    let barcodeValue: String?
    let active: Bool

    var fullName: String {
        [customerName, customerLastName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}
