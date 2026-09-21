import SwiftUI

/// Administración de promociones para el POS de iPad. La selección y el
/// formulario viven aquí (en vez de POSViewModel) para mantener el estado de
/// edición exclusivo de esta pantalla y compartida únicamente la capa API.
struct PromotionsView: View {
    @ObservedObject var vm: POSViewModel
    @State private var promotions: [Promotion] = []
    @State private var isLoading = true
    @State private var isShowingEditor = false
    @State private var editingPromotion: Promotion?
    @State private var errorMessage: String?

    @State private var searchText = ""
    @State private var filter: PromoFilter = .all
    @State private var selectedPromotionId: String?
    @State private var isShowingDetail = false

    /// Se busca en `promotions` (no se cachea en el `@State` de selección) a
    /// propósito: así el sheet de detalle refleja de inmediato un toggle de
    /// "Activa" sin tener que sincronizar dos copias del mismo dato.
    private var selectedPromotion: Promotion? {
        guard let id = selectedPromotionId else { return nil }
        return promotions.first { $0.id == id }
    }

    private var liveCount: Int { promotions.filter { $0.scheduleInfo().state == .live }.count }
    private var scheduledCount: Int { promotions.filter { $0.scheduleInfo().state == .scheduled }.count }
    private var pausedCount: Int {
        promotions.filter { let s = $0.scheduleInfo().state; return s == .paused || s == .expired }.count
    }
    private var alwaysOnCount: Int {
        promotions.filter { p in
            p.active && p.parsedDaysOfWeek.isEmpty && p.startTime == nil && p.endTime == nil
                && p.startDate == nil && p.endDate == nil
        }.count
    }

