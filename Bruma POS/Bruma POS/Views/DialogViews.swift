import SwiftUI

// MARK: - Guest Count Dialog

private struct DialogBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 20))
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(white: 0.1))
                        .shadow(color: .black.opacity(0.5), radius: 20)
                )
        }
    }
}

private struct StepperButton: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                Circle()
                    .fill(Color.white.opacity(0.06))
                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
    }
}

private struct QuickPickPill: ViewModifier {
    let isSelected: Bool
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isSelected ? .regular.tint(.blue).interactive() : .regular.interactive(),
                    in: .capsule
                )
        } else {
            content
                .background(
                    Capsule()
                        .fill(isSelected ? Color.blue : Color(white: 0.12))
                )
        }
    }
}

private struct NotesTextFieldBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.white.opacity(0.03))
                        
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color.white.opacity(0.1), lineWidth: 1)
                        )
                )
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(white: 0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color(white: 0.15), lineWidth: 1)
                        )
                )
        }
    }
}

struct GuestCountDialog: View {
    @ObservedObject var vm: POSViewModel
    let isInitial: Bool
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 24) {
            Text(isInitial ? "¿Cuántas personas?" : "Número de Personas")
                .font(.title2.bold())
                .foregroundColor(.white)

            // Counter
            HStack(spacing: 32) {
                Button {
                    vm.tempGuestCount = max(1, vm.tempGuestCount - 1)
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 72, height: 72)
                        .modifier(StepperButton())
                }
                .buttonStyle(.plain)

                Text("\(vm.tempGuestCount)")
                    .font(.system(size: 56, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 100)
                    .contentTransition(.numericText())
                    .animation(.default, value: vm.tempGuestCount)

                Button {
                    vm.tempGuestCount += 1
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 72, height: 72)
                        .modifier(StepperButton())
                }
                .buttonStyle(.plain)
            }

            if isInitial {
                Text("Puedes cambiarlo después desde el botón de personas")
                    .font(.caption)
                    .foregroundColor(.gray)

                // Quick picks
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach([1, 2, 3, 4, 5, 6, 8, 10], id: \.self) { n in
                        Button {
                            vm.tempGuestCount = n
                        } label: {
                            Text("\(n)")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .modifier(QuickPickPill(isSelected: vm.tempGuestCount == n))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            HStack(spacing: 12) {
                if !isInitial {
                    Button("Cancelar") {
                        vm.showGuestCountDialog = false
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
                    .buttonStyle(.plain)
                }

                let unchanged = !isInitial && vm.tempGuestCount == vm.guestCount
                Button("Confirmar") {
                    if isInitial {
                        vm.confirmInitialGuestCount()
                    } else {
                        vm.confirmGuestCount()
                    }
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(unchanged ? Color.blue.opacity(0.3) : Color.blue))
                .disabled(unchanged)
                .buttonStyle(.plain)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .modifier(DialogBackground())
        .offset(y: max(0, dragOffset))
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 80 {
                        withAnimation(.easeOut(duration: 0.25)) {
                            dragOffset = 600
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            if isInitial {
                                vm.showInitialGuestDialog = false
                            } else {
                                vm.showGuestCountDialog = false
                            }
                            dragOffset = 0
                        }
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                            dragOffset = 0
                        }
                    }
                }
        )
    }
}

// MARK: - Product Add Dialog (Variants + Notes combined)

private enum ProductAddMode {
    case variants
    case notes
}

