import SwiftUI

/// The floor-plan map's logical grid and how many points each cell occupies
/// on screen. Derived once per layout pass from the space actually
/// available, so the map fills the full width and height with no scrolling.
struct MapGridMetrics: Equatable {
    var columns: Int
    var rows: Int
    var cellSize: CGFloat
    var width: CGFloat { CGFloat(columns) * cellSize }
    var height: CGFloat { CGFloat(rows) * cellSize }
}

private struct MapGridMetricsKey: EnvironmentKey {
    static let defaultValue = MapGridMetrics(columns: 20, rows: 14, cellSize: 44)
}

extension EnvironmentValues {
    var mapGridMetrics: MapGridMetrics {
        get { self[MapGridMetricsKey.self] }
        set { self[MapGridMetricsKey.self] = newValue }
    }
}

/// A footprint in grid cells — a small `Equatable` wrapper (instead of a raw
/// tuple) so it can drive `.animation(_:value:)` for smooth resize.
struct CellFootprint: Equatable {
    var w: Int
    var h: Int
}

/// Small visual gap so a chip reads as sitting *inside* its cell(s) rather than
/// touching the neighbors — but small enough that it still fills the squares.
private let chipInset: CGFloat = 4

/// Stable coordinate space for drag/resize. Measuring the drag against the
/// fixed map canvas (instead of the moving chip/handle) prevents the resize
/// feedback loop where growing the chip shifts the handle, which re-measures
/// the drag, which shifts the handle again — the visible flicker.
private let mapCoordinateSpace = "brumaTableMap"

/// Little chair marks distributed round-robin around all 4 edges of a table,
/// scaled to the cell size — shared by single and merged tables.
struct SeatMarks: View {
    let width: CGFloat
    let height: CGFloat
    let cellSize: CGFloat
    let capacity: Int
    let color: Color

    var body: some View {
        let counts = seatCounts(total: max(0, min(20, capacity)))
        let seatSize = max(7, min(18, cellSize * 0.26))
        let gap: CGFloat = 4

        ZStack {
            line(count: counts.top, length: width, seatSize: seatSize, vertical: false)
                .position(x: width / 2, y: -(seatSize / 2 + gap))
            line(count: counts.bottom, length: width, seatSize: seatSize, vertical: false)
                .position(x: width / 2, y: height + seatSize / 2 + gap)
            line(count: counts.left, length: height, seatSize: seatSize, vertical: true)
                .position(x: -(seatSize / 2 + gap), y: height / 2)
            line(count: counts.right, length: height, seatSize: seatSize, vertical: true)
                .position(x: width + seatSize / 2 + gap, y: height / 2)
        }
        .allowsHitTesting(false)
    }

    private func seatCounts(total: Int) -> (top: Int, right: Int, bottom: Int, left: Int) {
        var c = [0, 0, 0, 0] // top, right, bottom, left
        for i in 0..<total { c[i % 4] += 1 }
        return (c[0], c[1], c[2], c[3])
    }

    @ViewBuilder
    private func line(count: Int, length: CGFloat, seatSize: CGFloat, vertical: Bool) -> some View {
        let seats = ForEach(0..<count, id: \.self) { _ in
            RoundedRectangle(cornerRadius: 2)
                .fill(color.opacity(0.9))
                .frame(width: seatSize, height: seatSize)
        }
        if vertical {
            VStack(spacing: max(2, seatSize * 0.35)) { seats }.frame(height: length)
        } else {
            HStack(spacing: max(2, seatSize * 0.35)) { seats }.frame(width: length)
        }
    }
}

struct TableMapView: View {
    static let targetCellSize: CGFloat = 56
    static let maxCellSize: CGFloat = 84
    static let minRows = 8
    static let minColumns = 10

    @ObservedObject var vm: POSViewModel

