import SwiftUI
import Combine

private let isoDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

private let hhmmFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "HH:mm"
    return f
}()

/// Reservas — visible para cualquier empleado (no solo admin), rediseñada
/// con el mismo lenguaje visual que Promociones: stats + filtros + una vista
/// de agenda por horas (en vez de una lista de tarjetas) para que salten a
/// la vista los huecos y choques de horario del día. Detalle y formulario
/// de Nueva/Editar reserva comparten la misma `BottomSheetCard` que el
/// resto de la app (Pago/Notas/Promociones).
struct ReservationsView: View {
    @StateObject private var vm: ReservationsViewModel

    init(initialStatusFilter: String = "all") {
        _vm = StateObject(wrappedValue: ReservationsViewModel(initialStatusFilter: initialStatusFilter))
    }

    @State private var selectedReservationId: String?
    @State private var editingReservation: Reservation?
    @State private var isShowingForm = false
    @State private var showDatePicker = false
    /// Última hora a la que se hizo auto-scroll — evita re-centrar en cada
    /// tick del timer si la hora en curso no cambió (dejaría de pelearse
    /// con quien esté hojeando el timeline a mano).
    @State private var lastAutoScrollHour: Int?
    @State private var autoScrollTimer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()

    private let startHour = 12
    private let endHour = 23
    private let rowHeight: CGFloat = 64
    /// Alto fijo de la tarjeta del timeline — con esto el slide de horas es
    /// vertical y vive adentro de la tarjeta (como un calendario tipo
    /// día/agenda), en vez de forzar a que la página completa crezca hasta
    /// el alto de las 11 horas.
    private let timelineCardHeight: CGFloat = 520

    private var selectedReservation: Reservation? {
        guard let id = selectedReservationId else { return nil }
        return vm.reservations.first { $0.id == id }
    }

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()

