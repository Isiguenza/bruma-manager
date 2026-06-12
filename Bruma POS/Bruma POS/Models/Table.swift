import Foundation

struct Table: Codable, Identifiable {
    let id: String
    let number: String
    let name: String?
    let capacity: Int
    let status: String // "available", "occupied", "reserved"
    let active: Bool
    let activeOrder: ActiveOrder?
    let guestCount: Int?
    let nextReservation: NextReservation?
    
    var isAvailable: Bool { status == "available" }
    var isOccupied: Bool { status == "occupied" }
    var isReserved: Bool { status == "reserved" }
    
    var displayName: String {
        name ?? "Mesa \(number)"
    }
}

struct NextReservation: Codable {
    let reservationTime: String
    let customerName: String
}

struct ActiveOrder: Codable {
    let id: String
    let orderNumber: Int
    let status: String
    let total: String?
    let itemCount: Int?
    let items: [OrderItem]?
    let createdAt: String?
    let priority: Int?      // 0=normal, 1=rush
    let onHold: Bool?       // true if order is on hold
}
