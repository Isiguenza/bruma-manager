import SwiftUI
import AVFoundation

// MARK: - Main View

struct LoyaltyView: View {
    @StateObject private var vm = LoyaltyViewModel()
    @State private var selectedTab: SearchTab = .scan
    @FocusState private var emailFocused: Bool

    enum SearchTab: String, CaseIterable {
        case scan = "Escanear"
        case manual = "Manual"
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            if selectedTab == .scan {
                cameraView
            } else {
                manualView
            }

            pickerBar
        }
        .sheet(isPresented: $vm.showCardSheet, onDismiss: { vm.resetScan() }) {
            LoyaltyCardSheet(vm: vm)
                .presentationDetents([.height(440)])
                .presentationDragIndicator(.visible)
        }
        .onChange(of: selectedTab) { _, _ in
            vm.resetScan()
            emailFocused = false
        }
    }

    // MARK: - Picker Bar

    private var pickerBar: some View {
        VStack(spacing: 0) {
            Picker("Modo", selection: $selectedTab) {
                ForEach(SearchTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(.ultraThinMaterial)
    }

    // MARK: - Escanear Tab

    private var cameraView: some View {
        ZStack {
            QRScannerView { code in
                Task { await vm.searchByBarcode(code) }
            }
            .ignoresSafeArea()

            ScanOverlay(isSearching: vm.isSearching, errorMessage: vm.errorMessage)
        }
    }

    // MARK: - Manual Tab

    private var manualView: some View {
        VStack(spacing: 16) {
            Color.clear.frame(height: 60)

            // Email input
            HStack(spacing: 10) {
                Image(systemName: "envelope")
                    .font(.subheadline)
                    .foregroundColor(.gray)

                TextField("Buscar por correo", text: $vm.emailInput)
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .focused($emailFocused)
                    .onSubmit { Task { await vm.searchByEmail() } }

                if vm.isSearching {
                    ProgressView().tint(.gray).scaleEffect(0.8)
                } else if !vm.emailInput.isEmpty {
                    Button(action: { Task { await vm.searchByEmail() } }) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.title3)
                            .foregroundColor(Color(red: 1.0, green: 0.58, blue: 0.0))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.ultraThinMaterial)
            .cornerRadius(14)
            .padding(.horizontal, 20)

            if let error = vm.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red.opacity(0.85))
            }

            if let card = vm.card {
                cardTile(card: card)
                    .padding(.horizontal, 20)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.05, green: 0.05, blue: 0.05).ignoresSafeArea())
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: vm.card != nil)
    }

    // MARK: - Card Tile

    private func cardTile(card: LoyaltyCard) -> some View {
        Button(action: { vm.showCardSheet = true }) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(card.fullName)
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)
                        if let email = card.customerEmail {
                            Text(email)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.gray)
                }

                let total = max(card.stampsPerReward, 1)
                let filled = min(card.stamps, total)
                let cols = min(total, 10)

                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: cols),
                    spacing: 6
                ) {
                    ForEach(0..<total, id: \.self) { i in
                        Circle()
                            .fill(i < filled
                                  ? Color(red: 1.0, green: 0.58, blue: 0.0)
                                  : Color.white.opacity(0.1))
                            .overlay(Circle().stroke(Color.white.opacity(i < filled ? 0 : 0.18), lineWidth: 1))
                            .aspectRatio(1, contentMode: .fit)
                    }
                }

                HStack {
                    Text("\(card.stamps) de \(card.stampsPerReward) sellos")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Spacer()
                    if card.rewardsAvailable > 0 {
                        Label("\(card.rewardsAvailable) premio\(card.rewardsAvailable > 1 ? "s" : "")", systemImage: "gift.fill")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.purple)
                    }
                }

                Text("Toca para agregar sello")
                    .font(.caption.weight(.medium))
                    .foregroundColor(Color(red: 1.0, green: 0.58, blue: 0.0))
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(16)
            .background(.ultraThinMaterial)
            .cornerRadius(16)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Scan Overlay

private struct ScanOverlay: View {
    let isSearching: Bool
    let errorMessage: String?

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
                    path.addRoundedRect(
                        in: CGRect(x: fx, y: fy, width: frameSize, height: frameSize),
                        cornerSize: CGSize(width: 14, height: 14)
                    )
                    ctx.fill(path, with: .color(.black.opacity(0.58)), style: FillStyle(eoFill: true))
                }
                .ignoresSafeArea()

                Canvas { ctx, size in
                    let len: CGFloat = 22
                    let lw: CGFloat = 3
                    let style = StrokeStyle(lineWidth: lw, lineCap: .round)
                    let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
                        (fx, fy, 1, 1),
                        (fx + frameSize, fy, -1, 1),
                        (fx, fy + frameSize, 1, -1),
                        (fx + frameSize, fy + frameSize, -1, -1),
                    ]
                    for (x, y, hd, vd) in corners {
                        var h = Path()
                        h.move(to: CGPoint(x: x, y: y))
                        h.addLine(to: CGPoint(x: x + hd * len, y: y))
                        var v = Path()
                        v.move(to: CGPoint(x: x, y: y))
                        v.addLine(to: CGPoint(x: x, y: y + vd * len))
                        ctx.stroke(h, with: .color(.white), style: style)
                        ctx.stroke(v, with: .color(.white), style: style)
                    }
                }
                .ignoresSafeArea()

                VStack(spacing: 6) {
                    if isSearching {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 16))
                            .foregroundColor(.white.opacity(0.6))
                    }
                    Text(isSearching ? "Buscando..." : "Apunta al código QR")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                }
                .position(x: cx, y: fy + frameSize + 36)

                if let err = errorMessage {
                    Text(err)
                        .font(.caption.weight(.medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Color.red.opacity(0.75))
                        .cornerRadius(8)
                        .position(x: cx, y: fy - 30)
                        .transition(.opacity.combined(with: .scale))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: errorMessage)
        }
    }
}

