import SwiftUI

/// Pantalla de toma de pedido — misma estructura de interacción que
/// `MainPOSView`/`ProductGridView` de Bruma POS (adaptada a una sola
/// columna para iPhone en vez del panel lado-a-lado de iPad). Variantes,
/// nodos de flujo y notas viven en un único contenedor animado; el carrito
/// conserva su hoja propia porque es una acción independiente.
struct ComandasOrderTakingView: View {
    @ObservedObject var vm: POSViewModel
    @State private var showCart = false
    @State private var showLeaveConfirm = false
    @State private var wasSubmitting = false
    @State private var showSendSuccess = false
    @State private var visibleStep: MobileItemStep?

    private enum MobileItemStep: Hashable {
        case variants(String)
        case flowNode(String)
        case notes
    }

    private var activeStep: MobileItemStep? {
        if vm.showNotesDialog { return .notes }
        if let node = vm.activeFlowNode { return .flowNode(node.id) }
        if vm.showVariantDialog, let product = vm.selectedProductForVariant {
            return .variants(product.id)
        }
        return nil
    }

    /// Los pasos de composición comparten el mismo encabezado: solo el cuerpo
    /// hace un fade breve para que no parezca una navegación lateral.
    private let stepTransition = AnyTransition.opacity

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                if vm.isPracticeMode {
                    practiceBanner
                }
                header
                Divider().background(Color.white.opacity(0.1))

                ZStack {
                    if let step = visibleStep {
                        itemStepContent(for: step)
                            .id(step)
                            .transition(stepTransition)
                    } else {
                        browseContent
                    }
                }
                .onAppear { visibleStep = activeStep }
                .onChange(of: activeStep) { _, newStep in
                    withAnimation(.easeInOut(duration: 0.16)) {
                        visibleStep = newStep
                    }
                }

                Spacer(minLength: 0)

                if !vm.cart.isEmpty {
                    cartBar
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea())
            .comandasBottomSheet(isPresented: showCart, onDismiss: { showCart = false }) {
                // BottomSheetCard es lo que da el grabber/fondo/sombra/drag-to-
                // dismiss — .comandasBottomSheet() por sí solo solo maneja el scrim y la
                // animación de entrada, el contenido tiene que envolverse en la
                // tarjeta explícitamente.
                BottomSheetCard(maxHeight: UIScreen.main.bounds.height * 0.82, onDismiss: { showCart = false }) {
                    ComandasCartView(vm: vm, isPresented: $showCart)
                }
            }
            .alert("¿Salir sin enviar?", isPresented: $showLeaveConfirm) {
                Button("Seguir aquí", role: .cancel) {}
                Button("Salir", role: .destructive) { vm.handleBackToTables() }
            } message: {
                Text("Tienes items sin mandar a cocina — si sales ahora se pierden.")
            }