    var body: some View {
        GeometryReader { geo in
            let rows = max(Self.minRows, Int((geo.size.height / Self.targetCellSize).rounded(.down)))
            let cellSize = min(Self.maxCellSize, geo.size.height / CGFloat(rows))
            let columns = max(Self.minColumns, Int((geo.size.width / cellSize).rounded(.down)))
            let metrics = MapGridMetrics(columns: columns, rows: rows, cellSize: cellSize)

            mapCanvas(metrics: metrics)
                .environment(\.mapGridMetrics, metrics)
                .overlay(alignment: .topTrailing) {
                    editControls.padding(10)
                }
                .overlay {
                    if vm.placedTables.isEmpty {
                        emptyStateView
                    }
                }
                .onChange(of: metrics) { _, newValue in
                    vm.mapMetrics = newValue
                }
                .task(id: metrics) {
                    vm.mapMetrics = metrics
                }
        }
        .sheet(isPresented: $vm.showUnplacedTablesTray) {
            UnplacedTablesTray(vm: vm)
        }
    }

    private func mapCanvas(metrics: MapGridMetrics) -> some View {
        ZStack(alignment: .topLeading) {
            gridBackground(metrics: metrics)

            ForEach(vm.mapFixtures) { fixture in
                FixtureChip(fixture: fixture, vm: vm)
            }

            ForEach(vm.placedTables) { table in
                if table.isMerged {
                    // Render a merged pair once, as a single combined table on
                    // the primary; the secondary half is absorbed into it.
                    if table.isMergePrimary == true {
                        MergedTableChip(primary: table, vm: vm)
                    }
                } else {
                    TableMapChip(table: table, vm: vm)
                }
            }
        }
        .frame(width: metrics.width, height: metrics.height)
        .coordinateSpace(.named(mapCoordinateSpace))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    // Floating toolbar, pinned inside the map's top-trailing corner instead of
    // taking its own row above the map — keeps the canvas as large as possible.
    private var editControls: some View {
        HStack(spacing: 10) {
            if vm.editingLayout {
                if vm.unplacedTables.count > 0 {
                    Button {
                        vm.showUnplacedTablesTray = true
                    } label: {
                        Label("Añadir mesa (\(vm.unplacedTables.count))", systemImage: "plus.circle.fill")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(MapToolbarButtonStyle(tint: .blue))
                }

                Menu {
                    Button { vm.addFixture(type: "wall") } label: {
                        Label("Muro", systemImage: "minus")
                    }
                    Button { vm.addFixture(type: "bar") } label: {
                        Label("Barra", systemImage: "wineglass.fill")
                    }
                    Button { vm.addFixture(type: "furniture") } label: {
                        Label("Mueble", systemImage: "cube.fill")
                    }
                } label: {
                    Label("Añadir elemento", systemImage: "square.dashed")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
            }

            Button {
                withAnimation(.snappy) {
                    vm.editingLayout.toggle()
                }
            } label: {
                Label(
                    vm.editingLayout ? "Listo" : "Editar mapa",
                    systemImage: vm.editingLayout ? "checkmark.circle.fill" : "pencil.circle.fill"
                )
                .font(.caption.weight(.semibold))
            }
            .buttonStyle(MapToolbarButtonStyle(tint: vm.editingLayout ? .green : nil))
        }
        .padding(6)
        .glassEffect(.regular.interactive(), in: Capsule())
    }

    private func gridBackground(metrics: MapGridMetrics) -> some View {
        Canvas { context, size in
            // Only show the placement grid while actively editing the layout —
            // it's just visual scaffolding for dragging, not useful otherwise.
            guard vm.editingLayout else { return }
            let cell = metrics.cellSize
            let inset: CGFloat = 5
            for row in 0..<metrics.rows {
                for col in 0..<metrics.columns {
                    let rect = CGRect(
                        x: CGFloat(col) * cell + inset / 2,
                        y: CGFloat(row) * cell + inset / 2,
                        width: cell - inset,
                        height: cell - inset
                    )
                    let path = Path(roundedRect: rect, cornerRadius: 12)
                    context.fill(path, with: .color(Color.white.opacity(0.04)))
                    context.stroke(path, with: .color(Color.white.opacity(0.09)), lineWidth: 1)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "map")
                .font(.system(size: 36))
                .foregroundColor(.white.opacity(0.25))
            Text("No hay mesas acomodadas en el mapa")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white.opacity(0.6))
            if vm.canEditLayout {
                Button {
                    withAnimation(.snappy) {
                        vm.editingLayout = true
                    }
                    if vm.unplacedTables.count > 0 {
                        vm.showUnplacedTablesTray = true
                    }
                } label: {
                    Text("Acomodar mesas")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(MapToolbarButtonStyle(tint: .blue))
            } else {
                Text("Pide a un administrador que acomode las mesas")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(24)
    }
}

/// Compact pill button used by the floating map toolbar.
private struct MapToolbarButtonStyle: ButtonStyle {
    var tint: Color?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background((tint ?? Color.white.opacity(0.15)).opacity(tint == nil ? 1 : 0.85))
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct TableMapChip: View {
    static let maxCells = 4

    let table: Table
    @ObservedObject var vm: POSViewModel
    @Environment(\.mapGridMetrics) private var metrics
    // Plain @State (not @GestureState) so we control exactly when they clear:
    // atomically, in the same withAnimation as the committed model update, so
    // the chip never flashes back to the old spot before jumping to the new one.
    @State private var dragOffset: CGSize = .zero
    @State private var resizePreview: CellFootprint?
    @State private var showCapacityEditor = false

    private var isRound: Bool { table.shape == "round" }
    private var isSelectedForMerge: Bool { vm.selectedForMerge.contains(table.id) }

    /// Footprint in *raw* (pre-rotation) cells — what's actually stored.
    private var rawCells: CellFootprint {
        resizePreview ?? CellFootprint(w: table.effectiveWidthCells, h: table.effectiveHeightCells)
    }

    /// Footprint in *screen* (post-rotation) cells — what's occupied on the grid.
    private var screenCells: CellFootprint {
        let r = table.rotation ?? 0
        return (r == 90 || r == 270) ? CellFootprint(w: rawCells.h, h: rawCells.w) : rawCells
    }

    // Merged tables render as MergedTableChip, so a plain chip is always single.
    private var displayCapacity: Int { table.capacity }

    var body: some View {
        let cell = metrics.cellSize
        let spanW = CGFloat(screenCells.w) * cell
        let spanH = CGFloat(screenCells.h) * cell
        let originX = CGFloat(table.positionX ?? 0) * cell
        let originY = CGFloat(table.positionY ?? 0) * cell
        // Center-based placement keeps the top-left anchored while resizing
        // (span grows, center shifts by half the growth), and maps exactly
        // onto whole grid cells so the chip always fills its squares.
        let centerX = originX + spanW / 2 + dragOffset.width
        let centerY = originY + spanH / 2 + dragOffset.height

        return chip(spanW: spanW, spanH: spanH, cell: cell)
            .frame(width: spanW, height: spanH)
            .position(x: centerX, y: centerY)
            .sheet(isPresented: $showCapacityEditor) {
                CapacityEditorSheet(table: table, vm: vm)
            }
    }

    @ViewBuilder
    private func chip(spanW: CGFloat, spanH: CGFloat, cell: CGFloat) -> some View {
        let visual = chipVisual(spanW: spanW, spanH: spanH, cell: cell)

        if vm.mergeModeActive {
            visual
                .overlay(mergeSelectionOverlay)
                .contentShape(Rectangle())
                .onTapGesture { vm.toggleMergeSelection(table) }
        } else if vm.editingLayout {
            visual
                .gesture(moveGesture)
                .overlay(alignment: .bottomTrailing) {
                    resizeHandle
                        .offset(x: 8, y: 8)
                        .highPriorityGesture(resizeGesture(cell: cell))
                }
                .contextMenu { editContextMenu }
                .zIndex(dragOffset == .zero && resizePreview == nil ? 0 : 1)
        } else {
            Button {
                vm.handleSelectTable(table)
            } label: {
                visual
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button {
                    vm.startMergeMode(preselecting: table)
                } label: {
                    Label("Combinar mesas", systemImage: "link")
                }
            }
        }
    }

    private func chipVisual(spanW: CGFloat, spanH: CGFloat, cell: CGFloat) -> some View {
        let rawW = CGFloat(rawCells.w) * cell - chipInset
        let rawH = CGFloat(rawCells.h) * cell - chipInset

        return ZStack {
            // Rotated layer — the physical table shape and its chairs.
            ZStack {
                shapeBackground
                if !vm.editingLayout && !vm.mergeModeActive {
                    SeatMarks(width: rawW, height: rawH, cellSize: cell, capacity: table.capacity, color: table.borderColor)
                }
            }
            .frame(width: rawW, height: rawH)
            .rotationEffect(.degrees(Double(table.rotation ?? 0)))

            // Unrotated layer — number/capacity always stay upright and legible.
            VStack(spacing: 2) {
                Text(table.number)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("\(displayCapacity)p")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .frame(width: spanW, height: spanH)
        .overlay(alignment: .topTrailing) {
            if table.isMerged {
                Image(systemName: "link.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.blue).frame(width: 14, height: 14))
                    .padding(2)
            }
        }
        .animation(.snappy, value: rawCells)
    }

    @ViewBuilder
    private var mergeSelectionOverlay: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: isRound ? 999 : 10)
                .stroke(isSelectedForMerge ? Color.blue : Color.white.opacity(0.3), lineWidth: isSelectedForMerge ? 3 : 1)

            Image(systemName: isSelectedForMerge ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 20))
                .foregroundColor(isSelectedForMerge ? .blue : .white.opacity(0.7))
                .background(Circle().fill(Color.black.opacity(0.5)).padding(-3))
                .padding(4)
        }
    }

    @ViewBuilder
    private var editContextMenu: some View {
        if table.isMerged {
            Button(role: .destructive) {
                Task { await vm.unmergeTable(table) }
            } label: {
                Label("Separar mesas", systemImage: "link.badge.plus")
            }
        }

        Button {
            applyLayoutChange { $0.rotation = ((table.rotation ?? 0) + 90) % 360 }
        } label: {
            Label("Rotar 90°", systemImage: "rotate.right")
        }

        Button {
            applyLayoutChange { $0.shape = (table.shape == "round") ? "square" : "round" }
        } label: {
            Label(isRound ? "Forma cuadrada" : "Forma redonda", systemImage: isRound ? "square" : "circle")
        }

        Button {
            showCapacityEditor = true
        } label: {
            Label("Editar capacidad", systemImage: "person.2.fill")
        }
    }

    private func applyLayoutChange(_ mutate: (inout TableLayoutUpdate) -> Void) {
        var update = TableLayoutUpdate(
            id: table.id,
            positionX: table.positionX ?? 0,
            positionY: table.positionY ?? 0,
            widthCells: table.effectiveWidthCells,
            heightCells: table.effectiveHeightCells,
            rotation: table.rotation ?? 0,
            shape: table.shape ?? "square"
        )
        mutate(&update)
        vm.saveLayout([update])
    }

    private var moveGesture: some Gesture {
        DragGesture(coordinateSpace: .named(mapCoordinateSpace))
            .onChanged { value in
                dragOffset = value.translation
            }
            .onEnded { value in
                let cell = metrics.cellSize
                let deltaX = Int((value.translation.width / cell).rounded())
                let deltaY = Int((value.translation.height / cell).rounded())
                let (fw, fh) = table.footprintCells
                let newX = max(0, min(metrics.columns - fw, (table.positionX ?? 0) + deltaX))
                let newY = max(0, min(metrics.rows - fh, (table.positionY ?? 0) + deltaY))

                // Commit the model move and clear the live offset in one animated
                // transaction so the chip glides straight to the snapped cell.
                withAnimation(.snappy) {
                    if newX != table.positionX || newY != table.positionY {
                        let update = TableLayoutUpdate(
                            id: table.id,
                            positionX: newX,
                            positionY: newY,
                            widthCells: table.effectiveWidthCells,
                            heightCells: table.effectiveHeightCells,
                            rotation: table.rotation ?? 0,
                            shape: table.shape ?? "square"
                        )
                        vm.saveLayout([update])
                    }
                    dragOffset = .zero
                }
            }
    }

    // Corner drag handle — like a Photoshop/Figma resize corner. Grows the chip
    // toward the bottom-right (top-left stays anchored) in whole grid steps.
    private var resizeHandle: some View {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
            .padding(6)
            .background(Circle().fill(Color.blue))
            .contentShape(Circle())
    }

    private func resizeGesture(cell: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .named(mapCoordinateSpace))
            .onChanged { value in
                resizePreview = clampedResize(for: value.translation, cell: cell)
            }
            .onEnded { value in
                let newCells = clampedResize(for: value.translation, cell: cell)
                withAnimation(.snappy) {
                    if newCells.w != table.effectiveWidthCells || newCells.h != table.effectiveHeightCells {
                        applyLayoutChange {
                            $0.widthCells = newCells.w
                            $0.heightCells = newCells.h
                        }
                    }
                    resizePreview = nil
                }
            }
    }

    /// Interprets the drag in *screen* cells (what's visually growing), then
    /// converts back to raw storage terms for the current rotation.
    private func clampedResize(for translation: CGSize, cell: CGFloat) -> CellFootprint {
        let dx = Int((translation.width / cell).rounded())
        let dy = Int((translation.height / cell).rounded())
        let (curScreenW, curScreenH) = table.footprintCells
        let maxScreenW = min(Self.maxCells, metrics.columns - (table.positionX ?? 0))
        let maxScreenH = min(Self.maxCells, metrics.rows - (table.positionY ?? 0))
        let newScreenW = max(1, min(maxScreenW, curScreenW + dx))
        let newScreenH = max(1, min(maxScreenH, curScreenH + dy))
        let rotation = table.rotation ?? 0
        return (rotation == 90 || rotation == 270)
            ? CellFootprint(w: newScreenH, h: newScreenW)
            : CellFootprint(w: newScreenW, h: newScreenH)
    }

    @ViewBuilder
    private var shapeBackground: some View {
        if isRound {
            Circle()
                .fill(table.backgroundColor)
                .overlay(Circle().stroke(table.borderColor, lineWidth: 2))
        } else {
            RoundedRectangle(cornerRadius: 10)
                .fill(table.backgroundColor)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(table.borderColor, lineWidth: 2))
        }
    }
}

private struct CapacityEditorSheet: View {
    let table: Table
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var capacity: Int

    init(table: Table, vm: POSViewModel) {
        self.table = table
        self.vm = vm
        _capacity = State(initialValue: table.capacity)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(table.displayName)
                    .font(.title3.weight(.semibold))

                Stepper("Capacidad: \(capacity) personas", value: $capacity, in: 1...20)
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding()
            .navigationTitle("Editar capacidad")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        vm.updateTableCapacity(table, capacity: capacity)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.height(260)])
    }
}

/// A merged group (2+ tables) drawn as ONE combined table spanning every
/// member's footprint, with summed capacity, seats around the whole shape,
/// and a joint label (e.g. "1-2" or "1-2-5").
struct MergedTableChip: View {
    let primary: Table
    @ObservedObject var vm: POSViewModel
    @Environment(\.mapGridMetrics) private var metrics

    /// The primary first, then its members sorted by table number.
    private var groupMembers: [Table] {
        let others = vm.tables
            .filter { $0.mergeGroupId == primary.id && $0.id != primary.id }
            .sorted { (Int($0.number) ?? 0) < (Int($1.number) ?? 0) }
        return [primary] + others
    }

    var body: some View {
        let cell = metrics.cellSize
        let members = groupMembers

        // Bounding box covering every member (they're slid adjacent on merge).
        let minX = members.map { $0.positionX ?? 0 }.min() ?? 0
        let minY = members.map { $0.positionY ?? 0 }.min() ?? 0
        let maxX = members.map { ($0.positionX ?? 0) + $0.footprintCells.w }.max() ?? 1
        let maxY = members.map { ($0.positionY ?? 0) + $0.footprintCells.h }.max() ?? 1
        let spanW = CGFloat(maxX - minX) * cell
        let spanH = CGFloat(maxY - minY) * cell
        let centerX = CGFloat(minX) * cell + spanW / 2
        let centerY = CGFloat(minY) * cell + spanH / 2
        let capacity = members.reduce(0) { $0 + $1.capacity }
        let label = members.map { $0.number }.joined(separator: "-")

        Button {
            vm.handleSelectTable(primary)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(primary.backgroundColor)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.blue, lineWidth: 2))
                    .frame(width: spanW - chipInset, height: spanH - chipInset)
                    .overlay {
                        SeatMarks(width: spanW - chipInset, height: spanH - chipInset, cellSize: cell, capacity: capacity, color: .blue)
                    }

                VStack(spacing: 2) {
                    Text(label)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("\(capacity)p · combinadas")
                        .font(.system(size: 9))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .frame(width: spanW, height: spanH)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                Task { await vm.unmergeTable(primary) }
            } label: {
                Label("Separar mesas", systemImage: "link.badge.plus")
            }
        }
        .position(x: centerX, y: centerY)
        .animation(.spring(duration: 0.35, bounce: 0.3), value: metrics)
    }
}

