import SwiftUI

/// Numpad circular "glass" (mismo `GlassCircle` — iOS 26 `.glassEffect`, sin
/// relleno sólido — que usa el resto de botones circulares de la app) — antes
/// vivía triplicado como `NumpadView` (Login POS), `ComandasNumpad` (Login
/// Mobile) y `pinNumpadButton` inline (`CashRegisterView`, que en realidad
/// usaba el estilo "flat" plano, no glass). Ahora es el único numpad de PIN
/// de toda la app: login (POS/Mobile), re-lock por inactividad y acceso a
/// Caja — todos deben verse igual.
struct PinNumpadView: View {
    let onNumber: (String) -> Void
    let onClear: () -> Void
    let onBackspace: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: 12) {
                    ForEach(1...3, id: \.self) { col in
                        key(String(row * 3 + col))
                    }
                }
            }
            HStack(spacing: 12) {
                key("", systemImage: "xmark", action: onClear)
                key("0")
                key("", systemImage: "delete.left", action: onBackspace)
            }
        }
    }

    private func key(_ text: String, systemImage: String? = nil, action: (() -> Void)? = nil) -> some View {
        Button {
            if let action { action() } else { onNumber(text) }
        } label: {
            Group {
                if let systemImage {
                    Image(systemName: systemImage).font(.title2)
                } else {
                    Text(text).font(.title.bold())
                }
            }
            .foregroundColor(.white)
            .frame(width: 80, height: 80)
            .modifier(GlassCircle(isActive: false, color: .blue))
            // Toda la tecla es tocable: el glassEffect dibuja el círculo pero
            // no cuenta para hit-testing, así que antes solo el glifo recibía
            // el toque y los taps rápidos a la orilla se perdían.
            .contentShape(Rectangle())
        }
        .buttonStyle(InstantKeyStyle())
    }
}

/// Dispara la tecla al TOCAR (no al soltar), como el teclado de código de
/// iOS: al teclear rápido el siguiente dedo suele bajar antes de que suba el
/// anterior, y con el disparo al soltar se perdían dígitos. Cada tecla tiene
/// su propio gesto, así que toques encimados en teclas distintas cuentan
/// todos. Un solo disparo por toque (aunque el dedo se mueva).
private struct InstantKeyStyle: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        InstantKey(configuration: configuration)
    }

    private struct InstantKey: View {
        let configuration: Configuration
        @Environment(\.isEnabled) private var isEnabled
        @State private var pressed = false

        var body: some View {
            configuration.label
                .scaleEffect(pressed ? 0.9 : 1)
                .brightness(pressed ? 0.15 : 0)
                .animation(.spring(response: 0.18, dampingFraction: 0.6), value: pressed)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in
                            guard !pressed, isEnabled else { return }
                            pressed = true
                            Haptics.tap()
                            configuration.trigger()
                        }
                        .onEnded { _ in pressed = false }
                )
                .accessibilityAction { configuration.trigger() }
        }
    }
}
