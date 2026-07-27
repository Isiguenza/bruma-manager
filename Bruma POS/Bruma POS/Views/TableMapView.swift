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
            let cell = TableMapGrid.cellSize
            var path = Path()
            var x: CGFloat = 0
            while x <= size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += cell
            }
            var y: CGFloat = 0
            while y <= size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += cell
            }
            context.stroke(path, with: .color(Color.white.opacity(0.05)), lineWidth: 1)
        }
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
    let table: Table
    @ObservedObject var vm: POSViewModel
    @State private var dragOffset: CGSize = .zero

    private var isRound: Bool { table.shape == "round" }

    var body: some View {
        Group {
            if vm.mergeModeActive {
                chipContent
                    .overlay(mergeSelectionOverlay)
                    .onTapGesture { vm.toggleMergeSelection(table) }
            } else if vm.editingLayout {
                chipContent
                    .offset(dragOffset)
                    .gesture(dragGesture)
                    .zIndex(dragOffset == .zero ? 0 : 1)
                    .contextMenu { editContextMenu }
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

        Button {
            applyLayoutChange { $0.widthCells = min(3, table.effectiveWidthCells + 1) }
        } label: {
            Label("Ampliar ancho", systemImage: "arrow.left.and.right")
        }
        .disabled(table.effectiveWidthCells >= 3)

        Button {
            applyLayoutChange { $0.widthCells = max(1, table.effectiveWidthCells - 1) }
        } label: {
            Label("Reducir ancho", systemImage: "arrow.left.and.right")
        }
        .disabled(table.effectiveWidthCells <= 1)

        Button {
            applyLayoutChange { $0.heightCells = min(3, table.effectiveHeightCells + 1) }
        } label: {
            Label("Ampliar alto", systemImage: "arrow.up.and.down")
        }
        .disabled(table.effectiveHeightCells >= 3)

        Button {
            applyLayoutChange { $0.heightCells = max(1, table.effectiveHeightCells - 1) }
        } label: {
            Label("Reducir alto", systemImage: "arrow.up.and.down")
        }
        .disabled(table.effectiveHeightCells <= 1)
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

    private var chipContent: some View {
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
            width: CGFloat(table.footprintCells.w) * TableMapGrid.cellSize - 6,
            height: CGFloat(table.footprintCells.h) * TableMapGrid.cellSize - 6
        )
        .rotationEffect(.degrees(Double(table.rotation ?? 0)))
    }

    private var dragGesture: some Gesture {
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
