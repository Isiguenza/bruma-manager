import SwiftUI

// MARK: - Guest Count Dialog

/// Mismo fondo plano y sólido que las hojas del panel de pago
/// (`BottomSheetCard`) — sin material glass — para que todos los modales
/// del POS compartan el mismo color.
private struct DialogBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color(white: 0.09))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .shadow(color: .black.opacity(0.5), radius: 20)
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

// MARK: - Admin Menu Dialog

/// Solo elige QUÉ hacer. Cada opción cierra el modal y pone el carrito en modo
/// admin (Views/CartAdminMode.swift): los platillos se eligen en el carrito
/// real, el reemplazo usa el menú de productos con su flujo, y el PIN se pide
/// al final.
struct AdminMenuDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 20) {
            Text("Menú Admin")
                .font(.title2.bold())
                .foregroundColor(.white)

            VStack(spacing: 10) {
                AdminPillButton(
                    icon: "gift.fill",
                    label: "Invitar Productos",
                    iconColor: .white,
                    action: { vm.beginCartAdmin(.guest) }
                )

                AdminPillButton(
                    icon: "trash.fill",
                    label: "Eliminar Items",
                    iconColor: .white,
                    action: { vm.beginCartAdmin(.delete) }
                )

                AdminPillButton(
                    icon: "arrow.2.circlepath",
                    label: "Reemplazar Item",
                    iconColor: .white,
                    action: { vm.beginCartAdmin(.replace) }
                )

                AdminPillButton(
                    icon: "plus.circle.fill",
                    label: "Modificador Personalizado",
                    iconColor: .white,
                    action: { vm.beginCartAdmin(.customModifier) }
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
                            vm.showAdminMenu = false
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

// MARK: - Loyalty Stamps Dialog

/// Se abre desde el botón condensado "Acumular Sellos Lealtad" del sheet de
/// confirmar cobro cuando ya hay una tarjeta leída — progreso, stepper de
/// sellos a agregar y acceso al premio si hay uno disponible.
struct LoyaltyStampsDialog: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        VStack(spacing: 20) {
            if let card = vm.loyaltyCard {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(card.displayName)
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)
                        Text("\(card.stamps)/\(card.stampsPerReward) sellos")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Button {
                        vm.loyaltyCard = nil
                        vm.loyaltyStampsToAdd = 1
                        vm.showLoyaltyStampsDialog = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundColor(.gray)
                    }
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Color.white.opacity(0.08))
                            .frame(height: 10)
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Color.yellow)
                            .frame(width: geo.size.width * CGFloat(card.stamps) / CGFloat(card.stampsPerReward), height: 10)
                    }
                }
                .frame(height: 10)

                HStack(spacing: 16) {
                    Text("Sellos a agregar")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Button {
                        vm.loyaltyStampsToAdd = max(1, vm.loyaltyStampsToAdd - 1)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                    }
                    Text("\(vm.loyaltyStampsToAdd)")
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 32)
                    Button {
                        vm.loyaltyStampsToAdd += 1
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                    }
                }

                if card.rewardsAvailable > 0 {
                    Button {
                        vm.showLoyaltyStampsDialog = false
                        vm.showLoyaltyRewardDialog = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "gift.fill")
                                .foregroundColor(.yellow)
                            Text("Premio disponible: Canjear")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        .foregroundColor(.white)
                        .padding(12)
                        .background(
                            Capsule()
                                .fill(Color.yellow.opacity(0.12))
                                .overlay(Capsule().stroke(Color.yellow.opacity(0.3), lineWidth: 1))
                        )
                    }
                }

                HStack(spacing: 12) {
                    Button("Cerrar") {
                        vm.showLoyaltyStampsDialog = false
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.white.opacity(0.08)))

                    Button {
                        vm.addLoyaltyStamps()
                        vm.showLoyaltyStampsDialog = false
                    } label: {
                        Text("Agregar Sellos")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(Capsule().fill(Color.blue))
                    }
                }
            }
        }
        .padding(24)
        .frame(maxWidth: 420)
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
