import SwiftUI

/// Corte financiero de la sesión de caja — vive dentro de la tab de Caja
/// (selector Caja · Corte · Resumen), no en un sheet. Usa el MISMO
/// `CorteViewModel` que alimenta la tarjeta de Ventas Netas de la caja, así
/// que pantalla, tarjeta y ticket impreso siempre muestran los mismos números.
///
/// Mismo lenguaje que la vista "Caja": panel ancho a la izquierda + panel de
/// 380 a la derecha, fondos planos, color solo en los puntos de cada método.
struct CorteView: View {
    @ObservedObject var vm: CorteViewModel
    let registerId: String
    /// Para el ticket impreso: id → nombre (quién abrió) y quién imprime.
    var employeeNames: [String: String] = [:]
    var printedBy: String? = nil
    var showToast: (String, Bool) -> Void = { _, _ in }
    /// Abre el cierre de caja. El Corte es el último paso antes de cerrar, por
    /// eso el botón vive aquí; el "Cerrar" de la vista Caja solo trae al Corte.
    var onCloseRegister: (() -> Void)? = nil

    @State private var printing = false
    @State private var lastUpdated: Date?
    @State private var showMovements = false

    // Mismos tonos que los botones de método en PaymentView.
    private static let cashColor = Color(red: 0, green: 137/255, blue: 50/255)
    private static let cardColor = Color(red: 30/255, green: 110/255, blue: 244/255)
    private static let transferColor = Color(red: 86/255, green: 74/255, blue: 222/255)

