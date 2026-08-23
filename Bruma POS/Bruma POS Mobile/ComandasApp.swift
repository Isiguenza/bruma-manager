import SwiftUI

/// Punto de entrada de "Bruma Comandas" — app de iPhone solo para tomar
/// pedidos y mandarlos a cocina (sin cobrar, sin caja registradora). Usa el
/// mismo `POSViewModel` real que Bruma POS (compartido vía doble membresía
/// de target, no una copia) — nunca llama a las funciones de pago/caja de
/// ese ViewModel, solo a las de login/mesas/carrito/mandar-a-cocina.
@main
struct ComandasApp: App {
    @StateObject private var vm = POSViewModel()

    var body: some Scene {
        WindowGroup {
            ComandasRootView(vm: vm)
                .preferredColorScheme(.dark)
        }
    }
}
