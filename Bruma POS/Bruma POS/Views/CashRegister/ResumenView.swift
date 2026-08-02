import SwiftUI

/// Resumen operativo de la sesión de caja — solo conteos y productos vendidos,
/// SIN dinero (los montos van en el Corte). Alimentado por `vm.paidOrders`.
struct ResumenView: View {
    @ObservedObject var vm: CashRegisterViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var printing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    countsRow
                    productsSection
                    Spacer(minLength: 20)
                }
                .padding(20)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Resumen del turno")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await printSummary() }
                    } label: {
                        if printing { ProgressView() } else { Label("Imprimir", systemImage: "printer.fill") }
                    }
                    .disabled(printing)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Conteos

    private var countsRow: some View {
        VStack(spacing: 12) {
            bigCountCard(
                title: "Órdenes del turno",
                value: "\(vm.paidOrders.count)",
                icon: "list.number",
                accent: .blue
            )
            HStack(spacing: 12) {
                countCard(title: "Para llevar", value: "\(vm.takeoutOrdersCount)", icon: "bag.fill", accent: .orange)
                countCard(title: "En mesa", value: "\(vm.tableOrdersCount)", icon: "fork.knife", accent: .green)
            }
        }
    }

    private func bigCountCard(title: String, value: String, icon: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon).foregroundColor(accent)
                Text(title.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white.opacity(0.6))
                    .tracking(1)
                Spacer()
            }
            Text(value)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Color(white: 0.08))
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(white: 0.15), lineWidth: 1))
    }

    private func countCard(title: String, value: String, icon: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.title3).foregroundColor(accent)
            Text(value)
                .font(.title.bold())
                .foregroundColor(.white)
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(white: 0.08))
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(white: 0.15), lineWidth: 1))
    }

    // MARK: - Productos vendidos

    private var productsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Productos vendidos")
                    .font(.headline.bold())
                    .foregroundColor(.white)
                Spacer()
                Text("\(vm.totalProductsSold) piezas")
                    .font(.caption)
                    .foregroundColor(.gray)
            }

            if vm.productsSold.isEmpty {
                Text("Sin productos vendidos aún")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(vm.productsSold.enumerated()), id: \.offset) { idx, product in
                        HStack {
                            Text("\(product.qty)×")
                                .font(.subheadline.weight(.bold))
                                .foregroundColor(.blue)
                                .frame(width: 44, alignment: .leading)
                            Text(product.name)
                                .font(.subheadline)
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding(.vertical, 10)
                        if idx < vm.productsSold.count - 1 {
                            Divider().background(Color.white.opacity(0.08))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .background(Color(white: 0.08))
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(white: 0.15), lineWidth: 1))
            }
        }
    }

    // MARK: - Imprimir (sin dinero)

    private func printSummary() async {
        printing = true
        defer { printing = false }

        let products = vm.productsSold.map { ["name": $0.name, "qty": $0.qty] }
        let body: [String: Any] = [
            "date": ISO8601DateFormatter().string(from: Date()),
            "registerName": "Caja \(vm.register?.id.prefix(8) ?? "")",
            "totalOrders": vm.paidOrders.count,
            "takeoutCount": vm.takeoutOrdersCount,
            "tableCount": vm.tableOrdersCount,
            "products": products
        ]

        guard let url = URL(string: "\(APIService.shared.printServerURL)/print-summary") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            _ = try await URLSession.shared.data(for: request)
            vm.showToast("Resumen impreso")
        } catch {
            vm.showToast("Error imprimiendo resumen", isError: true)
        }
    }
}
