import Foundation

/// Un cobro en efectivo "en progreso, sin finalizar" que se parquea por mesa
/// cuando el mesero sale a comandar otra cosa. No se cobra nada en el backend
/// hasta confirmar — esto es solo el estado local del cobro (efectivo recibido,
/// propina y cambio) para poder reanudarlo donde se dejó.
struct PendingCashPayment {
    var cashReceived: String
    var tipPercentage: Int
    var customTip: String
    var showCustomTip: Bool
    var tipPaymentMethod: String?
    var paymentStep: String
    /// Snapshots para mostrar en el chip sin recalcular contra el carrito actual.
    var totalSnapshot: Double
    var changeSnapshot: Double
    var tableNumber: String
}
