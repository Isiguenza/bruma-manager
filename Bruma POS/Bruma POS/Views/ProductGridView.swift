import SwiftUI

struct ProductGridView: View {
    @ObservedObject var vm: POSViewModel
    @State private var visibleStep: ItemStep?

    /// A single identity for every part of adding an item. Keeping the old
    /// identity mounted until the new one is ready also avoids a blank product
    /// area while a graph is being resolved after selecting a variant.
    private enum ItemStep: Hashable {
        case variants(String)
        case flowNode(String)
        case notes
    }

    private var activeStep: ItemStep? {
        if vm.showNotesDialog { return .notes }
        if let node = vm.activeFlowNode { return .flowNode(node.id) }
        if vm.showVariantDialog, let product = vm.selectedProductForVariant {
            return .variants(product.id)
        }
        return nil
    }

    /// Los pasos son pantallas de composición dentro del mismo panel. Un fade
    /// corto conserva el contexto; mover toda la rejilla horizontalmente hacía
    /// parecer que se navegaba fuera del pedido.
    private let stepTransition = AnyTransition.opacity

    var body: some View {
        VStack(spacing: 0) {
            if let step = visibleStep {
                stepHeader(for: step)
                    .transaction { $0.animation = nil }
                Divider().background(Color.white.opacity(0.1))

                ZStack {
                    stepContent(for: step)
                        .id(step)
                        .transition(stepTransition)
                }
            } else {
                legacyContent
            }
        }
        .onAppear { visibleStep = activeStep }
        .onChange(of: activeStep) { _, newStep in
            withAnimation(.easeInOut(duration: 0.16)) {
                visibleStep = newStep
            }
        }
    }