            // Sin `ScrollView` en la página — a propósito: la página se
            // queda fija, lo único que se desliza es el timeline (horizontal,
            // adentro de `timelineCard`). Un `ScrollView` vertical aquí
            // arriba hacía que arrastrar sobre el timeline moviera TODA la
            // página, y se sentía como si el timeline también scrolleara
            // vertical.
            VStack(alignment: .leading, spacing: 18) {
                topBar
                statsRow
                filterBar
                dayHeading
                if placedReservations.isEmpty {
                    Text("Sin reservas para este filtro.")
                        .font(.subheadline)
                        .foregroundStyle(Color.white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else {
                    timelineRow
                }
                Spacer(minLength: 0)
            }
            .padding(20)

            if vm.loading && vm.reservations.isEmpty {
                ProgressView("Cargando reservas…").tint(.white).foregroundStyle(.white)
            }

            if let toast = vm.toastMessage {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Image(systemName: vm.toastIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundColor(vm.toastIsError ? .red : .green)
                        Text(toast).font(.subheadline).foregroundColor(.white)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Color(white: 0.15)).cornerRadius(10)
                    .padding(.bottom, 30)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(), value: vm.toastMessage)
            }
        }
        .task { await vm.loadData() }
        .onChange(of: vm.selectedDate) { _, _ in Task { await vm.loadData() } }
        .sheet(isPresented: $showDatePicker) { datePickerSheet }
        // Sin `.id()` a propósito — se resiembra con `.onChange(of:)` adentro,
        // igual que el editor de Promociones (un `.id()` que cambia justo al
        // abrir fuerza un remount, que no anima el slide-up).
        .bottomSheet(isPresented: isShowingForm, onDismiss: { isShowingForm = false }) {
            // 600, no 680: `BottomSheetOverlay` la esconde con un offset fijo
            // de 700pt — con maxHeight 680 quedaban ~6pt de margen y una
            // rebaba de la tarjeta se asomaba abajo de la pantalla.
            BottomSheetCard(maxHeight: 600, onDismiss: { isShowingForm = false }) {
                ReservationFormContent(
                    vm: vm,
                    reservation: editingReservation,
                    defaultDate: vm.selectedDate,
                    onCancel: { isShowingForm = false }
                )
            }
        }
    }

    // MARK: - Header

    private var topBar: some View {
        HStack(alignment: .center, spacing: 16) {
            Text("Reservas")
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(.white)
            Spacer(minLength: 12)
            HStack(spacing: 10) {
                dayNav
                refreshButton
                searchField
                newReservationButton
            }
        }
    }

    /// Sustituye al pull-to-refresh que se perdió al quitar el `ScrollView`
    /// de la página.
    private var refreshButton: some View {
        Button {
            Task { await vm.loadData() }
        } label: {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 40, height: 40)
        }
        .buttonStyle(.flatCircleNeutral)
    }

    private var dayNav: some View {
        HStack(spacing: 6) {
            Button { shiftDay(-1) } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.flatCircleNeutral)

            Button { showDatePicker = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "calendar").font(.system(size: 13))
                    Text(dayNavLabel).font(.system(size: 13.5, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .frame(height: 40)
                .background(
                    Capsule().fill(Color.white.opacity(0.045))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            }
            .buttonStyle(.plain)

            Button { shiftDay(1) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.flatCircleNeutral)
        }
    }

    private var dayNavLabel: String {
        let today = isoDateFormatter.string(from: Date())
        let prefix = vm.selectedDate == today ? "Hoy · " : ""
        guard let d = isoDateFormatter.date(from: vm.selectedDate) else { return vm.selectedDate }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM"
        return prefix + f.string(from: d)
    }

    private func shiftDay(_ delta: Int) {
        guard let d = isoDateFormatter.date(from: vm.selectedDate) else { return }
        let shifted = Calendar(identifier: .gregorian).date(byAdding: .day, value: delta, to: d) ?? d
        vm.selectedDate = isoDateFormatter.string(from: shifted)
    }

    private var datePickerSheet: some View {
        NavigationStack {
            DatePicker(
                "",
                selection: Binding(
                    get: { isoDateFormatter.date(from: vm.selectedDate) ?? Date() },
                    set: { vm.selectedDate = isoDateFormatter.string(from: $0) }
                ),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .padding()
            .navigationTitle("Seleccionar fecha")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { showDatePicker = false }
                }
            }
        }
        .preferredColorScheme(.dark)
        .presentationDetents([.medium])
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundStyle(Color.white.opacity(0.4))
            TextField("", text: $vm.search, prompt: Text("Buscar cliente…").foregroundStyle(Color.white.opacity(0.3)))
                .foregroundStyle(.white)
                .font(.system(size: 14))
                .textFieldStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: 40)
        .frame(minWidth: 200)
        .background(
            Capsule().fill(Color.white.opacity(0.045))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
        )
    }

    private var newReservationButton: some View {
        Button {
            editingReservation = nil
            isShowingForm = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 13, weight: .heavy))
                Text("Nueva reserva").font(.system(size: 14.5, weight: .bold))
            }
            .padding(.horizontal, 18)
            .frame(height: 44)
        }
        .buttonStyle(.flatCapsule(.blue))
    }

    // MARK: - Stats

    private var confirmedCount: Int { vm.count(for: "confirmed") }
    private var pendingCount: Int { vm.count(for: "pending") }
    private var expectedGuests: Int {
        vm.reservations.filter { $0.status != "cancelled" && $0.status != "no_show" }.reduce(0) { $0 + $1.guestCount }
    }

    private var statsRow: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 12
            let unit = (geo.size.width - spacing * 3) / 4.4
            HStack(spacing: spacing) {
                heroCard.frame(width: max(unit * 1.4, 0))
                statTile(icon: "checkmark.circle.fill", iconColor: .blue, iconBg: Color.blue.opacity(0.16),
                         value: "\(confirmedCount)", label: "Confirmadas")
                    .frame(width: max(unit, 0))
                statTile(icon: "clock.fill", iconColor: .orange, iconBg: Color.orange.opacity(0.16),
                         value: "\(pendingCount)", label: "Pendientes")
                    .frame(width: max(unit, 0))
                statTile(icon: "person.2.fill", iconColor: .purple, iconBg: Color.purple.opacity(0.16),
                         value: "\(expectedGuests)", label: "Personas esperadas")
                    .frame(width: max(unit, 0))
            }
        }
        .frame(height: 132)
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RESERVAS DEL DÍA")
                .font(.system(size: 11.5, weight: .heavy))
                .tracking(1)
                .foregroundStyle(Color.white.opacity(0.6))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(vm.reservations.count)")
                    .font(.system(size: 42, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text("\(confirmedCount) confirmadas · \(pendingCount) pendientes")
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
                Text(value).font(.system(size: 26, weight: .bold)).monospacedDigit().foregroundStyle(.white)
                Text(label).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.white.opacity(0.45))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
        .modifier(FlatCard(cornerRadius: 20))
    }

    // MARK: - Filters

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                filterButton("all", label: "Todas", dot: nil)
                filterButton("pending", label: "Pendiente", dot: .orange)
                filterButton("confirmed", label: "Confirmada", dot: .blue)
                filterButton("arrived", label: "Llegó", dot: .green)
                filterButton("cancelled", label: "Cancelada", dot: Color.white.opacity(0.3))
                filterButton("no_show", label: "No show", dot: .red)
            }
            .padding(4)
            .background(
                Capsule().fill(Color.white.opacity(0.045))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
        }
    }

    private func filterButton(_ value: String, label: String, dot: Color?) -> some View {
        let isActive = vm.statusFilter == value
        return Button { vm.statusFilter = value } label: {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 6, height: 6) }
                Text(label)
                Text("(\(vm.count(for: value)))").opacity(0.7)
            }
            .font(.system(size: 12.5, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(isActive ? .white : Color.white.opacity(0.45))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(isActive ? Color.white.opacity(0.12) : Color.clear))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Day heading

    private var dayHeading: some View {
        HStack(spacing: 9) {
            Image(systemName: "calendar").font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.4))
            Text(fullDayLabel).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
            Text("\(vm.reservations.count)")
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

    private var fullDayLabel: String {
        guard let d = isoDateFormatter.date(from: vm.selectedDate) else { return vm.selectedDate }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEEE d 'de' MMMM"
        return f.string(from: d).capitalized
    }

    // MARK: - Timeline

    private struct PlacedReservation: Identifiable {
        let reservation: Reservation
        /// Columna donde cae — reservas que se traslapan en el tiempo caen
        /// en su propia columna para quedar lado a lado, no encimadas.
        let column: Int
        let totalColumns: Int
        let startMinutes: Int
        let endMinutes: Int
        var id: String { reservation.id }
    }

    private func minutes(of hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return 0 }
        return parts[0] * 60 + parts[1]
    }

    /// Asignación de columnas tipo "vista de día" de calendario: cada
    /// reserva que se traslapa con otra en el tiempo cae en su propia
    /// columna para que se vean lado a lado en vez de encimadas.
    private func layoutColumns(_ items: [Reservation]) -> [PlacedReservation] {
        let sorted = items.sorted { minutes(of: $0.reservationTime) < minutes(of: $1.reservationTime) }
        var columnEnds: [Int] = []
        var placed: [(r: Reservation, col: Int, start: Int, end: Int)] = []
        for r in sorted {
            let start = minutes(of: r.reservationTime)
            let end = start + r.duration
            if let idx = columnEnds.firstIndex(where: { $0 <= start }) {
                columnEnds[idx] = end
                placed.append((r, idx, start, end))
            } else {
                columnEnds.append(end)
                placed.append((r, columnEnds.count - 1, start, end))
            }
        }
        let totalCols = max(columnEnds.count, 1)
        return placed.map {
            PlacedReservation(reservation: $0.r, column: $0.col, totalColumns: totalCols, startMinutes: $0.start, endMinutes: $0.end)
        }
    }

    private var placedReservations: [PlacedReservation] { layoutColumns(vm.filteredReservations) }
    private var trackHeight: CGFloat { CGFloat(endHour - startHour) * rowHeight }

    private var nowLineOffset: CGFloat? {
        guard vm.selectedDate == isoDateFormatter.string(from: Date()) else { return nil }
        let comps = Calendar(identifier: .gregorian).dateComponents([.hour, .minute], from: Date())
        let nowMin = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
        guard nowMin >= startHour * 60 && nowMin <= endHour * 60 else { return nil }
        return CGFloat(nowMin - startHour * 60) / 60 * rowHeight
    }

    /// Timeline (3/4) + panel de detalle (1/4) — el panel no es un sheet:
    /// vive fijo al lado y se llena al tocar una reserva, como el layout de
    /// dos columnas de Caja (órdenes + ventas/acciones).
    private var timelineRow: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 12
            let sideWidth = (geo.size.width - spacing) * 0.25
            let mainWidth = (geo.size.width - spacing) * 0.75
            HStack(alignment: .top, spacing: spacing) {
                timelineCard.frame(width: max(mainWidth, 0))
                sidePanelCard.frame(width: max(sideWidth, 0))
            }
        }
        .frame(height: timelineCardHeight)
    }

    /// Eje de horas VERTICAL, como un calendario tipo día/agenda — la
    /// tarjeta tiene alto fijo y el slide de horas es su propio scroll
    /// (vertical), independiente del resto de la página. Se autocentra en
    /// la hora actual al abrir, al cambiar de día, y cada vez que cambia la
    /// hora en curso (sin pelearse con quien esté hojeando otra hora a
    /// mano).
    private var timelineCard: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                HStack(alignment: .top, spacing: 0) {
                    hourLabelsColumn
                    trackArea
                }
            }
            .onAppear { autoScroll(proxy) }
            .onChange(of: vm.selectedDate) { _, _ in autoScroll(proxy, force: true) }
            .onReceive(autoScrollTimer) { _ in autoScroll(proxy) }
        }
        .padding(18)
        .modifier(FlatCard(cornerRadius: 20))
    }

    private func autoScroll(_ proxy: ScrollViewProxy, force: Bool = false) {
        guard vm.selectedDate == isoDateFormatter.string(from: Date()) else { return }
        let nowHour = Calendar(identifier: .gregorian).component(.hour, from: Date())
        guard force || nowHour != lastAutoScrollHour else { return }
        lastAutoScrollHour = nowHour
        let target = min(max(nowHour, startHour), endHour)
        withAnimation(.easeInOut(duration: 0.6)) {
            proxy.scrollTo("hour-\(target)", anchor: .center)
        }
    }

    // MARK: - Side panel (detalle de la reserva tocada)

    private var sidePanelCard: some View {
        Group {
            if let r = selectedReservation {
                sidePanelDetail(r)
            } else {
                sidePanelEmpty
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(18)
        .modifier(FlatCard(cornerRadius: 20))
    }

    private var sidePanelEmpty: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "hand.tap.fill")
                .font(.system(size: 22))
                .foregroundStyle(Color.white.opacity(0.25))
            Text("Toca una reserva para ver sus detalles aquí")
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.4))
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func sidePanelDetail(_ r: Reservation) -> some View {
        let canConfirm = r.status == "pending" || r.status == "confirmed"
        return ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(vm.statusColor(r.status).opacity(0.16))
                        Image(systemName: "clock.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(vm.statusColor(r.status))
                    }
                    .frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.customerName)
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundStyle(.white)
                        Text(r.reservationTime)
                            .font(.system(size: 12.5, weight: .bold))
                            .foregroundStyle(Color.white.opacity(0.6))
                    }
                }

                HStack(spacing: 6) {
                    Circle().fill(vm.statusColor(r.status)).frame(width: 6, height: 6)
                    Text(vm.statusLabel(r.status))
                        .font(.system(size: 11.5, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.85))
                }
                .padding(.horizontal, 10)
                .frame(height: 22)
                .background(
                    Capsule().fill(Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )

                VStack(alignment: .leading, spacing: 10) {
                    sideDetailLine(icon: "person.2.fill", text: "\(r.guestCount) personas")
                    sideDetailLine(icon: "table.furniture.fill", text: r.table.map { "Mesa \($0.number)" } ?? "Sin mesa asignada")
                    sideDetailLine(icon: "timer", text: "\(r.duration) min")
                    if let phone = r.customerPhone, !phone.trimmingCharacters(in: .whitespaces).isEmpty {
                        sideDetailLine(icon: "phone.fill", text: phone)
                    }
                    if let occasion = r.occasion, !occasion.isEmpty {
                        sideDetailLine(icon: "sparkles", text: occasion)
                    }
                }

                if let notes = r.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 12, weight: .medium))
                        .italic()
                        .foregroundStyle(Color.white.opacity(0.5))
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 8) {
                    if canConfirm {
                        Button {
                            Task { await vm.confirm(id: r.id) }
                        } label: {
                            Text("Sí llegó")
                                .font(.system(size: 13.5, weight: .bold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 40)
                        }
                        .buttonStyle(.flatCapsule(.green))
                    }
                    Button {
                        editingReservation = r
                        isShowingForm = true
                    } label: {
                        Text("Editar reserva")
                            .font(.system(size: 13.5, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                    }
                    .buttonStyle(.flatCapsule(.blue))
                }
                .padding(.top, 4)
            }
        }
    }

    private func sideDetailLine(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.4))
                .frame(width: 14)
            Text(text)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Columna de horas vertical — cada label mide exactamente `rowHeight`
    /// de alto (alineada con las líneas horizontales de `trackArea`). Cada
    /// una lleva `.id("hour-N")` para que `autoScroll(_:)` pueda centrar el
    /// scroll ahí con `ScrollViewProxy`.
    private var hourLabelsColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(startHour...endHour, id: \.self) { h in
                Text(String(format: "%02d:00", h))
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.white.opacity(0.3))
                    .frame(width: 52, height: rowHeight, alignment: .topLeading)
                    .id("hour-\(h)")
            }
        }
    }

    private var trackArea: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                ForEach(startHour...endHour, id: \.self) { h in
                    Rectangle()
                        .fill(Color.white.opacity(0.1))
                        .frame(width: geo.size.width, height: 1)
                        .offset(y: CGFloat(h - startHour) * rowHeight)
                    if h < endHour {
                        Rectangle()
                            .fill(Color.white.opacity(0.05))
                            .frame(width: geo.size.width, height: 1)
                            .offset(y: CGFloat(h - startHour) * rowHeight + rowHeight / 2)
                    }
                }

                if let nowOffset = nowLineOffset {
                    Rectangle()
                        .fill(Color.red)
                        .frame(width: geo.size.width, height: 2)
                        .overlay(alignment: .leading) {
                            Circle().fill(Color.red).frame(width: 8, height: 8).offset(x: -4)
                        }
                        .offset(y: nowOffset)
                }

                ForEach(placedReservations) { placed in
                    reservationBlock(placed, trackWidth: geo.size.width)
                }
            }
            .frame(width: geo.size.width, height: trackHeight, alignment: .topLeading)
            .clipped()
            .overlay(Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1), alignment: .leading)
        }
        .frame(minWidth: 480)
        .frame(height: trackHeight)
    }

    private func reservationBlock(_ placed: PlacedReservation, trackWidth: CGFloat) -> some View {
        let r = placed.reservation
        let color = vm.statusColor(r.status)
        let top = CGFloat(placed.startMinutes - startHour * 60) / 60 * rowHeight + 1.5
        let height = max(CGFloat(placed.endMinutes - placed.startMinutes) / 60 * rowHeight - 3, rowHeight * 0.28)
        let colWidth = trackWidth / CGFloat(placed.totalColumns)
        let compact = height < 40
        let isSelected = r.id == selectedReservationId

        return Button {
            selectedReservationId = r.id
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(r.reservationTime)
                    .font(.system(size: 10.5, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(color)
                Text(r.customerName)
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if !compact {
                    Text("\(r.guestCount) pers. · \(r.table.map { "Mesa \($0.number)" } ?? "Sin mesa")")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.45))
                        .lineLimit(1)
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .padding(.vertical, 6)
            .frame(width: max(colWidth - 4, 20), height: height, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(isSelected ? 0.11 : 0.06)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(isSelected ? 0.45 : 0.1), lineWidth: isSelected ? 1.5 : 1))
            .overlay(alignment: .leading) {
                // Barrita de color ANTES del texto, no como borde del bloque
                // — el borde del bloque se queda neutro (stroke de arriba).
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(color)
                    .frame(width: 3)
                    .padding(.vertical, 8)
                    .padding(.leading, 6)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(r.status == "cancelled" || r.status == "no_show" ? 0.55 : 1)
        .offset(x: CGFloat(placed.column) * colWidth + 2, y: top)
    }
}

// MARK: - Nueva / Editar reserva (mismo form para ambas, misma BottomSheetCard)

private struct ReservationFormContent: View {
    @ObservedObject var vm: ReservationsViewModel
    let reservation: Reservation?
    let defaultDate: String
    let onCancel: () -> Void

    @State private var date: Date
    @State private var time: Date
    @State private var duration: Int
    @State private var customerName: String
    @State private var customerPhone: String
    @State private var guestCount: Int
    @State private var tableId: String
    @State private var notes: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(vm: ReservationsViewModel, reservation: Reservation?, defaultDate: String, onCancel: @escaping () -> Void) {
        self.vm = vm
        self.reservation = reservation
        self.defaultDate = defaultDate
        self.onCancel = onCancel
        _date = State(initialValue: isoDateFormatter.date(from: reservation?.reservationDate ?? defaultDate) ?? Date())
        _time = State(initialValue: hhmmFormatter.date(from: reservation?.reservationTime ?? "19:00") ?? Date())
        _duration = State(initialValue: reservation?.duration ?? 120)
        _customerName = State(initialValue: reservation?.customerName ?? "")
        _customerPhone = State(initialValue: reservation?.customerPhone ?? "")
        _guestCount = State(initialValue: reservation?.guestCount ?? 2)
        _tableId = State(initialValue: reservation?.tableId ?? "")
        _notes = State(initialValue: reservation?.notes ?? "")
    }

    private var isEditing: Bool { reservation != nil }

    /// Resiembra todos los campos cuando cambia la reserva a editar — igual
    /// que el editor de Promociones: sin `.id()`, esta vista se queda
    /// montada de forma permanente y `init()` no vuelve a correr.
    private func reseed(_ reservation: Reservation?) {
        date = isoDateFormatter.date(from: reservation?.reservationDate ?? defaultDate) ?? Date()
        time = hhmmFormatter.date(from: reservation?.reservationTime ?? "19:00") ?? Date()
        duration = reservation?.duration ?? 120
        customerName = reservation?.customerName ?? ""
        customerPhone = reservation?.customerPhone ?? ""
        guestCount = reservation?.guestCount ?? 2
        tableId = reservation?.tableId ?? ""
        notes = reservation?.notes ?? ""
        errorMessage = nil
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                header
                dateTimePanel
                clientPanel
                groupPanel
                notesPanel
                actions
            }
        }
        .onChange(of: reservation?.id) { _, _ in reseed(reservation) }
        .alert("Revisa la reserva", isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) { Button("Aceptar", role: .cancel) { errorMessage = nil } } message: {
            Text(errorMessage ?? "")
        }
    }

    private var header: some View {
        HStack {
            Text(isEditing ? "Editar reserva" : "Nueva reserva")
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
    }

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

    private func fieldLabel(_ text: String) -> some View {
        Text(text).font(.system(size: 11.5, weight: .bold)).foregroundStyle(Color.white.opacity(0.45))
    }

    private func styledField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .foregroundStyle(.white)
            .font(.system(size: 14))
            .padding(.horizontal, 12)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private var dateTimePanel: some View {
        panel("Fecha y hora") {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Fecha")
                    DatePicker("", selection: $date, displayedComponents: .date)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .tint(.blue)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Hora")
                    DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .tint(.blue)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Duración")
                Picker("", selection: $duration) {
                    ForEach([60, 90, 120, 150, 180], id: \.self) { mins in
                        Text(durationLabel(mins)).tag(mins)
                    }
                }
                .pickerStyle(.menu)
                .tint(.white)
            }
        }
    }

    private func durationLabel(_ mins: Int) -> String {
        let h = mins / 60
        let m = mins % 60
        if m == 0 { return "\(h) hora\(h > 1 ? "s" : "")" }
        return "\(h)h \(m)min"
    }

    private var clientPanel: some View {
        panel("Cliente") {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Nombre")
                    styledField("Juan Pérez", text: $customerName)
                }
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Teléfono")
                    styledField("55 1234 5678", text: $customerPhone)
                        .keyboardType(.phonePad)
                }
            }
        }
    }

    private var groupPanel: some View {
        panel("Grupo y mesa") {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Personas")
                    HStack(spacing: 0) {
                        Button {
                            if guestCount > 1 { guestCount -= 1 }
                        } label: {
                            Image(systemName: "minus")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(guestCount > 1 ? .white : Color.white.opacity(0.3))
                                .frame(width: 40, height: 44)
                        }
                        .disabled(guestCount <= 1)

                        Text("\(guestCount)")
                            .font(.system(size: 15.5, weight: .heavy))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)

                        Button {
                            if guestCount < 20 { guestCount += 1 }
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(guestCount < 20 ? .white : Color.white.opacity(0.3))
                                .frame(width: 40, height: 44)
                        }
                        .disabled(guestCount >= 20)
                    }
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
                }
                VStack(alignment: .leading, spacing: 6) {
                    // Opcional a propósito: elegir mesa no es obligatorio ni
                    // se filtra por capacidad — puede quedar sin asignar y no
                    // importa si ninguna mesa "alcanza" al grupo.
                    fieldLabel("Mesa (opcional)")
                    Picker("", selection: $tableId) {
                        Text("Sin mesa").tag("")
                        ForEach(sortedTables) { table in
                            Text("Mesa \(table.number)").tag(table.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(.white)
                }
            }
        }
    }

    private var sortedTables: [Table] {
        vm.tables.filter { $0.active }.sorted { (Int($0.number) ?? 0) < (Int($1.number) ?? 0) }
    }

    private var notesPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Notas")
            TextField("Alergias, ocasión especial…", text: $notes, axis: .vertical)
                .foregroundStyle(.white)
                .font(.system(size: 14))
                .padding(12)
                .frame(minHeight: 70, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.05)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        }
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
                Text(isSaving ? "Guardando…" : (isEditing ? "Actualizar" : "Crear reserva"))
                    .font(.system(size: 14.5, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .buttonStyle(.flatCapsule(.blue))
            .disabled(isSaving || customerName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.top, 2)
    }

    private func save() {
        let trimmedName = customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { errorMessage = "Escribe el nombre del cliente"; return }

        isSaving = true
        let body: [String: Any] = [
            "tableId": tableId.isEmpty ? NSNull() : tableId,
            "customerName": trimmedName,
            "customerPhone": customerPhone.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : customerPhone,
            "guestCount": guestCount,
            "reservationDate": isoDateFormatter.string(from: date),
            "reservationTime": hhmmFormatter.string(from: time),
            "duration": duration,
            "notes": notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : notes,
        ]
        Task {
            let success = await vm.save(body: body, editingId: reservation?.id)
            isSaving = false
            if success {
                onCancel()
            } else {
                errorMessage = "No se pudo guardar la reserva"
            }
        }
    }
}