struct ProductAddDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var mode: ProductAddMode

    init(vm: POSViewModel) {
        self.vm = vm
        self._mode = State(initialValue: vm.showVariantDialog ? .variants : .notes)
    }

    private var productName: String {
        vm.selectedProductForVariant?.name ?? vm.pendingCartItem?.productName ?? ""
    }

    var body: some View {
        VStack(spacing: 20) {
            Text(productName)
                .font(.title2.bold())
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            ZStack {
                variantsSection
                    .opacity(mode == .variants ? 1 : 0)
                notesSection
                    .opacity(mode == .notes ? 1 : 0)
            }
        }
        .padding(24)
        .frame(maxWidth: mode == .notes ? 480 : 400)
        .modifier(DialogBackground())
        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: mode)
        .onChange(of: vm.showNotesDialog) { _, newValue in
            if newValue {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                    mode = .notes
                }
            }
        }
    }

    @ViewBuilder
    private var variantsSection: some View {
        VStack(spacing: 12) {
            Text("Selecciona una opción:")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let product = vm.selectedProductForVariant {
                ForEach(product.parsedVariants) { variant in
                    let isPlatform = vm.isPlatformDelivery
                    let price = isPlatform ? variant.numericPlatformPrice : variant.numericPrice

                    Button {
                        vm.handleAddVariant(variant.name, price: variant.price, platformPrice: variant.platformPrice)
                    } label: {
                        HStack {
                            Text(variant.name)
                                .font(.headline)
                                .foregroundColor(.white)
                            Spacer()
                            HStack(spacing: 4) {
                                Text(vm.formatCurrency(price))
                                    .font(.title3.bold())
                                    .foregroundColor(.white)
                                if isPlatform && variant.platformPrice != nil {
                                    Image(systemName: "motorcycle")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                }
                            }
                        }
                        .padding(16)
                        .background(
                            Capsule()
                                .fill(Color(white: 0.12))
                                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                vm.showVariantDialog = false
            } label: {
                Text("Cancelar")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var notesSection: some View {
        VStack(spacing: 16) {
            // Flow selection summary (when coming from custom flow)
            if let flow = vm.categoryFlow {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Resumen de selección")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(flow.steps) { step in
                            if let sel = vm.stepSelections[step.id] {
                                HStack(alignment: .top, spacing: 6) {
                                    Text("•")
                                        .foregroundColor(.blue)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(step.stepName)
                                            .font(.caption.weight(.medium))
                                            .foregroundColor(.white)
                                        Text(selectionSummary(for: sel))
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Comentarios especiales")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Text("Instrucciones, preferencias o alergias")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if !applicableQuickNotes.isEmpty {
                FlowLayout(spacing: 10) {
                    ForEach(applicableQuickNotes) { note in
                        let isSelected = vm.selectedQuickNoteIds.contains(note.id)
                        Button {
                            if isSelected {
                                vm.selectedQuickNoteIds.remove(note.id)
                            } else {
                                vm.selectedQuickNoteIds.insert(note.id)
                            }
                        } label: {
                            Text(note.label)
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                        .modifier(QuickPickPill(isSelected: isSelected))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    vm.showFreeTextNotes.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: vm.showFreeTextNotes ? "minus.circle" : "plus.circle")
                    Text("Comentario adicional")
                }
                .font(.subheadline.weight(.medium))
                .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)

            if vm.showFreeTextNotes {
                ZStack(alignment: .topLeading) {
                    if vm.tempNotes.isEmpty {
                        Text("Ej: Sin cebolla, extra salsa...")
                            .foregroundColor(.gray.opacity(0.5))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .font(.body)
                    }
                    TextEditor(text: $vm.tempNotes)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .padding(12)
                        .frame(height: 120)
                        .font(.body)
                }
                .modifier(NotesTextFieldBackground())
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack(spacing: 12) {
                Button {
                    vm.handleCancelNotes()
                } label: {
                    Text("Cancelar")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)

                Button {
                    vm.handleConfirmNotes()
                } label: {
                    let hasContent = !vm.selectedQuickNoteIds.isEmpty
                        || !vm.tempNotes.trimmingCharacters(in: .whitespaces).isEmpty
                    Text(hasContent ? "Confirmar" : "Agregar")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Capsule().fill(Color.blue))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var currentProductId: String? {
        vm.selectedProduct?.id ?? vm.pendingCartItem?.productId
    }

    private var applicableQuickNotes: [QuickNote] {
        vm.quickNotes.filter { $0.applies(toProductId: currentProductId) }
    }
    
    private func selectionSummary(for selection: Any) -> String {
        if let opts = selection as? [ModifierOption], !opts.isEmpty {
            return opts.map { $0.name }.joined(separator: ", ")
        } else if let opt = selection as? ModifierOption {
            return opt.name
        } else if let exts = selection as? [Extra], !exts.isEmpty {
            return exts.map { $0.name }.joined(separator: ", ")
        } else if let f = selection as? Frosting {
            return f.name
        } else if let t = selection as? DryTopping {
            return t.name
        }
        return ""
    }
}

// MARK: - Void Dialog

struct VoidDialog: View {
    @ObservedObject var vm: POSViewModel
    
    private let reasons = ["Cliente cambió de opinión", "Error del mesero", "Producto agotado", "Problema de calidad"]
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Eliminar Item de Cocina")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            if let index = vm.voidItemIndex, index < vm.cart.count {
                Text("Eliminar: \(vm.cart[index].quantity)x \(vm.cart[index].productName)")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Razón de eliminación")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(reasons, id: \.self) { reason in
                        Button {
                            vm.voidReason = reason
                        } label: {
                            Text(reason)
                                .font(.caption)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(vm.voidReason == reason ? Color.blue : Color(white: 0.12))
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                    }
                }
                
                TextField("Otra razón...", text: $vm.voidReason)
                    .foregroundColor(.white)
                    .padding(10)
                    .modifier(NotesTextFieldBackground())
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showVoidDialog = false
                    vm.voidItemIndex = nil
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button("Eliminar Item") {
                    vm.handleVoidItem()
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(vm.voidReason.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray.opacity(0.3) : Color.red))
                .disabled(vm.voidReason.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 440)
        .modifier(DialogBackground())
    }
}

// MARK: - Customer Name Dialog

struct CustomerNameDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text(vm.isPlatformDelivery ? "Orden Delivery (Plataforma)" : "Orden Para Llevar")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            if vm.isPlatformDelivery {
                // Platform selector
                VStack(alignment: .leading, spacing: 6) {
                    Text("Plataforma *")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    HStack(spacing: 8) {
                        ForEach(["Uber", "Rappi", "Didi"], id: \.self) { platform in
                            Button {
                                vm.deliveryPlatform = platform
                            } label: {
                                Text(platform)
                                    .font(.subheadline.bold())
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 44)
                                    .background(vm.deliveryPlatform == platform ? Color.orange : Color(white: 0.12))
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                            }
                        }
                    }
                }
                
                VStack(alignment: .leading, spacing: 6) {
                    Text("Últimos 4 dígitos de la orden *")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    TextField("1234", text: $vm.platformOrderDigits)
                        .keyboardType(.numberPad)
                        .foregroundColor(.white)
                        .padding(12)
                        .modifier(NotesTextFieldBackground())
                        .onChange(of: vm.platformOrderDigits) { _, newValue in
                            vm.platformOrderDigits = String(newValue.prefix(4)).filter { $0.isNumber }
                        }
                }
            }
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Nombre del Cliente")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                TextField("Ej: Juan Pérez", text: $vm.customerName)
                    .foregroundColor(.white)
                    .padding(12)
                    .modifier(NotesTextFieldBackground())
                    .onSubmit { vm.handleConfirmCustomerName() }
            }
            
            // Home delivery toggle (only for Para Llevar)
            if !vm.isPlatformDelivery {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Envío a domicilio")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)
                        if vm.isHomeDelivery {
                            Text("+\(vm.formatCurrency(vm.homeDeliveryFee))")
                                .font(.caption)
                                .foregroundColor(.blue)
                        }
                    }
                    
                    Spacer()
                    
                    Toggle("", isOn: Binding(
                        get: { vm.isHomeDelivery },
                        set: { _ in vm.toggleHomeDelivery() }
                    ))
                    .tint(.blue)
                    .labelsHidden()
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(vm.isHomeDelivery ? Color.blue.opacity(0.08) : Color(white: 0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(vm.isHomeDelivery ? Color.blue.opacity(0.3) : Color(white: 0.2), lineWidth: 1)
                        )
                )
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showCustomerNameDialog = false
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button("Continuar") {
                    vm.handleConfirmCustomerName()
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.blue))
            }
        }
        .padding(24)
        .frame(maxWidth: 440)
        .modifier(DialogBackground())
    }
}

// MARK: - QR / Loyalty Dialog

struct LoyaltyDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var showManual = false
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Tarjeta de Lealtad")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            // Camera QR Scanner
            if !showManual {
                ZStack {
                    QRScannerView { code in
                        vm.handleQRCodeDetected(code)
                    }
                    .frame(height: 260)
                    .cornerRadius(16)
                    
                    // Overlay frame
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.3), lineWidth: 2)
                        .frame(height: 260)
                    
                    // Corner brackets
                    VStack {
                        HStack {
                            Image(systemName: "viewfinder")
                                .font(.system(size: 32))
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                        }
                        Spacer()
                    }
                    .padding(20)
                    .frame(height: 260)
                }
            }
            
            // Manual input toggle
            Button {
                withAnimation {
                    showManual.toggle()
                }
            } label: {
                Text(showManual ? "Usar cámara" : "Ingresar código manual")
                    .font(.subheadline)
                    .foregroundColor(.blue)
            }
            
            if showManual {
                TextField("Código de barras", text: $vm.qrCode)
                    .foregroundColor(.white)
                    .padding(12)
                    .modifier(NotesTextFieldBackground())
                    .onSubmit { vm.handleQRCodeDetected(vm.qrCode) }
                
                HStack(spacing: 12) {
                    Button("Cancelar") {
                        vm.qrDialogOpen = false
                        vm.qrCode = ""
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
                    
                    Button {
                        vm.handleQRCodeDetected(vm.qrCode)
                    } label: {
                        HStack {
                            if vm.loadingCard { ProgressView().tint(.white) }
                            Text(vm.loadingCard ? "Buscando..." : "Buscar")
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Capsule().fill(vm.qrCode.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray.opacity(0.3) : Color.blue))
                    }
                    .disabled(vm.loadingCard || vm.qrCode.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } else {
                Button("Cancelar") {
                    vm.qrDialogOpen = false
                    vm.qrCode = ""
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
            }
        }
        .padding(24)
        .frame(maxWidth: 420)
        .modifier(DialogBackground())
    }
}

// MARK: - Manual Stamp Dialog

struct ManualStampDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Asignar Sello Manual")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Código de Barras")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                TextField("Escanea o ingresa el código", text: $vm.manualBarcodeInput)
                    .foregroundColor(.white)
                    .padding(12)
                    .modifier(NotesTextFieldBackground())
                    .onSubmit { vm.handleManualStampSubmit() }
                
                Text("Para clientes que ya pagaron pero olvidaron escanear su tarjeta")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.manualStampDialogOpen = false
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button {
                    vm.handleManualStampSubmit()
                } label: {
                    HStack {
                        if vm.loadingCard { ProgressView().tint(.white) }
                        Text(vm.loadingCard ? "Procesando..." : "Agregar Sello")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.blue))
                }
                .disabled(vm.loadingCard)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .modifier(DialogBackground())
    }
}

