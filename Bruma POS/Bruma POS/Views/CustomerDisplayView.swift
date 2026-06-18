import SwiftUI
import QRCode

struct CustomerDisplayView: View {
    @ObservedObject var posVM: POSViewModel
    @StateObject private var vm = CustomerDisplayViewModel()
    @State private var showSettings = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            switch vm.mode {
            case .idle:
                IdleCarouselView(vm: vm, onSettingsTrigger: { showSettings = true })
                    .transition(.opacity)
            case .active:
                ActiveOrderView(vm: vm)
                    .transition(.opacity)
            case .payment:
                PaymentReadyView(vm: vm)
                    .transition(.opacity)
            case .thankYou:
                ThankYouView()
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .onAppear {
            vm.setCarouselImages(CustomerDisplayView.discoverCarouselImages())
        }
        .sheet(isPresented: $showSettings) {
            CustomerDisplaySettingsView(posVM: posVM)
        }
    }
    
    static func discoverCarouselImages() -> [(imageName: String, dishName: String)] {
        return [
            ("aguachile_bruma",       "Aguachile Bruma"),
            ("aguachile_verde",       "Aguachile Verde"),
            ("caldo",                 "Caldo de Camarón"),
            ("camarones_asiaticos",   "Camarones Asiáticos"),
            ("camarones_hawaii",      "Camarones Hawaii"),
            ("camarones_mojo",        "Camarones al Mojo"),
            ("coco",                  "Camarones al Coco"),
            ("coctel_camaron",        "Cóctel de Camarón"),
            ("empanada_camaron",      "Empanada de Camarón"),
            ("empanada_pulpo",        "Empanada de Pulpo"),
            ("ensenada",              "Taco Ensenada"),
            ("pescaditos",            "Pescaditos Fritos"),
            ("quesadillas",           "Quesadillas de Camarón"),
            ("tacos_camaron",         "Tacos de Camarón"),
            ("tostada_camaron",       "Tostada de Camarón"),
            ("tostada_pulpo",         "Tostada de Pulpo")
        ]
    }
}

// MARK: - Idle Carousel