// Decorative floor-plan element (wall/bar/furniture) — same drag/resize/rotate
// interactions as a table while editing, but never selectable for an order.
struct FixtureChip: View {
    let fixture: MapFixture
    @ObservedObject var vm: POSViewModel
    @Environment(\.mapGridMetrics) private var metrics
    @State private var dragOffset: CGSize = .zero
    @State private var resizePreview: CellFootprint?

    private var rawCells: CellFootprint {
        resizePreview ?? CellFootprint(w: fixture.widthCells, h: fixture.heightCells)
    }
    private var screenCells: CellFootprint {
        (fixture.rotation == 90 || fixture.rotation == 270) ? CellFootprint(w: rawCells.h, h: rawCells.w) : rawCells
    }

    var body: some View {
        let cell = metrics.cellSize
        let spanW = CGFloat(screenCells.w) * cell
        let spanH = CGFloat(screenCells.h) * cell
        let originX = CGFloat(fixture.positionX) * cell
        let originY = CGFloat(fixture.positionY) * cell
        let centerX = originX + spanW / 2 + dragOffset.width
        let centerY = originY + spanH / 2 + dragOffset.height

        return chip(spanW: spanW, spanH: spanH, cell: cell)
            .frame(width: spanW, height: spanH)
            .position(x: centerX, y: centerY)
    }

