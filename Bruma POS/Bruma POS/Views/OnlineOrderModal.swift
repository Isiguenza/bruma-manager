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
            LinearGradient(colors: [brumaGreen, brumaGreenDark], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            if reviewing {
                detailPhase
            } else {
                newOrderPhase
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: reviewing)
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
        .onTapGesture { reviewing = true }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
    }

    // MARK: - Fase 2: detalle + acciones

    private var detailPhase: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Image(systemName: isDelivery ? "bicycle" : "bag.fill")
                    .font(.title.weight(.bold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nuevo pedido")
                        .font(.title.bold())
                    Text(isDelivery ? "Envío a domicilio" : "Para recoger")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white.opacity(0.85))
                }
                Spacer()
            }
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 12)

            ScrollView {
                VStack(spacing: 16) {
                    infoCard {
                        row("Cliente", order.customerName ?? "—", icon: "person.fill")
                        if let phone = order.customerPhone {
                            Divider().background(Color.white.opacity(0.15))
                            row("Teléfono", phone, icon: "phone.fill")
                        }
                        if isDelivery, let addr = order.deliveryAddress {
                            Divider().background(Color.white.opacity(0.15))
                            row("Dirección", addr, icon: "mappin.and.ellipse")
                        }
                    }

                    if isDelivery, let coord = coordinate {
                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: coord,
                            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                        ))) {
                            Marker("Entrega", coordinate: coord).tint(.red)
                        }
                        .frame(height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .allowsHitTesting(false)
                    }

                    infoCard {
                        ForEach(Array((order.items ?? []).enumerated()), id: \.offset) { idx, item in
                            HStack {
                                Text("\(item.quantity)×")
                                    .font(.headline.bold())
                                    .foregroundColor(.white)
                                    .frame(width: 40, alignment: .leading)
                                Text(item.productName).foregroundColor(.white)
                                Spacer()
                            }
                            .padding(.vertical, 4)
                            if idx < (order.items?.count ?? 0) - 1 {
                                Divider().background(Color.white.opacity(0.12))
                            }
                        }
                    }

                    HStack {
                        Text("Total").font(.title3.weight(.semibold)).foregroundColor(.white.opacity(0.85))
                        Spacer()
                        Text(formatMoney(order.total)).font(.title.bold()).foregroundColor(.white)
                    }
                    .padding(.horizontal, 4)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 12)
            }

            // Botones pill
            HStack(spacing: 12) {
                Button {
                    showRejectDialog = true
                } label: {
                    Text("Rechazar")
                        .font(.headline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .overlay(Capsule().stroke(Color.white.opacity(0.7), lineWidth: 1.5))
                }

                Button {
                    vm.acceptOnlineOrder()
                } label: {
                    Text("Aceptar")
                        .font(.headline.bold())
                        .foregroundColor(brumaGreen)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.white)
                        .clipShape(Capsule())
                }
            }
            .padding(24)
        }
    }

    // MARK: - UI helpers

    @ViewBuilder
    private func infoCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func row(_ label: String, _ value: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundColor(.white.opacity(0.8)).frame(width: 22)
            Text(label).foregroundColor(.white.opacity(0.7))
            Spacer()
            Text(value).foregroundColor(.white).font(.body.weight(.semibold)).multilineTextAlignment(.trailing)
        }
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