    var body: some View {
        Group {
            if let data = vm.corteData {
                HStack(alignment: .top, spacing: 12) {
                    ScrollView {
                        salesPanel(data)
                            .padding(20)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .modifier(PanelBackground())
                    .refreshable { await reload() }

                    cashPanel(data)
                        .frame(width: 380)
                        .frame(maxHeight: .infinity)
                        .modifier(PanelBackground())
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            } else if vm.loading {
                ProgressView("Cargando corte…")
                    .tint(.white)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 40))
                        .foregroundColor(.orange)
                    Text(error)
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                    Button("Reintentar") { Task { await reload() } }
                        .buttonStyle(.flatCapsuleNeutral)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        // Al entrar al Corte se refresca: los números de la caja pudieron
        // cambiar desde que se cargaron (cobros, propinas, sangrías).
        .task { await reload() }
    }

    private func reload() async {
        await vm.loadCorte(registerId: registerId)
        lastUpdated = Date()
    }

    private func print() async {
        printing = true
        defer { printing = false }
        let ok = await vm.printCorte(employeeNames: employeeNames, printedBy: printedBy)
        showToast(ok ? "Corte impreso" : "No se pudo imprimir el corte", !ok)
    }

    // MARK: - Izquierda: ventas

    private func salesPanel(_ data: CorteData) -> some View {
        let orders = data.summary.totalOrders
        let avgTicket = orders > 0 ? data.sales.total / Double(orders) : 0

        return VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 4) {
                Text("VENTAS NETAS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                    .tracking(1.4)
                Text(vm.formatCurrency(vm.totalNetSales))
                    .font(.system(size: 52, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: vm.totalNetSales)
                Text("\(orders) órdenes · ticket promedio \(vm.formatCurrency(avgTicket)) · propinas netas \(vm.formatCurrency(vm.totalNetTips))")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }

            methodsTable(data)

            Text(metaText(data))
                .font(.caption)
                .foregroundColor(Color(white: 0.45))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct MethodRow: Identifiable {
        let id: String
        let label: String
        let color: Color
        let sales: Double
        let tips: Double?
    }

    private func methodsTable(_ data: CorteData) -> some View {
        var rows = [
            MethodRow(id: "cash", label: "Efectivo", color: Self.cashColor, sales: data.sales.cash, tips: data.tips.cash),
            MethodRow(id: "card", label: "Terminal", color: Self.cardColor, sales: data.sales.card, tips: data.tips.card),
            MethodRow(id: "transfer", label: "Transferencia", color: Self.transferColor, sales: data.sales.transfer, tips: data.tips.transfer)
        ]
        if data.sales.online > 0 || data.tips.online > 0 {
            rows.append(MethodRow(id: "online", label: "En línea", color: .teal, sales: data.sales.online, tips: data.tips.online))
        }
        if data.sales.platformDelivery > 0 {
            rows.append(MethodRow(id: "platform", label: "Plataformas", color: .orange, sales: data.sales.platformDelivery, tips: nil))
        }

        let hasOnline = data.sales.online > 0 || data.tips.online > 0
        let salesCommission = data.commissions.salesCommission + (hasOnline ? data.commissions.online.salesCommission : 0)
        let tipsCommission = data.commissions.tipsCommission + (hasOnline ? data.commissions.online.tipsCommission : 0)
        let salesTotal = rows.reduce(0) { $0 + $1.sales }

        return VStack(spacing: 0) {
            shareBar(rows, total: salesTotal)
                .padding(.bottom, 18)

            tableRow {
                Text("MÉTODO")
            } sales: {
                Text("VENTAS")
            } tips: {
                Text("PROPINAS")
            }
            .font(.caption2.weight(.bold))
            .foregroundColor(.gray)
            .tracking(1)
            .padding(.bottom, 8)

            ForEach(rows) { row in
                Divider().background(Color.white.opacity(0.08))
                tableRow {
                    HStack(spacing: 8) {
                        Circle().fill(row.color).frame(width: 8, height: 8)
                        Text(row.label).foregroundColor(.white)
                        if salesTotal > 0, row.sales > 0 {
                            Text("\(Int((row.sales / salesTotal * 100).rounded()))%")
                                .font(.caption.weight(.semibold).monospacedDigit())
                                .foregroundColor(.gray)
                        }
                    }
                } sales: {
                    amount(row.sales)
                } tips: {
                    if let tips = row.tips { amount(tips) } else { Text("—").foregroundColor(Color(white: 0.35)) }
                }
                .font(.subheadline)
                .padding(.vertical, 12)
            }

            Divider().background(Color.white.opacity(0.2))

            VStack(spacing: 8) {
                tableRow {
                    Text("Bruto").foregroundColor(.gray)
                } sales: {
                    Text(vm.formatCurrency(data.sales.total)).foregroundColor(.white)
                } tips: {
                    Text(vm.formatCurrency(data.tips.total)).foregroundColor(.white)
                }
                tableRow {
                    Text("Comisión \(vm.formatPercentage(data.commissions.rateWithIVA))").foregroundColor(.gray)
                } sales: {
                    Text(salesCommission > 0 ? "−\(vm.formatCurrency(salesCommission))" : "—").foregroundColor(.gray)
                } tips: {
                    Text(tipsCommission > 0 ? "−\(vm.formatCurrency(tipsCommission))" : "—").foregroundColor(.gray)
                }
                tableRow {
                    Text("Neto").foregroundColor(.white).fontWeight(.semibold)
                } sales: {
                    Text(vm.formatCurrency(vm.totalNetSales)).foregroundColor(.white).fontWeight(.bold)
                } tips: {
                    Text(vm.formatCurrency(vm.totalNetTips)).foregroundColor(.white).fontWeight(.bold)
                }
            }
            .font(.subheadline.monospacedDigit())
            .padding(.top, 12)

            if data.sales.platformDelivery > 0 {
                Text("Plataformas se liquidan aparte y no suman al neto.")
                    .font(.caption)
                    .foregroundColor(Color(white: 0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 10)
            }
        }
        .padding(16)
        .modifier(FlatCard(cornerRadius: 14))
    }

    /// Proporción de ventas por método, con los colores del cobro.
    private func shareBar(_ rows: [MethodRow], total: Double) -> some View {
        GeometryReader { geo in
            let visible = rows.filter { $0.sales > 0 }
            let gaps = CGFloat(max(visible.count - 1, 0)) * 3
            HStack(spacing: 3) {
                ForEach(visible) { row in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(row.color)
                        .frame(width: max((geo.size.width - gaps) * CGFloat(row.sales / max(total, 0.01)), 4))
                }
            }
        }
        .frame(height: 10)
        .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Color.white.opacity(0.06)))
        .animation(.snappy, value: total)
    }

    private func tableRow<Label: View, Sales: View, Tips: View>(
        @ViewBuilder label: () -> Label,
        @ViewBuilder sales: () -> Sales,
        @ViewBuilder tips: () -> Tips
    ) -> some View {
        HStack {
            label().frame(maxWidth: .infinity, alignment: .leading)
            sales().frame(width: 140, alignment: .trailing)
            tips().frame(width: 140, alignment: .trailing)
        }
    }

    private func amount(_ value: Double) -> some View {
        Text(vm.formatCurrency(value))
            .monospacedDigit()
            .foregroundColor(value == 0 ? Color(white: 0.35) : .white)
    }

    // MARK: - Derecha: efectivo

    private func cashPanel(_ data: CorteData) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Image(systemName: "banknote.fill")
                                .font(.caption.weight(.bold))
                                .foregroundColor(Self.cashColor)
                            Text("EFECTIVO EN CAJÓN")
                                .font(.caption.weight(.bold))
                                .foregroundColor(.white.opacity(0.7))
                                .tracking(1.4)
                        }
                        Text(vm.formatCurrency(vm.cashExpected))
                            .font(.system(size: 40, weight: .heavy, design: .rounded))
                            .foregroundColor(.white)
                            .contentTransition(.numericText())
                            .animation(.snappy, value: vm.cashExpected)
                        if data.summary.finalCash == nil {
                            Text("Lo que debe haber ahora")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.55))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .modifier(FlatCardTinted(color: Self.cashColor, cornerRadius: 14))

                    if let finalCash = data.summary.finalCash {
                        cashCheck(counted: finalCash, diff: vm.differenceAmount)
                    }

                    VStack(spacing: 0) {
                        cashLine("Fondo inicial", data.register.initialCash)
                        cashLine("Ventas en efectivo", data.sales.cash, sign: "+")
                        cashLine("Propinas en efectivo", data.tips.cash, sign: "+")
                        cashLine("Depósitos", data.movements.deposits.total, sign: "+")
                        cashLine("Sangrías", data.movements.withdrawals.total, sign: "−")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .modifier(FlatCard(cornerRadius: 14))

                    movements(data)
                    notes(data)
                }
                .padding(20)
            }
            .refreshable { await reload() }