            if showSendSuccess {
                ComandasSendSuccessOverlay {
                    Haptics.tap()
                    withAnimation(.easeOut(duration: 0.25)) {
                        showSendSuccess = false
                    }
                    vm.handleBackToTables()
                }
                .transition(.opacity)
                .zIndex(10)
            }
        }
        // handleSendToKitchen no es async — se confirma el éxito real
        // reaccionando a que vm.submitting vuelva a false Y ya no queden
        // items pendientes (si falló, submitting también vuelve a false pero
        // los items se quedan sin enviar — el toast de error de POS ya avisa
        // de eso, aquí solo confirmamos el caso feliz). Primero se cierra el
        // carrito y se espera a que termine su animación (antes se disparaban
        // juntas y se veía encimado); la pantalla verde ya no se quita sola
        // con un timer — se queda hasta que el mesero la toca ("Toca para
        // continuar"), y ahí es cuando regresa a mesas.
        .onChange(of: vm.submitting) { _, isSubmitting in
            if wasSubmitting && !isSubmitting && !vm.cart.contains(where: { !$0.sentToKitchen }) {
                Haptics.success()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    showCart = false
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.42) {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                        showSendSuccess = true
                    }
                }
            }
            wasSubmitting = isSubmitting
        }
    }

    @ViewBuilder
    private func itemStepContent(for step: MobileItemStep) -> some View {
        switch step {
        case .variants:
            if let product = vm.selectedProductForVariant {
                MobileVariantNode(product: product, vm: vm)
            }
        case .flowNode:
            if let node = vm.activeFlowNode {
                MobileFlowNode(
                    node: node,
                    selectedOptionIds: vm.activeFlowSelectedOptionIds,
                    select: { option in
                        Haptics.tap()
                        vm.handleStepSelection(option)
                    },
                    clear: { Haptics.tap(); vm.handleStepSelection(nil) },
                    advance: { Haptics.tap(); vm.advanceToNextStep() }
                )
            }
        case .notes:
            MobileNotesNode(vm: vm)
        }
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    Haptics.tap()
                    if vm.cart.contains(where: { !$0.sentToKitchen }) {
                        showLeaveConfirm = true
                    } else {
                        vm.handleBackToTables()
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(FlatCapsuleStyle.neutralFill)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 1) {
                    Text(itemStepTitle ?? orderTitle)
                        .font(.headline.weight(.bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if let subtitle = itemStepSubtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }

                Spacer()

                if vm.activeFlowNode != nil {
                    Text(vm.formatCurrency(vm.flowLiveTotal()))
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.green)
                }

                if activeStep != nil {
                    Button {
                        Haptics.tap()
                        if vm.showNotesDialog {
                            vm.handleCancelNotes()
                        } else if vm.activeFlowNode != nil {
                            vm.handleBackInFlow()
                        } else {
                            vm.dismissVariantDialog()
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Atrás")
                        }
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.flatCapsuleNeutral)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if vm.activeFlowNode != nil {
                flowBreadcrumbs
            }
        }
        .transaction { $0.animation = nil }
    }

    private var itemStepTitle: String? {
        if let node = vm.activeFlowNode { return node.title }
        if vm.showNotesDialog {
            return vm.pendingCartItem?.productName ?? vm.selectedProductForVariant?.name ?? vm.selectedProduct?.name
        }
        if vm.showVariantDialog { return vm.selectedProductForVariant?.name }
        return nil
    }

    private var itemStepSubtitle: String? {
        if let node = vm.activeFlowNode { return node.subtitle }
        if vm.showNotesDialog { return "Comentarios especiales" }
        if vm.showVariantDialog { return "Selecciona una opción" }
        return nil
    }

    /// Recordatorio persistente de que esto SÍ imprime y SÍ aparece en el
    /// Pase real (solo excluido de caja) — para que el mesero nunca lo
    /// confunda con un pedido de verdad a medio tomar.
    private var practiceBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "graduationcap.fill")
            Text("MODO PRÁCTICA — se imprime igual que un pedido real")
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundColor(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.purple.opacity(0.85))
    }

    private var orderTitle: String {
        if let table = vm.selectedTable { return table.displayName }
        if !vm.customerName.isEmpty { return vm.customerName }
        return "Para Llevar"
    }

    private var flowBreadcrumbs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(vm.flowBreadcrumbs, id: \.index) { crumb in
                    Button(crumb.title) {
                        Haptics.tap()
                        vm.returnToFlowVisit(crumb.index)
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.blue)
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.03))
    }

    // MARK: - Browse

    private var browseContent: some View {
        VStack(spacing: 10) {
            seatCourseBar

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.gray)
                TextField("Buscar producto", text: $vm.searchQuery)
                    .foregroundColor(.white)
                if !vm.searchQuery.isEmpty {
                    Button { vm.searchQuery = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .modifier(FlatCard(cornerRadius: 12))
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button {
                        ComandasKeyboard.dismiss()
                        Haptics.tap()
                        vm.cancelItemComposition()
                        withAnimation(.easeInOut(duration: 0.15)) { vm.selectedCategory = nil }
                    } label: {
                        Text("Todo")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(vm.selectedCategory == nil ? .white : .gray)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .modifier(FlatPill(isSelected: vm.selectedCategory == nil, color: .blue))
                    }
                    .buttonStyle(.plain)

                    ForEach(vm.categories.filter { $0.active }.sorted { $0.sortOrder < $1.sortOrder }) { category in
                        Button {
                            ComandasKeyboard.dismiss()
                            Haptics.tap()
                            vm.cancelItemComposition()
                            withAnimation(.easeInOut(duration: 0.15)) {
                                vm.selectedCategory = category.id
                            }
                        } label: {
                            Text(category.name)
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(vm.selectedCategory == category.id ? .white : .gray)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .modifier(FlatPill(isSelected: vm.selectedCategory == category.id, color: .blue))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }

            productsGrid
        }
        .padding(.top, 8)
    }

    /// Movido aquí desde el carrito — pedido explícito: cambiar de
    /// asiento/tiempo antes de agregar un producto no debe requerir abrir el
    /// carrito primero.
    private var seatCourseBar: some View {
        VStack(spacing: 8) {
            if vm.selectedTable != nil && vm.guestCount > 0 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach((1...vm.guestCount).map { "A\($0)" } + ["C"], id: \.self) { seat in
                            Button {
                                Haptics.tap()
                                vm.activeSeat = seat
                            } label: {
                                Text(seat)
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(height: 32)
                                    .modifier(FlatPill(isSelected: vm.activeSeat == seat, color: .blue))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .animation(.easeInOut(duration: 0.15), value: vm.activeSeat)
            }

            Picker("Tiempo", selection: $vm.activeCourse) {
                ForEach(1...4, id: \.self) { course in
                    Text("T\(course)").tag(course)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
        }
    }

    /// `vm.filteredProducts` (compartido, sin modificar) regresa `[]` cuando
    /// no hay categoría ni búsqueda — en POS eso está bien porque siempre
    /// hay una categoría elegida en el sidebar de iPad. Aquí el chip "Todo"
    /// necesita mostrar el catálogo completo en ese mismo caso, así que ese
    /// fallback se resuelve localmente sin tocar POSViewModel.
    private var displayedProducts: [Product] {
        if !vm.searchQuery.isEmpty || vm.selectedCategory != nil {
            return vm.filteredProducts
        }
        return vm.products
            .filter { $0.active }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var productsGrid: some View {
        Group {
            if displayedProducts.isEmpty {
                emptyState(icon: "tray", text: "No hay productos")
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(displayedProducts) { product in
                            ComandasProductTile(product: product) {
                                ComandasKeyboard.dismiss()
                                Haptics.tap()
                                vm.handleProductClick(product)
                            }
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 120)
                }
            }
        }
    }

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: icon).font(.system(size: 40)).foregroundColor(Color(white: 0.35))
            Text(text).font(.subheadline).foregroundColor(Color(white: 0.45))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Floating cart bar

    private var cartBar: some View {
        Button {
            ComandasKeyboard.dismiss()
            Haptics.tap()
            showCart = true
        } label: {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "cart.fill")
                    Text("\(vm.cart.reduce(0) { $0 + $1.quantity }) items")
                        .contentTransition(.numericText())
                }
                .font(.subheadline.weight(.semibold))
                Spacer()
                Text(vm.formatCurrency(vm.cart.reduce(0.0) { $0 + $1.total }))
                    .font(.subheadline.weight(.bold))
                    .contentTransition(.numericText())
            }
            .foregroundColor(.white)
            .padding(.horizontal, 18)
            .frame(height: 52)
        }
        .buttonStyle(.flatCapsule(.blue))
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: vm.cart.count)
    }
}

