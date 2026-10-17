//
//  TicketCardView.swift
//  BRUMA_Dispatch
//
//  Una ronda en el riel del Pase.
//

import SwiftUI

// MARK: — Paleta del Pase (tablero oscuro)

enum PassTheme {
    static let ground = Color(hex: 0x0E0E0F)
    static let card = Color(hex: 0x1B1B1D)
    static let line = Color(hex: 0x2A2A2E)
    static let rowLine = Color(hex: 0x26262A)
    static let track = Color(hex: 0x2C2C30)
    static let text = Color(hex: 0xF4F4F1)
    static let muted = Color(hex: 0x9A9AA0)
    static let soft = Color(hex: 0xC9C9CE)
    static let control = Color(hex: 0x3A3A40)
    static let box = Color(hex: 0x6A6A72)
    static let accent = Color(hex: 0xFFE14A)      // modificadores
    static let warning = Color(hex: 0xFF9A4A)
    static let late = Color(hex: 0xFF6B3D)
    static let note = Color(hex: 0xFF8A5C)
    static let done = Color(hex: 0x4ADE80)
    static let practice = Color(hex: 0xB48CFF)
    static let hold = Color(hex: 0xD9D9DE)

    static let cardWidth: CGFloat = 300
    static let cardSpacing: CGFloat = 10

    static func timerColor(elapsed: Int, onHold: Bool) -> Color {
        if onHold { return muted }
        if elapsed >= PassTicket.lateSeconds { return late }
        if elapsed >= PassTicket.warningSeconds { return warning }
        if elapsed >= PassTicket.attentionSeconds { return accent }
        return text
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Persiana: revela (o esconde) el contenido de arriba hacia abajo, como la
/// comanda saliendo de la impresora.
struct Unroll: ViewModifier, Animatable {
    var progress: CGFloat

    // Animatable: `body` corre en cada cuadro con el valor interpolado, así la
    // tarjeta desaparece por completo justo al cerrar (sin dejar una rayita
    // del borde) en vez de desvanecerse durante todo el recorrido.
    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content
            .mask(alignment: .top) {
                Rectangle().scaleEffect(x: 1, y: max(0, min(1, progress)), anchor: .top)
            }
            .opacity(progress < 0.01 ? 0 : 1)
    }
}

// MARK: — Tarjeta

/// Recibe la ronda ya resuelta + callbacks. A propósito NO observa el
/// ViewModel: así un cambio en una ronda no redibuja las demás, y el reloj
/// (TimelineView) solo repinta el texto del cronómetro.
struct TicketCardView: View, Equatable {
    let ticket: PassTicket
    let isReprinting: Bool
    let onToggleItem: (String) -> Void
    let onMarkAll: () -> Void
    let onHold: () -> Void
    let onReprint: () -> Void

    static func == (lhs: TicketCardView, rhs: TicketCardView) -> Bool {
        lhs.ticket == rhs.ticket && lhs.isReprinting == rhs.isReprinting
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            progressBar
            bands
            itemsList
            footer
        }
        .background(PassTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(frame)
    }

