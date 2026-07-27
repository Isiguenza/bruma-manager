import SwiftUI

enum TableMapGrid {
    static let columns = 20
    static let rows = 14
    static let cellSize: CGFloat = 64
}

struct TableMapView: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if vm.canEditLayout {
                editControls
            }

            ScrollView([.horizontal, .vertical], showsIndicators: true) {
                ZStack(alignment: .topLeading) {
                    gridBackground

                    ForEach(vm.placedTables) { table in
                        TableMapChip(table: table, vm: vm)
                            .position(cellCenter(for: table))
                    }
                }
                .frame(
                    width: CGFloat(TableMapGrid.columns) * TableMapGrid.cellSize,
                    height: CGFloat(TableMapGrid.rows) * TableMapGrid.cellSize
                )
            }
            .frame(minHeight: 420, maxHeight: 560)
            .frame(maxWidth: .infinity)
            .background(Color.white.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .overlay {
                if vm.placedTables.isEmpty {
                    emptyStateView
                }
            }
        }
        .sheet(isPresented: $vm.showUnplacedTablesTray) {
            UnplacedTablesTray(vm: vm)
        }
        .confirmationDialog(
            "¿Unir estas 2 mesas?",
            isPresented: $vm.showMergeConfirmation,
            titleVisibility: .visible
        ) {
            Button("Unir mesas") { Task { await vm.confirmMerge() } }
            Button("Cancelar", role: .cancel) { vm.cancelMergeMode() }
        } message: {
            Text("Se combinarán temporalmente; se separan solas al cerrar la cuenta o cancelar la reservación.")
        }
    }

    private var editControls: some View {
        HStack(spacing: 10) {
            if vm.mergeModeActive {
                Text(vm.selectedForMerge.isEmpty ? "Toca 2 mesas para unir" : "1 mesa seleccionada")
                    .font(.caption.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))

                Button {
                    vm.cancelMergeMode()
                } label: {
                    Text("Cancelar")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.7))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            } else if vm.editingLayout {
                if vm.unplacedTables.count > 0 {
                    Button {
                        vm.showUnplacedTablesTray = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                            Text("Añadir mesa (\(vm.unplacedTables.count))")
                                .font(.caption.weight(.semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.blue.opacity(0.8))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    vm.startMergeMode()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "link")
                        Text("Combinar mesas")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.purple.opacity(0.8))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if vm.mergeModeActive { vm.cancelMergeMode() }
                    vm.editingLayout.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: vm.editingLayout ? "checkmark.circle.fill" : "pencil.circle.fill")
                    Text(vm.editingLayout ? "Listo" : "Editar mapa")
                        .font(.caption.weight(.semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(vm.editingLayout ? Color.green.opacity(0.8) : Color.white.opacity(0.12))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private var gridBackground: some View {
        Canvas { context, size in
            // Only show the placement grid while actively editing the layout —
            // it's just visual scaffolding for dragging, not useful otherwise.
            guard vm.editingLayout else { return }
            let cell = TableMapGrid.cellSize
            let inset: CGFloat = 5
            for row in 0..<TableMapGrid.rows {
                for col in 0..<TableMapGrid.columns {
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
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        vm.editingLayout = true
                    }
                    if vm.unplacedTables.count > 0 {
                        vm.showUnplacedTablesTray = true
                    }
                } label: {
                    Text("Acomodar mesas")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.blue.opacity(0.8))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            } else {
                Text("Pide a un administrador que acomode las mesas")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(24)
    }

    private func cellCenter(for table: Table) -> CGPoint {
        let cell = TableMapGrid.cellSize
        let x = CGFloat(table.positionX ?? 0) * cell
        let y = CGFloat(table.positionY ?? 0) * cell
        let (w, h) = table.footprintCells
        return CGPoint(
            x: x + CGFloat(w) * cell / 2,
            y: y + CGFloat(h) * cell / 2
        )
    }
}

struct TableMapChip: View {
    static let maxCells = 4

    let table: Table
    @ObservedObject var vm: POSViewModel
    @State private var dragOffset: CGSize = .zero
    @State private var resizePreview: (w: Int, h: Int)?

    private var isRound: Bool { table.shape == "round" }
    private var displayCells: (w: Int, h: Int) { resizePreview ?? table.footprintCells }

    var body: some View {
        Group {
            if vm.mergeModeActive {
                chipContent
                    .overlay(mergeSelectionOverlay)
                    .onTapGesture { vm.toggleMergeSelection(table) }
            } else if vm.editingLayout {
                ZStack(alignment: .bottomTrailing) {
                    chipContent
                        .offset(dragOffset)
                        .gesture(moveGesture)
                        .contextMenu { editContextMenu }

                    resizeHandle
                        .offset(x: dragOffset.width + 10, y: dragOffset.height + 10)
                }
                .zIndex(dragOffset == .zero && resizePreview == nil ? 0 : 1)
            } else {
                Button {
                    vm.handleSelectTable(table)
                } label: {
                    chipContent
                }
                .buttonStyle(.plain)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: table.mergedWith)
    }

    @ViewBuilder
    private var mergeSelectionOverlay: some View {
        if vm.selectedForMerge.contains(table.id) {
            RoundedRectangle(cornerRadius: isRound ? 999 : 10)
                .stroke(Color.blue, lineWidth: 3)
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
        Task { await vm.saveLayout([update]) }
    }

    private func chipContent(cells: (w: Int, h: Int)) -> some View {
        ZStack(alignment: .topTrailing) {
            shapeBackground
            VStack(spacing: 2) {
                Text(table.number)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("\(table.capacity)p")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if table.isMerged {
                Image(systemName: "link.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.blue).frame(width: 14, height: 14))
                    .offset(x: 4, y: -4)
            }
        }
        .frame(
            width: CGFloat(cells.w) * TableMapGrid.cellSize - 6,
            height: CGFloat(cells.h) * TableMapGrid.cellSize - 6
        )
        .rotationEffect(.degrees(Double(table.rotation ?? 0)))
    }

    private var chipContent: some View {
        chipContent(cells: displayCells)
    }

    private var moveGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation
            }
            .onEnded { value in
                let cell = TableMapGrid.cellSize
                let deltaX = Int((value.translation.width / cell).rounded())
                let deltaY = Int((value.translation.height / cell).rounded())
                let (fw, fh) = table.footprintCells
                let newX = max(0, min(TableMapGrid.columns - fw, (table.positionX ?? 0) + deltaX))
                let newY = max(0, min(TableMapGrid.rows - fh, (table.positionY ?? 0) + deltaY))
                dragOffset = .zero

                guard newX != table.positionX || newY != table.positionY else { return }

                let update = TableLayoutUpdate(
                    id: table.id,
                    positionX: newX,
                    positionY: newY,
                    widthCells: table.effectiveWidthCells,
                    heightCells: table.effectiveHeightCells,
                    rotation: table.rotation ?? 0,
                    shape: table.shape ?? "square"
                )
                Task { await vm.saveLayout([update]) }
            }
    }

    // Corner drag handle — like a Photoshop/Figma resize corner. Dragging it
    // changes how many grid squares this table occupies, anchored at its
    // current top-left cell (positionX/Y never change from this gesture).
    private var resizeHandle: some View {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
            .padding(6)
            .background(Circle().fill(Color.blue))
            .contentShape(Circle())
            .gesture(resizeGesture)
    }

    private var resizeGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                resizePreview = clampedResize(for: value.translation)
            }
            .onEnded { value in
                let newCells = clampedResize(for: value.translation)
                resizePreview = nil
                guard newCells.w != table.effectiveWidthCells || newCells.h != table.effectiveHeightCells else { return }
                applyLayoutChange {
                    $0.widthCells = newCells.w
                    $0.heightCells = newCells.h
                }
            }
    }

    private func clampedResize(for translation: CGSize) -> (w: Int, h: Int) {
        let cell = TableMapGrid.cellSize
        let deltaW = Int((translation.width / cell).rounded())
        let deltaH = Int((translation.height / cell).rounded())
        let maxW = min(Self.maxCells, TableMapGrid.columns - (table.positionX ?? 0))
        let maxH = min(Self.maxCells, TableMapGrid.rows - (table.positionY ?? 0))
        let newW = max(1, min(maxW, table.effectiveWidthCells + deltaW))
        let newH = max(1, min(maxH, table.effectiveHeightCells + deltaH))
        return (newW, newH)
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