private struct MobileFlowNode: View {
    let node: FlowNode
    let selectedOptionIds: [String]
    let select: (FlowNodeOption) -> Void
    let clear: () -> Void
    let advance: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    if node.includeNoneOption {
                        MobileFlowOption(label: node.noneLabel ?? "Sin \(node.title.lowercased())", priceLabel: nil, selected: selectedOptionIds.isEmpty, action: clear)
                    }
                    ForEach(node.options, id: \.id) { option in
                        MobileFlowOption(label: option.label, priceLabel: option.effectivePrice == 0 ? nil : String(format: "+$%.2f", option.effectivePrice), selected: selectedOptionIds.contains(option.id)) { select(option) }
                    }
                }
                .padding(16)
            }
            if node.selectMode == "multi" {
                Button("Siguiente") { advance() }
                    .buttonStyle(.flatCapsule(.blue))
                    .padding(16)
                    .disabled(selectedOptionIds.count < node.minSelections || (node.maxSelections != nil && selectedOptionIds.count > node.maxSelections!))
            }
        }
    }
}

private struct MobileVariantNode: View {
    let product: Product
    @ObservedObject var vm: POSViewModel

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(product.parsedVariants) { variant in
                        let usesPlatformPrice = vm.isPlatformDelivery && variant.platformPrice != nil
                        let price = usesPlatformPrice ? variant.numericPlatformPrice : variant.numericPrice

                        MobileFlowOption(
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
                .padding(16)
            }
        }
    }
}

/// Notes are the final item step, rendered in the same full-height container
/// as variants and flow nodes rather than in a separate sheet.
private struct MobileNotesNode: View {
    @ObservedObject var vm: POSViewModel

    private var productName: String {
        vm.pendingCartItem?.productName ?? vm.selectedProductForVariant?.name ?? vm.selectedProduct?.name ?? ""
    }

    private var applicableQuickNotes: [QuickNote] {
        let productId = vm.pendingCartItem?.productId ?? vm.selectedProduct?.id
        return vm.quickNotes.filter { $0.applies(toProductId: productId, variantName: vm.pendingCartItem?.variantName) }
    }