// MARK: - Flexible Discount Dialog

struct FlexibleDiscountDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Seleccionar Descuento")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            // Type toggle
            VStack(alignment: .leading, spacing: 8) {
                Text("Tipo de Descuento")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                HStack(spacing: 8) {
                    Button {
                        vm.flexibleDiscountType = "percentage"
                        vm.flexibleDiscountValue = 10
                    } label: {
                        Text("Porcentaje")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(vm.flexibleDiscountType == "percentage" ? Color.blue : Color(white: 0.12))
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    
                    Button {
                        vm.flexibleDiscountType = "fixed"
                        vm.customFlexibleAmount = ""
                    } label: {
                        Text("Monto Fijo")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(vm.flexibleDiscountType == "fixed" ? Color.blue : Color(white: 0.12))
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                }
            }
            
            if vm.flexibleDiscountType == "percentage" {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach([10, 20, 30, 50, 60], id: \.self) { pct in
                        Button {
                            vm.flexibleDiscountValue = Double(pct)
                        } label: {
                            Text("\(pct)%")
                                .font(.title3.bold())
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(vm.flexibleDiscountValue == Double(pct) ? Color.blue : Color(white: 0.12))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Monto en Pesos")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    TextField("Ingresa el monto", text: $vm.customFlexibleAmount)
                        .keyboardType(.decimalPad)
                        .font(.title3.bold())
                        .foregroundColor(.white)
                        .padding(12)
                        .modifier(NotesTextFieldBackground())
                }
            }
            
            // Preview
            HStack {
                Image(systemName: "info.circle.fill")
                    .foregroundColor(.blue)
                Text(vm.flexibleDiscountType == "percentage"
                     ? "Descuento del \(Int(vm.flexibleDiscountValue))% sobre el subtotal"
                     : "Descuento de $\(vm.customFlexibleAmount.isEmpty ? "0" : vm.customFlexibleAmount) en pesos")
                    .font(.subheadline)
                    .foregroundColor(.blue.opacity(0.8))
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.blue.opacity(0.08))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.blue.opacity(0.2)))
            )
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showFlexibleDiscountDialog = false
                    vm.selectedDiscount = nil
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button("Aplicar Descuento") {
                    vm.showFlexibleDiscountDialog = false
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.blue))
            }
        }
        .padding(24)
        .frame(maxWidth: 420)
        .modifier(DialogBackground())
    }
}

// MARK: - Admin Menu Dialog

private enum AdminMode: Equatable {
    case menu
    case guestItems
    case deleteItems
    case replaceItem
    case customModifier
    case pinConfirm
}

private enum CustomModifierTarget: Equatable {
    case wholeAccount
    case specificProduct
}

