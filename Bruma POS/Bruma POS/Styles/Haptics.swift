import UIKit

/// Feedback háptico reusable para microinteracciones del flujo de cobro
/// (selección de método, confirmar pago, éxito/error). Sin lógica de negocio.
enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
