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
    
    enum CodingKeys: String, CodingKey {
        case id, number, name, capacity, status, active
        case activeOrder = "active_order"
        case guestCount = "guest_count"
        case nextReservation = "next_reservation"
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
    let items: [OrderItem]?
}
