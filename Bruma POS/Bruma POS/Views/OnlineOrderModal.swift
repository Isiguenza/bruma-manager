import SwiftUI
import MapKit

/// Pantalla verde tipo Uber para pedidos en línea (web + Stripe). Suena en loop
/// (ver POSViewModel.startOnlineOrderSound) mientras está visible. Dos fases:
/// (1) "¡Nuevo pedido! · Toca para revisar", (2) detalle + Aceptar/Rechazar.
struct OnlineOrderModal: View {
    @ObservedObject var vm: POSViewModel
    let order: Order

    @State private var reviewing = false
    @State private var showRejectDialog = false
    @State private var rejectReason = ""
    @State private var pulse = false
    @State private var reviewTimeout: Task<Void, Never>?

    // Tiempo de preparación editable. Arranca en la sugerencia del server
    // (carga de cocina); si el POS lo cambia, ese valor es el que se manda
    // al aceptar y el que ve el cliente (en vez de un cálculo genérico).
    @State private var readyMinutes = 35
    @State private var suggestedMinutes = 35
    @State private var isEditingTime = false

    private let brumaGreen = Color(red: 0.09, green: 0.53, blue: 0.30)
    private let brumaGreenDark = Color(red: 0.04, green: 0.34, blue: 0.18)

    private var isDelivery: Bool { order.deliveryType == "delivery" }

    private var coordinate: CLLocationCoordinate2D? {
        guard let latS = order.deliveryLat, let lngS = order.deliveryLng,
              let lat = Double(latS), let lng = Double(lngS) else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var body: some View {
        ZStack {
            if reviewing {
                Color.black.ignoresSafeArea()
                detailPhase
            } else {
                LinearGradient(colors: [brumaGreen, brumaGreenDark], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                newOrderPhase
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: reviewing)
        .onDisappear { cancelTimeout() }
        .alert("Rechazar pedido", isPresented: $showRejectDialog) {
            TextField("Motivo (opcional)", text: $rejectReason)
            Button("Cancelar", role: .cancel) {}
            Button("Rechazar y reembolsar", role: .destructive) {
                vm.rejectOnlineOrder(reason: rejectReason)
                rejectReason = ""
            }
        } message: {
            Text("Se reembolsará el pago al cliente automáticamente.")
        }
    }

    // MARK: - Fase 1: "Nuevo pedido"

    private var newOrderPhase: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            Image(systemName: isDelivery ? "bicycle" : "bag.fill")
                .font(.system(size: 56, weight: .semibold))
                .foregroundColor(.white.opacity(0.95))
                .scaleEffect(pulse ? 1.06 : 1.0)
                .padding(.bottom, 20)

            Text("¡Nuevo pedido!")
                .font(.system(size: 64, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.6)

            Text(isDelivery ? "Envío a domicilio" : "Para recoger")
                .font(.title2.weight(.semibold))
                .foregroundColor(.white.opacity(0.85))
                .padding(.top, 4)

            Spacer()

            HStack(spacing: 10) {
                Text("Toca para revisar")
                    .font(.title3.weight(.bold))
                Image(systemName: "arrow.right")
                    .font(.title3.weight(.bold))
            }
            .foregroundColor(brumaGreen)
            .padding(.horizontal, 28)
            .padding(.vertical, 16)
            .background(Color.white)
            .clipShape(Capsule())
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture { startReviewing() }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
    }

    // Al revisar: para el sonido y arranca un timeout de 2 min. Si no se acepta
    // ni rechaza, vuelve a la pantalla verde y suena de nuevo.
    private func startReviewing() {
        reviewing = true
        vm.stopOnlineOrderSound()
        reviewTimeout?.cancel()
        reviewTimeout = Task {
            try? await Task.sleep(nanoseconds: 120_000_000_000) // 2 minutos
            if Task.isCancelled { return }
            await MainActor.run {
                reviewing = false
                vm.startOnlineOrderSound()
            }
        }
    }

    private func cancelTimeout() {
        reviewTimeout?.cancel()
        reviewTimeout = nil
    }

    // MARK: - Fase 2: detalle negro minimalista + acciones apiladas

    private var itemCount: Int { (order.items ?? []).reduce(0) { $0 + $1.quantity } }

    private var computedSubtotal: Double {
        (order.items ?? []).reduce(0) { $0 + $1.numericSubtotal }
    }

    private var detailPhase: some View {
        HStack(spacing: 0) {
            // ── Panel izquierdo: cliente + items + subtotal + (mapa/dirección abajo) ──
            VStack(alignment: .leading, spacing: 0) {
                detailHeader

                Divider().background(Color.white.opacity(0.08)).padding(.horizontal, 40)

                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        ForEach(Array((order.items ?? []).enumerated()), id: \.offset) { index, item in
                            itemRow(item)
                            if index < (order.items?.count ?? 1) - 1 {
                                Divider().background(Color.white.opacity(0.06))
                            }
                        }
                    }
                    .padding(.horizontal, 40)
                    .padding(.top, 8)
                }

                Divider().background(Color.white.opacity(0.08)).padding(.horizontal, 40)

                HStack {
                    Text("Subtotal")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(white: 0.45))
                    Spacer()
                    Text(formatMoney(order.subtotal ?? String(computedSubtotal)))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 40)
                .padding(.top, 14)

                // Mapa + dirección al final del panel (no hasta arriba).
                if isDelivery {
                    deliveryCard
                        .padding(.horizontal, 40)
                        .padding(.top, 14)
                        .padding(.bottom, 24)
                } else {
                    Spacer().frame(height: 24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color(white: 0.06))

            // ── Panel derecho: tiempo de entrega + total + acciones ──
            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                readyTimeCard
                    .padding(.horizontal, 24)

                Spacer().frame(height: 20)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Total")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(Color(white: 0.45))
                    Text(formatMoney(order.total))
                        .font(.system(size: 54, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("\(itemCount) artículo\(itemCount == 1 ? "" : "s")")
                        .font(.system(size: 15))
                        .foregroundColor(Color(white: 0.35))
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 24)

                VStack(spacing: 12) {
                    Button {
                        cancelTimeout()
                        vm.acceptOnlineOrder(estimatedReadyMinutes: readyMinutes)
                    } label: {
                        Text("Aceptar")
                            .font(.headline.bold())
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(brumaGreen)
                            .clipShape(Capsule())
                    }
                    Button {
                        cancelTimeout()
                        showRejectDialog = true
                    } label: {
                        Text("Rechazar")
                            .font(.headline.bold())
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .overlay(Capsule().stroke(Color.red.opacity(0.6), lineWidth: 1.5))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
            }
            .frame(width: 320)
            .frame(maxHeight: .infinity)
            .background(Color(white: 0.03))
        }
        .ignoresSafeArea()
        .task(id: reviewing) {
            guard reviewing else { return }
            if let mins = try? await APIService.shared.fetchOnlineOrderEtaSuggestion(deliveryType: order.deliveryType ?? "pickup") {
                await MainActor.run {
                    suggestedMinutes = mins
                    readyMinutes = mins
                }
            }
        }
    }

    // MARK: - UI helpers

    private var detailHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text((order.customerName ?? "Cliente").uppercased())
                    .font(.system(size: 27, weight: .black))
                    .tracking(2)
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("· #\(order.orderNumber)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Color(white: 0.4))
            }
            HStack(spacing: 6) {
                Image(systemName: isDelivery ? "bicycle" : "bag.fill")
                Text(isDelivery ? "Envío a domicilio" : "Para recoger")
                Text("· \(itemCount) artículo\(itemCount == 1 ? "" : "s")")
                if let phone = order.customerPhone {
                    Text("· \(phone)")
                }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(white: 0.5))
            .lineLimit(1)
        }
        .padding(.horizontal, 40)
        .padding(.top, 40)
        .padding(.bottom, 18)
    }

    private func itemRow(_ item: OrderItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 16) {
                Text("×\(item.quantity)")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(Color(white: 0.55))
                    .frame(width: 36, alignment: .leading)
                Text(item.productName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text(formatMoney(item.unitPrice))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Color(white: 0.45))
            }
            if let notes = item.notes, !notes.isEmpty {
                Text("\u{201c}\(notes)\u{201d}")
                    .font(.system(size: 13))
                    .foregroundColor(brumaGreen)
                    .padding(.leading, 52)
            }
        }
        .padding(.vertical, 12)
    }

