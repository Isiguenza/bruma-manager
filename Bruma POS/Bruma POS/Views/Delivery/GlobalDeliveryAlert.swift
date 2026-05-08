import SwiftUI

struct GlobalDeliveryAlert: View {
    @ObservedObject var vm: DeliveryViewModel
    
    var body: some View {
        if vm.showNewOrderNotification, let order = vm.newOrder {
            ZStack {
                // Fondo oscuro
                Color.black.opacity(0.95)
                    .ignoresSafeArea()
                
                VStack(spacing: 40) {
                    // Contador de pedidos
                    VStack(spacing: 16) {
                        Text("\(vm.pendingCount)")
                            .font(.system(size: 120, weight: .bold))
                            .foregroundColor(.white)
                        
                        Text(vm.pendingCount == 1 ? "nuevo pedido" : "nuevos pedidos")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.8))
                    }
                    
                    // Detalles del pedido
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Image(systemName: "box.truck.fill")
                                .font(.title2)
                                .foregroundColor(.white)
                            Text(vm.platformName(order.platform))
                                .font(.title3.bold())
                                .foregroundColor(.white)
                        }
                        
                        Divider()
                            .background(Color.white.opacity(0.3))
                        
                        HStack {
                            Text(order.customerName)
                                .font(.headline)
                                .foregroundColor(.white)
                            Spacer()
                            Text(formatCurrency(order.total))
                                .font(.title3.bold())
                                .foregroundColor(.white)
                        }
                        
                        if let address = order.deliveryAddress {
                            Text(address)
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.7))
                                .lineLimit(2)
                        }
                    }
                    .padding(24)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(16)
                    .padding(.horizontal, 40)
                    
                    // Botones
                    if !vm.autoAccept {
                        HStack(spacing: 20) {
                            Button {
                                vm.showNewOrderNotification = false
                            } label: {
                                Text("Ver después")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 20)
                                    .background(Color.white.opacity(0.2))
                                    .cornerRadius(12)
                            }
                            
                            Button {
                                Task {
                                    await vm.acceptOrder(id: order.id)
                                    vm.showNewOrderNotification = false
                                }
                            } label: {
                                Text("Aceptar")
                                    .font(.headline.bold())
                                    .foregroundColor(.black)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 20)
                                    .background(Color.white)
                                    .cornerRadius(12)
                            }
                        }
                        .padding(.horizontal, 40)
                    } else {
                        HStack(spacing: 12) {
                            ProgressView()
                                .tint(.white)
                            Text("Aceptando automáticamente...")
                                .font(.headline)
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.3), value: vm.showNewOrderNotification)
        }
    }
    
    private func formatCurrency(_ value: String) -> String {
        guard let amount = Double(value) else { return "$0.00" }
        return String(format: "$%.2f", amount)
    }
}