    @ViewBuilder
    private func chip(spanW: CGFloat, spanH: CGFloat, cell: CGFloat) -> some View {
        let visual = chipVisual(spanW: spanW, spanH: spanH, cell: cell)

        if vm.editingLayout {
            visual
                .gesture(moveGesture)
                .overlay(alignment: .bottomTrailing) {
                    resizeHandle
                        .offset(x: 6, y: 6)
                        .highPriorityGesture(resizeGesture(cell: cell))
                }
                .contextMenu {
                    Button {
                        applyLayoutChange { $0.rotation = (fixture.rotation + 90) % 360 }
                    } label: {
                        Label("Rotar 90°", systemImage: "rotate.right")
                    }
                    Button(role: .destructive) {
                        vm.deleteFixture(fixture)
                    } label: {
                        Label("Eliminar", systemImage: "trash")
                    }
                }
                .zIndex(dragOffset == .zero && resizePreview == nil ? 0 : 1)
        } else {
            visual
        }
    }

    private func chipVisual(spanW: CGFloat, spanH: CGFloat, cell: CGFloat) -> some View {
        let rawW = CGFloat(rawCells.w) * cell - chipInset
        let rawH = CGFloat(rawCells.h) * cell - chipInset

        return ZStack {
            // Rotated layer — the dashed container that shows the real shape.
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.white.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                .frame(width: rawW, height: rawH)
                .rotationEffect(.degrees(Double(fixture.rotation)))

            // Unrotated layer — icon/label always stay upright and legible.
            VStack(spacing: 2) {
                Image(systemName: fixture.icon)
                    .font(.system(size: 12))
                if vm.editingLayout {
                    Text(fixture.displayLabel)
                        .font(.system(size: 9))
                }
            }
            .foregroundColor(.white.opacity(0.5))
        }
        .frame(width: spanW, height: spanH)
        .animation(.snappy, value: rawCells)
    }

