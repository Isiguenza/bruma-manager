//
//  BatchCardView.swift
//  BRUMA_Dispatch
//
//  Card view for a single batch of items
//

import SwiftUI

struct BatchCardView: View {
    let batch: OrderBatch
    let isExpanded: Bool
    let onToggleExpand: () -> Void
    let onMarkAsReady: () -> Void
    @ObservedObject var viewModel: OrdersViewModel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header con color según urgencia
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    // Mesa o Para Llevar en formato pill
                    HStack(spacing: 8) {
                        if let table = batch.table {
                            Text("Mesa \(table.number)")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.2))
                                .clipShape(Capsule())
                            
                            // Guest count (pax)
                            if let guestCount = table.guestCount, guestCount > 1 {
                                Text("\(guestCount) pax")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.blue.opacity(0.3))
                                    .clipShape(Capsule())
                            }
                        } else {
                            Text("Para Llevar")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.2))
                                .clipShape(Capsule())
                        }
                        
                        // Nombre del cliente si existe
                        if let customerName = batch.customerName, !customerName.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "person.fill")
                                    .font(.system(size: 11))
                                Text(customerName)
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.2))
                            .clipShape(Capsule())
                        }
                        
                        // Order number
                        Text("#\(batch.orderNumber)")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.3))
                            .clipShape(Capsule())
                    }
                    
                    Spacer()
                    
                    // Tiempo transcurrido
                    TimelineView(.periodic(from: Date(), by: 1.0)) { context in
                        HStack(spacing: 4) {
                            Image(systemName: "clock")
                                .font(.system(size: 14))
                            Text(calculateElapsedTime(from: batch.createdAt, at: context.date))
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                    }
                }
                
                // Tiempo de preparación si existe
                if let prepTime = batch.preparationTime {
                    Text("\(prepTime) min")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .padding(16)
            .background(urgencyColor(batch.urgency))
            
            VStack(alignment: .leading, spacing: 12) {
                // Separate beverages and food
                let beverages = batch.items.filter { $0.product?.category?.isBeverage == true }
                let food = batch.items.filter { $0.product?.category?.isBeverage != true }
                
                // 1. BEBIDAS PRIMERO (todas juntas)
                if !beverages.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("BEBIDAS")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.cyan)
                            .padding(.bottom, 4)
                        
                        ForEach(beverages) { item in
                            itemRow(item)
                            if item.id != beverages.last?.id {
                                Divider().background(Color.white.opacity(0.1))
                            }
                        }
                    }
                    
                    if !food.isEmpty {
                        Divider()
                            .background(Color.white.opacity(0.2))
                            .padding(.vertical, 8)
                    }
                }
                
                // 2. ALIMENTOS POR ASIENTO Y TIEMPO
                if !food.isEmpty {
                    let groupedBySeat = Dictionary(grouping: food) { $0.seat ?? "C" }
                    let sortedSeats = groupedBySeat.keys.sorted { s1, s2 in
                        if s1 == "C" { return false }
                        if s2 == "C" { return true }
                        return s1 < s2
                    }
                    
                    ForEach(sortedSeats, id: \.self) { seat in
                        if let seatItems = groupedBySeat[seat] {
                            VStack(alignment: .leading, spacing: 4) {
                                // Seat header
                                HStack(spacing: 4) {
                                    Image(systemName: seat == "C" ? "fork.knife" : "person.fill")
                                        .font(.system(size: 11))
                                    Text(seat == "C" ? "COMPARTIDO" : "ASIENTO \(seat)")
                                        .font(.system(size: 12, weight: .bold))
                                }
                                .foregroundColor(seat == "C" ? .orange : .blue)
                                .padding(.bottom, 4)
                                
                                // Group by course within seat
                                let groupedByCourse = Dictionary(grouping: seatItems) { $0.course ?? 1 }
                                let sortedCourses = groupedByCourse.keys.sorted()
                                
                                ForEach(sortedCourses, id: \.self) { course in
                                    if let courseItems = groupedByCourse[course] {
                                        // Course header (only if multiple courses)
                                        if sortedCourses.count > 1 {
                                            Text("Tiempo \(course)")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundColor(.green.opacity(0.8))
                                                .padding(.leading, 8)
                                                .padding(.top, 4)
                                        }
                                        
                                        ForEach(courseItems) { item in
                                            itemRow(item)
                                            if item.id != courseItems.last?.id || course != sortedCourses.last {
                                                Divider().background(Color.white.opacity(0.1))
                                            }
                                        }
                                    }
                                }
                            }
                            .padding(.bottom, seat != sortedSeats.last ? 12 : 0)
                        }
                    }
                }
                
                // Slide to confirm
                VStack(spacing: 8) {
                    Text("Desliza para marcar como entregado")
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                        .frame(maxWidth: .infinity)
                    
                    SlideToConfirmView(onConfirm: onMarkAsReady)
                }
                .padding(.top, 16)
            }
            .padding(16)
        }
        .background(Color(red: 0.15, green: 0.15, blue: 0.15))
        .cornerRadius(12)
    }
    
    private func calculateElapsedTime(from createdAtString: String, at currentDate: Date) -> String {
        guard let createdDate = parseDate(createdAtString) else {
            return "0m 0s"
        }
        
        let elapsed = max(0, Int(currentDate.timeIntervalSince(createdDate)))
        let minutes = elapsed / 60
        let seconds = elapsed % 60
        
        return "\(minutes)m \(seconds)s"
    }
    
    private func parseDate(_ dateString: String) -> Date? {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSZ",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ssZ",
        ]
        
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        
        for format in formats {
            df.dateFormat = format
            if let date = df.date(from: dateString) {
                return date
            }
        }
        
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: dateString) {
            return date
        }
        
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: dateString)
    }
    
    private func urgencyColor(_ urgency: OrderUrgency) -> Color {
        switch urgency {
        case .normal:
            return Color(red: 0.2, green: 0.6, blue: 0.3)
        case .attention:
            return Color(red: 0.8, green: 0.6, blue: 0.2)
        case .warning:
            return Color(red: 0.9, green: 0.5, blue: 0.2)
        case .urgent:
            return Color(red: 0.9, green: 0.2, blue: 0.2)
        }
    }
    
    @ViewBuilder
    private func itemRow(_ item: OrderItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Cantidad
            Text("\(item.quantity)x")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 40, alignment: .leading)
            
            // Nombre del producto y modificadores
            VStack(alignment: .leading, spacing: 4) {
                Text(item.productName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                
                // Modificadores
                if let frosting = item.frostingName {
                    Text("Frosting: \(frosting)")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.7))
                }
                
                if let topping = item.dryToppingName {
                    Text("Topping: \(topping)")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.7))
                }
                
                if let extra = item.extraName {
                    Text("Extra: \(extra)")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.7))
                }
                
                // Custom modifiers
                if let customMods = item.customModifiers,
                   let modifiers = viewModel.parseCustomModifiers(customMods) {
                    ForEach(Array(modifiers.keys.sorted()), id: \.self) { stepId in
                        if let modifier = modifiers[stepId] {
                            let optionNames = modifier.options.map { $0.name }.joined(separator: ", ")
                            HStack(spacing: 4) {
                                Text("↳")
                                    .foregroundColor(.cyan.opacity(0.6))
                                Text("\(modifier.stepName): \(optionNames)")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.cyan)
                                    .lineLimit(3)
                                    .truncationMode(.tail)
                            }
                        }
                    }
                }
                
                // Notas
                if let notes = item.notes, !notes.isEmpty {
                    Text("Nota: \(notes)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.yellow)
                        .lineLimit(3)
                        .truncationMode(.tail)
                        .padding(.top, 2)
                }
            }
            
            Spacer()
        }
        .padding(.vertical, 8)
    }
}