struct IdleCarouselView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    var onSettingsTrigger: () -> Void = {}
    
    @State private var isHolding = false
    @State private var holdProgress: Double = 0
    @State private var holdTimer: Timer? = nil
    private let holdDuration: Double = 5.0
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if vm.carouselImageNames.isEmpty {
                // Fallback branding screen when no promo images exist yet
                VStack(spacing: 32) {
                    Spacer()
                    
                    Image("LogoBruma")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 300)
                    
                    Spacer()
                }
            } else {
                // Promo image carousel
                ZStack {
                    if let name = vm.carouselImageNames[safe: vm.carouselIndex],
                       let img = UIImage(named: name) {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .ignoresSafeArea()
                            .id(vm.carouselIndex)
                            .transition(.asymmetric(
                                insertion: .move(edge: vm.slideDirection),
                                removal: .move(edge: vm.slideDirection == .trailing ? .leading : .trailing)
                            ))
                    }
                    
                    // Dish name — top-left
                    
                    
                    // Gradient overlay
                    LinearGradient(
                        colors: [Color.black.opacity(0.6), Color.clear, Color.black.opacity(0.45)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .ignoresSafeArea()
                    
                    
                    
                    
                    // Controls row: dots pill + play/pause
                    VStack {
                        if let dishName = vm.carouselDishNames[safe: vm.carouselIndex] {
                            VStack(){
                                Text(dishName)
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(.white)
                                    
                                    .padding(.horizontal, 24)
                                    .padding(.vertical)
                                    .glassEffect(.clear)
                                    .padding(.vertical, 24)
                                    .id(vm.carouselIndex)
                                    .transition(.blurReplace)
                                
                                
                            }
                           
                            
                        }
                        
                        Spacer()
                        
                        if isHolding {
                            VStack {
                                Spacer()
                                Circle()
                                    .trim(from: 0, to: holdProgress)
                                    .stroke(Color.white.opacity(0.45), lineWidth: 3)
                                    .rotationEffect(.degrees(-90))
                                    .frame(width: 36, height: 36)
                                    .animation(.linear(duration: 0.05), value: holdProgress)
                                    .padding(.bottom, 48)
                            }
                        }
                        
                        
                        Spacer()
                        
                        GlassEffectContainer{
                            
                            HStack(spacing: 12) {
                                // Progress dots pill
                                HStack(spacing: 9) {
                                    ForEach(vm.carouselImageNames.indices, id: \.self) { idx in
                                        if idx == vm.carouselIndex {
                                            // Active: progress bar
                                            ZStack(alignment: .leading) {
                                                Capsule()
                                                    .fill(Color.white.opacity(0.3))
                                                    .frame(width: 28, height: 8)
                                                Capsule()
                                                    .fill(Color.white)
                                                    .frame(width: max(8, 28 * vm.carouselProgress), height: 8)
                                            }
                                            .animation(.linear(duration: 0.05), value: vm.carouselProgress)
                                        } else {
                                            Circle()
                                                .fill(Color.white.opacity(0.4))
                                                .frame(width: 7, height: 7)
                                        }
                                    }
                                }
                                .padding(.horizontal, 18)
                                .frame(height: 46)
                                .glassEffect(.clear, in: Capsule())
                                
                                // Play / pause
                                Button { vm.togglePlayPause() } label: {
                                    Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 17, weight: .semibold))
                                        .foregroundColor(.white)
                                        .frame(width: 46, height: 46)
                                        .glassEffect(.clear.interactive(), in: Circle())
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.bottom, 40)
                        }
                    }
                }
                .gesture(
                    DragGesture(minimumDistance: 40, coordinateSpace: .local)
                        .onEnded { value in
                            if value.translation.width < -40 {
                                vm.goNext()
                            } else if value.translation.width > 40 {
                                vm.goPrev()
                            }
                        }
                )
                .simultaneousGesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in
                            guard !isHolding else { return }
                            startHold()
                        }
                        .onEnded { _ in cancelHold() }
                )
            }
            
            // Subtle hold progress indicator
           
        }
    }
    
    private func startHold() {
        isHolding = true
        holdProgress = 0
        let start = Date()
        holdTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { timer in
            let elapsed = Date().timeIntervalSince(start)
            let p = min(elapsed / holdDuration, 1.0)
            DispatchQueue.main.async {
                holdProgress = p
                if p >= 1.0 {
                    timer.invalidate()
                    holdTimer = nil
                    isHolding = false
                    holdProgress = 0
                    onSettingsTrigger()
                }
            }
        }
        RunLoop.main.add(holdTimer!, forMode: .common)
    }
    
    private func cancelHold() {
        holdTimer?.invalidate()
        holdTimer = nil
        withAnimation(.easeOut(duration: 0.2)) {
            isHolding = false
            holdProgress = 0
        }
    }
}

// MARK: - Active Order

struct ActiveOrderView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    
    var body: some View {
        HStack(spacing: 0) {
            // Left panel - item list
            VStack(alignment: .leading, spacing: 0) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    if !vm.customerName.isEmpty {
                        Text(vm.customerName.uppercased())
                            .font(.system(size: 28, weight: .black))
                            .tracking(4)
                            .foregroundColor(.white)
                    }
                    if !vm.orderNumber.isEmpty {
                        Text("#\(vm.orderNumber.uppercased()) - \(vm.orderType)")
                            .font(.system(size: 13, weight: .medium))
                            .tracking(1)
                            .foregroundColor(Color(white: 0.45))
                    } else if !vm.orderType.isEmpty {
                        Text(vm.orderType)
                            .font(.system(size: 13, weight: .medium))
                            .tracking(1)
                            .foregroundColor(Color(white: 0.45))
                    }
                }
                .padding(.horizontal, 40)
                .padding(.top, 48)
                .padding(.bottom, 28)
                
                // Item list
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.items) { item in
                            ItemRow(item: item, vm: vm)
                        }
                    }
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .background(Color(white: 0.06))
            
            // Right panel - totals
            VStack(alignment: .leading, spacing: 0) {
                Spacer()
                
                VStack(alignment: .leading, spacing: 20) {
                    if vm.subtotal != vm.total {
                        VStack(alignment: .trailing, spacing: 8) {
                            Text("Subtotal")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(Color(white: 0.45))
                            Text(vm.formattedPrice(vm.subtotal))
                                .font(.system(size: 36, weight: .semibold, design: .rounded))
                                .foregroundColor(Color(white: 0.65))
                        }
                        
                        Divider()
                            .frame(width: 180)
                            .background(Color.white.opacity(0.12))
                    }
                    
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Total")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(Color(white: 0.45))
                        Text(vm.formattedPrice(vm.total))
                            .font(.system(size: 64, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                    }
                    
                    Text("\(vm.items.reduce(0) { $0 + $1.qty }) artículo\(vm.items.reduce(0) { $0 + $1.qty } == 1 ? "" : "s")")
                        .font(.system(size: 15))
                        .foregroundColor(Color(white: 0.35))
                }
                .padding(.horizontal, 40)
                
                Spacer()
                
                // Branding
               Image("BRUMA")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 100)
                    .opacity(0.5)
                    .padding(.bottom, 32)
                    .padding(.leading, 40)
            }
            .frame(width: 300)
            .background(Color(white: 0.03))
        }
    }
}