    private var searchedPromotions: [Promotion] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return promotions }
        return promotions.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    private func bucket(_ p: Promotion) -> PromoFilter {
        switch p.scheduleInfo().state {
        case .live: return .live
        case .scheduled: return .scheduled
        case .paused, .expired: return .paused
        }
    }

    private var sections: [PromoSection] {
        let searched = searchedPromotions
        return [
            PromoSection(key: .live, title: "En vivo ahora", dotColor: .green,
                         items: searched.filter { bucket($0) == .live }),
            PromoSection(key: .scheduled, title: "Programadas", dotColor: Color.white.opacity(0.3),
                         items: searched.filter { bucket($0) == .scheduled }),
            PromoSection(key: .paused, title: "Pausadas y vencidas", dotColor: Color.white.opacity(0.3),
                         items: searched.filter { bucket($0) == .paused }),
        ]
    }

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()

            if isLoading {
                ProgressView("Cargando promociones…")
                    .tint(.white)
                    .foregroundStyle(.white)
            } else if promotions.isEmpty {
                ContentUnavailableView(
                    "Sin promociones",
                    systemImage: "tag",
                    description: Text("Crea una promoción para que aparezca en el POS.")
                )
                .foregroundStyle(.white)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        topBar
                        statsRow
                        filterBar
                        sectionsList
                    }
                    .padding(20)
                }
                .refreshable { await loadPromotions() }
            }
        }
        .task { await loadPromotions() }
        // Sin `.id()` a propósito, mismo motivo que ProductAddDialog en
        // MainPOSView: la vista se queda siempre montada (misma identidad) y
        // se resiembra con `.onChange(of: promotion?.id)` adentro — un `.id()`
        // que cambia justo al abrir fuerza un remount, que no anima.
        .bottomSheet(isPresented: isShowingEditor, onDismiss: { isShowingEditor = false }) {
            // 600, no 680: `BottomSheetOverlay` la esconde con un offset fijo
            // de 700pt — con 680 casi no quedaba margen y se asomaba una
            // rebaba de la tarjeta abajo de la pantalla (mismo bug detectado
            // en el form de Reservas).
            BottomSheetCard(maxHeight: 600, onDismiss: { isShowingEditor = false }) {
                PromotionEditorContent(
                    vm: vm,
                    promotion: editingPromotion,
                    onSaved: { saved in replace(saved) },
                    onCancel: { isShowingEditor = false }
                )
            }
        }
        .alert("No se pudo completar la acción", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("Aceptar", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Error desconocido")
        }
        // `PromotionDetailContent` se monta siempre (recibe `Promotion?`, no un
        // `if let` aquí arriba) — mismo motivo que ProductAddDialog en
        // MainPOSView: si el contenido de la hoja aparece/desaparece del
        // árbol junto con `isPresented`, la PRIMERA vez que se abre no tiene
        // geometría previa de la que animar y el slide-up se ve como un
        // "pop" instantáneo en vez de subir desde abajo.
        .bottomSheet(isPresented: isShowingDetail, onDismiss: { isShowingDetail = false }) {
            BottomSheetCard(maxHeight: 640, onDismiss: { isShowingDetail = false }) {
                PromotionDetailContent(
                    vm: vm,
                    promotion: selectedPromotion,
                    onToggle: { if let p = selectedPromotion { toggle(p) } },
                    onEdit: {
                        if let p = selectedPromotion {
                            isShowingDetail = false
                            editingPromotion = p
                            isShowingEditor = true
                        }
                    },
                    onDelete: {
                        if let p = selectedPromotion {
                            isShowingDetail = false
                            delete(p)
                        }
                    },
                    onClose: { isShowingDetail = false }
                )
            }
        }
    }

    // MARK: - Header

    private var topBar: some View {
        HStack(alignment: .center, spacing: 16) {
            HStack(spacing: 12) {
                Text("Promociones")
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(.white)
                livePill
            }
            Spacer(minLength: 12)
            HStack(spacing: 10) {
                searchField
                newPromotionButton
            }
        }
    }

    private var livePill: some View {
        HStack(spacing: 7) {
            PulsingDot()
            Text("\(liveCount) activa\(liveCount == 1 ? "" : "s") ahora")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.62))
        }
        .padding(.horizontal, 13)
        .frame(height: 30)
        .background(
            Capsule().fill(Color.white.opacity(0.045))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundStyle(Color.white.opacity(0.4))
            TextField("", text: $searchText, prompt: Text("Buscar promoción…").foregroundStyle(Color.white.opacity(0.3)))
                .foregroundStyle(.white)
                .font(.system(size: 14))
                .textFieldStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 40)
        .frame(minWidth: 220)
        .background(
            Capsule().fill(Color.white.opacity(0.045))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }

    private var newPromotionButton: some View {
        Button {
            editingPromotion = nil
            isShowingEditor = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 13, weight: .heavy))
                Text("Nueva promoción").font(.system(size: 14.5, weight: .bold))
            }
            .padding(.horizontal, 18)
            .frame(height: 44)
        }
        .buttonStyle(.flatCapsule(.blue))
    }

    // MARK: - Stats

    private var statsRow: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 12
            let unit = (geo.size.width - spacing * 3) / 4.4
            HStack(spacing: spacing) {
                heroCard.frame(width: max(unit * 1.4, 0))
                statTile(icon: "clock.fill", iconColor: .blue, iconBg: Color.blue.opacity(0.16),
                         value: "\(scheduledCount)", label: "Programadas")
                    .frame(width: max(unit, 0))
                statTile(icon: "line.3.horizontal", iconColor: .purple, iconBg: Color.purple.opacity(0.16),
                         value: "\(alwaysOnCount)", label: "Sin horario — siempre")
                    .frame(width: max(unit, 0))
                statTile(icon: "pause.circle.fill", iconColor: Color.white.opacity(0.5), iconBg: Color.white.opacity(0.09),
                         value: "\(pausedCount)", label: "Pausadas / vencidas")
                    .frame(width: max(unit, 0))
            }
        }
        .frame(height: 132)
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ACTIVAS AHORA")
                    .font(.system(size: 11.5, weight: .heavy))
                    .tracking(1)
                    .foregroundStyle(Color.white.opacity(0.6))
                Spacer()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("\(liveCount)")
                    .font(.system(size: 42, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text("de \(promotions.count) promociones en total")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Color.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(20)
        .modifier(FlatCard(cornerRadius: 20))
    }

    private func statTile(icon: String, iconColor: Color, iconBg: Color, value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(iconBg)
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(iconColor)
            }
            .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(size: 26, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text(label)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.45))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
        .modifier(FlatCard(cornerRadius: 20))
    }

    // MARK: - Filters

    private var filterBar: some View {
        HStack(spacing: 4) {
            filterButton(.all, count: promotions.count)
            filterButton(.live, count: liveCount)
            filterButton(.scheduled, count: scheduledCount)
            filterButton(.paused, count: pausedCount)
        }
        .padding(4)
        .background(
            Capsule().fill(Color.white.opacity(0.045))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }

    private func filterButton(_ f: PromoFilter, count: Int) -> some View {
        Button {
            filter = f
        } label: {
            HStack(spacing: 6) {
                Text(f.label)
                Text("\(count)").opacity(0.7)
            }
            .font(.system(size: 13, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(filter == f ? .white : Color.white.opacity(0.45))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(Capsule().fill(filter == f ? Color.white.opacity(0.12) : Color.clear))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sections + grid

    private var sectionsList: some View {
        let visible = sections.filter { (filter == .all || filter == $0.key) && !$0.items.isEmpty }
        return VStack(alignment: .leading, spacing: 22) {
            if visible.isEmpty {
                Text("Sin promociones para este filtro.")
                    .font(.subheadline)
                    .foregroundStyle(Color.white.opacity(0.45))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
            } else {
                ForEach(visible) { section in
                    VStack(alignment: .leading, spacing: 12) {
                        sectionHeader(section)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 12)], spacing: 12) {
                            ForEach(section.items) { promotion in
                                PromoCard(
                                    vm: vm,
                                    promotion: promotion,
                                    onTap: {
                                        selectedPromotionId = promotion.id
                                        isShowingDetail = true
                                    },
                                    onToggle: { toggle(promotion) },
                                    onEdit: {
                                        editingPromotion = promotion
                                        isShowingEditor = true
                                    },
                                    onDelete: { delete(promotion) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private func sectionHeader(_ section: PromoSection) -> some View {
        HStack(spacing: 10) {
            Circle().fill(section.dotColor).frame(width: 8, height: 8)
            Text(section.title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
            Text("\(section.items.count)")
                .font(.system(size: 12.5, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Color.white.opacity(0.45))
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
        }
    }

    // MARK: - Data

    private func loadPromotions() async {
        isLoading = true
        defer { isLoading = false }
        do {
            promotions = try await APIService.shared.fetchPromotions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func replace(_ promotion: Promotion) {
        if let index = promotions.firstIndex(where: { $0.id == promotion.id }) {
            promotions[index] = promotion
        } else {
            promotions.append(promotion)
        }
    }

    private func toggle(_ promotion: Promotion) {
        Task {
            do {
                let updated = try await APIService.shared.updatePromotion(id: promotion.id, body: ["active": !promotion.active])
                replace(updated)
                vm.showToast(updated.active ? "Promoción activada" : "Promoción desactivada")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func delete(_ promotion: Promotion) {
        Task {
            do {
                try await APIService.shared.deletePromotion(id: promotion.id)
                promotions.removeAll { $0.id == promotion.id }
                vm.showToast("Promoción eliminada")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Filter/section support types

enum PromoFilter: String, CaseIterable {
    case all, live, scheduled, paused

    var label: String {
        switch self {
        case .all: return "Todas"
        case .live: return "En vivo"
        case .scheduled: return "Programadas"
        case .paused: return "Pausadas"
        }
    }
}

private struct PromoSection: Identifiable {
    let key: PromoFilter
    let title: String
    let dotColor: Color
    let items: [Promotion]
    var id: PromoFilter { key }
}

// MARK: - Type metadata (icono/color/etiqueta por tipo de promo)

private struct PromoTypeMeta {
    let icon: String
    let color: Color
    let dim: Color
    let label: (Promotion) -> String
}

private let promoTypeMeta: [String: PromoTypeMeta] = [
    "buy_x_get_y": PromoTypeMeta(icon: "cart.fill", color: .purple, dim: Color.purple.opacity(0.16)) { p in
        "Compra \(p.buyQuantity ?? 0), lleva \(p.getQuantity ?? 0)"
    },
    "percentage_discount": PromoTypeMeta(icon: "percent", color: .orange, dim: Color.orange.opacity(0.16)) { p in
        "\(String(format: "%.0f", p.discountPercentage ?? 0))% de descuento"
    },
    "fixed_discount": PromoTypeMeta(icon: "dollarsign.circle.fill", color: .cyan, dim: Color.cyan.opacity(0.16)) { p in
        "$\(String(format: "%.2f", p.discountAmount ?? 0)) de descuento"
    },
    "combo": PromoTypeMeta(icon: "square.grid.2x2.fill", color: .pink, dim: Color.pink.opacity(0.16)) { _ in
        "Combo"
    },
]

private func typeMeta(for promotion: Promotion) -> PromoTypeMeta {
    promoTypeMeta[promotion.type] ?? PromoTypeMeta(icon: "tag.fill", color: .gray, dim: Color.gray.opacity(0.16)) { $0.type }
}

private func applyToSummary(_ promotion: Promotion, vm: POSViewModel) -> String {
    switch promotion.applyTo {
    case "all_products":
        return "Todos los productos"
    case "category":
        return "Categoría · \(vm.categories.first { $0.id == promotion.categoryId }?.name ?? "Categoría")"
    case "specific_products":
        let ids = promotion.parsedProductIds
        if ids.count <= 1 {
            let name = ids.first.flatMap { id in vm.products.first { $0.id == id }?.name }
            return name ?? "1 producto"
        }
        return "\(ids.count) productos seleccionados"
    default:
        return promotion.applyTo
    }
}

private func timeToPct(_ hhmm: String) -> Double {
    let parts = hhmm.split(separator: ":").compactMap { Int($0) }
    guard parts.count >= 2 else { return 0 }
    return Double(parts[0] * 60 + parts[1]) / 1440.0 * 100.0
}

// MARK: - Pulsing dot (pill "N activas ahora")

private struct PulsingDot: View {
    @State private var animate = false
    var color: Color = .green

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .overlay(
                Circle()
                    .stroke(color.opacity(0.55), lineWidth: 1.4)
                    .scaleEffect(animate ? 2.6 : 1)
                    .opacity(animate ? 0 : 1)
            )
            .onAppear {
                withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) {
                    animate = true
                }
            }
    }
}

// MARK: - Mini switch (mismo look que el toggle "Activa" del mock)

private struct MiniSwitch: View {
    let isOn: Bool

    var body: some View {
        ZStack(alignment: isOn ? .trailing : .leading) {
            Capsule()
                .fill(isOn ? Color.green : Color.white.opacity(0.09))
                .overlay(Capsule().stroke(isOn ? Color.clear : Color.white.opacity(0.1), lineWidth: 1))
            Circle()
                .fill(Color.white)
                .padding(2)
        }
        .frame(width: 42, height: 25)
        .animation(.easeInOut(duration: 0.18), value: isOn)
    }
}

// MARK: - Promo card

private struct PromoCard: View {
    @ObservedObject var vm: POSViewModel
    let promotion: Promotion
    let onTap: () -> Void
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    private var meta: PromoTypeMeta { typeMeta(for: promotion) }
    private var schedule: PromotionScheduleInfo { promotion.scheduleInfo() }

    private var statusLabel: String {
        switch schedule.state {
        case .live: return "Activo"
        case .scheduled: return "Programada"
        case .paused: return "Pausada"
        case .expired: return "Vencida"
        }
    }

    private var hasScheduleVisual: Bool {
        !promotion.parsedDaysOfWeek.isEmpty || promotion.startTime != nil || promotion.endTime != nil
    }

    private var isScheduleFree: Bool {
        promotion.parsedDaysOfWeek.isEmpty && promotion.startTime == nil && promotion.endTime == nil
            && promotion.startDate == nil && promotion.endDate == nil
    }

    private var dateRangeChipText: String? {
        guard promotion.startDate != nil || promotion.endDate != nil else { return nil }
        var parts: [String] = []
        if let s = promotion.startDate { parts.append("desde \(Promotion.friendlyDate(s))") }
        if let e = promotion.endDate { parts.append("hasta \(Promotion.friendlyDate(e))") }
        return parts.joined(separator: " · ")
    }

    private var statusLineText: String? {
        if schedule.state == .live {
            if let end = promotion.endTime { return "Termina a las \(String(end.prefix(5)))" }
            return "Activa ahora, sin hora de fin"
        }
        return schedule.reason
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            topRow
            chipsRow
            if hasScheduleVisual {
                VStack(alignment: .leading, spacing: 8) {
                    if !promotion.parsedDaysOfWeek.isEmpty { weekDotsRow }
                    if promotion.startTime != nil || promotion.endTime != nil { timeTrack }
                }
            }
            if let text = statusLineText {
                HStack(spacing: 6) {
                    Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                    Text(text)
                }
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.6))
            }
            Divider().overlay(Color.white.opacity(0.1))
            footer
        }
        .padding(16)
        .modifier(FlatCard(cornerRadius: 16))
        .overlay(alignment: .topTrailing) {
            if let priority = promotion.priority, priority > 0 {
                Text("Prioridad \(priority)")
                    .font(.system(size: 10.5, weight: .heavy))
                    .foregroundStyle(Color.white.opacity(0.45))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(Color.white.opacity(0.06))
                            .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                    )
                    .padding(14)
            }
        }
        .opacity(schedule.state == .expired ? 0.55 : (schedule.state == .paused ? 0.68 : 1))
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private var topRow: some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                RoundedRectangle(cornerRadius: 11, style: .continuous).fill(meta.dim)
                Image(systemName: meta.icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(meta.color)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 1) {
                Text(promotion.name)
                    .font(.system(size: 15.5, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(meta.label(promotion))
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundStyle(meta.color)
            }
            Spacer(minLength: 6)

            HStack(spacing: 6) {
                Circle()
                    .fill(schedule.state == .live ? Color.green : Color.white.opacity(0.3))
                    .frame(width: 6, height: 6)
                Text(statusLabel).font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(Color.white.opacity(0.85))
            .padding(.horizontal, 10)
            .frame(height: 23)
            .background(
                Capsule().fill(Color.white.opacity(0.06))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
        }
    }

    private var chipsRow: some View {
        FlowLayout(spacing: 6) {
            chip(applyToSummary(promotion, vm: vm))
            if let dateText = dateRangeChipText { chip(dateText) }
            if isScheduleFree { chip("Sin restricción de horario") }
        }
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.6))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .frame(height: 22)
            .background(
                Capsule().fill(Color.white.opacity(0.06))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
    }

    private var weekDotsRow: some View {
        let letters = ["D", "L", "M", "M", "J", "V", "S"]
        let today = Calendar(identifier: .gregorian).component(.weekday, from: Date()) - 1
        return HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { i in
                let on = promotion.parsedDaysOfWeek.isEmpty || promotion.parsedDaysOfWeek.contains(i)
                Text(letters[i])
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(on ? meta.color : Color.white.opacity(0.3))
                    .frame(width: 21, height: 21)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(on ? meta.dim : Color.white.opacity(0.05))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(i == today ? meta.color : .clear, lineWidth: 1.4)
                    )
            }
        }
    }

    private var timeTrack: some View {
        let startPct = timeToPct(promotion.startTime.map { String($0.prefix(5)) } ?? "00:00")
        let endPct = timeToPct(promotion.endTime.map { String($0.prefix(5)) } ?? "23:59")
        let nowPct = timeToPct(Promotion.hhmm(Date()))
        return VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.09))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(meta.color.opacity(0.55))
                        .frame(width: max(geo.size.width * CGFloat(endPct - startPct) / 100, 3))
                        .offset(x: geo.size.width * CGFloat(startPct) / 100)
                    Rectangle()
                        .fill(Color.white)
                        .frame(width: 2.5)
                        .offset(x: geo.size.width * CGFloat(nowPct) / 100)
                        .shadow(color: .white.opacity(0.7), radius: 4)
                }
            }
            .frame(height: 7)
            HStack {
                Text(promotion.startTime.map { String($0.prefix(5)) } ?? "00:00")
                Spacer()
                Text(promotion.endTime.map { String($0.prefix(5)) } ?? "23:59")
            }
            .font(.system(size: 10.5, design: .monospaced))
            .foregroundStyle(Color.white.opacity(0.3))
        }
    }

    private var footer: some View {
        HStack {
            HStack(spacing: 8) {
                MiniSwitch(isOn: promotion.active)
                    .onTapGesture(perform: onToggle)
                Text(promotion.active ? "Activa" : "Pausada")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.45))
            }
            Spacer()
            HStack(spacing: 6) {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.flatCircleNeutral)

                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.red)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.flatCircleNeutral)
            }
        }
    }
}

// MARK: - Detail sheet content (misma BottomSheetCard que Pago/Notas)

/// Envoltura siempre montada: recibe `Promotion?` y despacha a
/// `PromotionDetailBody` (que ya no es opcional) para no envolver el
/// contenido real en un `if let` a este nivel — ver el comentario en
/// `PromotionsView.body` sobre por qué eso rompe el slide-up.
private struct PromotionDetailContent: View {
    @ObservedObject var vm: POSViewModel
    let promotion: Promotion?
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onClose: () -> Void

    var body: some View {
        if let promotion {
            PromotionDetailBody(vm: vm, promotion: promotion, onToggle: onToggle, onEdit: onEdit, onDelete: onDelete, onClose: onClose)
        } else {
            Color.clear.frame(height: 1)
        }
    }
}

private struct PromotionDetailBody: View {
    @ObservedObject var vm: POSViewModel
    let promotion: Promotion
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onClose: () -> Void

    private var meta: PromoTypeMeta { typeMeta(for: promotion) }
    private var schedule: PromotionScheduleInfo { promotion.scheduleInfo() }

    private var statusLabel: String {
        switch schedule.state {
        case .live: return "Activo"
        case .scheduled: return "Programada"
        case .paused: return "Pausada"
        case .expired: return "Vencida"
        }
    }

    private var categoryName: String {
        vm.categories.first { $0.id == promotion.categoryId }?.name ?? "Categoría"
    }

    private var productNames: [String] {
        let ids = promotion.parsedProductIds
        return ids.compactMap { id in vm.products.first { $0.id == id }?.name }
    }

    private var daysValueText: String {
        let days = promotion.parsedDaysOfWeek
        if days.isEmpty || days.count == 7 { return "Todos los días" }
        let names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
        return days.sorted().map { names[$0] }.joined(separator: ", ")
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let description = promotion.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Color.white.opacity(0.6))
                }
                statusCallout
                section("APLICA A") { applyPanel }
                section("VIGENCIA") { vigenciaPanel }
                section("DETALLES") { detallesPanel }
                actions
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous).fill(meta.dim)
                Image(systemName: meta.icon).font(.system(size: 18, weight: .semibold)).foregroundStyle(meta.color)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(promotion.name)
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(.white)
                Text(meta.label(promotion))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(meta.color)
            }
            Spacer(minLength: 8)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.flatCircleNeutral)
        }
    }

    private var statusCallout: some View {
        let text: String
        let subtitle: String?
        if schedule.state == .live {
            text = "En vivo ahora mismo"
            subtitle = promotion.endTime.map { "Termina a las \(String($0.prefix(5)))" } ?? "Sin hora de fin configurada"
        } else {
            text = statusLabel
            subtitle = schedule.reason
        }
        return HStack(spacing: 10) {
            Circle()
                .fill(schedule.state == .live ? Color.green : Color.white.opacity(0.3))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(text).font(.system(size: 13.5, weight: .bold)).foregroundStyle(.white)
                if let subtitle {
                    Text(subtitle).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(Color.white.opacity(0.45))
                }
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.05)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11.5, weight: .heavy))
                .tracking(0.8)
                .foregroundStyle(Color.white.opacity(0.45))
            content()
        }
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.035)))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private func drow<Value: View>(_ label: String, subtitle: String? = nil, @ViewBuilder value: () -> Value) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.6))
                if let subtitle {
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.3))
                }
            }
            Spacer(minLength: 8)
            value().multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 12)
    }

    private var rowDivider: some View { Divider().overlay(Color.white.opacity(0.1)) }

    private func productTag(_ name: String) -> some View {
        Text(name)
            .font(.system(size: 11.5, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.6))
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(
                Capsule().fill(Color.white.opacity(0.06))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
    }

    @ViewBuilder
    private var applyPanel: some View {
        panel {
            switch promotion.applyTo {
            case "category":
                drow("Categoría") {
                    Text(categoryName).font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
            case "specific_products":
                let names = productNames
                drow(names.count == 1 ? "1 producto" : "\(names.count) productos") {
                    if names.count > 1 {
                        FlowLayout(spacing: 6) {
                            ForEach(names, id: \.self) { name in productTag(name) }
                        }
                    } else {
                        Text(names.first ?? "1 producto").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                    }
                }
            default:
                drow("Alcance") {
                    Text("Todos los productos").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
            }
        }
    }

    private var vigenciaPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            panel {
                drow("Días") {
                    Text(daysValueText).font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
                rowDivider
                drow("Horario") {
                    let hasWindow = promotion.startTime != nil || promotion.endTime != nil
                    Text(hasWindow
                         ? "\(String((promotion.startTime ?? "00:00").prefix(5))) – \(String((promotion.endTime ?? "23:59").prefix(5)))"
                         : "Todo el día")
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
                rowDivider
                drow("Fecha de inicio") {
                    Text(promotion.startDate.map { Promotion.friendlyDate($0) } ?? "Sin definir")
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
                rowDivider
                drow("Fecha de término") {
                    Text(promotion.endDate.map { Promotion.friendlyDate($0) } ?? "Sin definir")
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
            }
            if !promotion.parsedDaysOfWeek.isEmpty {
                weekDotsDetail
            }
        }
    }

    private var weekDotsDetail: some View {
        let letters = ["D", "L", "M", "M", "J", "V", "S"]
        let today = Calendar(identifier: .gregorian).component(.weekday, from: Date()) - 1
        return HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                let on = promotion.parsedDaysOfWeek.isEmpty || promotion.parsedDaysOfWeek.contains(i)
                Text(letters[i])
                    .font(.system(size: 9.5, weight: .heavy))
                    .foregroundStyle(on ? .white : Color.white.opacity(0.3))
                    .frame(width: 30, height: 30)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(on ? Color.white.opacity(0.1) : Color.white.opacity(0.05))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(i == today ? Color.white.opacity(0.6) : .clear, lineWidth: 1.4)
                    )
            }
        }
    }

    private var detallesPanel: some View {
        panel {
            drow("Prioridad", subtitle: "Si varias promos aplican al mismo producto, gana la de mayor prioridad") {
                Text("\(promotion.priority ?? 0)").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            }
            rowDivider
            drow("Visible en POS") {
                Text(promotion.active ? "Sí" : "No, pausada").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 10) {
            Button(action: onToggle) {
                Text(promotion.active ? "Pausar" : "Activar")
                    .font(.system(size: 14.5, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .buttonStyle(.flatCapsuleNeutral)

            Button(action: onEdit) {
                Text("Editar")
                    .font(.system(size: 14.5, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .buttonStyle(.flatCapsule(.blue))

            Button(action: onDelete) {
                Image(systemName: "trash").font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.red)
            .frame(width: 46, height: 46)
            .background(
                Capsule().fill(Color.red.opacity(0.1))
                    .overlay(Capsule().stroke(Color.red.opacity(0.25), lineWidth: 1))
            )
        }
    }
}

// MARK: - Flow layout (chips que hacen wrap, como flex-wrap en CSS)

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var lineWidth: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if lineWidth > 0 && lineWidth + spacing + size.width > maxWidth {
                totalWidth = max(totalWidth, lineWidth)
                totalHeight += lineHeight + spacing
                lineWidth = 0
                lineHeight = 0
            }
            lineWidth += (lineWidth > 0 ? spacing : 0) + size.width
            lineHeight = max(lineHeight, size.height)
        }
        totalWidth = max(totalWidth, lineWidth)
        totalHeight += lineHeight
        return CGSize(width: maxWidth.isFinite ? maxWidth : totalWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: .unspecified)
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// Mismo `BottomSheetCard` que el resto de la app (Pago/Notas/Detalle de
/// promoción) en vez de un `.sheet` nativo con `Form` — antes se veía como
/// una pantalla completamente distinta al resto del rediseño, tanto para
/// crear como para editar.
private struct PromotionEditorContent: View {
    @ObservedObject var vm: POSViewModel
    let promotion: Promotion?
    let onSaved: (Promotion) -> Void
    let onCancel: () -> Void

    @State private var name: String
    @State private var description: String
    @State private var type: String
    @State private var buyQuantity: Int
    @State private var getQuantity: Int
    @State private var discountPercentage: Double
    @State private var discountAmount: Double
    @State private var applyTo: String
    @State private var productIds: Set<String>
    @State private var categoryId: String
    @State private var active: Bool
    @State private var hasStartDate: Bool
    @State private var startDate: Date
    @State private var hasEndDate: Bool
    @State private var endDate: Date
    @State private var daysOfWeek: Set<Int>
    @State private var hasStartTime: Bool
    @State private var startTime: String
    @State private var hasEndTime: Bool
    @State private var endTime: String
    @State private var priority: Int
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingProductPicker = false

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    init(vm: POSViewModel, promotion: Promotion?, onSaved: @escaping (Promotion) -> Void, onCancel: @escaping () -> Void) {
        self.vm = vm
        self.promotion = promotion
        self.onSaved = onSaved
        self.onCancel = onCancel
        _name = State(initialValue: promotion?.name ?? "")
        _description = State(initialValue: promotion?.description ?? "")
        _type = State(initialValue: promotion?.type ?? "buy_x_get_y")
        _buyQuantity = State(initialValue: promotion?.buyQuantity ?? 2)
        _getQuantity = State(initialValue: promotion?.getQuantity ?? 1)
        _discountPercentage = State(initialValue: promotion?.discountPercentage ?? 10)
        _discountAmount = State(initialValue: promotion?.discountAmount ?? 10)
        _applyTo = State(initialValue: promotion?.applyTo ?? "all_products")
        _productIds = State(initialValue: Set(promotion?.parsedProductIds ?? []))
        _categoryId = State(initialValue: promotion?.categoryId ?? "")
        _active = State(initialValue: promotion?.active ?? true)
        _hasStartDate = State(initialValue: promotion?.startDate != nil)
        _startDate = State(initialValue: promotion.flatMap { Self.dateFormatter.date(from: $0.startDate ?? "") } ?? Date())
        _hasEndDate = State(initialValue: promotion?.endDate != nil)
        _endDate = State(initialValue: promotion.flatMap { Self.dateFormatter.date(from: $0.endDate ?? "") } ?? Date())
        _daysOfWeek = State(initialValue: Set(promotion?.parsedDaysOfWeek ?? []))
        _hasStartTime = State(initialValue: promotion?.startTime != nil)
        _startTime = State(initialValue: promotion?.startTime ?? "09:00")
        _hasEndTime = State(initialValue: promotion?.endTime != nil)
        _endTime = State(initialValue: promotion?.endTime ?? "18:00")
        _priority = State(initialValue: promotion?.priority ?? 0)
    }

    /// Resiembra todos los campos cuando cambia la promoción a editar —
    /// necesario porque, al no usar `.id()`, esta vista se queda montada de
    /// forma permanente y `init()` no vuelve a correr.
    private func reseed(_ promotion: Promotion?) {
        name = promotion?.name ?? ""
        description = promotion?.description ?? ""
        type = promotion?.type ?? "buy_x_get_y"
        buyQuantity = promotion?.buyQuantity ?? 2
        getQuantity = promotion?.getQuantity ?? 1
        discountPercentage = promotion?.discountPercentage ?? 10
        discountAmount = promotion?.discountAmount ?? 10
        applyTo = promotion?.applyTo ?? "all_products"
        productIds = Set(promotion?.parsedProductIds ?? [])
        categoryId = promotion?.categoryId ?? ""
        active = promotion?.active ?? true
        hasStartDate = promotion?.startDate != nil
        startDate = promotion.flatMap { Self.dateFormatter.date(from: $0.startDate ?? "") } ?? Date()
        hasEndDate = promotion?.endDate != nil
        endDate = promotion.flatMap { Self.dateFormatter.date(from: $0.endDate ?? "") } ?? Date()
        daysOfWeek = Set(promotion?.parsedDaysOfWeek ?? [])
        hasStartTime = promotion?.startTime != nil
        startTime = promotion?.startTime ?? "09:00"
        hasEndTime = promotion?.endTime != nil
        endTime = promotion?.endTime ?? "18:00"
        priority = promotion?.priority ?? 0
        showingProductPicker = false
        errorMessage = nil
    }

    var body: some View {
        Group {
            if showingProductPicker {
                productPickerContent
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
            } else {
                formContent
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: showingProductPicker)
        .onChange(of: promotion?.id) { _, _ in reseed(promotion) }
        .alert("Revisa la promoción", isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) { Button("Aceptar", role: .cancel) { errorMessage = nil } } message: {
            Text(errorMessage ?? "")
        }
    }

    private var productPickerContent: some View {
        VStack(spacing: 14) {
            HStack {
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { showingProductPicker = false }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left").font(.system(size: 13, weight: .bold))
                        Text("Productos").font(.system(size: 17, weight: .heavy))
                    }
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                Spacer()
                Text("\(productIds.count) seleccionados")
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.45))
            }
            PromotionProductPicker(products: vm.products, selectedIds: $productIds)
        }
    }

    private var formContent: some View {
        VStack(spacing: 0) {
            header
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    infoPanel
                    typePanel
                    applyPanel
                    vigenciaPanel
                }
                .padding(.top, 6)
                .padding(.bottom, 4)
            }
            actions
        }
    }

    // MARK: - Header/footer (mismo look que el detalle de promoción)

    private var header: some View {
        HStack {
            Text(promotion == nil ? "Nueva promoción" : "Editar promoción")
                .font(.system(size: 19, weight: .heavy))
                .foregroundStyle(.white)
            Spacer()
            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.flatCircleNeutral)
        }
        .padding(.bottom, 2)
    }

    private var actions: some View {
        HStack(spacing: 10) {
            Button(action: onCancel) {
                Text("Cancelar")
                    .font(.system(size: 14.5, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .buttonStyle(.flatCapsuleNeutral)

            Button(action: save) {
                Text(isSaving ? "Guardando…" : "Guardar")
                    .font(.system(size: 14.5, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .buttonStyle(.flatCapsule(.blue))
            .disabled(isSaving)
        }
        .padding(.top, 12)
    }

    // MARK: - Sections

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11.5, weight: .heavy))
            .tracking(0.8)
            .foregroundStyle(Color.white.opacity(0.45))
    }

    private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(title)
            VStack(alignment: .leading, spacing: 14, content: content)
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.035)))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        }
    }

    private func styledField(_ placeholder: String, text: Binding<String>, axis: Axis = .horizontal) -> some View {
        TextField(placeholder, text: text, axis: axis)
            .foregroundStyle(.white)
            .font(.system(size: 14))
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private var infoPanel: some View {
        panel("Información") {
            styledField("Nombre", text: $name)
            styledField("Descripción (opcional)", text: $description, axis: .vertical)
            Toggle("Activa", isOn: $active).tint(.green)
            Stepper("Prioridad: \(priority)", value: $priority, in: 0...100)
        }
    }

    private var typePanel: some View {
        panel("Tipo de promoción") {
            Picker("Tipo", selection: $type) {
                Text("Compra X lleva Y").tag("buy_x_get_y")
                Text("Descuento porcentual").tag("percentage_discount")
                Text("Descuento fijo").tag("fixed_discount")
            }
            .pickerStyle(.menu)
            .tint(.white)

            if type == "buy_x_get_y" {
                Stepper("Compra: \(buyQuantity)", value: $buyQuantity, in: 1...50)
                Stepper("Lleva: \(getQuantity)", value: $getQuantity, in: 1...50)
            } else if type == "percentage_discount" {
                Stepper("Descuento: \(String(format: "%.0f", discountPercentage))%", value: $discountPercentage, in: 1...100, step: 1)
            } else {
                Stepper("Descuento: $\(String(format: "%.2f", discountAmount))", value: $discountAmount, in: 1...10_000, step: 5)
            }
        }
    }

    private var applyPanel: some View {
        panel("Aplica a") {
            Picker("Alcance", selection: $applyTo) {
                Text("Todos los productos").tag("all_products")
                Text("Productos específicos").tag("specific_products")
                Text("Categoría").tag("category")
            }
            .pickerStyle(.menu)
            .tint(.white)

            if applyTo == "specific_products" {
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { showingProductPicker = true }
                } label: {
                    HStack {
                        Text("Productos seleccionados: \(productIds.count)")
                            .font(.system(size: 14))
                            .foregroundStyle(.white)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.white.opacity(0.3))
                    }
                }
                .buttonStyle(.plain)
            } else if applyTo == "category" {
                Picker("Categoría", selection: $categoryId) {
                    Text("Selecciona una categoría").tag("")
                    ForEach(vm.categories) { category in
                        Text(category.name).tag(category.id)
                    }
                }
                .tint(.white)
            }
        }
    }

    private var vigenciaPanel: some View {
        panel("Vigencia") {
            Toggle("Fecha de inicio", isOn: $hasStartDate).tint(.green)
            if hasStartDate { DatePicker("Inicia", selection: $startDate, displayedComponents: .date) }
            Toggle("Fecha de fin", isOn: $hasEndDate).tint(.green)
            if hasEndDate { DatePicker("Termina", selection: $endDate, displayedComponents: .date) }

            VStack(alignment: .leading, spacing: 8) {
                Text("Días de la semana (vacío = todos)")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.6))
                HStack {
                    ForEach(0...6, id: \.self) { day in
                        Button(["D", "L", "M", "M", "J", "V", "S"][day]) { toggleDay(day) }
                            .font(.caption.weight(.bold))
                            .frame(width: 30, height: 30)
                            .modifier(FlatPill(isSelected: daysOfWeek.contains(day), color: .blue))
                            .buttonStyle(.plain)
                    }
                }
            }
            Toggle("Hora de inicio", isOn: $hasStartTime).tint(.green)
            if hasStartTime { styledField("HH:mm", text: $startTime).keyboardType(.numbersAndPunctuation) }
            Toggle("Hora de fin", isOn: $hasEndTime).tint(.green)
            if hasEndTime { styledField("HH:mm", text: $endTime).keyboardType(.numbersAndPunctuation) }
        }
    }

    private func toggleDay(_ day: Int) {
        if daysOfWeek.contains(day) { daysOfWeek.remove(day) } else { daysOfWeek.insert(day) }
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { errorMessage = "Escribe un nombre para la promoción"; return }
        guard applyTo != "specific_products" || !productIds.isEmpty else { errorMessage = "Selecciona al menos un producto"; return }
        guard applyTo != "category" || !categoryId.isEmpty else { errorMessage = "Selecciona una categoría"; return }

        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                let payload = payload(name: trimmedName)
                let saved: Promotion
                if let promotion {
                    saved = try await APIService.shared.updatePromotion(id: promotion.id, body: payload)
                } else {
                    saved = try await APIService.shared.createPromotion(body: payload)
                }
                onSaved(saved)
                vm.showToast(promotion == nil ? "Promoción creada" : "Promoción actualizada")
                onCancel()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func payload(name: String) -> [String: Any] {
        [
            "name": name,
            "description": description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : description,
            "type": type,
            "buyQuantity": type == "buy_x_get_y" ? buyQuantity : NSNull(),
            "getQuantity": type == "buy_x_get_y" ? getQuantity : NSNull(),
            "discountPercentage": type == "percentage_discount" ? discountPercentage : NSNull(),
            "discountAmount": type == "fixed_discount" ? discountAmount : NSNull(),
            "applyTo": applyTo,
            "productIds": applyTo == "specific_products" ? Array(productIds).sorted() : NSNull(),
            "categoryId": applyTo == "category" ? categoryId : NSNull(),
            "active": active,
            "startDate": hasStartDate ? Self.dateFormatter.string(from: startDate) : NSNull(),
            "endDate": hasEndDate ? Self.dateFormatter.string(from: endDate) : NSNull(),
            "daysOfWeek": daysOfWeek.isEmpty ? NSNull() : daysOfWeek.sorted(),
            "startTime": hasStartTime ? startTime : NSNull(),
            "endTime": hasEndTime ? endTime : NSNull(),
            "priority": priority,
            "comboRules": NSNull(),
        ]
    }
}

