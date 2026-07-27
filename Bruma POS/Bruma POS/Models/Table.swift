import Foundation
import SwiftUI

struct Table: Codable, Identifiable {
    let id: String
    let number: String
    let name: String?
    var capacity: Int
    let status: String // "available", "occupied", "reserved"
    let active: Bool
    let activeOrder: ActiveOrder?
    let guestCount: Int?
    let nextReservation: NextReservation?

    // Floor-plan map (grid column/row index; nil = not yet placed) — `var` so
    // the map view can apply optimistic local updates while a drag/resize is
    // still in flight to the server, instead of waiting on a round trip.
    var positionX: Int?
    var positionY: Int?
    var widthCells: Int?
    var heightCells: Int?
    var shape: String? // "square" | "round"
    var rotation: Int? // 0/90/180/270

    // Temporary table merge (populated from GET /tables, kept in sync via socket
    // deltas). A "group" of N merged tables all share the same mergeGroupId (the
    // group's primary table id); one of them has isMergePrimary == true.
    var mergeGroupId: String?
    var isMergePrimary: Bool?

    var isAvailable: Bool { status == "available" }
    var isOccupied: Bool { status == "occupied" }
    var isReserved: Bool { status == "reserved" }
    var isPlaced: Bool { positionX != nil && positionY != nil }
    var isMerged: Bool { mergeGroupId != nil }
    var effectiveWidthCells: Int { widthCells ?? 1 }
    var effectiveHeightCells: Int { heightCells ?? 1 }
    // Effective footprint after 90°/270° rotation swap
    var footprintCells: (w: Int, h: Int) {
        let r = rotation ?? 0
        return (r == 90 || r == 270) ? (effectiveHeightCells, effectiveWidthCells) : (effectiveWidthCells, effectiveHeightCells)
    }

    var displayName: String {
        name ?? "Mesa \(number)"
    }
}

struct TableLayoutUpdate: Codable {
    let id: String
    var positionX: Int
    var positionY: Int
    var widthCells: Int
    var heightCells: Int
    var rotation: Int
    var shape: String
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

// Shared status-color helpers, used by both the Cards grid (TableCardView) and
// the floor-plan map (TableMapChip) so the two views stay visually consistent.
extension Table {
    static func kitchenStatusColor(_ status: String) -> Color {
        switch status {
        case "pending": return .orange
        case "preparing": return .blue
        case "ready": return .green
        case "delivered", "completed": return .gray
        default: return .gray
        }
    }

    var statusColor: Color {
        switch status {
        case "available": return .green
        case "occupied": return Color(red: 1.0, green: 0.45, blue: 0.0)
        case "reserved": return .purple
        default: return .gray
        }
    }

    var statusLabel: String {
        switch status {
        case "available": return "Libre"
        case "occupied": return "Ocupada"
        case "reserved": return "Reservada"
        default: return status
        }
    }

    var backgroundColor: Color {
        if activeOrder?.onHold == true {
            return Color.red.opacity(0.12)
        }
        if status == "occupied", let activeOrder = activeOrder {
            return Table.kitchenStatusColor(activeOrder.status).opacity(0.08)
        }
        switch status {
        case "reserved": return Color.purple.opacity(0.08)
        default: return Color.white.opacity(0.05)
        }
    }

    var borderColor: Color {
        if activeOrder?.onHold == true {
            return Color.red.opacity(0.5)
        }
        if activeOrder?.priority == 1 {
            return Color.orange.opacity(0.5)
        }
        if status == "occupied", let activeOrder = activeOrder {
            return Table.kitchenStatusColor(activeOrder.status).opacity(0.4)
        }
        switch status {
        case "reserved": return Color.purple.opacity(0.3)
        default: return Color.white.opacity(0.1)
        }
    }
}
