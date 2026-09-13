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
        }
        .buttonStyle(.plain)
    }
}
