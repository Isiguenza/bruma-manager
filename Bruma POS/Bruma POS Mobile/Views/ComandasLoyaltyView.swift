import SwiftUI
import AVFoundation

/// Tab "Lealtad" — misma interacción que la app de Waitress (escanear QR /
/// búsqueda manual / hoja de sellos), pero reapuntada a los métodos reales
/// de lealtad que ya existen en `POSViewModel`/`APIService` (compartidos,
/// no una reimplementación), y con mejoras explícitas sobre la versión de
/// Waitress: hoja inferior `BottomSheetCard` compartida (en vez de un sheet
/// aparte), animación real al agregar un sello (no solo un refresco del
/// número), y haptics en escaneo exitoso / sello agregado.
///
/// Nota: la búsqueda manual de POS solo soporta correo (`searchLoyaltyByEmail`)
/// o código de barras (`handleManualStampSubmit`, que agrega 1 sello directo
/// sin paso de revisión) — no un campo único "correo o teléfono" como tenía
/// Waitress, porque esa combinación no existe en el backend real. Se adapta
/// la pestaña "Manual" a lo que el backend sí soporta.
struct ComandasLoyaltyView: View {
    @ObservedObject var vm: POSViewModel
    @State private var selectedTab: SearchTab = .scan
    @State private var showCardSheet = false

    enum SearchTab: String, CaseIterable {
        case scan = "Escanear"
        case manual = "Manual"
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Modo", selection: $selectedTab) {
                ForEach(SearchTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            if selectedTab == .scan {
                cameraView
            } else {
                manualView
            }
        }
        .comandasBottomSheet(isPresented: showCardSheet, onDismiss: { showCardSheet = false }) {
            BottomSheetCard(onDismiss: { showCardSheet = false }) {
                ComandasLoyaltyCardSheet(vm: vm)
            }
        }
        .onChange(of: vm.loyaltyCard?.id) { _, newValue in
            if newValue != nil {
                Haptics.success()
                showCardSheet = true
            }
        }
        .onChange(of: selectedTab) { _, _ in
            vm.loyaltyEmailInput = ""
            vm.manualBarcodeInput = ""
        }
    }

    // MARK: - Escanear

    private var cameraView: some View {
        ZStack {
            ComandasQRScannerView { code in
                vm.handleQRCodeDetected(code)
            }
            .ignoresSafeArea()

            ComandasScanOverlay(isSearching: vm.loadingCard)
        }
    }

    // MARK: - Manual

