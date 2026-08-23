import SwiftUI

/// Mismo patrón que `BottomSheetOverlay` de Bruma POS
/// (`Styles/FlatStyles.swift`, compartido, no se modifica), pero con el
/// offset de "fuera de pantalla" calculado dinámicamente en vez de un valor
/// fijo de 700pt. En iPad ese valor fijo alcanza a esconder cualquier hoja,
/// pero en iPhone una hoja alta (p.ej. el carrito con
/// `maxHeight: 0.82 * screenHeight`) puede medir más de 700pt y se queda
/// asomando por abajo (grabber + título visibles) aunque `isPresented ==
/// false`, estorbando la barra flotante del carrito.
struct ComandasBottomSheetOverlay<SheetContent: View>: ViewModifier {
    let isPresented: Bool
    var onDismiss: () -> Void
    @ViewBuilder var sheetContent: () -> SheetContent

    func body(content: Content) -> some View {
        ZStack {
            content

            Color.black.opacity(isPresented ? 0.55 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(isPresented)
                .onTapGesture(perform: onDismiss)

            VStack {
                Spacer()
                sheetContent()
            }
            .offset(y: isPresented ? 0 : UIScreen.main.bounds.height + 200)
            .allowsHitTesting(isPresented)
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.84), value: isPresented)
    }
}

extension View {
    func comandasBottomSheet<SheetContent: View>(
        isPresented: Bool,
        onDismiss: @escaping () -> Void,
        @ViewBuilder content: @escaping () -> SheetContent
    ) -> some View {
        modifier(ComandasBottomSheetOverlay(isPresented: isPresented, onDismiss: onDismiss, sheetContent: content))
    }
}