    private func applyLayoutChange(_ mutate: (inout MapFixtureLayoutUpdate) -> Void) {
        var update = MapFixtureLayoutUpdate(
            id: fixture.id,
            positionX: fixture.positionX,
            positionY: fixture.positionY,
            widthCells: fixture.widthCells,
            heightCells: fixture.heightCells,
            rotation: fixture.rotation
        )
        mutate(&update)
        vm.saveFixtureLayout(update)
    }

    private var moveGesture: some Gesture {
        DragGesture(coordinateSpace: .named(mapCoordinateSpace))
            .onChanged { value in
                dragOffset = value.translation
            }
            .onEnded { value in
                let cell = metrics.cellSize
                let deltaX = Int((value.translation.width / cell).rounded())
                let deltaY = Int((value.translation.height / cell).rounded())
                let (fw, fh) = fixture.footprintCells
                let newX = max(0, min(metrics.columns - fw, fixture.positionX + deltaX))
                let newY = max(0, min(metrics.rows - fh, fixture.positionY + deltaY))
                withAnimation(.snappy) {
                    if newX != fixture.positionX || newY != fixture.positionY {
                        applyLayoutChange {
                            $0.positionX = newX
                            $0.positionY = newY
                        }
                    }
                    dragOffset = .zero
                }
            }
    }