    @ViewBuilder
    private func stepHeader(for step: ItemStep) -> some View {
        switch step {
        case .variants:
            if let product = vm.selectedProductForVariant {
                HStack {
                    stepBackButton(action: vm.dismissVariantDialog)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(product.name).font(.title2.weight(.bold)).foregroundColor(.white)
                        Text("Selecciona una opción").font(.subheadline).foregroundColor(.gray)
                    }
                    Spacer()
                }
                .padding(16)
            }
        case .flowNode:
            if let node = vm.activeFlowNode {
                VStack(alignment: .leading, spacing: 8) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(vm.flowBreadcrumbs, id: \.index) { crumb in
                                Button(crumb.title) { vm.returnToFlowVisit(crumb.index) }
                                    .font(.caption.weight(.semibold))
                                    .foregroundColor(.blue)
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    HStack {
                        stepBackButton(action: vm.handleBackInFlow)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(node.title).font(.title2.weight(.bold)).foregroundColor(.white)
                            if let subtitle = node.subtitle {
                                Text(subtitle).font(.subheadline).foregroundColor(.gray)
                            }
                        }
                        Spacer()
                        Text(vm.formatCurrency(vm.flowLiveTotal())).font(.headline.weight(.bold)).foregroundColor(.green)
                    }
                }
                .padding(16)
            }
        case .notes:
            HStack {
                stepBackButton(action: vm.handleCancelNotes)
                VStack(alignment: .leading, spacing: 3) {
                    Text(notesProductName).font(.title2.weight(.bold)).foregroundColor(.white)
                    Text("Comentarios especiales").font(.subheadline).foregroundColor(.gray)
                }
                Spacer()
            }
            .padding(16)
        }
    }

    private func stepBackButton(action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "chevron.left")
                Text("Atrás")
            }
            .font(.callout.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .buttonStyle(.flatCapsuleNeutral)
    }

    @ViewBuilder
    private func stepContent(for step: ItemStep) -> some View {
        switch step {
        case .variants:
            if let product = vm.selectedProductForVariant {
                variantScreen(for: product)
            }
        case .flowNode:
            if let node = vm.activeFlowNode {
                flowNodeScreen(node)
            }
        case .notes:
            notesScreen
        }
    }

    private var legacyContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Selecciona un producto")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(16)
            Divider().background(Color.white.opacity(0.1))
            productsList
        }
    }

    // MARK: - Graph flow

    private func flowNodeScreen(_ node: FlowNode) -> some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    if node.includeNoneOption {
                        FlowOptionCard(label: node.noneLabel ?? "Sin \(node.title.lowercased())", priceLabel: nil, selected: vm.activeFlowSelectedOptionIds.isEmpty) {
                            Haptics.tap(); vm.handleStepSelection(nil)
                        }
                    }
                    ForEach(node.options, id: \.id) { option in
                        FlowOptionCard(label: option.label, priceLabel: option.effectivePrice == 0 ? nil : String(format: "+$%.2f", option.effectivePrice), selected: vm.activeFlowSelectedOptionIds.contains(option.id)) {
                            Haptics.tap()
                            vm.handleStepSelection(option)
                        }
                    }
                }
                .padding(20)
            }
            if node.selectMode == "multi" {
                Button { Haptics.tap(); vm.advanceToNextStep() } label: {
                    Text("Siguiente (\(vm.activeFlowSelectedOptionIds.count)/\(node.maxSelections.map(String.init) ?? "∞"))")
                        .font(.callout.weight(.semibold)).foregroundColor(.white).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .buttonStyle(.flatCapsule(.blue))
                .padding(16)
                .disabled(vm.activeFlowSelectedOptionIds.count < node.minSelections || (node.maxSelections != nil && vm.activeFlowSelectedOptionIds.count > node.maxSelections!))
            }
        }
    }

    private func variantScreen(for product: Product) -> some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    ForEach(product.parsedVariants) { variant in
                        let usesPlatformPrice = vm.isPlatformDelivery && variant.platformPrice != nil
                        let price = usesPlatformPrice ? variant.numericPlatformPrice : variant.numericPrice

                        FlowOptionCard(
                            label: variant.name,
                            priceLabel: vm.formatCurrency(price),
                            showsPlatformBadge: usesPlatformPrice,
                            selected: false
                        ) {
                            Haptics.tap()
                            vm.handleAddVariant(variant.name, price: variant.price, platformPrice: variant.platformPrice)
                        }
                    }
                }
                .padding(20)
            }
        }
    }

    // MARK: - Notes

    private var notesScreen: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    let flowItems = vm.flowSummaryItems()
                    if !flowItems.isEmpty {
                        POSInlineFlowNotesSummary(
                            items: flowItems,
                            formatCurrency: vm.formatCurrency,
                            editSelection: {
                                Haptics.tap()
                                vm.handleCancelNotes()
                            }
                        )
                    }

                    NotesTargetPicker(targets: vm.notesTargets, selectedId: vm.notesTargetIndex) { vm.selectNotesTarget($0) }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Comentarios especiales").font(.subheadline.bold()).foregroundColor(.white)
                        Text("Instrucciones, preferencias o alergias").font(.caption).foregroundColor(.gray)
                    }

                    if !applicableQuickNotes.isEmpty {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                            ForEach(applicableQuickNotes) { note in
                                FlowOptionCard(label: note.label, priceLabel: nil, selected: vm.selectedQuickNoteIds.contains(note.id)) {
                                    Haptics.tap()
                                    if vm.selectedQuickNoteIds.contains(note.id) {
                                        vm.selectedQuickNoteIds.remove(note.id)
                                    } else {
                                        vm.selectedQuickNoteIds.insert(note.id)
                                    }
                                }
                            }
                        }
                    }

                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            vm.showFreeTextNotes.toggle()
                        }
                    } label: {
                        Label(vm.showFreeTextNotes ? "Ocultar comentario" : "Comentario adicional", systemImage: vm.showFreeTextNotes ? "minus.circle" : "plus.circle")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)

                    if vm.showFreeTextNotes {
                        TextEditor(text: $vm.tempNotes)
                            .scrollContentBackground(.hidden)
                            .foregroundColor(.white)
                            .padding(12)
                            .frame(height: 120)
                            .font(.body)
                            .modifier(FlatCard(cornerRadius: 12))
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(20)
            }

            // El ancho lo da la ETIQUETA, no el botón: con `.frame` después de
            // `.buttonStyle` el fondo relleno sigue abrazando el texto y solo se
            // estira el contenedor invisible.
            HStack(spacing: 12) {
                Button { vm.handleCancelNotes() } label: {
                    Text("Cancelar")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(.gray)

                Button { vm.handleConfirmNotes() } label: {
                    Text(notesHasContent ? "Confirmar" : "Agregar")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
        }
    }

    private var notesProductName: String {
        vm.pendingCartItem?.productName ?? vm.selectedProductForVariant?.name ?? vm.selectedProduct?.name ?? ""
    }

    private var applicableQuickNotes: [QuickNote] {
        let productId = vm.pendingCartItem?.productId ?? vm.selectedProduct?.id
        return vm.quickNotes.filter { $0.applies(toProductId: productId, variantName: vm.pendingCartItem?.variantName) }
    }

    private var notesHasContent: Bool {
        !vm.selectedQuickNoteIds.isEmpty || !vm.tempNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Products List
    
    private var productsList: some View {
        Group {
            if vm.selectedCategory == nil && vm.searchQuery.isEmpty {
                VStack {
                    Spacer()
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("Selecciona una categoría")
                        .font(.headline)
                        .foregroundColor(.gray)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else if vm.filteredProducts.isEmpty {
                VStack {
                    Spacer()
                    Image(systemName: "tray")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("No hay productos")
                        .font(.headline)
                        .foregroundColor(.gray)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20) {
                        ForEach(vm.groupedFilteredProducts) { group in
                            if let title = group.title {
                                Text(title)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundColor(.gray)
                                    .padding(.horizontal, 20)
                            }
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16) {
                                ForEach(group.products) { product in
                                    ProductCardView(product: product, vm: vm)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.vertical, 20)
                }
            }
        }
    }
    
}

/// The existing sheet summary, moved into the inline item-step container.
private struct POSInlineFlowNotesSummary: View {
    let items: [CartItem]
    let formatCurrency: (Double) -> String
    let editSelection: () -> Void

    private var total: Double { items.reduce(0) { $0 + $1.total } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Resumen del paquete").font(.subheadline.bold()).foregroundColor(.white)
            ForEach(items) { item in
                HStack(spacing: 8) {
                    if item.parentLocalId != nil {
                        Image(systemName: "arrow.turn.down.right").font(.caption).foregroundColor(.gray)
                    }
                    Text(item.productName)
                        .font(item.parentLocalId == nil ? .subheadline.weight(.semibold) : .caption)
                        .foregroundColor(.white)
                    Spacer(minLength: 12)
                    Text(formatCurrency(item.unitPrice))
                        .font(.caption.weight(.medium))
                        .foregroundColor(item.parentLocalId == nil ? .green : .gray)
                }
                .padding(.leading, item.parentLocalId == nil ? 0 : 14)
            }
            Divider().background(Color.white.opacity(0.12))
            HStack {
                Text("Total").font(.subheadline.weight(.bold)).foregroundColor(.white)
                Spacer()
                Text(formatCurrency(total)).font(.subheadline.weight(.bold)).foregroundColor(.green)
            }
            Button(action: editSelection) {
                Label("Editar selección", systemImage: "chevron.left")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
            }
            .buttonStyle(.flatCapsuleNeutral)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .modifier(FlatCard(cornerRadius: 12))
    }
}

private struct FlowOptionCard: View {
    let label: String
    let priceLabel: String?
    var showsPlatformBadge = false
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 8) {
                    Text(label).font(.subheadline.weight(.medium)).foregroundColor(.white).multilineTextAlignment(.center)
                    if let priceLabel {
                        HStack(spacing: 4) {
                            Text(priceLabel).font(.caption).foregroundColor(.blue)
                            if showsPlatformBadge {
                                Image(systemName: "motorcycle")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity).frame(height: 110)
                .modifier(FlatCardTinted(color: selected ? .blue : .gray))
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue).padding(8) }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Product Card

struct ProductCardView: View {
    let product: Product
    @ObservedObject var vm: POSViewModel
    
    private var categoryObj: Category? {
        vm.categories.first(where: { $0.id == product.categoryId })
    }
    
    private var isPlatform: Bool {
        vm.isPlatformDelivery
    }
    
    private var displayPrice: Double {
        isPlatform ? product.numericPlatformPrice : product.numericPrice
    }
    
    var body: some View {
        Button {
            vm.handleProductClick(product)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Product name
                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                Spacer()
                
                // Price — los productos con variantes no tienen precio base
                // propio (cada variante trae el suyo), así que no mostramos
                // "$0.00" aquí.
                if !product.hasVariants || displayPrice > 0 {
                    HStack(spacing: 4) {
                        Text(vm.formatCurrency(displayPrice))
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)

                        if isPlatform && product.platformPrice != nil {
                            Image(systemName: "motorcycle")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        }
                    }
                }
                
                // Category badge
                if let cat = categoryObj {
                    Text(cat.name)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color(hex: cat.color ?? "#6B7280").opacity(0.15))
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: cat.color ?? "#6B7280").opacity(0.3), lineWidth: 1))
                        )
                        .foregroundColor(Color(hex: cat.color ?? "#6B7280"))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 140, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
