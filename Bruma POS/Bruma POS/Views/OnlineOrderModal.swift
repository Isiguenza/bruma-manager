import SwiftUI
import MapKit

/// Pantalla verde tipo Uber para pedidos en línea (web + Stripe). Suena en loop
/// (ver POSViewModel.startOnlineOrderSound) mientras está visible.
struct OnlineOrderModal: View {
    @ObservedObject var vm: POSViewModel
    let order: Order

    @State private var showRejectDialog = false
    @State private var rejectReason = ""

    private var isDelivery: Bool { order.deliveryType == "delivery" }

    private var coordinate: CLLocationCoordinate2D? {
        guard let latS = order.deliveryLat, let lngS = order.deliveryLng,
              let lat = Double(latS), let lng = Double(lngS) else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var body: some View {
        ZStack {
            // Verde pulsante de fondo
            LinearGradient(
                colors: [Color(red: 0.06, green: 0.5, blue: 0.24), Color(red: 0.03, green: 0.35, blue: 0.16)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                VStack(spacing: 6) {
                    Image(systemName: isDelivery ? "bicycle" : "bag.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.white)
                    Text("¡Nuevo pedido en línea!")
                        .font(.largeTitle.bold())
                        .foregroundColor(.white)
                    Text(isDelivery ? "Envío a domicilio" : "Para recoger")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.white.opacity(0.9))
                }
                .padding(.top, 32)
                .padding(.bottom, 16)

                ScrollView {
                    VStack(spacing: 16) {
                        // Cliente
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

                        // Mapa (solo domicilio con coords)
                        if isDelivery, let coord = coordinate {
                            Map(initialPosition: .region(MKCoordinateRegion(
                                center: coord,
                                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                            ))) {
                                Marker("Entrega", coordinate: coord)
                                    .tint(.red)
                            }
                            .frame(height: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .allowsHitTesting(false)
                        }

                        // Productos
                        infoCard {
                            ForEach(Array((order.items ?? []).enumerated()), id: \.offset) { idx, item in
                                HStack {
                                    Text("\(item.quantity)×")
                                        .font(.headline.bold())
                                        .foregroundColor(.white)
                                        .frame(width: 40, alignment: .leading)
                                    Text(item.productName)
                                        .foregroundColor(.white)
                                    Spacer()
                                }
                                .padding(.vertical, 4)
                                if idx < (order.items?.count ?? 0) - 1 {
                                    Divider().background(Color.white.opacity(0.12))
                                }
                            }
                        }

                        // Total
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

                // Botones
                HStack(spacing: 12) {
                    Button {
                        showRejectDialog = true
                    } label: {
                        Text("Rechazar")
                            .font(.headline.bold())
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Color.red.opacity(0.9))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }

                    Button {
                        vm.acceptOnlineOrder()
                    } label: {
                        Text("Aceptar")
                            .font(.headline.bold())
                            .foregroundColor(Color(red: 0.03, green: 0.35, blue: 0.16))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding(24)
            }
        }
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
