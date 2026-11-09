import SwiftUI

/// Letrero fijo arriba de la pantalla cuando la app apunta al backend local
/// (`-localBackend`, ver `AppEnvironment`). Sirve para no mandar una comanda a
/// producción creyendo que es prueba. En producción no dibuja nada.
struct LocalBackendBadge: ViewModifier {
    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if AppEnvironment.current == .development {
                Text("LOCAL · PRUEBAS")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .tracking(1.5)
                    .foregroundColor(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.orange))
                    .padding(.top, 4)
                    .allowsHitTesting(false)
                    .zIndex(999)
            }
        }
    }
}

extension View {
    func localBackendBadge() -> some View {
        modifier(LocalBackendBadge())
    }
}
