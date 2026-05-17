import SwiftUI

struct EmployeeOrderHistoryView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            if vm.employeeOrderHistory.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 36))
                        .foregroundColor(.gray)
                    Text("Sin historial")
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.gray)
                    Text("Las ordenes del empleado apareceran aqui")
                        .font(.caption)
                        .foregroundColor(.gray.opacity(0.7))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.employeeOrderHistory) { order in
                            EmployeeOrderHistoryRow(order: order, vm: vm)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
            }
        }
        .task {
            await vm.fetchEmployeeOrderHistory()
        }
    }
}

struct EmployeeOrderHistoryRow: View {
    let order: Order
    @ObservedObject var vm: POSViewModel
    
    private var isPaid: Bool {
        order.paymentStatus == "paid"
    }
    
    private var formattedDate: String {
        guard let dateStr = order.createdAt else { return "" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateStr) else {
            // Try without fractional seconds
            let f2 = ISO8601DateFormatter()
            f2.formatOptions = [.withInternetDateTime]
            guard let d2 = f2.date(from: dateStr) else { return dateStr }
            return formatDate(d2)
        }
        return formatDate(date)
    }
    
    private func formatDate(_ date: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "dd/MM/yy HH:mm"
        return df.string(from: date)
    }
    
    private var totalAmount: Double {
        Double(order.total ?? "0") ?? 0
    }
    
    private var paymentMethodLabel: String {
        guard let pm = order.paymentMethod else { return "-" }
        switch pm {
        case "cash": return "Efectivo"
        case "transfer": return "Transferencia"
        case "terminal_mercadopago": return "Terminal"
        case "split": return "Dividida"
        default: return pm.capitalized
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header row: order number + date + status
            HStack {
                Text("#\(order.orderNumber)")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white)
                
                Text(formattedDate)
                    .font(.caption2)
                    .foregroundColor(.gray)
                
                Spacer()
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(isPaid ? Color.green : Color.orange)
                        .frame(width: 6, height: 6)
                    Text(isPaid ? "Pagado" : "Pendiente")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(isPaid ? .green : .orange)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isPaid ? Color.green.opacity(0.1) : Color.orange.opacity(0.1))
                )
            }
            
            // Items
            if let items = order.items {
                ForEach(items.prefix(5), id: \.id) { item in
                    HStack(spacing: 4) {
                        Text("\(item.quantity ?? 1)x")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text(item.productName ?? "")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.8))
                            .lineLimit(1)
                    }
                }
                if items.count > 5 {
                    Text("+ \(items.count - 5) items mas")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            
            // Footer: total + payment method
            HStack {
                if isPaid {
                    Text(paymentMethodLabel)
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                Text(vm.formatCurrency(totalAmount))
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.04))
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }
}
