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
        VStack(spacing: 8) {
            ForEach(keys, id: \.self) { row in
                HStack(spacing: 10) {
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
        .padding(.vertical, 12)
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
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                } else if isActionKey {
                    Image(systemName: label == "C" ? "xmark" : "delete.left")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.gray)
                } else {
                    Text(label)
                        .font(.title2.weight(.medium))
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
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
