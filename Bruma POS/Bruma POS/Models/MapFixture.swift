import Foundation

// Purely decorative floor-plan elements (walls, bars, fixed furniture) — help
// the Bruma POS map read like the real room, but aren't interactive tables.
struct MapFixture: Codable, Identifiable {
    let id: String
    var type: String // "wall" | "bar" | "furniture" | "other"
    var label: String?
    var positionX: Int
    var positionY: Int
    var widthCells: Int
    var heightCells: Int
    var rotation: Int

    var footprintCells: (w: Int, h: Int) {
        (rotation == 90 || rotation == 270) ? (heightCells, widthCells) : (widthCells, heightCells)
    }

    var icon: String {
        switch type {
        case "wall": return "minus"
        case "bar": return "wineglass.fill"
        case "furniture": return "cube.fill"
        default: return "square.dashed"
        }
    }

    var displayLabel: String {
        label ?? MapFixture.defaultLabel(for: type)
    }

    static func defaultLabel(for type: String) -> String {
        switch type {
        case "wall": return "Muro"
        case "bar": return "Barra"
        case "furniture": return "Mueble"
        default: return "Elemento"
        }
    }
}

struct MapFixtureLayoutUpdate: Codable {
    let id: String
    var positionX: Int
    var positionY: Int
    var widthCells: Int
    var heightCells: Int
    var rotation: Int
}