    private var hasContent: Bool {
        !vm.selectedQuickNoteIds.isEmpty || !vm.tempNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    let flowItems = vm.flowSummaryItems()
                    if !flowItems.isEmpty {
                        MobileInlineFlowNotesSummary(
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
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                            ForEach(applicableQuickNotes) { note in
                                MobileFlowOption(label: note.label, priceLabel: nil, selected: vm.selectedQuickNoteIds.contains(note.id), height: 54) {
                                    Haptics.tap()
                                    if vm.selectedQuickNoteIds.contains(note.id) {
                                        vm.selectedQuickNoteIds.remove(note.id)
                                    } else {
                                        vm.selectedQuickNoteIds.insert(note.id)
                                    }
                                }
                            }
                        }
                        // Cada platillo trae sus propias notas rápidas. Sin esto, las que
                        // se repiten entre dos platillos se deslizaban a su nueva posición;
                        // al cambiar de platillo la rejilla completa se funde en su lugar.
                        .id(vm.notesTargetIndex)
                        .transition(.opacity.animation(.easeInOut(duration: 0.18)))
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
                            .frame(height: 100)
                            .modifier(FlatCard(cornerRadius: 12))
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(16)
            }

            HStack(spacing: 12) {
                Button("Cancelar") { vm.handleCancelNotes() }
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .buttonStyle(.flatCapsuleNeutral)
                Button(hasContent ? "Confirmar" : "Agregar") { vm.handleConfirmNotes() }
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .buttonStyle(.flatCapsule(.blue))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
    }
}

private struct MobileInlineFlowNotesSummary: View {
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

private struct MobileFlowOption: View {
    let label: String
    let priceLabel: String?
    var showsPlatformBadge = false
    let selected: Bool
    /// Las notas rápidas usan una tarjeta más baja que las opciones de flujo.
    var height: CGFloat = 90
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 6) {
                    Text(label).font(.subheadline.weight(.medium)).foregroundColor(.white).multilineTextAlignment(.center).lineLimit(height < 80 ? 2 : nil).minimumScaleFactor(height < 80 ? 0.85 : 1).padding(.horizontal, height < 80 ? 8 : 0)
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
                .frame(maxWidth: .infinity).frame(height: height)
                .modifier(FlatCardTinted(color: selected ? .blue : .gray))
                if selected { Image(systemName: "checkmark.circle.fill").font(height < 80 ? .caption : .body).foregroundStyle(.blue).padding(height < 80 ? 4 : 6) }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Send-to-kitchen success overlay

/// Pantalla completa verde al confirmar el envío a cocina — gap real que
/// tiene POS hoy (solo un toast discreto). Aparece con un pulso en el
/// ícono, y se queda hasta que el mesero la toca (sin timer automático) —
/// un "Toca para continuar" respirando avisa que es tocable, y el tap
/// dispara `onContinue` (regresa a mesas).
private struct ComandasSendSuccessOverlay: View {
    let onContinue: () -> Void
    @State private var iconScale: CGFloat = 0.6
    @State private var iconOpacity: Double = 0
    @State private var hintOpacity: Double = 0
    @State private var hintDim = false

    var body: some View {
        ZStack {
            Color(red: 0.09, green: 0.55, blue: 0.28).ignoresSafeArea()

            VStack {
                Spacer()
                VStack(spacing: 18) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 84, weight: .bold))
                        .foregroundColor(.white)
                        .scaleEffect(iconScale)
                        .opacity(iconOpacity)
                    Text("Enviado a Cocina")
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                        .opacity(iconOpacity)
                }
                Spacer()
                Text("Toca para continuar")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white.opacity(hintDim ? 0.5 : 1))
                    .opacity(hintOpacity)
                    .padding(.bottom, 36)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onContinue)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) {
                iconScale = 1
                iconOpacity = 1
            }
            withAnimation(.easeIn(duration: 0.3).delay(0.5)) {
                hintOpacity = 1
            }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true).delay(0.5)) {
                hintDim = true
            }
        }
    }
}

// MARK: - Product tile

private struct ComandasProductTile: View {
    let product: Product
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Text(product.hasVariants ? "Desde $\(priceString)" : "$\(priceString)")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.blue)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
            .modifier(FlatCard(cornerRadius: 14))
        }
        .buttonStyle(ComandasTilePressStyle())
    }

    private var priceString: String {
        if product.hasVariants, let cheapest = product.parsedVariants.map({ $0.numericPrice }).min() {
            return String(format: "%.0f", cheapest)
        }
        return String(format: "%.0f", product.numericPrice)
    }
}

private struct ComandasTilePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
