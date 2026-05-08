import SwiftUI

struct NewOrderNotificationModal: View {
    let order: DeliveryOrder
    @ObservedObject var vm: DeliveryViewModel
    @State private var scale: CGFloat = 0.8
    
    var body: some View {
        ZStack {
            // Blur background
            Color.black.opacity(0.8)
                .ignoresSafeArea()
                .onTapGesture {
                    vm.showNewOrderNotification = false
                }
            
            // Modal content
            VStack(spacing: 24) {
                // Platform logo/icon
                ZStack {
                    Circle()
                        .fill(vm.platformColor(order.platform))
                        .frame(width: 80, height: 80)
                    
                    Image(systemName: "box.truck.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.white)
                }
                .shadow(color: vm.platformColor(order.platform).opacity(0.5), radius: 20)
                
                // Title
                VStack(spacing: 8) {
                    Text("¡Nuevo Pedido!")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    
                    Text(vm.platformName(order.platform))
                        .font(.headline)
                        .foregroundColor(vm.platformColor(order.platform))
                }
                
                // Order info
                VStack(spacing: 12) {
                    infoRow(icon: "person.fill", label: "Cliente", value: order.customerName)
                    
                    if let phone = order.customerPhone {
                        infoRow(icon: "phone.fill", label: "Teléfono", value: phone)
                    }
                    
                    infoRow(icon: "dollarsign.circle.fill", label: "Total", value: formatCurrency(order.total))
                    
                    if let pickupTime = order.estimatedPickupTime {
                        infoRow(icon: "clock.fill", label: "Recoger", value: formatTime(pickupTime))
                    }
                }
                .padding(16)
                .background(Color(white: 0.1))
                .cornerRadius(12)
                
                // Auto-accept indicator
                if vm.autoAccept {
                    HStack(spacing: 8) {
                        ProgressView()
                            .tint(.green)
                        Text("Aceptando automáticamente...")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.vertical, 8)
                }
                
                // Action buttons
                if !vm.autoAccept {
                    HStack(spacing: 12) {
                        Button {
                            vm.showNewOrderNotification = false
                        } label: {
                            Text("Ver Después")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color(white: 0.15))
                                .cornerRadius(12)
                        }
                        
                        Button {
                            Task {
                                await vm.acceptOrder(id: order.id)
                                vm.showNewOrderNotification = false
                            }
                        } label: {
                            Text("Aceptar Ahora")
                                .font(.headline.bold())
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color.green)
                                .cornerRadius(12)
                        }
                    }
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(white: 0.08))
                    .shadow(color: .black.opacity(0.5), radius: 30)
            )
            .padding(.horizontal, 40)
            .scaleEffect(scale)
            .onAppear {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                    scale = 1.0
                }
            }
        }
    }
    
    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.white)
                .frame(width: 32)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.gray)
                Text(value)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
            }
            
            Spacer()
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