    // MARK: — Encabezado

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(ticket.title)
                    .font(.system(size: 25, weight: .black))
                    .kerning(0.5)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let elapsed = ticket.elapsedSeconds(at: context.date)
                    Text(PassDate.clock(elapsed))
                        .font(.system(size: 25, weight: .black))
                        .monospacedDigit()
                        .foregroundColor(PassTheme.timerColor(elapsed: elapsed, onHold: ticket.isOnHold))
                }
            }
            HStack(spacing: 8) {
                Text(ticket.subtitle)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text("\(ticket.doneCount)/\(ticket.totalCount)")
                    .monospacedDigit()
            }
            .font(.system(size: 13, weight: .semibold))
            .kerning(0.8)
            .foregroundColor(PassTheme.muted)
        }
        .foregroundColor(PassTheme.text)
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }

    private var progressBar: some View {
        GeometryReader { geo in
            let fraction = ticket.totalCount == 0 ? 0 : CGFloat(ticket.doneCount) / CGFloat(ticket.totalCount)
            ZStack(alignment: .leading) {
                PassTheme.track
                PassTheme.text.frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 4)
    }

    // MARK: — Franjas de estado

    @ViewBuilder
    private var bands: some View {
        if ticket.isPractice {
            band("MODO PRÁCTICA", background: PassTheme.practice, foreground: Color(hex: 0x17111F))
        }
        if ticket.isRush {
            band("RUSH", background: PassTheme.accent, foreground: PassTheme.ground)
        }
        if ticket.isOnHold {
            band("EN PAUSA · TIEMPO DETENIDO", background: PassTheme.hold, foreground: PassTheme.ground)
        } else {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let over = ticket.elapsedSeconds(at: context.date) - PassTicket.lateSeconds
                if over >= 0 {
                    band("FUERA DE TIEMPO +\(PassDate.clock(over))",
                         background: PassTheme.late, foreground: Color(hex: 0x1A0B05))
                } else {
                    Color.clear.frame(height: 0)
                }
            }
        }
    }

    private func band(_ text: String, background: Color, foreground: Color) -> some View {
        Text(text)
            .font(.system(size: 15, weight: .black))
            .kerning(0.8)
            .monospacedDigit()
            .foregroundColor(foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(background)
    }

    private var frame: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let color: Color = ticket.isPractice ? PassTheme.practice
                : ticket.isOnHold ? PassTheme.box
                : ticket.isLate(at: context.date) ? PassTheme.late
                : PassTheme.line
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(color, lineWidth: 2)
        }
        .allowsHitTesting(false)
    }

    // MARK: — Platillos

    private var itemsList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(ticket.sections) { section in
                    if let title = section.title {
                        sectionHeader(title, highlighted: section.isBeverages)
                    }
                    ForEach(section.items) { item in
                        PassItemRow(item: item) { onToggleItem(item.id) }
                    }
                }
            }
            .padding(.bottom, 8)
        }
        .frame(maxHeight: .infinity)
    }

    private func sectionHeader(_ title: String, highlighted: Bool) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .heavy))
            .kerning(1.6)
            .foregroundColor(highlighted ? PassTheme.text : PassTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.top, highlighted ? 8 : 12)
            .padding(.bottom, highlighted ? 8 : 5)
            .background(highlighted ? PassTheme.track : Color.clear)
    }

    // MARK: — Pie: reimprimir · pausar · entregar todo

    private var footer: some View {
        let remaining = ticket.totalCount - ticket.doneCount
        return HStack(spacing: 6) {
            Button(action: onReprint) {
                Group {
                    if isReprinting {
                        ProgressView().tint(PassTheme.ground)
                    } else {
                        Image(systemName: "printer.fill")
                            .font(.system(size: 19, weight: .semibold))
                    }
                }
                .frame(width: 48, height: 48)
                .foregroundColor(isReprinting ? PassTheme.ground : PassTheme.soft)
                .background(isReprinting ? PassTheme.accent : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(isReprinting ? PassTheme.accent : PassTheme.control, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(PassPressStyle())
            // Sin `.disabled`: atenuaría el botón justo cuando debe verse sólido.
            .allowsHitTesting(!isReprinting)
            .accessibilityLabel("Reimprimir comanda")

            Button(action: onHold) {
                Image(systemName: ticket.isOnHold ? "play.fill" : "pause.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 48, height: 48)
                    .foregroundColor(ticket.isOnHold ? PassTheme.ground : PassTheme.soft)
                    .background(ticket.isOnHold ? PassTheme.hold : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(ticket.isOnHold ? PassTheme.hold : PassTheme.control, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(PassPressStyle())
            .accessibilityLabel(ticket.isOnHold ? "Reanudar orden" : "Pausar orden")

            Button(action: onMarkAll) {
                Text("ENTREGAR TODO · \(remaining)")
                    .font(.system(size: 14, weight: .black))
                    .kerning(1)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .foregroundColor(PassTheme.ground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(PassTheme.text)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(PassPressStyle())
            .allowsHitTesting(remaining > 0)
        }
        .padding(8)
        .overlay(alignment: .top) {
            Rectangle()
                .stroke(PassTheme.control, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                .frame(height: 1)
        }
    }
}

/// Botones del Pase: al tocar NO se atenúan (el `.plain` baja la opacidad);
/// solo se hunden un poco. El color sólido lo da el estado, que cambia en el
/// mismo toque (reimprimiendo / en pausa / entregado).
struct PassPressStyle: ButtonStyle {
    var scales = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(scales && configuration.isPressed ? 0.95 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: — Renglón de platillo

/// Todo el renglón es el botón de "entregado". Su posición nunca cambia al
/// marcarlo: solo se tacha y se atenúa.
private struct PassItemRow: View {
    let item: PassItem
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(alignment: .top, spacing: 9) {
                checkbox
                Text("\(item.quantity)")
                    .font(.system(size: 16, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(PassTheme.muted)
                    .frame(minWidth: 16, alignment: .leading)
                    .padding(.top, 3)
                    .opacity(item.delivered ? 0.45 : 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name.uppercased())
                        .font(.system(size: 16, weight: .bold))
                        .kerning(0.3)
                        .strikethrough(item.delivered, color: PassTheme.text)
                        .foregroundColor(PassTheme.text)
                    if let context = item.context {
                        Text(context.uppercased())
                            .font(.system(size: 11, weight: .heavy))
                            .kerning(1)
                            .foregroundColor(PassTheme.soft)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .overlay(RoundedRectangle(cornerRadius: 4)
                                .strokeBorder(Color(hex: 0x5B5B63), lineWidth: 1))
                    }
                    ForEach(Array(item.modifiers.enumerated()), id: \.offset) { _, modifier in
                        Text(modifier.uppercased())
                            .font(.system(size: 17, weight: .heavy))
                            .kerning(0.3)
                            .foregroundColor(PassTheme.accent)
                    }
                    if let note = item.note {
                        Text("NOTA: \(note.uppercased())")
                            .font(.system(size: 17, weight: .heavy))
                            .kerning(0.3)
                            .foregroundColor(PassTheme.note)
                    }
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
                // Solo el texto se atenúa: la palomita se queda verde sólido.
                .opacity(item.delivered ? 0.45 : 1)
                Spacer(minLength: 0)
            }
            .padding(.leading, item.isChild ? 34 : 12)
            .padding(.trailing, 12)
            .padding(.vertical, 10)
            .frame(minHeight: 50, alignment: .top)
            .overlay(alignment: .top) {
                PassTheme.rowLine.frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PassPressStyle(scales: false))
        .accessibilityLabel("\(item.quantity) \(item.name)")
        .accessibilityValue(item.delivered ? "Entregado" : "Pendiente")
    }

    private var checkbox: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(item.delivered ? PassTheme.done : Color.clear)
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(item.delivered ? PassTheme.done : PassTheme.box, lineWidth: 2)
            if item.delivered {
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .black))
                    .foregroundColor(PassTheme.ground)
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
            }
        }
        .frame(width: 26, height: 26)
    }
}
