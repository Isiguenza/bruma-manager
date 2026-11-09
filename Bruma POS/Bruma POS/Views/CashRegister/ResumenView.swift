import SwiftUI
import Charts

/// Resumen operativo de la sesión de caja — solo conteos y productos vendidos,
/// SIN dinero (los montos van en el Corte). Alimentado por `vm.paidOrders`.
///
/// Dice lo mismo que el ticket impreso (`buildSummaryTicket` en
/// print-server): categoría → producto → variante, lo más vendido, y aparte
/// incluidos de paquete, cortesías y promociones. El agrupado de abajo es
/// espejo de `groupSummaryItems` de print-server: si cambias uno, cambia el otro.
struct ResumenView: View {
    @ObservedObject var vm: CashRegisterViewModel
    /// productId → (categoría, orden) para agrupar.
    var categoryByProduct: [String: (name: String, sort: Int)] = [:]
    var printedBy: String? = nil
    @State private var printing = false
    @State private var collapsed: Set<String> = []

    /// Único acento de la pantalla: el azul de "Terminal" en PaymentView.
    private static let accent = Color(red: 30/255, green: 110/255, blue: 244/255)

    var body: some View {
        let categories = groupedCategories
        HStack(alignment: .top, spacing: 12) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    if categories.isEmpty {
                        Text("Sin productos vendidos aún")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(categories) { categoryCard($0) }
                        }
                    }
                }
                .padding(20)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .modifier(PanelBackground())
            .refreshable { await vm.loadData() }

            sidePanel(categories)
                .frame(width: 380)
                .frame(maxHeight: .infinity)
                .modifier(PanelBackground())
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }

    // MARK: - Izquierda

    private var hero: some View {
        HStack(alignment: .bottom, spacing: 24) {
            VStack(alignment: .leading, spacing: 4) {
                Text("PIEZAS VENDIDAS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                    .tracking(1.4)
                Text("\(soldPieces)")
                    .font(.system(size: 52, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: soldPieces)
                Text("\(vm.paidOrders.count) órdenes · \(vm.tableOrdersCount) en mesa · \(vm.takeoutOrdersCount) para llevar")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .layoutPriority(1)

            Spacer(minLength: 0)

            hourlyChart
        }
    }

    // MARK: - Órdenes por hora

    private struct HourBucket: Identifiable {
        var id: Int { hour }
        let hour: Int
        let count: Int
    }

    /// Órdenes por hora en que se crearon, rellenando las horas vacías entre
    /// la primera y la última para que la gráfica no "salte" huecos.
    private var hourlyBuckets: [HourBucket] {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        let calendar = Calendar.current
        var counts: [Int: Int] = [:]
        for order in vm.paidOrders {
            guard let raw = order.createdAt,
                  let date = withFraction.date(from: raw) ?? plain.date(from: raw) else { continue }
            counts[calendar.component(.hour, from: date), default: 0] += 1
        }
        guard let first = counts.keys.min(), let last = counts.keys.max() else { return [] }
        return (first...last).map { HourBucket(hour: $0, count: counts[$0] ?? 0) }
    }

    @ViewBuilder
    private var hourlyChart: some View {
        let buckets = hourlyBuckets
        if buckets.count > 1, let peak = buckets.max(by: { $0.count < $1.count }) {
            VStack(alignment: .trailing, spacing: 6) {
                Chart(buckets) { bucket in
                    BarMark(
                        x: .value("Hora", Self.hourLabel(bucket.hour)),
                        y: .value("Órdenes", bucket.count)
                    )
                    .foregroundStyle(bucket.hour == peak.hour ? Self.accent : Color.white.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                }
                .chartYAxis(.hidden)
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel()
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(Color(white: 0.45))
                    }
                }
                .frame(width: 340, height: 92)

                HStack(spacing: 4) {
                    Circle().fill(Self.accent).frame(width: 6, height: 6)
                    Text("Hora pico \(Self.hourLabel(peak.hour)) · \(peak.count) órdenes")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
        }
    }

    private static func hourLabel(_ hour: Int) -> String {
        let h = hour % 12 == 0 ? 12 : hour % 12
        return "\(h)\(hour < 12 ? "am" : "pm")"
    }

    private func categoryCard(_ category: SummaryCategory) -> some View {
        let isCollapsed = collapsed.contains(category.id)
        let maxQty = category.products.map(\.qty).max() ?? 1
        let share = soldPieces > 0 ? Int((Double(category.qty) / Double(soldPieces) * 100).rounded()) : 0
        return VStack(spacing: 0) {
            Button {
                withAnimation(.snappy) {
                    if isCollapsed { collapsed.remove(category.id) } else { collapsed.insert(category.id) }
                }
            } label: {
                HStack {
                    Text(category.name.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundColor(.white)
                        .tracking(1)
                    Text("\(share)%")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(category.qty)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundColor(.white)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.gray)
                        .rotationEffect(.degrees(isCollapsed ? -90 : 0))
                        .frame(width: 20)
                }
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !isCollapsed {
                ForEach(category.products) { product in
                    Divider().background(Color.white.opacity(0.08))
                    VStack(spacing: 6) {
                        qtyRow(product.name, product.qty, promo: product.hasPromo)
                        dataBar(Double(product.qty) / Double(max(maxQty, 1)))
                            .padding(.trailing, 28)
                        ForEach(product.variants, id: \.name) { variant in
                            qtyRow(variant.name, variant.qty, secondary: true)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
        }
        .padding(.horizontal, 16)
        .modifier(FlatCard(cornerRadius: 14))
    }

    /// Barra discreta proporcional (0…1) — qué tanto jala un platillo sin leer números.
    private func dataBar(_ fraction: Double, strong: Bool = false) -> some View {
        GeometryReader { geo in
            Capsule()
                .fill(Self.accent.opacity(strong ? 0.9 : 0.45))
                .frame(width: max(geo.size.width * CGFloat(min(max(fraction, 0), 1)), 3))
        }
        .frame(height: 3)
        .background(Capsule().fill(Color.white.opacity(0.05)))
    }

    private func qtyRow(_ name: String, _ qty: Int, promo: Bool = false, secondary: Bool = false) -> some View {
        HStack(spacing: 8) {
            Text(name)
                .font(secondary ? .caption : .subheadline)
                .foregroundColor(secondary ? .gray : .white)
                .padding(.leading, secondary ? 16 : 0)
            if promo {
                Text("PROMO")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.orange)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.orange.opacity(0.15)))
            }
            Spacer()
            Text("\(qty)")
                .font((secondary ? Font.caption : Font.subheadline.weight(.semibold)).monospacedDigit())
                .foregroundColor(secondary ? .gray : .white)
                .padding(.trailing, 28)
        }
    }

    // MARK: - Derecha

    private func sidePanel(_ categories: [SummaryCategory]) -> some View {
        let top = categories.flatMap(\.products).sorted { $0.qty > $1.qty }.prefix(5)
        let packageItems = summedByName(.package)
        let guestItems = summedByName(.guest)
        let promotions = promotionSummary

        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !top.isEmpty {
                        sideList(title: "Lo más vendido") {
                            let leader = Double(top.first?.qty ?? 1)
                            ForEach(Array(top.enumerated()), id: \.element.id) { idx, product in
                                VStack(spacing: 6) {
                                    HStack(spacing: 10) {
                                        Text("\(idx + 1)")
                                            .font(.caption.weight(.bold).monospacedDigit())
                                            .foregroundColor(idx == 0 ? Self.accent : .gray)
                                            .frame(width: 16, alignment: .leading)
                                        Text(product.name)
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                        Spacer()
                                        Text("\(product.qty)")
                                            .fontWeight(.semibold)
                                            .monospacedDigit()
                                            .foregroundColor(.white)
                                    }
                                    .font(.subheadline)
                                    dataBar(Double(product.qty) / max(leader, 1), strong: idx == 0)
                                        .padding(.leading, 26)
                                }
                            }
                        }
                    }
                    if !packageItems.isEmpty {
                        sideList(title: "Incluidos en paquetes", caption: "Salieron dentro de un paquete, no se vendieron sueltos") {
                            ForEach(packageItems, id: \.name) { simpleRow($0.name, $0.qty) }
                        }
                    }
                    if !guestItems.isEmpty {
                        sideList(title: "Cortesías") {
                            ForEach(guestItems, id: \.name) { simpleRow($0.name, $0.qty) }
                        }
                    }
                    if !promotions.isEmpty {
                        sideList(title: "Promociones aplicadas") {
                            ForEach(promotions, id: \.name) { simpleRow($0.name, $0.count) }
                        }
                    }
                }
                .padding(20)
            }
            .refreshable { await vm.loadData() }

            footer
        }
    }

    private func sideList<Content: View>(title: String, caption: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                    .tracking(1.4)
                if let caption {
                    Text(caption)
                        .font(.caption2)
                        .foregroundColor(Color(white: 0.45))
                }
            }
            VStack(spacing: 10) { content() }
                .padding(14)
                .modifier(FlatCard(cornerRadius: 14))
        }
    }

    private func simpleRow(_ name: String, _ qty: Int) -> some View {
        HStack {
            Text(name).foregroundColor(.white).lineLimit(1)
            Spacer()
            Text("\(qty)").monospacedDigit().foregroundColor(.gray)
        }
        .font(.subheadline)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Divider().background(Color.white.opacity(0.1))
            HStack(spacing: 10) {
                Button {
                    Task { await vm.loadData() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.flatCircleNeutral)

                Button {
                    Task { await printSummary() }
                } label: {
                    HStack(spacing: 8) {
                        if printing { ProgressView().tint(.white) } else { Image(systemName: "printer.fill") }
                        Text("Imprimir resumen")
                    }
                    .font(.callout.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                }
                .buttonStyle(.flatCapsule(Color(red: 30/255, green: 110/255, blue: 244/255)))
                .disabled(printing)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    // MARK: - Agrupado (espejo de groupSummaryItems en print-server)

    private struct SummaryVariant {
        let name: String
        let qty: Int
    }

    private struct SummaryProduct: Identifiable {
        let id: String
        let name: String
        let qty: Int
        let hasPromo: Bool
        let variants: [SummaryVariant]
    }

    private struct SummaryCategory: Identifiable {
        var id: String { name }
        let name: String
        let sort: Int
        let qty: Int
        let products: [SummaryProduct]
    }

    /// "Espresso - Doble" → ("Espresso", "Doble").
    private static func splitVariant(_ name: String) -> (base: String, variant: String?) {
        guard let range = name.range(of: " - ", options: .backwards), range.lowerBound > name.startIndex else {
            return (name, nil)
        }
        return (String(name[..<range.lowerBound]), String(name[range.upperBound...]))
    }

    private var soldPieces: Int {
        vm.summaryItems.filter { $0.kind == .sold }.reduce(0) { $0 + $1.item.quantity }
    }

    private var groupedCategories: [SummaryCategory] {
        struct ProductAcc { var qty = 0; var hasPromo = false; var names: [(String, Int)] = [] }
        struct CategoryAcc { var sort: Int; var qty = 0; var order: [String] = []; var products: [String: ProductAcc] = [:] }

        var categories: [String: CategoryAcc] = [:]
        for (item, kind) in vm.summaryItems where kind == .sold {
            let category = categoryByProduct[item.productId]
            let catName = category?.name ?? "Otros"
            var cat = categories[catName] ?? CategoryAcc(sort: category?.sort ?? 99999)
            let key = item.productId
            var product = cat.products[key] ?? ProductAcc()
            if cat.products[key] == nil { cat.order.append(key) }
            product.qty += item.quantity
            product.hasPromo = product.hasPromo || item.promotionId != nil
            if let idx = product.names.firstIndex(where: { $0.0 == item.productName }) {
                product.names[idx].1 += item.quantity
            } else {
                product.names.append((item.productName, item.quantity))
            }
            cat.qty += item.quantity
            cat.products[key] = product
            categories[catName] = cat
        }

        return categories
            .map { name, cat in
                let products = cat.order.compactMap { key -> SummaryProduct? in
                    guard let p = cat.products[key] else { return nil }
                    // Un solo nombre: se muestra completo ("Boing Sabores - Mango").
                    if p.names.count == 1 {
                        return SummaryProduct(id: key, name: p.names[0].0, qty: p.qty, hasPromo: p.hasPromo, variants: [])
                    }
                    let base = Self.splitVariant(p.names[0].0).base
                    let variants = p.names
                        .map { name, qty -> SummaryVariant in
                            let split = Self.splitVariant(name)
                            return SummaryVariant(name: split.base == base ? (split.variant ?? name) : name, qty: qty)
                        }
                        .sorted { $0.qty != $1.qty ? $0.qty > $1.qty : $0.name < $1.name }
                    return SummaryProduct(id: key, name: base, qty: p.qty, hasPromo: p.hasPromo, variants: variants)
                }
                .sorted { $0.qty != $1.qty ? $0.qty > $1.qty : $0.name < $1.name }
                return SummaryCategory(name: name, sort: cat.sort, qty: cat.qty, products: products)
            }
            .sorted { $0.sort != $1.sort ? $0.sort < $1.sort : $0.name < $1.name }
    }

    private func summedByName(_ kind: CashRegisterViewModel.SummaryKind) -> [(name: String, qty: Int)] {
        var totals: [String: Int] = [:]
        for (item, k) in vm.summaryItems where k == kind {
            totals[item.productName, default: 0] += item.quantity
        }
        return totals.map { (name: $0.key, qty: $0.value) }
            .sorted { $0.qty != $1.qty ? $0.qty > $1.qty : $0.name < $1.name }
    }

    private var promotionSummary: [(name: String, count: Int)] {
        var promotions: [String: (name: String, count: Int)] = [:]
        for (item, kind) in vm.summaryItems where kind == .sold {
            guard let promotionId = item.promotionId else { continue }
            let current = promotions[promotionId] ?? (item.promotionName ?? "Promoción", 0)
            promotions[promotionId] = (current.name, current.count + item.quantity)
        }
        return promotions.values.sorted { $0.count > $1.count }
    }

    // MARK: - Imprimir (sin dinero)

    private func printSummary() async {
        printing = true
        defer { printing = false }

        // El print-server agrupa por categoría → producto → variante y separa
        // incluidos de paquete y cortesías; aquí solo va cada renglón con su tipo.
        let items: [[String: Any]] = vm.summaryItems.map { item, kind in
            var dict: [String: Any] = [
                "productId": item.productId,
                "name": item.productName,
                "qty": item.quantity,
                "kind": kind.rawValue
            ]
            if let category = categoryByProduct[item.productId] {
                dict["category"] = category.name
                dict["categorySort"] = category.sort
            }
            if item.promotionId != nil { dict["hasPromo"] = true }
            return dict
        }
        var body: [String: Any] = [
            "totalOrders": vm.paidOrders.count,
            "takeoutCount": vm.takeoutOrdersCount,
            "tableCount": vm.tableOrdersCount,
            "items": items,
            "promotionSummary": promotionSummary.map { ["name": $0.name, "count": $0.count] }
        ]
        if let openedAt = vm.register?.openedAt { body["openedAt"] = openedAt }
        if let printedBy, !printedBy.isEmpty { body["printedBy"] = printedBy }

        guard let url = URL(string: "\(APIService.shared.printServerURL)/print-summary") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
            vm.showToast(ok ? "Resumen impreso" : "No se pudo imprimir el resumen", isError: !ok)
        } catch {
            vm.showToast("No se pudo imprimir el resumen", isError: true)
        }
    }
}
