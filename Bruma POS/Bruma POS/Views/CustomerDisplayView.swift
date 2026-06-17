import SwiftUI

struct CustomerDisplayView: View {
    @ObservedObject var posVM: POSViewModel
    @StateObject private var vm = CustomerDisplayViewModel()
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            switch vm.mode {
            case .idle:
                IdleCarouselView(vm: vm)
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
            
            // Exit button (top-right, subtle)
            VStack {
                HStack {
                    Spacer()
                    Button {
                        posVM.config.customerDisplayEnabled = false
                        posVM.config.save()
                        posVM.currentScreen = .dashboard
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white.opacity(0.25))
                            .padding(12)
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.top, 12)
            .padding(.trailing, 12)
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .onAppear {
            // Discover carousel images from Assets
            vm.carouselImageNames = CustomerDisplayView.discoverCarouselImages()
        }
    }
    
    static func discoverCarouselImages() -> [String] {
        // Add image names here as you add them to Assets
        // Naming convention: "promo_1", "promo_2", etc.
        let candidates = (1...20).map { "promo_\($0)" }
        return candidates.filter { UIImage(named: $0) != nil }
    }
}

// MARK: - Idle Carousel

struct IdleCarouselView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if vm.carouselImageNames.isEmpty {
                // Fallback branding screen when no promo images exist yet
                VStack(spacing: 32) {
                    Spacer()
                    
                    Image(systemName: "fork.knife.circle.fill")
                        .font(.system(size: 96))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(white: 0.9), Color(white: 0.5)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    
                    VStack(spacing: 12) {
                        Text("BRUMA")
                            .font(.system(size: 72, weight: .black, design: .default))
                            .tracking(24)
                            .foregroundColor(.white)
                        
                        Text("COCINA & BEBIDAS")
                            .font(.system(size: 18, weight: .light))
                            .tracking(8)
                            .foregroundColor(Color(white: 0.5))
                    }
                    
                    Spacer()
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
                            .transition(.opacity)
                    }
                    
                    // Gradient overlay for legibility
                    LinearGradient(
                        colors: [Color.black.opacity(0.6), Color.clear, Color.black.opacity(0.4)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .ignoresSafeArea()
                    
                    // Dot indicators
                    VStack {
                        Spacer()
                        HStack(spacing: 8) {
                            ForEach(vm.carouselImageNames.indices, id: \.self) { idx in
                                Circle()
                                    .fill(idx == vm.carouselIndex ? Color.white : Color.white.opacity(0.35))
                                    .frame(width: idx == vm.carouselIndex ? 10 : 7,
                                           height: idx == vm.carouselIndex ? 10 : 7)
                                    .animation(.spring(response: 0.3), value: vm.carouselIndex)
                            }
                        }
                        .padding(.bottom, 40)
                    }
                }
            }
        }
        .animation(.easeInOut(duration: 0.8), value: vm.carouselIndex)
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
                VStack(alignment: .leading, spacing: 6) {
                    if !vm.customerName.isEmpty {
                        Text(vm.customerName.uppercased())
                            .font(.system(size: 28, weight: .black))
                            .tracking(4)
                            .foregroundColor(.white)
                    }
                    if !vm.orderNumber.isEmpty {
                        Text("ORDEN #\(vm.orderNumber.uppercased())")
                            .font(.system(size: 14, weight: .medium))
                            .tracking(2)
                            .foregroundColor(Color(white: 0.45))
                    }
                }
                .padding(.horizontal, 40)
                .padding(.top, 48)
                .padding(.bottom, 28)
                
                Divider().background(Color.white.opacity(0.08))
                
                // Item list
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.items) { item in
                            ItemRow(item: item, vm: vm)
                            Divider()
                                .background(Color.white.opacity(0.06))
                                .padding(.leading, 40)
                        }
                    }
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .background(Color(white: 0.06))
            
            // Right panel - totals
            VStack(alignment: .trailing, spacing: 0) {
                Spacer()
                
                VStack(alignment: .trailing, spacing: 20) {
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
                    
                    VStack(alignment: .trailing, spacing: 8) {
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
                Text("BRUMA")
                    .font(.system(size: 14, weight: .black))
                    .tracking(8)
                    .foregroundColor(Color(white: 0.2))
                    .padding(.bottom, 32)
                    .padding(.trailing, 40)
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
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        ))
    }
}

// MARK: - Payment Ready

struct PaymentReadyView: View {
    @ObservedObject var vm: CustomerDisplayViewModel
    @State private var pulseScale: CGFloat = 1.0
    @State private var iconOpacity: Double = 1.0
    
    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.38, blue: 0.22).ignoresSafeArea()
            
            VStack(spacing: 40) {
                Spacer()
                
                // Contactless icon with pulse
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 180, height: 180)
                        .scaleEffect(pulseScale)
                        .opacity(2.0 - pulseScale)
                    
                    Circle()
                        .fill(Color.white.opacity(0.12))
                        .frame(width: 140, height: 140)
                    
                    Image(systemName: "wave.3.forward")
                        .font(.system(size: 64, weight: .thin))
                        .foregroundColor(.white)
                        .opacity(iconOpacity)
                }
                .onAppear {
                    withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                        pulseScale = 1.35
                    }
                    withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                        iconOpacity = 0.6
                    }
                }
                
                VStack(spacing: 16) {
                    Text(vm.formattedPrice(vm.total))
                        .font(.system(size: 80, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("Listo para pagar")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                    
                    Text("Tarjeta · Efectivo · Transferencia")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(.white.opacity(0.45))
                        .padding(.top, 4)
                }
                
                Spacer()
                
                Text("BRUMA")
                    .font(.system(size: 14, weight: .black))
                    .tracking(10)
                    .foregroundColor(.white.opacity(0.25))
                    .padding(.bottom, 40)
            }
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

// MARK: - Safe subscript helper

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