struct AdminMenuDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var dragOffset: CGFloat = 0
    @State private var adminMode: AdminMode = .menu

    // Delete items state
    @State private var deleteSelection: [Int: Int] = [:]
    @State private var deleteReason: String = ""

    // Replace item state
    @State private var replaceItemIndex: Int?
    @State private var replaceQuantity: Int = 1
    @State private var replaceSearch: String = ""
    @State private var pendingReplaceProduct: Product? = nil

    // Custom modifier state
    @State private var customModifierLabel: String = ""
    @State private var customModifierAmount: String = ""
    @State private var customModifierTarget: CustomModifierTarget = .wholeAccount
    @State private var customModifierItemIndex: Int?

    // PIN confirm state
    @State private var pendingMode: AdminMode = .menu
    @State private var adminPin: String = ""
    @State private var adminPinVerifying: Bool = false
    @State private var adminPinError: Bool = false

    private var isWide: Bool {
        adminMode != .menu
    }

    var body: some View {
        VStack(spacing: 20) {
            Text("Menú Admin")
                .font(.title2.bold())
                .foregroundColor(.white)

            switch adminMode {
            case .menu:
                menuSection
                    .transition(.opacity)
            case .guestItems:
                guestItemsSection
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            case .deleteItems:
                deleteItemsSection
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            case .replaceItem:
                replaceItemSection
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            case .customModifier:
                customModifierSection
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            case .pinConfirm:
                pinSection
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(24)
        .frame(maxWidth: isWide ? 520 : 400)
        .modifier(DialogBackground())
        .offset(y: max(0, dragOffset))
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 80 {
                        withAnimation(.easeOut(duration: 0.25)) {
                            dragOffset = 600
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            vm.showAdminMenu = false
                            resetState()
                        }
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                            dragOffset = 0
                        }
                    }
                }
        )
    }

    private func resetState() {
        adminMode = .menu
        deleteSelection = [:]
        deleteReason = ""
        replaceItemIndex = nil
        replaceQuantity = 1
        replaceSearch = ""
        pendingReplaceProduct = nil
        customModifierLabel = ""
        customModifierAmount = ""
        customModifierTarget = .wholeAccount
        customModifierItemIndex = nil
        pendingMode = .menu
        adminPin = ""
        adminPinError = false
        adminPinVerifying = false
        vm.guestItemsSelection = []
    }

    private func requestPinFor(_ mode: AdminMode) {
        pendingMode = mode
        adminPin = ""
        adminPinError = false
        goToMode(.pinConfirm)
    }

    private func executeConfirmedAction() {
        switch pendingMode {
        case .guestItems:
            vm.markItemsAsGuest()
            goToMode(.menu)
        case .deleteItems:
            Task { @MainActor in
                await performDeleteAsync()
                goToMode(.menu)
            }
        case .replaceItem:
            if let idx = replaceItemIndex, let product = pendingReplaceProduct {
                vm.changeItemIndex = idx
                vm.confirmChangeItem(newProduct: product, quantityToChange: replaceQuantity)
            }
            resetState()
        case .customModifier:
            let amount = Double(customModifierAmount) ?? 0
            let label = customModifierLabel.trimmingCharacters(in: .whitespaces)
            if !label.isEmpty && amount > 0 {
                if customModifierTarget == .specificProduct, let idx = customModifierItemIndex {
                    vm.applyCustomModifierToItem(at: idx, label: label, amount: amount)
                } else {
                    vm.addStandaloneCharge(label: label, amount: amount)
                }
            }
            resetState()
        default:
            goToMode(.menu)
        }
    }

    private func goToMode(_ mode: AdminMode) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            adminMode = mode
        }
    }

    // MARK: - Menu Section

    @ViewBuilder
    private var menuSection: some View {
        VStack(spacing: 10) {
            AdminPillButton(
                icon: "gift.fill",
                label: "Invitar Productos",
                iconColor: .white,
                action: { goToMode(.guestItems) }
            )

            AdminPillButton(
                icon: "trash.fill",
                label: "Eliminar Items",
                iconColor: .white,
                action: { goToMode(.deleteItems) }
            )

            AdminPillButton(
                icon: "arrow.2.circlepath",
                label: "Reemplazar Item",
                iconColor: .white,
                action: { goToMode(.replaceItem) }
            )

            AdminPillButton(
                icon: "plus.circle.fill",
                label: "Modificador Personalizado",
                iconColor: .white,
                action: { goToMode(.customModifier) }
            )

            Button {
                vm.showAdminMenu = false
            } label: {
                Text("Cerrar")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
    }

    // MARK: - Guest Items Section

    @ViewBuilder
    private var guestItemsSection: some View {
        VStack(spacing: 12) {
            Text("Selecciona los productos que deseas marcar como invitados.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            cartList(
                selectionBinding: { index in
                    Binding(
                        get: { vm.guestItemsSelection.contains(index) },
                        set: { isSelected in
                            if isSelected {
                                if !vm.guestItemsSelection.contains(index) {
                                    vm.guestItemsSelection.append(index)
                                }
                            } else {
                                vm.guestItemsSelection.removeAll { $0 == index }
                            }
                        }
                    )
                },
                showQuantityStepper: false
            )

            actionBar(
                backAction: { goToMode(.menu); vm.guestItemsSelection = [] },
                confirmAction: { requestPinFor(.guestItems) },
                confirmLabel: "Marcar (\(vm.guestItemsSelection.count))",
                confirmColor: .blue,
                isDisabled: vm.guestItemsSelection.isEmpty
            )
        }
    }

    // MARK: - Delete Items Section

    @ViewBuilder
    private var deleteItemsSection: some View {
        VStack(spacing: 12) {
            Text("Selecciona los items y cantidad a eliminar.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            cartList(
                selectionBinding: { index in
                    Binding(
                        get: { deleteSelection[index] != nil },
                        set: { isSelected in
                            if isSelected {
                                deleteSelection[index] = 1
                            } else {
                                deleteSelection.removeValue(forKey: index)
                            }
                        }
                    )
                },
                showQuantityStepper: true,
                quantityBinding: { index in
                    Binding(
                        get: { deleteSelection[index] ?? 1 },
                        set: { deleteSelection[index] = $0 }
                    )
                }
            )

            let hasSentItems = deleteSelection.keys.contains(where: { idx in vm.cart.indices.contains(idx) && vm.cart[idx].sentToKitchen })
            if hasSentItems {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Razón de eliminación")
                        .font(.caption)
                        .foregroundColor(.gray)

                    // Quick reason pills
                    let reasons = ["Error del mesero", "Cambio de cliente", "No disponible", "Producto equivocado"]
                    FlowLayout(spacing: 6) {
                        ForEach(reasons, id: \.self) { reason in
                            Button {
                                deleteReason = reason
                            } label: {
                                Text(reason)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(
                                        Capsule()
                                            .fill(deleteReason == reason ? Color.red : Color.white.opacity(0.08))
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    TextField("Otra razón...", text: $deleteReason)
                        .foregroundColor(.white)
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color(white: 0.06))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.1)))
                        )
                }
            }

            let totalToDelete = deleteSelection.values.reduce(0, +)
            actionBar(
                backAction: { goToMode(.menu); deleteSelection = [:]; deleteReason = "" },
                confirmAction: { requestPinFor(.deleteItems) },
                confirmLabel: "Eliminar (\(totalToDelete))",
                confirmColor: .red,
                isDisabled: deleteSelection.isEmpty
            )
        }
    }

    @MainActor
    private func performDeleteAsync() async {
        let reason = deleteReason.isEmpty ? "Eliminado desde admin" : deleteReason
        let empId = vm.employeeId
        var anyFailed = false

        let sortedIndices = deleteSelection.keys.sorted(by: >)
        print("🗑️ [AdminDelete] Starting delete — \(sortedIndices.count) item(s), reason: \"\(reason)\"")

        for index in sortedIndices {
            guard index < vm.cart.count else {
                print("⚠️ [AdminDelete] index \(index) out of bounds (cart.count=\(vm.cart.count)), skipping")
                continue
            }
            let qtyToRemove = deleteSelection[index] ?? 1
            let item = vm.cart[index]
            print("📦 [AdminDelete] index=\(index) product=\"\(item.productName)\" qty=\(item.quantity) toRemove=\(qtyToRemove) sentToKitchen=\(item.sentToKitchen) itemId=\(item.itemId ?? "nil") orderId=\(item.orderId ?? "nil")")

            if item.sentToKitchen {
                if let itemId = item.itemId, let orderId = item.orderId {
                    do {
                        if qtyToRemove >= item.quantity {
                            print("🔴 [AdminDelete] VOID entire item — PATCH /api/orders/\(orderId)/items/\(itemId)/void")
                            try await APIService.shared.voidItem(
                                orderId: orderId,
                                itemId: itemId,
                                reason: reason,
                                voidedBy: empId
                            )
                            print("✅ [AdminDelete] Void success, removing from local cart")
                            if index < vm.cart.count { vm.cart.remove(at: index) }
                        } else {
                            let newQty = item.quantity - qtyToRemove
                            print("🟡 [AdminDelete] PARTIAL — PATCH /api/order-items/\(itemId) newQty=\(newQty) unitPrice=\(item.unitPrice)")
                            try await APIService.shared.updateOrderItemQuantity(
                                itemId: itemId,
                                quantity: newQty,
                                unitPrice: item.unitPrice
                            )
                            print("✅ [AdminDelete] Partial success, updating local qty to \(newQty)")
                            if index < vm.cart.count { vm.cart[index].quantity = newQty }
                        }
                    } catch {
                        print("❌ [AdminDelete] API error for \"\(item.productName)\": \(error)")
                        vm.showToast("Error al eliminar \"\(item.productName)\": \(error.localizedDescription)", isError: true)
                        anyFailed = true
                    }
                } else {
                    print("⚠️ [AdminDelete] sentToKitchen but no itemId/orderId — removing locally only")
                    if index < vm.cart.count { vm.cart.remove(at: index) }
                }
            } else {
                if qtyToRemove >= item.quantity {
                    print("🔵 [AdminDelete] Local-only item, removing from cart")
                    if index < vm.cart.count { vm.cart.remove(at: index) }
                } else {
                    let newQty = item.quantity - qtyToRemove
                    print("🔵 [AdminDelete] Local-only item, reducing qty \(item.quantity) → \(newQty)")
                    if index < vm.cart.count { vm.cart[index].quantity = newQty }
                }
            }
        }

        vm.applyPromotions()
        deleteSelection = [:]
        deleteReason = ""
        if !anyFailed {
            vm.showToast("Items eliminados")
        }
        print("🗑️ [AdminDelete] Done. anyFailed=\(anyFailed)")
    }

    // MARK: - Replace Item Section

    @ViewBuilder
    private var replaceItemSection: some View {
        VStack(spacing: 12) {
            Text("Selecciona el item a reemplazar:")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            if replaceItemIndex == nil {
                // Step 1: Select item from cart
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(Array(vm.cart.enumerated()), id: \.element.id) { index, item in
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    replaceItemIndex = index
                                    replaceQuantity = min(1, item.quantity)
                                }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "circle")
                                        .font(.title3)
                                        .foregroundColor(.gray)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(item.quantity)x \(item.productName)")
                                            .font(.subheadline.bold())
                                            .foregroundColor(.white)
                                        let _ = print("🔄 [ReplaceUI] step1 item=\"\(item.productName)\" unitPrice=\(item.unitPrice) formatted=\(vm.formatCurrency(item.unitPrice))")
                                        Text(vm.formatCurrency(item.unitPrice))
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                    Spacer()
                                }
                                .padding(10)
                                .background(
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color(white: 0.08))
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.12)))
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 300)
            } else if let idx = replaceItemIndex, idx < vm.cart.count {
                // Step 2: Select replacement product
                let item = vm.cart[idx]

                HStack(spacing: 10) {
                    Image(systemName: "arrow.2.circlepath")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Cambiando:")
                            .font(.caption2)
                            .foregroundColor(Color(white: 0.5))
                        Text(item.productName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                    }
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.orange.opacity(0.08))
                .cornerRadius(8)

                // Quantity stepper
                if item.quantity > 1 {
                    HStack(spacing: 16) {
                        Text("¿Cuántos cambiar?")
                            .font(.subheadline)
                            .foregroundColor(Color(white: 0.7))
                        Spacer()
                        HStack(spacing: 0) {
                            Button {
                                if replaceQuantity > 1 { replaceQuantity -= 1 }
                            } label: {
                                Image(systemName: "minus")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(replaceQuantity > 1 ? .white : Color(white: 0.3))
                                    .frame(width: 32, height: 32)
                                    .background(Circle().fill(Color.white.opacity(0.08)))
                            }
                            .buttonStyle(.plain)

                            Text("\(replaceQuantity) de \(item.quantity)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                                .frame(minWidth: 70)
                                .multilineTextAlignment(.center)

                            Button {
                                if replaceQuantity < item.quantity { replaceQuantity += 1 }
                            } label: {
                                Image(systemName: "plus")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(replaceQuantity < item.quantity ? .white : Color(white: 0.3))
                                    .frame(width: 32, height: 32)
                                    .background(Circle().fill(Color.white.opacity(0.08)))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }

                // Search
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(Color(white: 0.5))
                    TextField("Buscar producto...", text: $replaceSearch)
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.05))
                .cornerRadius(8)

                // Product list
                let filtered = replaceSearch.isEmpty
                    ? vm.products.filter { $0.active }
                    : vm.products.filter { $0.active && $0.name.localizedCaseInsensitiveContains(replaceSearch) }

                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filtered) { product in
                            Button {
                                pendingReplaceProduct = product
                                requestPinFor(.replaceItem)
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(product.name)
                                            .font(.subheadline.weight(.medium))
                                            .foregroundColor(.white)
                                        if let cat = product.category {
                                            Text(cat.name)
                                                .font(.caption2)
                                                .foregroundColor(Color(white: 0.5))
                                        }
                                    }
                                    Spacer()
                                    let _ = print("🔄 [ReplaceUI] step2 product=\"\(product.name)\" numericPrice=\(product.numericPrice) formatted=\(vm.formatCurrency(product.numericPrice))")
                                    Text(vm.formatCurrency(product.numericPrice))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(Color.white.opacity(0.03))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 260)
            }

            HStack(spacing: 12) {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        replaceItemIndex = nil
                        replaceQuantity = 1
                        replaceSearch = ""
                    }
                    goToMode(.menu)
                } label: {
                    Text(replaceItemIndex == nil ? "Volver" : "Cancelar")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            Capsule()
                                .fill(Color.white.opacity(0.08))
                        )
                }
                .buttonStyle(.plain)

                if replaceItemIndex != nil {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            replaceItemIndex = nil
                            replaceQuantity = 1
                            replaceSearch = ""
                        }
                    } label: {
                        Text("Cambiar item")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(
                                Capsule()
                                    .fill(Color.orange.opacity(0.3))
                            )
                    }
                    .disabled(true)
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Custom Modifier Section

    @ViewBuilder
    private var customModifierSection: some View {
        VStack(spacing: 16) {
            Text("Para cobrar algo fuera del menú (ej. un extra especial) o un cargo aparte.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 6) {
                Text("Nombre")
                    .font(.caption)
                    .foregroundColor(.gray)
                TextField("Ej: Doble queso extra", text: $customModifierLabel)
                    .foregroundColor(.white)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(white: 0.08))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.15)))
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Monto extra")
                    .font(.caption)
                    .foregroundColor(.gray)
                HStack {
                    Text("$")
                        .font(.headline)
                        .foregroundColor(.gray)
                    TextField("0.00", text: $customModifierAmount)
                        .foregroundColor(.white)
                        .keyboardType(.decimalPad)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.15)))
                )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Aplicar a")
                    .font(.caption)
                    .foregroundColor(.gray)
                HStack(spacing: 8) {
                    Button {
                        customModifierTarget = .wholeAccount
                        customModifierItemIndex = nil
                    } label: {
                        Text("Cuenta general")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                Capsule().fill(customModifierTarget == .wholeAccount ? Color.blue : Color.white.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)

                    Button {
                        customModifierTarget = .specificProduct
                    } label: {
                        Text("Producto específico")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                Capsule().fill(customModifierTarget == .specificProduct ? Color.blue : Color.white.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            if customModifierTarget == .specificProduct {
                cartList(
                    selectionBinding: { index in
                        Binding(
                            get: { customModifierItemIndex == index },
                            set: { isSelected in
                                customModifierItemIndex = isSelected ? index : nil
                            }
                        )
                    },
                    showQuantityStepper: false
                )
            }

            let amountValid = (Double(customModifierAmount) ?? 0) > 0
            let targetValid = customModifierTarget == .wholeAccount || customModifierItemIndex != nil
            let isDisabled = customModifierLabel.trimmingCharacters(in: .whitespaces).isEmpty
                || !amountValid || !targetValid

            actionBar(
                backAction: { goToMode(.menu) },
                confirmAction: { requestPinFor(.customModifier) },
                confirmLabel: "Agregar Modificador",
                confirmColor: .blue,
                isDisabled: isDisabled
            )
        }
    }

    // MARK: - Shared Components

    @ViewBuilder
    private func cartList(
        selectionBinding: @escaping (Int) -> Binding<Bool>,
        showQuantityStepper: Bool,
        quantityBinding: ((Int) -> Binding<Int>)? = nil
    ) -> some View {
        if vm.cart.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "tray")
                    .font(.largeTitle)
                    .foregroundColor(.gray)
                Text("No hay productos en el carrito")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .padding(.vertical, 24)
        } else {
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(Array(vm.cart.enumerated()), id: \.element.id) { index, item in
                        HStack(spacing: 12) {
                            Button {
                                let binding = selectionBinding(index)
                                binding.wrappedValue.toggle()
                            } label: {
                                let isSelected = selectionBinding(index).wrappedValue
                                Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                                    .font(.title3)
                                    .foregroundColor(isSelected ? .blue : .gray)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text("\(item.quantity)x \(item.productName)")
                                        .font(.subheadline.bold())
                                        .foregroundColor(.white)

                                    if item.isGuest {
                                        Text("Invitado")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.yellow)
                                            .foregroundColor(.black)
                                            .cornerRadius(4)
                                    }
                                }

                                let itemTotal = item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
                                Text(vm.formatCurrency(itemTotal))
                                    .font(.caption)
                                    .foregroundColor(item.isGuest ? .gray : .gray)
                                    .strikethrough(item.isGuest)
                            }

                            Spacer()

                            if showQuantityStepper, let qtyBinding = quantityBinding {
                                let selected = selectionBinding(index).wrappedValue
                                if selected {
                                    HStack(spacing: 10) {
                                        Button {
                                            let qty = qtyBinding(index).wrappedValue
                                            if qty > 1 {
                                                qtyBinding(index).wrappedValue = qty - 1
                                            }
                                        } label: {
                                            Image(systemName: "minus")
                                                .font(.callout.weight(.bold))
                                                .foregroundColor(.white)
                                                .frame(width: 36, height: 36)
                                                .background(Circle().fill(Color.white.opacity(0.12)))
                                        }
                                        .buttonStyle(.plain)

                                        Text("\(qtyBinding(index).wrappedValue)")
                                            .font(.headline)
                                            .foregroundColor(.white)
                                            .frame(minWidth: 28)

                                        Button {
                                            let qty = qtyBinding(index).wrappedValue
                                            if qty < item.quantity {
                                                qtyBinding(index).wrappedValue = qty + 1
                                            }
                                        } label: {
                                            Image(systemName: "plus")
                                                .font(.callout.weight(.bold))
                                                .foregroundColor(.white)
                                                .frame(width: 36, height: 36)
                                                .background(Circle().fill(Color.white.opacity(0.12)))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color(white: 0.08))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.12)))
                        )
                    }
                }
            }
            .frame(maxHeight: 350)
        }
    }

    // MARK: - PIN Section

    @ViewBuilder
    private var pinSection: some View {
        VStack(spacing: 16) {
            let modeLabel: String = {
                switch pendingMode {
                case .guestItems: return "Confirmar invitación"
                case .deleteItems: return "Confirmar eliminación"
                case .replaceItem: return "Confirmar reemplazo"
                case .customModifier: return "Confirmar modificador"
                default: return "PIN de Admin"
                }
            }()

            Text(modeLabel)
                .font(.headline)
                .foregroundColor(.gray)

            if adminPinError {
                Text("PIN incorrecto o sin permisos de admin")
                    .font(.caption)
                    .foregroundColor(.red)
            }

            // Dots – no background box
            HStack(spacing: 24) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < adminPin.count ? Color.white : Color(white: 0.25))
                        .frame(width: 16, height: 16)
                }
            }
            .padding(.vertical, 8)

            // Circular numpad
            VStack(spacing: 12) {
                let rows = [["1","2","3"],["4","5","6"],["7","8","9"],["C","0","←"]]
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 16) {
                        ForEach(row, id: \.self) { key in
                            Button {
                                if key == "C" { adminPin = "" }
                                else if key == "←" { if !adminPin.isEmpty { adminPin.removeLast() } }
                                else { if adminPin.count < 4 { adminPin.append(key) } }
                            } label: {
                                Text(key)
                                    .font(.title2.weight(.medium))
                                    .foregroundStyle(.white)
                                    .frame(width: 70, height: 70)
                                    .background(Circle().fill(Color.white.opacity(0.1)))
                                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Button {
                adminPinError = false
                adminPinVerifying = true
                Task {
                    do {
                        let emp = try await APIService.shared.verifyPin(pin: adminPin)
                        if emp.role == "admin" || emp.role == "manager" {
                            adminPinVerifying = false
                            adminPin = ""
                            executeConfirmedAction()
                        } else {
                            adminPinVerifying = false
                            adminPin = ""
                            withAnimation { adminPinError = true }
                        }
                    } catch {
                        adminPinVerifying = false
                        adminPin = ""
                        withAnimation { adminPinError = true }
                    }
                }
            } label: {
                HStack {
                    if adminPinVerifying {
                        ProgressView().tint(.white)
                    }
                    Text(adminPinVerifying ? "Verificando..." : "Confirmar")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    Capsule()
                        .fill(adminPin.count == 4 ? Color.blue : Color.gray.opacity(0.3))
                )
                .foregroundStyle(.white)
            }
            .disabled(adminPin.count != 4 || adminPinVerifying)
            .buttonStyle(.plain)

            Button {
                goToMode(pendingMode)
                adminPin = ""
                adminPinError = false
            } label: {
                Text("Cancelar")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .buttonStyle(.plain)
        }
    }

    private func actionBar(
        backAction: @escaping () -> Void,
        confirmAction: @escaping () -> Void,
        confirmLabel: String,
        confirmColor: Color,
        isDisabled: Bool
    ) -> some View {
        HStack(spacing: 12) {
            Button(action: backAction) {
                Text("Volver")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)

            Button(action: confirmAction) {
                Text(confirmLabel)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        Capsule()
                            .fill(isDisabled ? confirmColor.opacity(0.3) : confirmColor)
                    )
            }
            .disabled(isDisabled)
            .buttonStyle(.plain)
        }
    }
}

