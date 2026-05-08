import SwiftUI

struct DeliveryOrderCard: View {
    let order: DeliveryOrder
    @ObservedObject var vm: DeliveryViewModel
    @State private var showDenyModal = false
    @State private var processing = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header: Platform + Status
            HStack(spacing: 10) {
                // Platform badge
                HStack(spacing: 4) {
                    Image(systemName: "box.truck.fill")
                        .font(.caption2)
                    Text(vm.platformName(order.platform))
                        .font(.caption.bold())
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(vm.platformColor(order.platform))
                .cornerRadius(6)
                
                // Status indicator
                Circle()
                    .fill(vm.statusColor(order.status))
                    .frame(width: 8, height: 8)
                
                Text(vm.statusLabel(order.status))
                    .font(.caption)
                    .foregroundColor(.gray)
                
                Spacer()
                
                // Order number
                Text("#\(order.externalId.suffix(6))")
                    .font(.caption.bold())
                    .foregroundColor(.white)
            }
            
            // Customer info
            VStack(alignment: .leading, spacing: 4) {
                Text(order.customerName)
                    .font(.headline.bold())
                    .foregroundColor(.white)
                
                if let phone = order.customerPhone {
                    HStack(spacing: 4) {
                        Image(systemName: "phone.fill")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text(phone)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                
                if let address = order.deliveryAddress {
                    HStack(spacing: 4) {
                        Image(systemName: "location.fill")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text(address)
                            .font(.caption)
                            .foregroundColor(.gray)
                            .lineLimit(1)
                    }
                }
                
                if let instructions = order.deliveryInstructions, !instructions.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "note.text")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text(instructions)
                            .font(.caption)
                            .foregroundColor(Color(white: 0.5))
                            .italic()
                    }
                }
            }
            
            // Order total
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Total")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(formatCurrency(order.total))
                        .font(.title3.bold())
                        .foregroundColor(.white)
                }
                
                Spacer()
                
                // Time info
                if let pickupTime = order.estimatedPickupTime {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Recoger a las")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Text(formatTime(pickupTime))
                            .font(.subheadline.bold())
                            .foregroundColor(.orange)
                    }
                }
            }
            
            // Action buttons
            actionButtons
        }
        .padding(14)
        .background(Color(white: 0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(vm.platformColor(order.platform).opacity(0.3), lineWidth: 2)
        )
        .sheet(isPresented: $showDenyModal) {
            DenyOrderModal(orderId: order.id, vm: vm)
        }
    }
    
    @ViewBuilder
    private var actionButtons: some View {
        if order.status == "pending" {
            HStack(spacing: 10) {
                Button {
                    showDenyModal = true
                } label: {
                    Text("Rechazar")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.red.opacity(0.2))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.red, lineWidth: 1)
                        )
                }
                
                Button {
                    processing = true
                    Task {
                        await vm.acceptOrder(id: order.id)
                        processing = false
                    }
                } label: {
                    Text(processing ? "Aceptando..." : "Aceptar")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.green)
                        .cornerRadius(10)
                }
                .disabled(processing)
            }
        } else if order.status == "accepted" || order.status == "preparing" {
            Button {
                processing = true
                Task {
                    await vm.markReady(id: order.id)
                    processing = false
                }
            } label: {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                    Text(processing ? "Marcando..." : "Marcar Listo")
                        .font(.subheadline.bold())
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.green)
                .cornerRadius(10)
            }
            .disabled(processing)
        } else if order.status == "ready" {
            Button {
                processing = true
                Task {
                    await vm.markComplete(id: order.id)
                    processing = false
                }
            } label: {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                    Text(processing ? "Completando..." : "Completar Entrega")
                        .font(.subheadline.bold())
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.blue)
                .cornerRadius(10)
            }
            .disabled(processing)
        }
    }
    
    private func formatCurrency(_ value: String) -> String {
        guard let amount = Double(value) else { return "$0.00" }
        return String(format: "$%.2f", amount)
    }
    
    private func formatTime(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else { return dateString }
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        return timeFormatter.string(from: date)
    }
}

// MARK: - Deny Order Modal

struct DenyOrderModal: View {
    let orderId: String
    @ObservedObject var vm: DeliveryViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedReason = "out_of_items"
    @State private var submitting = false
    
    let reasons = [
        ("out_of_items", "Sin stock"),
        ("store_closed", "Cerrado"),
        ("too_busy", "Muy ocupado"),
        ("other", "Otro motivo"),
    ]
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 24) {
                HStack {
                    Text("Rechazar Pedido")
                        .font(.title2.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundColor(.gray)
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                }
                
                VStack(alignment: .leading, spacing: 12) {
                    Text("Motivo del rechazo:")
                        .font(.subheadline.bold())
                        .foregroundColor(.gray)
                    
                    ForEach(reasons, id: \.0) { reason in
                        Button {
                            selectedReason = reason.0
                        } label: {
                            HStack {
                                Image(systemName: selectedReason == reason.0 ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(selectedReason == reason.0 ? .blue : .gray)
                                Text(reason.1)
                                    .foregroundColor(.white)
                                Spacer()
                            }
                            .padding(12)
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                        }
                    }
                }
                
                Button {
                    submitting = true
                    Task {
                        await vm.denyOrder(id: orderId, reason: selectedReason)
                        submitting = false
                        dismiss()
                    }
                } label: {
                    Text(submitting ? "Rechazando..." : "Confirmar Rechazo")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.red)
                        .cornerRadius(12)
                }
                .disabled(submitting)
                
                Spacer()
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
        .presentationDetents([.medium])
    }
}
