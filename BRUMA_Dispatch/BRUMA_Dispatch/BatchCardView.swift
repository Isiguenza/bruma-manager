//
//  BatchCardView.swift
//  BRUMA_Dispatch
//
//  Redesigned to match Figma KDS light mode
//

import SwiftUI

struct BatchCardView: View {
    let batch: OrderBatch
    let isExpanded: Bool
    let onToggleExpand: () -> Void
    let onMarkAsReady: () -> Void
    let onRush: () -> Void
    let onHold: () -> Void
    var onReprint: () -> Void = {}
    @ObservedObject var viewModel: OrdersViewModel
    
    // MARK: — Status badge color (by elapsed time urgency)
    
    private var statusBadgeColor: Color {
        switch batch.urgency {
        case .normal:    return Color(red: 0.20, green: 0.78, blue: 0.35)   // green  ~1 min
        case .attention: return Color(red: 1.00, green: 0.58, blue: 0.00)   // orange ~9 min
        case .warning:   return Color(red: 1.00, green: 0.58, blue: 0.00)   // orange
        case .urgent:    return Color(red: 1.00, green: 0.23, blue: 0.19)   // red   ~29 min
        }
    }
    
    // MARK: — Shared date helper
    
    private var createdAtDate: Date? {
        let f1 = ISO8601DateFormatter()
        f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f1.date(from: batch.createdAt) { return d }
        let f2 = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        return f2.date(from: batch.createdAt)
    }
    
    private var elapsedLabel: String {
        _ = viewModel.currentTime  // subscribe so view re-renders each second
        guard let start = createdAtDate else { return "--:--" }
        let total = viewModel.currentTime.timeIntervalSince(start)
        let effective = max(0, total - Double(batch.holdAccumulatedSeconds))
        let secs = Int(effective)
        return String(format: "%02d:%02d", secs / 60, secs % 60)
    }
    
    // MARK: — Order mode (seats / courses / all-in)
    
