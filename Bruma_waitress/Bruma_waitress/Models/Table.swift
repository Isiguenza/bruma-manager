import Foundation

struct Table: Codable, Identifiable {
    let id: String
    let number: String
    let name: String?
    let capacity: Int
    let status: String // "available", "occupied", "reserved"
    let active: Bool
    let activeOrder: ActiveOrder?
    
    var isAvailable: Bool { status == "available" }
    var isOccupied: Bool { status == "occupied" }
    var isReserved: Bool { status == "reserved" }
}

struct ActiveOrder: Codable {
    let id: String
    let orderNumber: Int
    let status: String
    let guestCount: Int?
    let items: [OrderItem]?
}
