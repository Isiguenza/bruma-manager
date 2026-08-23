import SwiftUI

// Mismo lenguaje visual que Bruma POS (Bruma POS/Bruma POS/Styles/FlatStyles.swift)
// — tarjetas "glass" planas (fill translúcido + borde, sin sombra) y botones
// cápsula/círculo sólidos. Copiado a propósito (no compartido en paquete) por
// ahora — ver decisión en el plan de confiabilidad de Waitress.

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
    static func flatCircle(_ fill: Color, foreground: Color = .white) -> FlatCircleStyle {
        FlatCircleStyle(fill: fill, foreground: foreground, bordered: false)
    }
}

/// Tarjeta/sección plana — fill translúcido + borde, sin sombra.
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

/// Pill plana (para tabs tipo "A1"/"A2").
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

/// Borde de sección estándar (carrito, mesas) — mismo fondo/borde en todos lados.
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

extension View {
    func flatCard(cornerRadius: CGFloat = 18) -> some View { modifier(FlatCard(cornerRadius: cornerRadius)) }
    func flatCardTinted(_ color: Color, cornerRadius: CGFloat = 18) -> some View { modifier(FlatCardTinted(color: color, cornerRadius: cornerRadius)) }
    func flatPill(isSelected: Bool, color: Color) -> some View { modifier(FlatPill(isSelected: isSelected, color: color)) }
    func flatSection(cornerRadius: CGFloat = 22) -> some View { modifier(FlatSection(cornerRadius: cornerRadius)) }
}

// MARK: - Paleta compartida con Bruma POS (mismos valores exactos)

enum BrumaColors {
    static let backdrop = Color(red: 0.04, green: 0.04, blue: 0.05) // ~#0A0A0D
    static let occupied = Color(red: 1.0, green: 0.45, blue: 0.0)   // #FF7300
    static let available = Color.green
    static let reserved = Color.purple
}
