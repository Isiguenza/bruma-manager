import SwiftUI

/// Botón capsule plano y sólido — sin material "glass" (blur/brillo). Un solo
/// estilo cubre tanto el estado "seleccionado/con color" (fill sólido, sin
/// borde) como el "neutral" (fill translúcido + borde), según `bordered`.
struct FlatCapsuleStyle: ButtonStyle {
    var fill: Color
    var foreground: Color = .white
    var bordered: Bool = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(
                Capsule()
                    .fill(fill)
                    .overlay(bordered ? Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1) : nil)
            )
            .opacity(!isEnabled ? 0.4 : (configuration.isPressed ? 0.82 : 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }

    /// Fill "neutral" reusado por todos los botones sin seleccionar.
    static let neutralFill = Color.white.opacity(0.07)
}

extension ButtonStyle where Self == FlatCapsuleStyle {
    static func flatCapsule(_ fill: Color, foreground: Color = .white) -> FlatCapsuleStyle {
        FlatCapsuleStyle(fill: fill, foreground: foreground, bordered: false)
    }
    static var flatCapsuleNeutral: FlatCapsuleStyle {
        FlatCapsuleStyle(fill: FlatCapsuleStyle.neutralFill, foreground: .white, bordered: true)
    }
}

/// Botón circular plano — mismo rol que un GlassCircleButton pero sin material.
struct FlatCircleStyle: ButtonStyle {
    var fill: Color = FlatCapsuleStyle.neutralFill
    var foreground: Color = .white
    var bordered: Bool = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(
                Circle()
                    .fill(fill)
                    .overlay(bordered ? Circle().stroke(Color.white.opacity(0.12), lineWidth: 1) : nil)
            )
            .clipShape(Circle())
            .opacity(!isEnabled ? 0.4 : (configuration.isPressed ? 0.82 : 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == FlatCircleStyle {
    static var flatCircleNeutral: FlatCircleStyle { FlatCircleStyle() }
}

/// Fondo circular plano para usar dentro de un `Menu` (que no acepta
/// `ButtonStyle`) — misma idea que `FlatCircleStyle` pero como modifier.
struct FlatCircle: ViewModifier {
    var isActive: Bool = false
    var color: Color = .blue
    func body(content: Content) -> some View {
        content.background(
            Circle()
                .fill(isActive ? color.opacity(0.15) : FlatCapsuleStyle.neutralFill)
                .overlay(Circle().stroke(isActive ? color.opacity(0.4) : Color.white.opacity(0.12), lineWidth: 1))
        )
    }
}

/// Tarjeta/sección plana — mismo look que GlassCard pero sin glassEffect.
struct FlatCard: ViewModifier {
    var cornerRadius: CGFloat = 18
    func body(content: Content) -> some View {
        content.background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color.white.opacity(0.045))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }
}

struct FlatCardTinted: ViewModifier {
    let color: Color
    var cornerRadius: CGFloat = 18
    func body(content: Content) -> some View {
        content.background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(color.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(color.opacity(0.3), lineWidth: 1))
        )
    }
}

/// Pill plana (para tabs tipo "A1"/"A2") — misma idea que GlassPill pero sin
/// glassEffect.
struct FlatPill: ViewModifier {
    let isSelected: Bool
    let color: Color
    func body(content: Content) -> some View {
        content.background(
            Capsule()
                .fill(isSelected ? color : Color.white.opacity(0.06))
                .overlay(Capsule().stroke(isSelected ? Color.clear : Color.white.opacity(0.1), lineWidth: 1))
        )
    }
}

/// Borde de sección estándar (mesa/carrito, pago, categorías, productos) —
/// mismo fondo/borde en todos lados, sin material glass.
struct FlatSection: ViewModifier {
    var cornerRadius: CGFloat = 22
    func body(content: Content) -> some View {
        content
            .background(Color(white: 0.06))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    }
}

// MARK: - Bottom sheet (reusable)
//
// Mismo patrón en todo el POS: hoja plana anclada abajo de la SECCIÓN que la
// contiene (no de toda la pantalla), con grabber, y arrastrable hacia abajo
// para cerrarla. Usado por el panel de pago (propina/efectivo/confirmar/
// descuento) y por el panel de items (variantes/notas de producto).

/// Tarjeta plana con grabber, arrastrable hacia abajo para cerrar.
struct BottomSheetCard<Content: View>: View {
    var maxHeight: CGFloat? = nil
    var onDismiss: () -> Void
    @ViewBuilder var content: () -> Content
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Capsule().fill(Color.white.opacity(0.18)).frame(width: 40, height: 4).frame(maxWidth: .infinity)
            content()
        }
        .padding(24)
        .frame(maxHeight: maxHeight)
        .background(Color(white: 0.09))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
        .shadow(color: .black.opacity(0.5), radius: 30, y: -6)
        .offset(y: dragOffset)
        .gesture(
            DragGesture()
                .onChanged { value in dragOffset = max(0, value.translation.height) }
                .onEnded { value in
                    if value.translation.height > 90 { onDismiss() }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.87)) { dragOffset = 0 }
                }
        )
    }
}

/// Scrim + `BottomSheetCard` anclados a la sección que envuelve este
/// modifier — no a toda la pantalla — para que solo esa sección se oscurezca
/// y la hoja salga de abajo de ELLA, no del centro de la pantalla.
///
/// A propósito NO usa `if isPresented { ... }` + `.transition()`: insertar y
/// quitar la vista del árbol así solo anima de forma confiable cuando el
/// cambio de estado ocurre dentro de un `Button` normal — se rompe (y se ve
/// como un fade plano) en cuanto el estado se cambia desde un `Menu`, un
/// `Task` async, o un método del ViewModel, que es exactamente de donde
/// salen la mayoría de estos sheets. En su lugar la hoja SIEMPRE está en el
/// árbol y solo se anima su `offset`/`opacity` con `.animation(value:)`, que
/// sí es confiable sin importar de dónde venga el cambio de estado.
struct BottomSheetOverlay<SheetContent: View>: ViewModifier {
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
            .offset(y: isPresented ? 0 : 700)
            .allowsHitTesting(isPresented)
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.84), value: isPresented)
    }
}

extension View {
    func bottomSheet<SheetContent: View>(
        isPresented: Bool,
        onDismiss: @escaping () -> Void,
        @ViewBuilder content: @escaping () -> SheetContent
    ) -> some View {
        modifier(BottomSheetOverlay(isPresented: isPresented, onDismiss: onDismiss, sheetContent: content))
    }
}