struct ItemRow: View {
    let item: CustomerDisplayItem
    @ObservedObject var vm: CustomerDisplayViewModel
    
    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            // Quantity badge
            Text("×\(item.qty)")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(Color(white: 0.55))
                .frame(width: 44)
                .padding(.leading, 40)
            
            // Name + modifiers
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
                
                if !item.modifiers.isEmpty {
                    Text(item.modifiers)
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.4))
                }
            }
            
            Spacer()
            
            // Price
            Text(vm.formattedPrice(item.total))
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundColor(Color(white: 0.7))
                .padding(.trailing, 40)
        }
        .padding(.vertical, 18)
        .transition(.asymmetric(
            insertion: .scale(scale: 0.92).combined(with: .opacity),
            removal: .opacity
        ))
    }
}

// MARK: - Payment Ready (dispatcher)

struct PaymentReadyView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    
    var body: some View {
        Group {
            if vm.paymentMethod == "transfer" {
                TransferPaymentView(vm: vm)
            } else if vm.paymentMethod.contains("terminal") || vm.paymentMethod.contains("card") {
                CardPaymentView(vm: vm)
            } else {
                CashPaymentView(vm: vm)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: vm.paymentMethod)
    }
}

// MARK: - Cash Payment

struct CashPaymentView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    
    var body: some View {
        ZStack {
            Color(hex: "004B48").ignoresSafeArea()
            
            VStack(spacing: 24) {
                Spacer()
                
                Image("cash_wavy")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 100)
                
                VStack(spacing: 10) {
                    Text(vm.formattedPrice(vm.total))
                        .font(.system(size: 88, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("Pago en efectivo")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(.white.opacity(0.65))
                }
                
                Spacer()
                
                Image("BRUMA")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 150)
                    .padding(.bottom, 36)
            }
        }
    }
}

// MARK: - Card Payment

struct CardPaymentView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    @State private var pulseScale: CGFloat = 1.0
    @State private var iconOpacity: Double = 1.0
    
    var body: some View {
        ZStack {
            Color(hex: "004B48").ignoresSafeArea()
            
            VStack(spacing: 0) {
                Spacer()
                
                
                
                // Contactless icon
                Image("contact")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 150)
                .padding(.bottom, 36)
                
                // Instruction
                Text("Inserte o acerque en la terminal")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white.opacity(0.75))
                    .padding(.bottom, 40)
                
                // Total
                Text(vm.formattedPrice(vm.total))
                    .font(.system(size: 80, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                
                // Tip breakdown
                if vm.tipAmount > 0 {
                    HStack(spacing: 4) {
                        Text(vm.formattedPrice(vm.subtotal))
                            .foregroundColor(.white.opacity(0.55))
                        Text("+")
                            .foregroundColor(.white.opacity(0.35))
                        if vm.showCustomTip {
                            Text("\(vm.formattedPrice(vm.tipAmount)) de propina")
                                .foregroundColor(.white.opacity(0.55))
                        } else {
                            Text("\(vm.tipPercentage)% de propina (\(vm.formattedPrice(vm.tipAmount)))")
                                .foregroundColor(.white.opacity(0.55))
                        }
                    }
                    .font(.system(size: 16, weight: .regular))
                    .padding(.top, 10)
                }
                
                Spacer()
                
                Image("BRUMA")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 150)
                    .padding(.bottom, 36)
            }
            .padding(.horizontal, 40)
        }
    }
}