    private var resizeHandle: some View {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(5)
            .background(Circle().fill(Color.gray.opacity(0.8)))
            .contentShape(Circle())
    }

    private func resizeGesture(cell: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .named(mapCoordinateSpace))
            .onChanged { value in
                resizePreview = clampedResize(for: value.translation, cell: cell)
            }
            .onEnded { value in
                let newCells = clampedResize(for: value.translation, cell: cell)
                withAnimation(.snappy) {
                    if newCells.w != fixture.widthCells || newCells.h != fixture.heightCells {
                        applyLayoutChange {
                            $0.widthCells = newCells.w
                            $0.heightCells = newCells.h
                        }
                    }
                    resizePreview = nil
                }
            }
    }

    private func clampedResize(for translation: CGSize, cell: CGFloat) -> CellFootprint {
        let dx = Int((translation.width / cell).rounded())
        let dy = Int((translation.height / cell).rounded())
        let (curScreenW, curScreenH) = fixture.footprintCells
        let maxScreenW = min(8, metrics.columns - fixture.positionX)
        let maxScreenH = min(8, metrics.rows - fixture.positionY)
        let newScreenW = max(1, min(maxScreenW, curScreenW + dx))
        let newScreenH = max(1, min(maxScreenH, curScreenH + dy))
        return (fixture.rotation == 90 || fixture.rotation == 270)
            ? CellFootprint(w: newScreenH, h: newScreenW)
            : CellFootprint(w: newScreenW, h: newScreenH)
    }
}

struct UnplacedTablesTray: View {
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if vm.unplacedTables.isEmpty {
                    Text("No hay mesas sin acomodar")
                        .foregroundColor(.gray)
                } else {
                    ForEach(vm.unplacedTables) { table in
                        Button {
                            vm.placeTableOnMap(table)
                        } label: {
                            HStack {
                                Image(systemName: "chair.fill")
                                    .foregroundColor(.green.opacity(0.7))
                                VStack(alignment: .leading) {
                                    Text(table.displayName)
                                        .font(.body.weight(.medium))
                                    Text("\(table.capacity) personas")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                Spacer()
                                Image(systemName: "plus.circle.fill")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Añadir mesa al mapa")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