    private var manualView: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "envelope").font(.subheadline).foregroundColor(.gray)
                TextField("Correo del cliente", text: $vm.loyaltyEmailInput)
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .onSubmit { vm.searchLoyaltyByEmail() }

                if vm.loadingCard {
                    ProgressView().tint(.gray).scaleEffect(0.8)
                } else if !vm.loyaltyEmailInput.isEmpty {
                    Button { vm.loyaltyEmailInput = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .modifier(FlatCard(cornerRadius: 14))
            .padding(.horizontal, 20)

            Button {
                Haptics.tap()
                vm.searchLoyaltyByEmail()
            } label: {
                Text("Buscar").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).frame(height: 46)
            }
            .buttonStyle(.flatCapsule(.blue))
            .padding(.horizontal, 20)
            .disabled(vm.loyaltyEmailInput.trimmingCharacters(in: .whitespaces).isEmpty)

            Divider().background(Color.white.opacity(0.1)).padding(.horizontal, 20).padding(.vertical, 4)

            VStack(alignment: .leading, spacing: 8) {
                Text("O escanea el código de barras de la tarjeta")
                    .font(.caption)
                    .foregroundColor(.gray)
                HStack(spacing: 10) {
                    Image(systemName: "barcode").font(.subheadline).foregroundColor(.gray)
                    TextField("Código de barras", text: $vm.manualBarcodeInput)
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .modifier(FlatCard(cornerRadius: 14))

                Button {
                    Haptics.tap()
                    vm.handleManualStampSubmit()
                } label: {
                    Text("Agregar 1 sello").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).frame(height: 46)
                }
                .buttonStyle(.flatCapsule(.orange))
                .disabled(vm.manualBarcodeInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .padding(.top, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Card sheet

private struct ComandasLoyaltyCardSheet: View {
    @ObservedObject var vm: POSViewModel
    @State private var justAdded = false

    var body: some View {
        VStack(spacing: 20) {
            if let card = vm.loyaltyCard {
                VStack(spacing: 4) {
                    Text(card.displayName).font(.title3.weight(.bold)).foregroundColor(.white)
                    if let email = card.customerEmail {
                        Text(email).font(.caption).foregroundColor(.gray)
                    }
                }

                stampGrid(card: card)

                if card.rewardsAvailable > 0 {
                    HStack(spacing: 8) {
                        Image(systemName: "gift.fill")
                        Text(card.rewardsAvailable == 1 ? "1 premio disponible" : "\(card.rewardsAvailable) premios disponibles")
                            .font(.subheadline.weight(.semibold))
                    }
                    .foregroundColor(.purple)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .modifier(FlatCardTinted(color: .purple, cornerRadius: 10))
                }

                addStampButton(card: card)
            }
        }
    }

    private func stampGrid(card: LoyaltyCard) -> some View {
        let total = max(card.stampsPerReward, 1)
        let filled = min(card.stamps, total)
        let cols = min(total, 8)

        return VStack(spacing: 10) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: cols), spacing: 8) {
                ForEach(0..<total, id: \.self) { i in
                    Circle()
                        .fill(i < filled ? Color.orange : Color.white.opacity(0.08))
                        .overlay(Circle().stroke(i < filled ? Color.clear : Color.white.opacity(0.18), lineWidth: 1))
                        .overlay {
                            if i < filled {
                                Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundColor(.black.opacity(0.6))
                            }
                        }
                        .aspectRatio(1, contentMode: .fit)
                        // Sello recién agregado: pulso real, no solo el
                        // número cambiando — mejora explícita sobre Waitress.
                        .scaleEffect(i == filled - 1 && justAdded ? 1.3 : 1.0)
                        .animation(.spring(response: 0.35, dampingFraction: 0.55), value: justAdded)
                }
            }
            Text("\(card.stamps) de \(card.stampsPerReward) sellos")
                .font(.caption)
                .foregroundColor(.gray)
                .contentTransition(.numericText())
        }
        .padding(.horizontal, 12)
    }

    private func addStampButton(card: LoyaltyCard) -> some View {
        Button {
            Haptics.tap()
            vm.loyaltyStampsToAdd = 1
            vm.addLoyaltyStamps()
            withAnimation { justAdded = true }
            Haptics.success()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                withAnimation { justAdded = false }
            }
        } label: {
            HStack(spacing: 8) {
                if vm.loadingCard {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "plus.circle.fill").font(.title3)
                    Text("Agregar Sello").font(.headline.weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .buttonStyle(.flatCapsule(.orange))
        .disabled(vm.loadingCard)
    }
}

// MARK: - Scan overlay (mismo marco/esquinas que Waitress)

private struct ComandasScanOverlay: View {
    let isSearching: Bool
    private let frameSize: CGFloat = 230

    var body: some View {
        GeometryReader { geo in
            let cx = geo.size.width / 2
            let cy = geo.size.height / 2 - 60
            let fx = cx - frameSize / 2
            let fy = cy - frameSize / 2

            ZStack {
                Canvas { ctx, size in
                    var path = Path()
                    path.addRect(CGRect(origin: .zero, size: size))
                    path.addRoundedRect(in: CGRect(x: fx, y: fy, width: frameSize, height: frameSize), cornerSize: CGSize(width: 14, height: 14))
                    ctx.fill(path, with: .color(.black.opacity(0.58)), style: FillStyle(eoFill: true))
                }
                .ignoresSafeArea()

                Canvas { ctx, size in
                    let len: CGFloat = 22
                    let style = StrokeStyle(lineWidth: 3, lineCap: .round)
                    let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
                        (fx, fy, 1, 1), (fx + frameSize, fy, -1, 1),
                        (fx, fy + frameSize, 1, -1), (fx + frameSize, fy + frameSize, -1, -1),
                    ]
                    for (x, y, hd, vd) in corners {
                        var h = Path(); h.move(to: CGPoint(x: x, y: y)); h.addLine(to: CGPoint(x: x + hd * len, y: y))
                        var v = Path(); v.move(to: CGPoint(x: x, y: y)); v.addLine(to: CGPoint(x: x, y: y + vd * len))
                        ctx.stroke(h, with: .color(.white), style: style)
                        ctx.stroke(v, with: .color(.white), style: style)
                    }
                }
                .ignoresSafeArea()

                VStack(spacing: 6) {
                    if isSearching {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "qrcode.viewfinder").font(.system(size: 16)).foregroundColor(.white.opacity(0.6))
                    }
                    Text(isSearching ? "Buscando..." : "Apunta al código QR")
                        .font(.caption).foregroundColor(.white.opacity(0.6))
                }
                .position(x: cx, y: fy + frameSize + 36)
            }
        }
    }
}

// MARK: - Camera QR scanner

private struct ComandasQRScannerView: UIViewRepresentable {
    let onCodeDetected: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCodeDetected: onCodeDetected) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .black

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setupSession(in: view, coordinator: context.coordinator)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                guard granted else { return }
                DispatchQueue.main.async { self.setupSession(in: view, coordinator: context.coordinator) }
            }
        default:
            break
        }
        return view
    }

    private func setupSession(in view: UIView, coordinator: Coordinator) {
        let session = AVCaptureSession()
        coordinator.session = session

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(coordinator, queue: .main)
        output.metadataObjectTypes = [.qr, .code128, .ean13, .ean8, .pdf417, .aztec]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        coordinator.previewLayer = preview

        DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async { context.coordinator.previewLayer?.frame = uiView.bounds }
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var session: AVCaptureSession?
        var previewLayer: AVCaptureVideoPreviewLayer?
        let onCodeDetected: (String) -> Void
        private var lastDetected: String?

        init(onCodeDetected: @escaping (String) -> Void) {
            self.onCodeDetected = onCodeDetected
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard let obj = objects.first as? AVMetadataMachineReadableCodeObject,
                  let value = obj.stringValue, value != lastDetected else { return }
            lastDetected = value
            onCodeDetected(value)
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.lastDetected = nil }
        }
    }
}
