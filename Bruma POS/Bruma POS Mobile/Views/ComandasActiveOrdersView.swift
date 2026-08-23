import SwiftUI

/// Tab "Órdenes" — vista de solo lectura de todo lo que está activo ahorita
/// (mesas + para llevar juntos), para tener un vistazo rápido de qué falta
/// sin tener que entrar mesa por mesa. No hace ningún fetch propio — arma la
/// lista con datos que `POSViewModel` ya trae cargados (mismo patrón que el
/// grid de mesas), así que se mantiene en vivo vía el mismo `SocketService`
/// sin tocar nada del backend/POS.
///
/// Nota: `itemCount` no siempre viene poblado por el endpoint de lista de
/// mesas (el backend solo lo calcula al pedir el detalle de una mesa) — por
/// eso esta vista muestra estado/tiempo/total, no cantidad de items; el
/// detalle completo de items ya se ve al entrar a la mesa/pedido.
struct ComandasActiveOrdersView: View {
    @ObservedObject var vm: POSViewModel

    private struct Row: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let status: String
        let total: String?
        let createdAt: String?
        let onTap: () -> Void
    }

    private var rows: [Row] {
        let tableRows: [Row] = vm.tables.compactMap { table in
            guard let order = table.activeOrder else { return nil }
            return Row(
                id: order.id,
                title: table.displayName,
                subtitle: "Orden #\(order.orderNumber)",
                status: order.status,
                total: order.total,
                createdAt: order.createdAt,
                onTap: { vm.handleSelectTable(table) }
            )
        }
        let deliveryRows: [Row] = (vm.deliveryOrders + vm.platformDeliveryOrders).map { order in
            Row(
                id: order.id,
                title: order.customerName ?? "Para llevar",
                subtitle: "Orden #\(order.orderNumber)",
                status: order.status,
                total: order.total,
                createdAt: order.createdAt,
                onTap: { vm.handleSelectDeliveryOrder(order) }
            )
        }
        return (tableRows + deliveryRows).sorted {
            (ComandasDateParsing.parse($0.createdAt) ?? .distantPast) > (ComandasDateParsing.parse($1.createdAt) ?? .distantPast)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Órdenes activas").font(.title3.weight(.bold)).foregroundColor(.white)
                Spacer()
                Text("\(rows.count)").font(.subheadline.weight(.semibold)).foregroundColor(.gray)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 12)

            if rows.isEmpty {
                VStack(spacing: 10) {
                    Spacer()
                    Image(systemName: "tray").font(.system(size: 40)).foregroundColor(Color(white: 0.35))
                    Text("Nada activo ahorita").font(.subheadline).foregroundColor(Color(white: 0.45))
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 8) {
                        ForEach(rows) { row in
                            Button {
                                Haptics.tap()
                                row.onTap()
                            } label: {
                                OrderRowCard(row: row)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    private struct OrderRowCard: View {
        let row: Row

        var body: some View {
            HStack(spacing: 12) {
                Circle().fill(Table.kitchenStatusColor(row.status)).frame(width: 8, height: 8)

                VStack(alignment: .leading, spacing: 3) {
                    Text(row.title).font(.subheadline.weight(.semibold)).foregroundColor(.white)
                    HStack(spacing: 6) {
                        Text(row.subtitle)
                        if let total = row.total, let value = Double(total) {
                            Text("•")
                            Text(value, format: .currency(code: "MXN").precision(.fractionLength(0)))
                        }
                    }
                    .font(.caption2)
                    .foregroundColor(.gray)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 3) {
                    Text(Table.kitchenStatusLabel(row.status))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Table.kitchenStatusColor(row.status))
                    if let created = ComandasDateParsing.parse(row.createdAt) {
                        Text(created, style: .relative)
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(12)
            .modifier(FlatCard(cornerRadius: 12))
        }
    }
}
