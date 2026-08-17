import SwiftUI

struct GlassCard: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 14))
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
        }
    }
}

struct GlassCardTinted: ViewModifier {
    let color: Color
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(color).interactive(), in: .rect(cornerRadius: 14))
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(color.opacity(0.08))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(color.opacity(0.25), lineWidth: 1))
                )
        }
    }
}

struct GlassPill: ViewModifier {
    let isSelected: Bool
    let color: Color
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isSelected ? .regular.tint(color).interactive() : .regular.interactive(),
                    in: .capsule
                )
        } else {
            content
                .background(
                    Capsule()
                        .fill(isSelected ? color.opacity(0.15) : Color.white.opacity(0.05))
                        .overlay(Capsule().stroke(isSelected ? color.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1))
                )
        }
    }
}