    private var deliveryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let addr = order.deliveryAddress {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "mappin.and.ellipse").foregroundColor(brumaGreen)
                    Text(addr).font(.system(size: 14)).foregroundColor(.white.opacity(0.8))
                }
            }
            if let coord = coordinate {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: coord,
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                ))) {
                    Marker("Entrega", coordinate: coord).tint(.red)
                }
                .frame(height: 110)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .allowsHitTesting(false)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    /// Tiempo de preparación: sugerido por el server (carga de cocina), editable
    /// con +/- 5 min. Lo que quede aquí es lo que se manda al aceptar y lo que
    /// ve el cliente en la web.
    private var readyTimeCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tiempo de entrega")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(white: 0.45))
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { isEditingTime.toggle() }
                } label: {
                    Image(systemName: isEditingTime ? "checkmark" : "pencil")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(readyMinutes)")
                    .font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                Text("min")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(white: 0.5))
            }

            Text(readyMinutes == suggestedMinutes ? "Sugerido" : "Personalizado")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(readyMinutes == suggestedMinutes ? Color(white: 0.4) : brumaGreen)

            if isEditingTime {
                HStack(spacing: 16) {
                    timeStepButton("minus.circle.fill") { readyMinutes = max(5, readyMinutes - 5) }
                    Text("\(readyMinutes) min")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(minWidth: 60)
                    timeStepButton("plus.circle.fill") { readyMinutes = min(120, readyMinutes + 5) }
                }
                .padding(.top, 2)
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    private func timeStepButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 26))
                .foregroundColor(brumaGreen)
        }
        .buttonStyle(.plain)
    }

    private func formatMoney(_ s: String?) -> String {
        let v = Double(s ?? "0") ?? 0
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "MXN"
        f.locale = Locale(identifier: "es_MX")
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
}