private struct AdminPillButton: View {
    let icon: String
    let label: String
    let iconColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(iconColor)
                    .frame(width: 28)
                Text(label)
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.07))
                    .overlay(
                        Capsule()
                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Guest Items Dialog

struct GuestItemsDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Invitar Productos")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text("Selecciona los productos que deseas marcar como invitados. Aparecerán con precio $0.")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            if vm.cart.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.largeTitle)
                        .foregroundColor(.gray)
                    Text("No hay productos en el carrito")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(Array(vm.cart.enumerated()), id: \.element.id) { index, item in
                            HStack(spacing: 12) {
                                Button {
                                    if vm.guestItemsSelection.contains(index) {
                                        vm.guestItemsSelection.removeAll { $0 == index }
                                    } else {
                                        vm.guestItemsSelection.append(index)
                                    }
                                } label: {
                                    Image(systemName: vm.guestItemsSelection.contains(index) ? "checkmark.square.fill" : "square")
                                        .font(.title3)
                                        .foregroundColor(vm.guestItemsSelection.contains(index) ? .blue : .gray)
                                }
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text("\(item.quantity)x \(item.productName)")
                                            .font(.subheadline.bold())
                                            .foregroundColor(.white)
                                        
                                        if item.isGuest {
                                            Text("Invitado")
                                                .font(.caption2.bold())
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(Color.yellow)
                                                .foregroundColor(.black)
                                                .cornerRadius(4)
                                        }
                                    }
                                    
                                    let itemTotal = item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
                                    if item.isGuest {
                                        Text(vm.formatCurrency(itemTotal))
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                            .strikethrough()
                                    } else {
                                        Text(vm.formatCurrency(itemTotal))
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                }
                                
                                Spacer()
                                
                                if item.isGuest {
                                    Button {
                                        vm.unmarkItemAsGuest(at: index)
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: "xmark")
                                                .font(.caption2)
                                            Text("Desinvitar")
                                                .font(.caption)
                                        }
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(Color.red.opacity(0.2))
                                        .foregroundColor(.red)
                                        .cornerRadius(6)
                                    }
                                }
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color(white: 0.08))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.12)))
                            )
                        }
                    }
                }
                .frame(maxHeight: 350)
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showGuestItemsDialog = false
                    vm.guestItemsSelection = []
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button {
                    vm.markItemsAsGuest()
                } label: {
                    HStack {
                        Image(systemName: "gift.fill")
                        Text("Marcar como Invitado (\(vm.guestItemsSelection.count))")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(vm.guestItemsSelection.isEmpty ? Color.gray.opacity(0.3) : Color.blue))
                }
                .disabled(vm.guestItemsSelection.isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 520)
        .modifier(DialogBackground())
    }
}

