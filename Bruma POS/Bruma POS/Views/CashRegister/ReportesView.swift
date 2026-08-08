import SwiftUI

/// Reportes de la caja actual: ventas por empleado, por producto y por hora.
/// Se alimenta de `GET /api/cash-register/:id/report` (bloque `reports`).
struct ReportesView: View {
    let registerId: String
    @Environment(\.dismiss) private var dismiss
    @State private var reports: RegisterReports?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                if loading {
                    ProgressView()
                        .tint(.white)
                        .padding(40)
                } else if let r = reports {
                    VStack(spacing: 16) {
                        section("Ventas por empleado", systemImage: "person.2.fill", accent: .blue) {
                            if r.byEmployee.isEmpty { emptyRow }
                            ForEach(r.byEmployee) { e in
                                statRow(title: e.employeeName, subtitle: "\(e.orders) órdenes", value: currency(e.total))
                            }
                        }
                        section("Productos vendidos", systemImage: "cube.box.fill", accent: .orange) {
                            if r.byProduct.isEmpty { emptyRow }
                            ForEach(r.byProduct) { p in
                                statRow(title: p.productName, subtitle: "\(p.qty) pzas", value: currency(p.total))
                            }
                        }
                        section("Ventas por hora", systemImage: "clock.fill", accent: .green) {
                            if r.byHour.isEmpty { emptyRow }
                            ForEach(r.byHour) { h in
                                statRow(title: String(format: "%02d:00 – %02d:59", h.hour, h.hour), subtitle: "\(h.orders) órdenes", value: currency(h.total))
                            }
                        }
                    }
                    .padding(20)
                } else {
                    Text("No se pudo cargar el reporte")
                        .foregroundColor(.gray)
                        .padding(40)
                }
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Reportes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await load() }
    }

    private func load() async {
        loading = true
        reports = try? await APIService.shared.fetchRegisterReports(registerId: registerId)
        loading = false
    }

    // MARK: - UI helpers

    private func section<Content: View>(_ title: String, systemImage: String, accent: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: systemImage).foregroundColor(accent)
                Text(title).font(.headline.bold()).foregroundColor(.white)
            }
            VStack(spacing: 0) { content() }
                .padding(.horizontal, 14)
                .background(Color(white: 0.08))
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(white: 0.15), lineWidth: 1))
        }
    }

    private func statRow(title: String, subtitle: String, value: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).foregroundColor(.white).lineLimit(1)
                Text(subtitle).font(.caption2).foregroundColor(.gray)
            }
            Spacer()
            Text(value).font(.subheadline.weight(.semibold)).foregroundColor(.white)
        }
        .padding(.vertical, 10)
    }

    private var emptyRow: some View {
        Text("Sin datos")
            .font(.subheadline)
            .foregroundColor(.gray)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 16)
    }

    private func currency(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "MXN"
        f.locale = Locale(identifier: "es_MX")
        return f.string(from: NSNumber(value: v)) ?? "$0"
    }
}
