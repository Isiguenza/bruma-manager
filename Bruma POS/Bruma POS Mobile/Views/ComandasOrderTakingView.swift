import SwiftUI

/// Pantalla de toma de pedido — misma estructura de interacción que
/// `MainPOSView`/`ProductGridView` de Bruma POS (adaptada a una sola
/// columna para iPhone en vez del panel lado-a-lado de iPad): el mismo
/// contenedor cambia entre "explorar productos" y "flujo de modificadores"
/// según el nodo activo del grafo. Variante y notas se muestran en una hoja
/// inferior compartida (`ComandasProductAddDialog`, igual que
/// `ProductAddDialog` de POS) — el carrito vive en su propia hoja aparte,
/// accesible desde una barra flotante (en POS el carrito es un panel fijo
/// siempre visible, algo que no cabe en una pantalla de teléfono).
struct ComandasOrderTakingView: View {
    @ObservedObject var vm: POSViewModel
    @State private var showCart = false
    @State private var showLeaveConfirm = false
    @State private var wasSubmitting = false
    @State private var showSendSuccess = false

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                if vm.isPracticeMode {
                    practiceBanner
                }
                header
                Divider().background(Color.white.opacity(0.1))

                if vm.showingFlowSummary {
                    MobileFlowSummary(items: vm.flowSummaryItems(), formatCurrency: vm.formatCurrency, confirm: vm.confirmFlowSummary)
                } else if let node = vm.activeFlowNode {
                    MobileFlowNode(
                        node: node,
                        selectedOptionIds: vm.activeFlowSelectedOptionIds,
                        total: vm.formatCurrency(vm.flowLiveTotal()),
                        select: { option in
                            Haptics.tap()
                            vm.handleStepSelection(option)
                        },
                        clear: { Haptics.tap(); vm.handleStepSelection(nil) },
                        advance: { Haptics.tap(); vm.advanceToNextStep() }
                    )
                } else {
                    browseContent
                }

                Spacer(minLength: 0)

                if !vm.cart.isEmpty {
                    cartBar
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea())
            .comandasBottomSheet(
                isPresented: vm.showVariantDialog || vm.showNotesDialog,
                onDismiss: {
                    if vm.showNotesDialog {
                        vm.handleCancelNotes()
                    } else {
                        vm.dismissVariantDialog()
                    }
                }
            ) {
                ComandasProductAddDialog(vm: vm)
            }
            .comandasBottomSheet(isPresented: showCart, onDismiss: { showCart = false }) {
                // BottomSheetCard es lo que da el grabber/fondo/sombra/drag-to-
                // dismiss — .comandasBottomSheet() por sí solo solo maneja el scrim y la
                // animación de entrada, el contenido tiene que envolverse en la
                // tarjeta explícitamente (mismo patrón que ProductAddDialog).
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

    private var header: some View {
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
                Text(orderTitle)
                    .font(.headline.weight(.bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                if let node = vm.activeFlowNode {
                    Text(node.title)
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            Spacer()

            if vm.activeFlowNode != nil {
                Button {
                    Haptics.tap()
                    vm.handleBackInFlow()
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
        .animation(.easeInOut(duration: 0.2), value: vm.activeFlowNode?.id)
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
    let total: String
    let select: (FlowNodeOption) -> Void
    let clear: () -> Void
    let advance: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(node.title).font(.headline.weight(.bold)).foregroundColor(.white)
                    if let subtitle = node.subtitle { Text(subtitle).font(.caption).foregroundColor(.gray) }
                }
                Spacer()
                Text(total).font(.headline.weight(.bold)).foregroundColor(.green)
            }
            .padding(16)
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    if node.includeNoneOption {
                        MobileFlowOption(label: node.noneLabel ?? "Sin \(node.title.lowercased())", price: nil, selected: selectedOptionIds.isEmpty, action: clear)
                    }
                    ForEach(node.options, id: \.id) { option in
                        MobileFlowOption(label: option.label, price: option.effectivePrice == 0 ? nil : option.effectivePrice, selected: selectedOptionIds.contains(option.id)) { select(option) }
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

private struct MobileFlowOption: View {
    let label: String
    let price: Double?
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 6) {
                    Text(label).font(.subheadline.weight(.medium)).foregroundColor(.white).multilineTextAlignment(.center)
                    if let price { Text(String(format: "+$%.2f", price)).font(.caption).foregroundColor(.blue) }
                }
                .frame(maxWidth: .infinity).frame(height: 90)
                .modifier(FlatCardTinted(color: selected ? .blue : .gray))
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue).padding(6) }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct MobileFlowSummary: View {
    let items: [CartItem]
    let formatCurrency: (Double) -> String
    let confirm: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            Text("Resumen").font(.title3.weight(.bold)).foregroundColor(.white)
            ForEach(items) { item in
                HStack { Text(item.parentLocalId == nil ? item.productName : "↳ \(item.productName)").foregroundColor(.white); Spacer(); Text(formatCurrency(item.unitPrice)).foregroundColor(.gray) }
                    .padding(12).modifier(FlatCard(cornerRadius: 10))
            }
            Button("Confirmar") { confirm() }.buttonStyle(.flatCapsule(.green))
        }
        .padding(16)
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
