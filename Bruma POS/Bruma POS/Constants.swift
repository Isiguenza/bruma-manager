import Foundation

enum POSConstants {
    /// Placeholder product used as the FK anchor for ad-hoc "Modificador Personalizado" charges
    /// applied as a standalone item on the whole account (not tied to a specific cart item).
    /// See drizzle/0018_custom_modifier_placeholder_product.sql.
    static let customModifierProductId = "00000000-0000-0000-0000-000000000001"
}
