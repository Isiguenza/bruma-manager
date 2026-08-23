import UIKit

/// Cierra el teclado activo (si lo hay) — se llama antes de acciones como
/// seleccionar un producto o abrir el carrito, para que no se quede el
/// teclado de la búsqueda tapando la pantalla siguiente.
enum ComandasKeyboard {
    static func dismiss() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
