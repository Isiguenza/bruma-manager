//
//  ContentView.swift
//  BRUMA_Dispatch
//
//  Pase: riel horizontal de rondas, la más antigua a la izquierda.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = OrdersViewModel()
    @ObservedObject private var socket = SocketService.shared
    @AppStorage("kdsViewMode") private var kdsViewMode: String = "all"
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            PassTheme.line.frame(height: 1)

            if viewModel.tickets.isEmpty {
                emptyState
            } else {
                PassRail(
                    tickets: viewModel.tickets,
                    leavingIds: viewModel.leavingIds,
                    reprintingTicketId: viewModel.reprintingTicketId,
                    onToggleItem: { viewModel.toggleItem($0) },
                    onMarkAll: { viewModel.markRemaining($0) },
                    onHold: { viewModel.toggleHold($0) },
                    onReprint: { viewModel.reprint($0) }
                )
            }

            PassTheme.line.frame(height: 1)
            bottomBar
        }
        .background(PassTheme.ground.ignoresSafeArea())
        .foregroundColor(PassTheme.text)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showSettings) {
            SettingsSheet(kdsViewMode: $kdsViewMode, isConnected: socket.isConnected)
        }
        .onAppear {
            viewModel.viewMode = kdsViewMode
            // iPad fijo en la ventana: la pantalla no debe apagarse sola.
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onChange(of: kdsViewMode) { _, newValue in
            viewModel.viewMode = newValue
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { viewModel.refresh() }
        }
    }

    // MARK: — Barra superior

    private var headerBar: some View {
        HStack(spacing: 22) {
            HStack(spacing: 10) {
                Text("PASE")
                    .font(.system(size: 24, weight: .black))
                    .kerning(2)
                    .fixedSize()
                Circle()
                    .fill(socket.isConnected ? PassTheme.done : PassTheme.late)
                    .frame(width: 9, height: 9)
                    .accessibilityLabel(socket.isConnected ? "En línea" : "Sin conexión en tiempo real")
            }

            // En vertical no caben las tres cifras: se van soltando las menos
            // urgentes antes que apachurrar el filtro o el reloj.
            ViewThatFits(in: .horizontal) {
                stats(showHold: true, showOldest: true)
                stats(showHold: false, showOldest: true)
                stats(showHold: false, showOldest: false)
                Color.clear.frame(width: 0, height: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            filterControl

            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(PassDate.hour(context.date))
                    .font(.system(size: 22, weight: .heavy))
                    .monospacedDigit()
                    .fixedSize()
            }

            HStack(spacing: 8) {
                headerButton(icon: "arrow.clockwise", label: "Forzar actualización") {
                    viewModel.refresh()
                }
                headerButton(icon: "slider.horizontal.3", label: "Ajustes") {
                    showSettings = true
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 60)
    }

    private func stats(showHold: Bool, showOldest: Bool) -> some View {
        let onHold = viewModel.tickets.filter(\.isOnHold).count
        return HStack(alignment: .firstTextBaseline, spacing: 18) {
            stat("ACTIVAS", value: "\(viewModel.tickets.count - onHold)", color: PassTheme.text)
            if showHold {
                stat("EN PAUSA", value: "\(onHold)", color: PassTheme.text)
            }
            if showOldest {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let oldest = viewModel.tickets
                        .filter { !$0.isOnHold }
                        .map { $0.elapsedSeconds(at: context.date) }
                        .max() ?? 0
                    stat("MÁS ANTIGUA", value: PassDate.clock(oldest),
                         color: PassTheme.timerColor(elapsed: oldest, onHold: false))
                }
            }
        }
    }

    private func stat(_ label: String, value: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .kerning(1.3)
                .foregroundColor(PassTheme.muted)
            Text(value)
                .font(.system(size: 17, weight: .heavy))
                .monospacedDigit()
                .foregroundColor(color)
        }
        .lineLimit(1)
        .fixedSize()
    }

    private var filterControl: some View {
        HStack(spacing: 2) {
            filterButton("TODO", mode: "all")
            filterButton("ALIMENTOS", mode: "food")
            filterButton("BEBIDAS", mode: "beverages")
        }
        .padding(3)
        .background(PassTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(PassTheme.line, lineWidth: 1))
    }

    private func filterButton(_ title: String, mode: String) -> some View {
        let selected = kdsViewMode == mode
        return Button { kdsViewMode = mode } label: {
            Text(title)
                .font(.system(size: 13, weight: .heavy))
                .kerning(1)
                .foregroundColor(selected ? PassTheme.ground : PassTheme.muted)
                .fixedSize()
                .padding(.horizontal, 14)
                .frame(height: 38)
                .background(selected ? PassTheme.text : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func headerButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(PassTheme.soft)
                .frame(width: 44, height: 44)
                .background(PassTheme.card)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(PassTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: — Vacío

    private var emptyState: some View {
        VStack(spacing: 8) {
            if viewModel.hasLoaded {
                Text("PASE LIMPIO")
                    .font(.system(size: 26, weight: .heavy))
                    .kerning(1.5)
                Text("No hay comandas pendientes de entregar")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(PassTheme.muted)
            } else {
                ProgressView().tint(PassTheme.text)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: — Barra inferior: recién entregadas (Deshacer 60s) + avisos

    private var bottomBar: some View {
        HStack(spacing: 12) {
            Text("RECIÉN ENTREGADAS")
                .font(.system(size: 12, weight: .heavy))
                .kerning(1.6)
                .foregroundColor(PassTheme.muted)
                .fixedSize()

            if viewModel.recentlyCompleted.isEmpty {
                Text("Ninguna en el último minuto")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(PassTheme.muted)
                    .lineLimit(1)
                Spacer(minLength: 0)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.recentlyCompleted) { completed in
                            completedChip(completed)
                        }
                    }
                }
            }

            Group {
                if let toast = viewModel.toast {
                    Text(toast.message)
                        .foregroundColor(toast.isError ? PassTheme.late : PassTheme.text)
                } else {
                    Text("Toca un platillo para marcarlo entregado")
                        .foregroundColor(PassTheme.muted)
                }
            }
            .font(.system(size: 13, weight: .bold))
            .lineLimit(1)
            .layoutPriority(1)
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .animation(.snappy(duration: 0.3), value: viewModel.recentlyCompleted)
    }

    private func completedChip(_ completed: CompletedOrder) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 14, weight: .black))
                .foregroundColor(PassTheme.done)
            Text(completed.label)
                .font(.system(size: 14, weight: .heavy))
                .kerning(0.5)
                .lineLimit(1)
            Button { viewModel.undoCompleted(completed) } label: {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let left = max(0, Int(OrdersViewModel.completedTTL - context.date.timeIntervalSince(completed.completedAt)))
                    Text("DESHACER \(left)s")
                        .font(.system(size: 13, weight: .black))
                        .kerning(0.8)
                        .monospacedDigit()
                        .foregroundColor(PassTheme.ground)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(PassTheme.text)
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                }
            }
            .buttonStyle(.plain)
            Button { viewModel.dismissCompleted(completed) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(PassTheme.muted)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quitar de la franja")
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .frame(height: 44)
        .background(Color(hex: 0x14201A))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(hex: 0x2F5A3F), lineWidth: 1))
        .transition(.opacity.combined(with: .move(edge: .leading)))
    }
}