// MARK: - Loyalty Email Dialog

struct LoyaltyEmailDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Buscar por Correo")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Correo electrónico")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                TextField("cliente@email.com", text: $vm.loyaltyEmailInput)
                    .foregroundColor(.white)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .padding(12)
                    .modifier(NotesTextFieldBackground())
                    .onSubmit { vm.searchLoyaltyByEmail() }
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showLoyaltyEmailDialog = false
                    vm.loyaltyEmailInput = ""
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button {
                    vm.searchLoyaltyByEmail()
                } label: {
                    HStack {
                        if vm.loadingCard { ProgressView().tint(.white) }
                        Text(vm.loadingCard ? "Buscando..." : "Buscar")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(vm.loyaltyEmailInput.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray.opacity(0.3) : Color.blue))
                }
                .disabled(vm.loadingCard || vm.loyaltyEmailInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .modifier(DialogBackground())
    }
}

// MARK: - Loyalty Reward Dialog

struct LoyaltyRewardDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 6) {
                Text("🎉 Premio Disponible")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                Text("¿Cómo quieres canjear el premio?")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            
            // Option 1: Producto gratis
            Button {
                vm.loyaltyRewardMode = "product"
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "gift.fill")
                        .font(.title2)
                        .foregroundColor(.yellow)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Producto gratis")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("Elige un producto del carrito")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(.gray)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.yellow.opacity(0.3), lineWidth: 1))
                )
            }
            
            // Option 2: Descuento porcentual
            Button {
                vm.loyaltyRewardMode = "discount"
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "percent")
                        .font(.title2)
                        .foregroundColor(.green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Descuento porcentual")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("Ingresa el % a aplicar")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(.gray)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.green.opacity(0.3), lineWidth: 1))
                )
            }
            
            Button("Cancelar") {
                vm.showLoyaltyRewardDialog = false
                vm.loyaltyRewardMode = ""
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Capsule().fill(Color.white.opacity(0.08)))
        }
        .padding(24)
        .frame(maxWidth: 400)
        .modifier(DialogBackground())
    }
}