/// Sin `List`/`NavigationStack`/`.searchable` a propósito: ambos pintan su
/// propio fondo opaco de sistema (negro en modo oscuro), una capa aparte del
/// fondo de `BottomSheetCard` — mismo problema que tenía el `NavigationLink`
/// que envolvía esta vista. Búsqueda + filas con el mismo estilo flat que el
/// resto de la hoja.
private struct PromotionProductPicker: View {
    let products: [Product]
    @Binding var selectedIds: Set<String>
    @State private var searchText = ""

    private var filteredProducts: [Product] {
        guard !searchText.isEmpty else { return products }
        return products.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.4))
                TextField("", text: $searchText, prompt: Text("Buscar producto…").foregroundStyle(Color.white.opacity(0.3)))
                    .foregroundStyle(.white)
                    .font(.system(size: 14))
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))

            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 8) {
                    ForEach(filteredProducts) { product in
                        let isSelected = selectedIds.contains(product.id)
                        Button {
                            if isSelected { selectedIds.remove(product.id) } else { selectedIds.insert(product.id) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(product.name)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.white)
                                    if let category = product.category?.name {
                                        Text(category)
                                            .font(.system(size: 11.5))
                                            .foregroundStyle(Color.white.opacity(0.45))
                                    }
                                }
                                Spacer()
                                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 17))
                                    .foregroundStyle(isSelected ? Color.blue : Color.white.opacity(0.25))
                            }
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.035)))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 4)
            }
        }
    }
}