// MARK: - Camera QR Scanner

struct QRScannerView: UIViewRepresentable {
    let onCodeDetected: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCodeDetected: onCodeDetected) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .black

        let session = AVCaptureSession()
        context.coordinator.session = session

        guard
            let device = AVCaptureDevice.default(for: .video),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else { return view }

        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return view }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
        output.metadataObjectTypes = [.qr, .code128, .ean13, .ean8, .pdf417, .aztec]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = UIScreen.main.bounds
        view.layer.addSublayer(preview)
        context.coordinator.previewLayer = preview

        DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.previewLayer?.frame = uiView.bounds
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
            guard
                let obj = objects.first as? AVMetadataMachineReadableCodeObject,
                let value = obj.stringValue,
                value != lastDetected
            else { return }
            lastDetected = value
            onCodeDetected(value)
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                self?.lastDetected = nil
            }
        }
    }
}

// MARK: - Card Bottom Sheet

struct LoyaltyCardSheet: View {
    @ObservedObject var vm: LoyaltyViewModel

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 4) {
                Text(vm.card?.fullName ?? "")
                    .font(.title3.weight(.bold))
                if let email = vm.card?.customerEmail {
                    Text(email)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 20)

            Divider()

            if let card = vm.card {
                stampGrid(card: card)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 20)
            }

            if let card = vm.card, card.rewardsAvailable > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "gift.fill")
                    Text(card.rewardsAvailable == 1
                         ? "1 premio disponible"
                         : "\(card.rewardsAvailable) premios disponibles")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundColor(.purple)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(Color.purple.opacity(0.15))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.purple.opacity(0.3), lineWidth: 1))
                .cornerRadius(10)
                .padding(.horizontal, 24)
                .padding(.bottom, 14)
            }

            addStampButton
                .padding(.horizontal, 24)
                .padding(.bottom, 32)

            if let err = vm.errorMessage {
                Text(err)
                    .font(.caption)
                    .foregroundColor(.red.opacity(0.85))
                    .padding(.bottom, 8)
            }
        }
    }

    private func stampGrid(card: LoyaltyCard) -> some View {
        let total = max(card.stampsPerReward, 1)
        let filled = min(card.stamps, total)
        let cols = min(total, 8)

        return VStack(spacing: 10) {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: cols),
                spacing: 8
            ) {
                ForEach(0..<total, id: \.self) { i in
                    Circle()
                        .fill(i < filled
                              ? Color(red: 1.0, green: 0.58, blue: 0.0)
                              : Color.primary.opacity(0.08))
                        .overlay(
                            Circle().stroke(
                                i < filled ? Color.clear : Color.primary.opacity(0.18),
                                lineWidth: 1
                            )
                        )
                        .overlay(
                            Group {
                                if i < filled {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(.black.opacity(0.6))
                                }
                            }
                        )
                        .aspectRatio(1, contentMode: .fit)
                        .scaleEffect(i == filled - 1 && vm.stampAddedSuccess ? 1.25 : 1.0)
                        .animation(.spring(response: 0.35, dampingFraction: 0.6), value: vm.stampAddedSuccess)
                }
            }

            Text("\(card.stamps) de \(card.stampsPerReward) sellos")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var addStampButton: some View {
        Button(action: { Task { await vm.addStamp() } }) {
            HStack(spacing: 10) {
                if vm.isAddingStamp {
                    ProgressView().tint(.white)
                } else if vm.stampAddedSuccess {
                    Image(systemName: "checkmark.circle.fill").font(.title3)
                    Text("Sello agregado").font(.headline.weight(.semibold))
                } else {
                    Image(systemName: "plus.circle.fill").font(.title3)
                    Text("Agregar Sello").font(.headline.weight(.semibold))
                }
            }
            .foregroundColor(vm.stampAddedSuccess ? .green : .white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(
                vm.stampAddedSuccess
                    ? Color.green.opacity(0.15)
                    : Color(red: 1.0, green: 0.58, blue: 0.0)
            )
            .cornerRadius(14)
        }
        .buttonStyle(.plain)
        .disabled(vm.isAddingStamp || vm.stampAddedSuccess)
        .animation(.easeInOut(duration: 0.2), value: vm.stampAddedSuccess)
    }
}
