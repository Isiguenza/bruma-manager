import SwiftUI
import MapKit
import UIKit

/// Modal con la ubicación de entrega de un pedido: mapa de Apple, dirección
/// escrita, compartir por WhatsApp y abrir en Mapas.
struct OrderLocationModal: View {
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss

    private var coordinate: CLLocationCoordinate2D? {
        guard let latS = vm.currentOrderLat, let lngS = vm.currentOrderLng,
              let lat = Double(latS), let lng = Double(lngS) else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private var mapsLink: String {
        guard let c = coordinate else { return "" }
        return "https://www.google.com/maps/search/?api=1&query=\(c.latitude),\(c.longitude)"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let c = coordinate {
                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: c,
                            span: MKCoordinateSpan(latitudeDelta: 0.008, longitudeDelta: 0.008)
                        ))) {
                            Marker("Entrega", coordinate: c).tint(.red)
                        }
                        .frame(height: 280)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(white: 0.15), lineWidth: 1))
                    }

                    if let addr = vm.currentOrderAddress {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "mappin.and.ellipse").foregroundColor(.blue)
                            Text(addr).foregroundColor(.white)
                            Spacer()
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(white: 0.08))
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(white: 0.15), lineWidth: 1))
                    }

                    if !vm.customerName.isEmpty || vm.currentOrderPhone != nil {
                        HStack(spacing: 10) {
                            Image(systemName: "person.fill").foregroundColor(.gray)
                            Text(vm.customerName).foregroundColor(.white)
                            Spacer()
                            if let phone = vm.currentOrderPhone {
                                Text(phone).foregroundColor(.gray)
                            }
                        }
                        .padding(16)
                        .background(Color(white: 0.08))
                        .cornerRadius(14)
                    }

                    Button { shareWhatsApp() } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "square.and.arrow.up")
                            Text("Compartir por WhatsApp")
                        }
                        .font(.headline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color(red: 0.15, green: 0.68, blue: 0.38))
                        .clipShape(Capsule())
                    }

                    Button { openInMaps() } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "map.fill")
                            Text("Abrir en Mapas")
                        }
                        .font(.headline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 1))
                    }
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Ubicación de entrega")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func shareWhatsApp() {
        let addr = vm.currentOrderAddress ?? ""
        let text = "📍 Entrega para \(vm.customerName):\n\(addr)\n\(mapsLink)"
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "https://wa.me/?text=\(encoded)") {
            UIApplication.shared.open(url)
        }
    }

    private func openInMaps() {
        if let url = URL(string: mapsLink) { UIApplication.shared.open(url) }
    }
}