// MARK: - Transfer Payment

struct TransferPaymentView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    @State private var qrImage: UIImage?
    
    var body: some View {
        HStack(spacing: 0) {
            // Left: bank info
            VStack(alignment: .leading, spacing: 0) {
                Spacer()
                
                VStack(alignment: .leading, spacing: 32) {
                    Image(systemName: "building.columns.fill")
                        .font(.system(size: 44))
                        .foregroundColor(.white.opacity(0.5))
                    
                    VStack(alignment: .leading, spacing: 24) {
                        BankInfoRow(label: "Banco", value: vm.bankBank.isEmpty ? "—" : vm.bankBank)
                        BankInfoRow(label: "Nombre", value: vm.bankName.isEmpty ? "—" : vm.bankName)
                        BankInfoRow(label: "CLABE", value: vm.bankCLABE.isEmpty ? "—" : vm.bankCLABE)
                    }
                    
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Total a transferir")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white.opacity(0.45))
                        Text(vm.formattedPrice(vm.total))
                            .font(.system(size: 52, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                    }
                }
                
                Spacer()
                
                Image("BRUMA")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 150)
                    .padding(.bottom, 36)
            }
            .padding(.horizontal, 56)
            .frame(maxWidth: .infinity)
            .background(Color(white: 0.05))
            
            // Right: QR code
            VStack {
                Spacer()
                if let qr = qrImage, !vm.bankCLABE.isEmpty {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 260, height: 260)
                        .padding(24)
                        .background(Color.white)
                        .cornerRadius(20)
                    
                    Text("Escanear para copiar CLABE")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.35))
                        .padding(.top, 16)
                } else {
                    Image(systemName: "qrcode")
                        .font(.system(size: 80))
                        .foregroundColor(.white.opacity(0.1))
                }
                Spacer()
            }
            .frame(width: 380)
            .background(Color(white: 0.03))
        }
        .onAppear {
            qrImage = generateQRCode(from: vm.bankCLABE)
        }
        .onChange(of: vm.bankCLABE) { newValue in
            qrImage = generateQRCode(from: newValue)
        }
    }
    
    private func generateQRCode(from string: String) -> UIImage? {
        guard !string.isEmpty else { return nil }
        do {
            let doc = try QRCode.Document(utf8String: string, errorCorrection: .high)
           
            doc.design.shape.onPixels = QRCode.PixelShape.Circle()
            doc.design.shape.eye = QRCode.EyeShape.Squircle()
            doc.design.shape.pupil = QRCode.PupilShape.Squircle()
            doc.design.style.onPixels = QRCode.FillStyle.Solid(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
            doc.design.style.eye = QRCode.FillStyle.Solid(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
            doc.design.style.pupil = QRCode.FillStyle.Solid(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
            let cgImage = try doc.cgImage(dimension: 1024)
            return UIImage(cgImage: cgImage, scale: 1.0, orientation: .up)
        } catch {
            print("QR generation error: \(error)")
            return nil
        }
    }
}

struct BankInfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(2)
                .foregroundColor(.white.opacity(0.3))
            Text(value)
                .font(.system(size: 22, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Thank You

struct ThankYouView: View {
    @State private var appear = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 28) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 88))
                    .foregroundColor(Color(red: 0.05, green: 0.78, blue: 0.40))
                    .scaleEffect(appear ? 1 : 0.4)
                    .opacity(appear ? 1 : 0)
                
                VStack(spacing: 12) {
                    Text("¡Gracias por tu compra!")
                        .font(.system(size: 40, weight: .black))
                        .foregroundColor(.white)
                        .opacity(appear ? 1 : 0)
                        .offset(y: appear ? 0 : 20)
                    
                    Text("Vuelve pronto")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(Color(white: 0.45))
                        .opacity(appear ? 1 : 0)
                        .offset(y: appear ? 0 : 10)
                }
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) {
                appear = true
            }
        }
    }
}

// MARK: - Customer Display Settings