    private var orderMode: (label: String, icon: String, color: Color) {
        let active = batch.items.filter { !($0.voided ?? false) }
        let seats   = Set(active.compactMap { $0.seat?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        let courses = Set(active.compactMap { $0.course })
        if seats.count > 1 {
            return ("Por Asientos", "person.2.fill", .purple)
        } else if courses.count > 1 {
            return ("Por Tiempos", "timer", .indigo)
        } else {
            return ("Al Centro", "fork.knife", Color(UIColor.systemTeal))
        }
    }
    
    // MARK: — Body
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if batch.isPractice {
                practiceStrip
            }

            topInfoSection

            if batch.isOnHold || batch.isRush {
                statusStrip
            }

            itemsSection

            Divider()

            bottomButtons
        }
        .background(Color(UIColor.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.07), radius: 6, x: 0, y: 2)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(
                    batch.isPractice ? Color.purple.opacity(0.6) :
                    batch.isOnHold ? Color.red.opacity(0.45) :
                    batch.isRush   ? Color.orange.opacity(0.55) :
                    Color(UIColor.separator).opacity(0.4),
                    lineWidth: (batch.isPractice || batch.isRush || batch.isOnHold) ? 2 : 0.5
                )
        )
    }

    // MARK: — Modo Práctica strip (letrero grande, siempre primero)

    private var practiceStrip: some View {
        HStack(spacing: 8) {
            Spacer()
            Image(systemName: "graduationcap.fill")
                .font(.system(size: 15, weight: .black))
            Text("MODO PRÁCTICA")
                .font(.system(size: 16, weight: .black))
                .kerning(0.5)
            Spacer()
        }
        .foregroundColor(.white)
        .padding(.vertical, 10)
        .background(Color.purple.opacity(0.85))
    }
    
    // MARK: — TOP INFO
    
    private var topInfoSection: some View {
        HStack(alignment: .top, spacing: 12) {
            // Left: icon + order # + meta
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: batch.table != nil ? "fork.knife" : "takeoutbag.and.cup.and.straw.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(batch.table != nil ? .blue : .orange)
                    .padding(.top, 3)


               
                
                VStack(alignment: .leading, spacing: 3) {

                     Text(customerDisplay)      
                        .font(.system(size: 30, weight: .black))
                        .foregroundColor(Color(UIColor.label))


                    Text(orderNumberDisplay)
                        .font(.system(size: 15))
                       .foregroundColor(Color(UIColor.secondaryLabel))
                    
                   
                        
                    
                    Text(timeDisplay)
                        .font(.system(size: 15))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                    
                    deliveryProgress
                        .padding(.top, 4)
                }
            }
            
            Spacer()
            
            // Right: colored status badge
            VStack(alignment: .center, spacing: 3) {
                Text("Preparando")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                Text(elapsedLabel)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(statusBadgeColor)
            .cornerRadius(12)
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemBackground))
    }
    
    // MARK: — Progreso de entrega

    private var progress: (done: Int, total: Int) {
        viewModel.deliveredProgress(batch)
    }

    private var allDelivered: Bool { progress.done >= progress.total && progress.total > 0 }

    private var deliveryProgress: some View {
        let p = progress
        return VStack(alignment: .leading, spacing: 5) {
            Text("\(p.done) / \(p.total) entregados")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(allDelivered ? .green : Color(UIColor.label))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(UIColor.tertiarySystemFill))
                    Capsule().fill(allDelivered ? Color.green : Color.blue)
                        .frame(width: p.total == 0 ? 0 : geo.size.width * CGFloat(p.done) / CGFloat(p.total))
                }
            }
            .frame(width: 150, height: 6)
        }
    }

    // MARK: — Status strip (Rush / Hold banner)
    
    @ViewBuilder
    private var statusStrip: some View {
        if batch.isOnHold {
            HStack(spacing: 8) {
                Spacer()
                Image(systemName: "pause.fill")
                    .font(.system(size: 13, weight: .black))
                Text("EN ESPERA")
                    .font(.system(size: 14, weight: .black))
                    .kerning(0.5)
                Spacer()
            }
            .foregroundColor(.white)
            .padding(.vertical, 8)
            .background(Color.red.opacity(0.75))
        }
        if batch.isRush {
            HStack(spacing: 8) {
                Spacer()
                Image(systemName: "flame.fill")
                    .font(.system(size: 13, weight: .black))
                Text("RUSH ORDER")
                    .font(.system(size: 14, weight: .black))
                    .kerning(0.5)
                Spacer()
            }
            .foregroundColor(.white)
            .padding(.vertical, 8)
            .background(Color.orange.opacity(0.80))
        }
    }
    
    // MARK: — Items section
    
    private var itemsSection: some View {
        return ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 4) {
                let grouped = groupItemsBySeat(batch.items)
                let keys = grouped.keys.sorted()
                ForEach(keys, id: \.self) { seat in
                    if let items = grouped[seat] {
                        seatBlock(seat: seat, items: items)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxHeight: 260)
    }
    
    // MARK: — Bottom buttons
    
    private var bottomButtons: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                // Reimprimir comanda → impresora de cocina
                Button(action: onReprint) {
                    HStack(spacing: 6) {
                        if viewModel.reprintingBatchId == batch.id {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "printer.fill")
                                .font(.system(size: 15, weight: .semibold))
                        }
                        Text("Reimprimir")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Capsule().fill(Color(red: 0.30, green: 0.44, blue: 0.95)))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.reprintingBatchId == batch.id)

                // Rush button
               /* Button(action: onRush) {
                    HStack(spacing: 6) {
                        Text(batch.isRush ? "Quitar Rush" : "Rush Orden")
                            .font(.system(size: 15, weight: .semibold))
                        Image(systemName: "figure.walk.motion")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        Capsule()
                            .fill(batch.isRush
                                  ? Color(red: 1.0, green: 0.45, blue: 0.0)
                                  : Color(red: 1.0, green: 0.62, blue: 0.0))
                    )
                }
                .buttonStyle(.plain)*/
                
                // Hold button
                Button(action: onHold) {
                    HStack(spacing: 6) {
                        Text(batch.isOnHold ? "Reanudar" : "Pausar Orden")
                            .font(.system(size: 15, weight: .semibold))
                        Image(systemName: batch.isOnHold ? "play.circle.fill" : "hand.raised.fill")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        Capsule()
                            .fill(batch.isOnHold
                                  ? Color(red: 0.85, green: 0.1, blue: 0.1)
                                  : Color(red: 1.0, green: 0.25, blue: 0.25))
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            
            // Marcar lo que falta (atajo — normalmente se marca plato por plato)
            Button(action: onMarkAsReady) {
                Text(allDelivered ? "Todo entregado" : "Marcar lo que falta")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        Capsule()
                            .fill(allDelivered ? Color.green.opacity(0.5) : Color.blue)
                    )
            }
            .buttonStyle(.plain)
            .disabled(allDelivered)
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 14)
        }
        .background(Color(UIColor.systemBackground))
    }
    
    // MARK: — Helpers
    
    private var customerDisplay: String {
        if let table = batch.table {
            return "Mesa \(table.number)"
        }
        return "Llevar"
    }
    
    private var orderNumberDisplay: String {
        var text = "# \(batch.orderNumber)"
        if batch.table == nil, let name = batch.customerName, !name.isEmpty {
            text += " - \(name)"
        }
        return text
    }
    
    private var timeDisplay: String {
        guard let d = createdAtDate else { return "" }
        let df = DateFormatter()
        df.dateFormat = "h:mm a"
        df.locale = Locale(identifier: "en_US")
        return df.string(from: d)
    }
    
    private func groupItemsByCategory(_ items: [OrderItem]) -> [String: [OrderItem]] {
        var dict: [String: [OrderItem]] = [:]
        for item in items {
            let category = item.product?.category?.name
            let key = (category == nil || category!.isEmpty) ? "Orden" : category!
            dict[key, default: []].append(item)
        }
        return dict
    }
    
    private func groupItemsBySeat(_ items: [OrderItem]) -> [String: [OrderItem]] {
        var dict: [String: [OrderItem]] = [:]
        for item in items where !(item.voided ?? false) {
            let raw = item.seat?.trimmingCharacters(in: .whitespaces) ?? ""
            let seat = raw.isEmpty ? "Orden" : raw.uppercased()
            dict[seat, default: []].append(item)
        }
        return dict
    }
    
    private func groupItemsByCourse(_ items: [OrderItem]) -> [Int: [OrderItem]] {
        var dict: [Int: [OrderItem]] = [:]
        for item in items where !(item.voided ?? false) {
            let course = item.course ?? 1
            dict[course, default: []].append(item)
        }
        return dict
    }
    
    private func seatBlock(seat: String, items: [OrderItem]) -> some View {
        let totalQty = items.reduce(0) { $0 + $1.quantity }
        let byCourse = groupItemsByCourse(items)
        let courseKeys = byCourse.keys.sorted()
        let hasMultipleCourses = courseKeys.count > 1
   
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Text("\(totalQty)x")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(seat == "C" ? .orange.opacity(0.7) : .blue.opacity(0.7))
                Text(seat == "C" ? "Al Centro" : seat)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(seat == "C" ? .orange : .blue)
            }
            .padding(.top, 4)
            if hasMultipleCourses {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(courseKeys, id: \.self) { course in
                        if let courseItems = byCourse[course] {
                            HStack(spacing: 0) {
                                Text("Tiempo \(course)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.green)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(Color.green.opacity(0.12))
                                    .cornerRadius(3)
                                Spacer()
                            }
                            .padding(.top, 4)
                            ForEach(courseItems) { item in
                                itemRow(item)
                            }
                        }
                    }
                }
            } else {
                ForEach(items) { item in
                    itemRow(item)
                }
            }
        }
    }
    
    private func courseBlock(course: Int, items: [OrderItem]) -> some View {
        return VStack(alignment: .leading, spacing: 4) {
            Text("T\(course)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.green)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.green.opacity(0.12))
                .cornerRadius(4)
                .padding(.top, 4)
            ForEach(items) { item in
                itemRow(item)
            }
        }
    }
    
    private func categoryBlock(category: String, items: [OrderItem]) -> some View {
        let totalQty = items.reduce(0) { $0 + $1.quantity }
        return VStack(alignment: .leading, spacing: 4) {
            // Category header row
            HStack(spacing: 6) {
                Text("\(totalQty) x")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Color(UIColor.secondaryLabel))
                Text(category)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(UIColor.label))
            }
            .padding(.top, 4)
            
            ForEach(items) { item in
                itemRow(item)
            }
        }
    }
    
    @ViewBuilder
    private func itemRow(_ item: OrderItem) -> some View {
        let delivered = viewModel.isDelivered(item)
        let urgent = batch.urgency == .warning || batch.urgency == .urgent
        let mods = buildModifierLines(item)

        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: delivered ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundColor(delivered ? .green : (urgent ? .orange : Color(UIColor.tertiaryLabel)))

                HStack(spacing: 6) {
                    Text("\(item.quantity) x")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                    Text(item.productName)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(delivered ? Color(UIColor.tertiaryLabel) : Color(UIColor.label))
                        .strikethrough(delivered, color: Color(UIColor.tertiaryLabel))
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            // Modifier / note lines
            if !mods.isEmpty {
                HStack(spacing: 0) {
                    Color.clear.frame(width: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(mods.enumerated()), id: \.offset) { _, line in
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.turn.down.right")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(line.color)
                                Text(line.text)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(line.color)
                            }
                        }
                    }
                }
            }
        }
        .opacity(delivered ? 0.5 : 1)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .onTapGesture { Task { await viewModel.toggleItemDelivered(item) } }
    }
    
    private func buildModifierLines(_ item: OrderItem) -> [(text: String, color: Color)] {
        var lines: [(text: String, color: Color)] = []
        if let f = item.frostingName    { lines.append((f, .orange)) }
        if let t = item.dryToppingName  { lines.append((t, .orange)) }
        if let e = item.extraName       { lines.append((e, .orange)) }
        if let cm = item.customModifiers,
           let mods = viewModel.parseCustomModifiers(cm) {
            for (_, mod) in mods.sorted(by: { $0.key < $1.key }) {
                let names = mod.options.map { $0.name }.joined(separator: ", ")
                lines.append(("\(mod.stepName): \(names)", .orange))
            }
        }
        if let notes = item.notes, !notes.isEmpty {
            lines.append(("Nota: \(notes)", .red))
        }
        return lines
    }
}
