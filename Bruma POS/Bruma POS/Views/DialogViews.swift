import SwiftUI

// MARK: - Guest Count Dialog

struct GuestCountDialog: View {
    @ObservedObject var vm: POSViewModel
    let isInitial: Bool
    
    var body: some View {
        VStack(spacing: 20) {
            Text(isInitial ? "¿Cuántas personas?" : "Número de Personas")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            // Counter
            HStack(spacing: 24) {
                Button {
                    vm.tempGuestCount = max(1, vm.tempGuestCount - 1)
                } label: {
                    Image(systemName: "minus")
                        .font(.title2.bold())
                        .frame(width: 64, height: 64)
                        .background(Color(white: 0.12))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.25)))
                }
                
                Text("\(vm.tempGuestCount)")
                    .font(.system(size: 64, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 100)
                
                Button {
                    vm.tempGuestCount += 1
                } label: {
                    Image(systemName: "plus")
                        .font(.title2.bold())
                        .frame(width: 64, height: 64)
                        .background(Color(white: 0.12))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.25)))
                }
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
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(vm.tempGuestCount == n ? Color.blue : Color(white: 0.12))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }
                }
            }
            
            HStack(spacing: 12) {
                if !isInitial {
                    Button("Cancelar") {
                        vm.showGuestCountDialog = false
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Color(white: 0.12))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                
                Button("Confirmar") {
                    if isInitial {
                        vm.confirmInitialGuestCount()
                    } else {
                        vm.confirmGuestCount()
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                .font(.headline)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
    }
}

// MARK: - Variant Dialog

struct VariantDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text(vm.selectedProductForVariant?.name ?? "")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text("Selecciona una opción:")
                .font(.subheadline)
                .foregroundColor(.gray)
            
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
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color(white: 0.12))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.25)))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            
            Button("Cancelar") {
                vm.showVariantDialog = false
            }
            .foregroundColor(.gray)
        }
        .padding(24)
        .frame(maxWidth: 400)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
    }
}

// MARK: - Notes Dialog

struct NotesDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 20) {
            // Header
            Text(vm.pendingCartItem?.productName ?? "")
                .font(.title2.bold())
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Comentarios especiales (opcional)")
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Text("Instrucciones, preferencias o alergias")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
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
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(white: 0.06))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(white: 0.15), lineWidth: 1)
                    )
            )
            
            // Botones
            HStack(spacing: 12) {
                Button {
                    vm.handleCancelNotes()
                } label: {
                    Text("Cancelar")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(white: 0.12))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                
                Button {
                    vm.handleConfirmNotes()
                } label: {
                    Text(vm.tempNotes.trimmingCharacters(in: .whitespaces).isEmpty ? "Agregar" : "Confirmar")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
        }
        .padding(28)
        .frame(maxWidth: 480)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.08))
                .shadow(color: .black.opacity(0.5), radius: 24, y: 8)
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
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(white: 0.06))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.2)))
                    )
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showVoidDialog = false
                    vm.voidItemIndex = nil
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button("Eliminar Item") {
                    vm.handleVoidItem()
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(vm.voidReason.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray.opacity(0.3) : Color.red)
                .foregroundColor(.white)
                .cornerRadius(10)
                .font(.headline)
                .disabled(vm.voidReason.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 440)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
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
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color(white: 0.06))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                        )
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
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(white: 0.06))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                    )
                    .onSubmit { vm.handleConfirmCustomerName() }
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.showCustomerNameDialog = false
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button("Continuar") {
                    vm.handleConfirmCustomerName()
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                .font(.headline)
            }
        }
        .padding(24)
        .frame(maxWidth: 440)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
    }
}

// MARK: - QR / Loyalty Dialog

struct LoyaltyDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Tarjeta de Lealtad")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 48))
                .foregroundColor(.blue)
            
            Text("Ingresa el código de barras")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            TextField("Código de barras", text: $vm.qrCode)
                .foregroundColor(.white)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(white: 0.06))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                )
                .onSubmit { vm.handleQRCodeDetected(vm.qrCode) }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.qrDialogOpen = false
                    vm.qrCode = ""
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button {
                    vm.handleQRCodeDetected(vm.qrCode)
                } label: {
                    HStack {
                        if vm.loadingCard { ProgressView().tint(.white) }
                        Text(vm.loadingCard ? "Buscando..." : "Buscar")
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(vm.qrCode.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray.opacity(0.3) : Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .font(.headline)
                }
                .disabled(vm.loadingCard || vm.qrCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
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
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(white: 0.06))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                    )
                    .onSubmit { vm.handleManualStampSubmit() }
                
                Text("Para clientes que ya pagaron pero olvidaron escanear su tarjeta")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            HStack(spacing: 12) {
                Button("Cancelar") {
                    vm.manualStampDialogOpen = false
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button {
                    vm.handleManualStampSubmit()
                } label: {
                    HStack {
                        if vm.loadingCard { ProgressView().tint(.white) }
                        Text(vm.loadingCard ? "Procesando..." : "Agregar Sello")
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .font(.headline)
                }
                .disabled(vm.loadingCard)
            }
        }
        .padding(24)
        .frame(maxWidth: 400)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
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
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color(white: 0.06))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                        )
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
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button("Aplicar Descuento") {
                    vm.showFlexibleDiscountDialog = false
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                .font(.headline)
            }
        }
        .padding(24)
        .frame(maxWidth: 420)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
    }
}

// MARK: - Admin Menu Dialog

struct AdminMenuDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Menú Admin")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Button {
                vm.showAdminMenu = false
                vm.showGuestItemsDialog = true
            } label: {
                HStack {
                    Image(systemName: "gift.fill")
                        .font(.title3)
                    Text("Invitar Productos / Cuenta Invitado")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            
            Button("Cerrar") {
                vm.showAdminMenu = false
            }
            .foregroundColor(.gray)
        }
        .padding(24)
        .frame(maxWidth: 400)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
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
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Color(white: 0.12))
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Button {
                    vm.markItemsAsGuest()
                } label: {
                    HStack {
                        Image(systemName: "gift.fill")
                        Text("Marcar como Invitado (\(vm.guestItemsSelection.count))")
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(vm.guestItemsSelection.isEmpty ? Color.gray.opacity(0.3) : Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .font(.headline)
                }
                .disabled(vm.guestItemsSelection.isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: 520)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.1))
                .shadow(color: .black.opacity(0.5), radius: 20)
        )
    }
}
