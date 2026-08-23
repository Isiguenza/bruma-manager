import Foundation
import SwiftUI

/// `POSViewModel.swift` (compartido, sin modificar) referencia estos 3 tipos,
/// pero viven adentro de archivos de Views/ que son solo de iPad y no
/// queremos compilar aquí completos (956 + 131 líneas de editor de mapa y
/// UI de promociones que esta app nunca usa): `MapGridMetrics`
/// (`Views/TableMapView.swift`), `PromotionGroup` y `CartRenderElement`
/// (`Views/PromotionGroupView.swift`/`Views/CartRenderElement.swift`).
///
/// En vez de compartir esos archivos completos, se duplican aquí SOLO las
/// definiciones mínimas de tipo — mismos campos exactos que la versión real
/// de POS — para que `POSViewModel.swift` compile en este target sin traer
/// UI de iPad que nunca se usa. Ningún archivo de Bruma POS se modificó para
/// esto; este archivo vive únicamente en el target de Comandas.

struct MapGridMetrics: Equatable {
    var columns: Int
    var rows: Int
    var cellSize: CGFloat
    var width: CGFloat { CGFloat(columns) * cellSize }
    var height: CGFloat { CGFloat(rows) * cellSize }
}

struct PromotionGroup: Identifiable {
    let id: String
    let promotionId: String
    let name: String
    let type: String
    let course: Int
    let seat: String
    let items: [(index: Int, item: CartItem)]
    let totalSavings: Double
}

/// `POSViewModel.swift` también referencia `POSConstants` (`Constants.swift`,
/// archivo suelto en la raíz de `Bruma POS/`, fuera de las carpetas
/// compartidas Models/Services/Styles/Config) — se duplica aquí por la misma
/// razón que los tipos de arriba.
enum POSConstants {
    static let customModifierProductId = "00000000-0000-0000-0000-000000000001"
}

enum CartRenderElement: Identifiable {
    case promotionGroup(PromotionGroup, showCourseHeader: Bool, showSeatHeader: Bool)
    case item(Int, CartItem, showCourseHeader: Bool, showSeatHeader: Bool)

    var id: String {
        switch self {
        case .promotionGroup(let group, _, _):
            return "promo_\(group.promotionId)_\(group.seat)_\(group.course)"
        case .item(let index, let item, _, _):
            return "item_\(index)_\(item.productId)_\(item.course)_\(item.seat)"
        }
    }
}