// MARK: - Loyalty Reward Product Picker

struct LoyaltyRewardProductPicker: View {
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Elige el producto gratis")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            let eligible = vm.cart.enumerated().filter { !$0.element.isGuest }
            
            if eligible.isEmpty {
                Text("No hay productos disponibles")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(eligible, id: \.offset) { index, item in
                            Button {
                                vm.redeemLoyaltyRewardProduct(at: index)
                                vm.showLoyaltyRewardDialog = false
                                vm.loyaltyRewardMode = ""
                            } label: {
                                HStack(spacing: 12) {
                                    Text("\(item.quantity)x")
                                        .font(.subheadline)
                                        .foregroundColor(.gray)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.productName)
                                            .font(.subheadline.bold())
                                            .foregroundColor(.white)
                                        Text(vm.formatCurrency(item.unitPrice * Double(item.quantity)))
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                    Spacer()
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.yellow)
                                }
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color(white: 0.08))
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.yellow.opacity(0.3), lineWidth: 1))
                                )
                            }
                        }
                    }
                }
                .frame(maxHeight: 350)
            }
            
            Button("Cancelar") {
                vm.loyaltyRewardMode = ""
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Capsule().fill(Color.white.opacity(0.08)))
        }
        .padding(24)
        .frame(maxWidth: 480)
        .modifier(DialogBackground())
    }
}

// MARK: - Loyalty Reward Discount Input

struct LoyaltyRewardDiscountDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Descuento porcentual")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("Porcentaje de descuento")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                
                HStack(spacing: 8) {
                    TextField("0", text: $vm.loyaltyRewardDiscountPct)
                        .keyboardType(.numberPad)
                        .foregroundColor(.white)
                        .padding(12)
                        .modifier(NotesTextFieldBackground())
                    
                    Text("%")
                        .font(.title2.bold())
                        .foregroundColor(.green)
                }
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.loyaltyRewardMode = ""
                    vm.loyaltyRewardDiscountPct = ""
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                
                Button {
                    vm.redeemLoyaltyRewardDiscount()
                } label: {
                    HStack {
                        Image(systemName: "percent")
                        Text("Aplicar")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.green))
                }
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .modifier(DialogBackground())
    }
}