struct CustomerDisplaySettingsView: View {
    @ObservedObject var posVM: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var bankCLABE: String = ""
    @State private var bankName: String = ""
    @State private var bankBank: String = ""
    @State private var displayEnabled: Bool = true
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Pantalla del cliente activa", isOn: $displayEnabled)
                        .onChange(of: displayEnabled) { _, enabled in
                            if !enabled {
                                var newConfig = POSConfig.load()
                                newConfig.customerDisplayEnabled = false
                                newConfig.save()
                                posVM.config = POSConfig.load()
                                dismiss()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                    posVM.currentScreen = .dashboard
                                }
                            }
                        }
                }
                
                Section(header: Text("Información bancaria (transferencias)")) {
                    HStack {
                        Text("Banco")
                            .foregroundColor(.secondary)
                            .frame(width: 80, alignment: .leading)
                        TextField("BBVA, Banamex…", text: $bankBank)
                    }
                    HStack {
                        Text("Nombre")
                            .foregroundColor(.secondary)
                            .frame(width: 80, alignment: .leading)
                        TextField("Nombre del titular", text: $bankName)
                    }
                    HStack {
                        Text("CLABE")
                            .foregroundColor(.secondary)
                            .frame(width: 80, alignment: .leading)
                        TextField("18 dígitos", text: $bankCLABE)
                            .keyboardType(.numberPad)
                    }
                }
            }
            .navigationTitle("Configuración")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        var newConfig = POSConfig.load()
                        newConfig.bankCLABE = bankCLABE
                        newConfig.bankName = bankName
                        newConfig.bankBank = bankBank
                        newConfig.save()
                        posVM.config = POSConfig.load()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            let fresh = POSConfig.load()
            bankCLABE = fresh.bankCLABE
            bankName  = fresh.bankName
            bankBank  = fresh.bankBank
            displayEnabled = fresh.customerDisplayEnabled
        }
    }
}

// MARK: - Safe subscript helper

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

#Preview("Idle") {
    let vm = CustomerDisplayViewModel()
    vm.setCarouselImages(CustomerDisplayView.discoverCarouselImages())
    return IdleCarouselView(vm: vm)
        .preferredColorScheme(.dark)
}

#Preview("Active") {
    let vm = CustomerDisplayViewModel()
    vm.mode = .active
    vm.customerName = "Juan Perez"
    vm.orderNumber = "A3B7"
    vm.orderType = "Para llevar"
    vm.total = 780
    vm.subtotal = 780
    vm.items = [
        CustomerDisplayItem(name: "Tacos de Camarón", qty: 2, unitPrice: 180, total: 360, modifiers: "Frijoles · Salsa verde"),
        CustomerDisplayItem(name: "Aguachile", qty: 1, unitPrice: 220, total: 220, modifiers: ""),
        CustomerDisplayItem(name: "Coco", qty: 2, unitPrice: 100, total: 200, modifiers: ""),
    ]
    return ActiveOrderView(vm: vm)
        .preferredColorScheme(.dark)
}

#Preview("Payment - Cash") {
    let vm = CustomerDisplayViewModel()
    vm.mode = .payment
    vm.paymentMethod = "cash"
    vm.total = 780
    return PaymentReadyView(vm: vm)
        .preferredColorScheme(.dark)
}

#Preview("Payment - Card") {
    let vm = CustomerDisplayViewModel()
    vm.mode = .payment
    vm.paymentMethod = "terminal_mercadopago"
    vm.subtotal = 280
    vm.total = 300
    vm.tipAmount = 20
    vm.tipPercentage = 0
    vm.showCustomTip = true
    return PaymentReadyView(vm: vm)
        .preferredColorScheme(.dark)
}

#Preview("Payment - Transfer") {
    let vm = CustomerDisplayViewModel()
    vm.mode = .payment
    vm.paymentMethod = "transfer"
    vm.total = 780
    vm.bankCLABE = "012345678901234567"
    vm.bankName = "Espantapajaros SA"
    vm.bankBank = "BBVA"
    return PaymentReadyView(vm: vm)
        .preferredColorScheme(.dark)
}

#Preview("Thank You") {
    ThankYouView()
        .preferredColorScheme(.dark)
}
