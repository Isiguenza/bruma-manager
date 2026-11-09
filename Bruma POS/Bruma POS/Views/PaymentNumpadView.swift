import SwiftUI

struct PaymentNumpadView: View {
    let onKey: (String) -> Void
    let onClear: () -> Void
    let onBackspace: () -> Void
    let onDone: (() -> Void)?
    
    private let keys = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["C", "0", "←"]
    ]
    
    var body: some View {
        VStack(spacing: 10) {
            ForEach(keys, id: \.self) { row in
                HStack(spacing: 14) {
                    ForEach(row, id: \.self) { key in
                        NumpadKey(
                            label: key,
                            isDone: key == "C" && onDone != nil,
                            onTap: {
                                if key == "C" {
                                    if let done = onDone {
                                        done()
                                    } else {
                                        onClear()
                                    }
                                } else if key == "←" {
                                    onBackspace()
                                } else {
                                    onKey(key)
                                }
                            }
                        )
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct NumpadKey: View {
    let label: String
    let isDone: Bool
    let onTap: () -> Void
    
    var isActionKey: Bool {
        label == "C" || label == "←"
    }
    
    var body: some View {
        Button {
            onTap()
        } label: {
            Group {
                if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                } else if isActionKey {
                    Image(systemName: label == "C" ? "xmark" : "delete.left")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(.gray)
                } else {
                    Text(label)
                        .font(.system(size: 32, weight: .medium, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
            // Tamaño fijo (no maxWidth): teclas grandes y juntas, fáciles de
            // atinar con el dedo, en vez de círculos chicos repartidos.
            .frame(width: 72, height: 72)
            .contentShape(Circle())
            .background(
                Circle()
                    .fill(isDone ? Color.green.opacity(0.3) : Color.white.opacity(0.06))
                    .overlay(
                        Circle()
                            .stroke(isDone ? Color.green.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