// MARK: — Riel

/// Riel horizontal. Se desliza con el dedo; los botones "+N" de las orillas
/// brincan una pantalla completa de rondas.
private struct PassRail: View {
    let tickets: [PassTicket]
    let leavingIds: Set<String>
    let reprintingTicketId: String?
    let onToggleItem: (String) -> Void
    let onMarkAll: (PassTicket) -> Void
    let onHold: (PassTicket) -> Void
    let onReprint: (PassTicket) -> Void

    private enum Side { case left, visible, right }

    /// De qué lado queda cada tarjeta respecto a la pantalla. Solo cambia
    /// cuando una tarjeta cruza una orilla, no en cada cuadro del scroll.
    @State private var sides: [String: Side] = [:]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Franja de la ronda anterior que se deja asomar al paginar, para que el
    /// botón de regreso no tape platillos.
    private static let peek: CGFloat = 64
    private static let space = "pass-rail"

    private var insertion: AnyTransition {
        reduceMotion
            ? .opacity
            : .modifier(active: Unroll(progress: 0), identity: Unroll(progress: 1))
    }

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: PassTheme.cardSpacing) {
                        ForEach(tickets) { ticket in
                            let leaving = leavingIds.contains(ticket.id)
                            TicketCardView(
                                ticket: ticket,
                                isReprinting: reprintingTicketId == ticket.id,
                                onToggleItem: onToggleItem,
                                onMarkAll: { onMarkAll(ticket) },
                                onHold: { onHold(ticket) },
                                onReprint: { onReprint(ticket) }
                            )
                            .equatable()
                            .frame(width: PassTheme.cardWidth)
                            .frame(maxHeight: .infinity)
                            .modifier(Unroll(progress: leaving && !reduceMotion ? 0 : 1))
                            .opacity(leaving && reduceMotion ? 0 : 1)
                            .allowsHitTesting(!leaving)
                            .background(sideReader(id: ticket.id, railWidth: width))
                            .id(ticket.id)
                            .transition(.asymmetric(insertion: insertion, removal: .opacity))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                .coordinateSpace(name: Self.space)
                .overlay(alignment: .leading) { leftEdge(proxy: proxy, railWidth: width) }
                .overlay(alignment: .trailing) { rightEdge(proxy: proxy, railWidth: width) }
            }
        }
        .onChange(of: tickets.map(\.id)) { _, ids in
            let live = Set(ids)
            sides = sides.filter { live.contains($0.key) }
        }
    }

    private func sideReader(id: String, railWidth: CGFloat) -> some View {
        GeometryReader { geo in
            let frame = geo.frame(in: .named(Self.space))
            let side: Side = frame.minX < -1 ? .left : (frame.maxX > railWidth + 1 ? .right : .visible)
            Color.clear
                .onChange(of: side, initial: true) { _, new in
                    if sides[id] != new { sides[id] = new }
                }
        }
    }

    private func count(_ side: Side) -> Int {
        tickets.reduce(0) { $0 + (sides[$1.id] == side ? 1 : 0) }
    }

    /// Fracción de ancla que deja la tarjeta a `peek` puntos de la orilla izquierda.
    private func pageAnchor(railWidth: CGFloat) -> UnitPoint {
        let room = railWidth - PassTheme.cardWidth
        return UnitPoint(x: room > 0 ? Self.peek / room : 0, y: 0.5)
    }

    private func scroll(_ proxy: ScrollViewProxy, toIndex index: Int, railWidth: CGFloat) {
        guard tickets.indices.contains(index) else { return }
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.45)) {
            proxy.scrollTo(tickets[index].id, anchor: index == 0 ? .leading : pageAnchor(railWidth: railWidth))
        }
    }

    @ViewBuilder
    private func rightEdge(proxy: ScrollViewProxy, railWidth: CGFloat) -> some View {
        let hidden = count(.right)
        if hidden > 0 {
            ZStack(alignment: .trailing) {
                LinearGradient(colors: [PassTheme.ground.opacity(0), PassTheme.ground.opacity(0.94)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: 120)
                    .allowsHitTesting(false)
                Button {
                    // La primera ronda que no cabe completa pasa a la izquierda.
                    if let index = tickets.firstIndex(where: { sides[$0.id] == .right }) {
                        scroll(proxy, toIndex: index, railWidth: railWidth)
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text("+\(hidden)").monospacedDigit()
                        Image(systemName: "arrow.right")
                    }
                    .edgeButtonStyle()
                }
                .buttonStyle(.plain)
                .padding(.trailing, 12)
                .accessibilityLabel("Ver las siguientes \(hidden) comandas")
            }
            .transition(.opacity)
        }
    }

    @ViewBuilder
    private func leftEdge(proxy: ScrollViewProxy, railWidth: CGFloat) -> some View {
        let hidden = count(.left)
        if hidden > 0 {
            ZStack(alignment: .leading) {
                LinearGradient(colors: [PassTheme.ground.opacity(0.94), PassTheme.ground.opacity(0)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: Self.peek + 24)
                    .allowsHitTesting(false)
                Button {
                    let perPage = max(1, Int((railWidth - Self.peek) / (PassTheme.cardWidth + PassTheme.cardSpacing)))
                    let firstVisible = tickets.firstIndex(where: { sides[$0.id] != .left }) ?? 0
                    scroll(proxy, toIndex: max(0, firstVisible - perPage), railWidth: railWidth)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                        Text("\(hidden)").monospacedDigit()
                    }
                    .edgeButtonStyle()
                }
                .buttonStyle(.plain)
                .padding(.leading, 6)
                .accessibilityLabel("Ver las \(hidden) comandas anteriores")
            }
            .transition(.opacity)
        }
    }
}

private extension View {
    func edgeButtonStyle() -> some View {
        self
            .font(.system(size: 18, weight: .black))
            .foregroundColor(PassTheme.ground)
            .padding(.horizontal, 12)
            .frame(height: 52)
            .background(PassTheme.text)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .shadow(color: .black.opacity(0.6), radius: 12, y: 6)
    }
}

// MARK: — Ajustes

struct SettingsSheet: View {
    @Binding var kdsViewMode: String
    let isConnected: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Mostrar", selection: $kdsViewMode) {
                        Text("Toda la comanda").tag("all")
                        Text("Solo alimentos").tag("food")
                        Text("Solo bebidas").tag("beverages")
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text("Filtro de comanda")
                } footer: {
                    Text("Con filtro, \"Entregar todo\" y el aviso de ronda completa solo cuentan lo que esta estación ve.")
                }

                Section("Conexión") {
                    LabeledContent("Tiempo real", value: isConnected ? "Conectado" : "Reconectando…")
                    LabeledContent("Servidor", value: APIService.shared.baseURL)
                }
            }
            .navigationTitle("Ajustes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
}