            footer(isOpen: data.register.status == "open")
        }
    }

    private func cashLine(_ label: String, _ value: Double, sign: String = "") -> some View {
        HStack {
            Text(sign)
                .foregroundColor(.gray)
                .frame(width: 14, alignment: .leading)
            Text(label)
                .foregroundColor(.gray)
            Spacer()
            Text(vm.formatCurrency(value))
                .monospacedDigit()
                .foregroundColor(value == 0 ? Color(white: 0.35) : .white)
        }
        .font(.subheadline)
        .padding(.vertical, 8)
    }

    private func cashCheck(counted: Double, diff: Double) -> some View {
        let squared = abs(diff) < 0.5
        let color: Color = squared ? Self.cashColor : (diff < 0 ? .red : .orange)
        let text = squared ? "Cuadra" : (diff < 0 ? "Faltan \(vm.formatCurrency(-diff))" : "Sobran \(vm.formatCurrency(diff))")

        return HStack {
            Image(systemName: squared ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
            Text(text).fontWeight(.semibold)
            Spacer()
            Text("Contado \(vm.formatCurrency(counted))")
                .font(.caption)
                .foregroundColor(.gray)
        }
        .font(.subheadline)
        .foregroundColor(color)
        .padding(12)
        .modifier(FlatCardTinted(color: color, cornerRadius: 12))
    }

    private struct MovementLine: Identifiable {
        let id: String
        let isDeposit: Bool
        let item: CorteMovementItem
    }

    @ViewBuilder
    private func movements(_ data: CorteData) -> some View {
        let lines = (data.movements.deposits.items.map { MovementLine(id: "d\($0.id)", isDeposit: true, item: $0) }
            + data.movements.withdrawals.items.map { MovementLine(id: "w\($0.id)", isDeposit: false, item: $0) })
            .sorted { $0.item.createdAt < $1.item.createdAt }

        if !lines.isEmpty {
            VStack(spacing: 0) {
                Button {
                    withAnimation(.snappy) { showMovements.toggle() }
                } label: {
                    HStack {
                        Text("Movimientos")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                        Text("\(lines.count)")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gray)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gray)
                            .rotationEffect(.degrees(showMovements ? 180 : 0))
                    }
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if showMovements {
                    ForEach(lines) { line in
                        Divider().background(Color.white.opacity(0.08))
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.item.description?.isEmpty == false ? line.item.description! : (line.isDeposit ? "Depósito" : "Sangría"))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                Text("\(line.isDeposit ? "Depósito" : "Sangría") · \(line.item.displayDate)")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                            Text("\(line.isDeposit ? "+" : "−")\(vm.formatCurrency(line.item.amount))")
                                .monospacedDigit()
                                .foregroundColor(.white)
                        }
                        .font(.subheadline)
                        .padding(.vertical, 10)
                    }
                }
            }
            .padding(.horizontal, 14)
            .modifier(FlatCard(cornerRadius: 14))
        }
    }

    @ViewBuilder
    private func notes(_ data: CorteData) -> some View {
        let items = [("Nota de apertura", data.notes.opening), ("Nota de cierre", data.notes.closure)]
            .compactMap { title, text in text.flatMap { $0.isEmpty ? nil : (title, $0) } }
        ForEach(items, id: \.0) { title, text in
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.caption)
                    .foregroundColor(.gray)
                Text(text)
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func footer(isOpen: Bool) -> some View {
        VStack(spacing: 10) {
            Divider().background(Color.white.opacity(0.1))
            HStack(spacing: 10) {
                Button {
                    Task { await reload() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.flatCircleNeutral)
                .disabled(vm.loading)

                Button {
                    Task { await print() }
                } label: {
                    HStack(spacing: 8) {
                        if printing { ProgressView().tint(.white) } else { Image(systemName: "printer.fill") }
                        Text("Imprimir corte")
                    }
                    .font(.callout.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                }
                .buttonStyle(.flatCapsule(Self.cardColor))
                .disabled(printing)
            }
            if isOpen, let onCloseRegister {
                Button(action: onCloseRegister) {
                    HStack(spacing: 8) {
                        Image(systemName: "lock.fill")
                        Text("Cerrar caja")
                    }
                    .font(.callout.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                }
                .buttonStyle(.flatCapsule(.red))
            }
            if let lastUpdated {
                Text("Actualizado \(Self.timeFormatter.string(from: lastUpdated))")
                    .font(.caption2)
                    .foregroundColor(Color(white: 0.45))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    // MARK: - Fechas

    private func metaText(_ data: CorteData) -> String {
        var parts: [String] = []
        if let opened = Self.parseDate(data.register.openedAt) {
            let closed = data.register.closedAt.flatMap { Self.parseDate($0) }
            parts.append("Abierta \(Self.dayTimeFormatter.string(from: opened))")
            if let closed { parts.append("cerrada \(Self.timeFormatter.string(from: closed))") }
            parts.append(Self.duration(from: opened, to: closed ?? Date()))
        }
        if let id = data.register.openedBy, let name = employeeNames[id] { parts.append("abrió \(name)") }
        if data.summary.splitOrders > 0 { parts.append("\(data.summary.splitOrders) pagos divididos") }
        return parts.joined(separator: " · ")
    }

    private static func parseDate(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    private static func duration(from start: Date, to end: Date) -> String {
        let minutes = max(Int(end.timeIntervalSince(start) / 60), 0)
        return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es-MX")
        f.dateFormat = "h:mm a"
        return f
    }()

    private static let dayTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es-MX")
        f.dateFormat = "d MMM, h:mm a"
        return f
    }()
}

/// Mismo fondo/borde que las dos columnas de la vista "Caja" (lo usan Corte y Resumen).
struct PanelBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color(uiColor: .systemGray6).opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
}
