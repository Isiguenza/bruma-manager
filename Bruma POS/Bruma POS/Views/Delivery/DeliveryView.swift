import SwiftUI

struct DeliveryView: View {
    @ObservedObject var vm: DeliveryViewModel
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 16) {
                    HStack {
                        Text("Pedidos Delivery")
                            .font(.title.bold())
                            .foregroundColor(.white)
                        
                        if vm.pendingCount > 0 {
                            Text("\(vm.pendingCount)")
                                .font(.caption.bold())
                                .foregroundColor(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.red)
                                .clipShape(Capsule())
                        }
                        
                        Spacer()
                        
                        // Auto-accept toggle
                        Button {
                            vm.toggleAutoAccept()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: vm.autoAccept ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(vm.autoAccept ? .green : .gray)
                                Text("Auto-aceptar")
                                    .font(.subheadline.bold())
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color(white: 0.1))
                            .cornerRadius(8)
                        }
                    }
                    
                    // Filters
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            filterButton("Todos", value: "all")
                            filterButton("Pendientes", value: "pending")
                            filterButton("Preparando", value: "preparing")
                            filterButton("Listos", value: "ready")
                            filterButton("Completados", value: "completed")
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 16)
                
                Rectangle()
                    .fill(Color(white: 0.1))
                    .frame(height: 1)
                
                // Content
                if vm.loading {
                    Spacer()
                    ProgressView()
                        .tint(.white)
                    Spacer()
                } else if vm.filteredOrders.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "box.truck")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("No hay pedidos")
                            .font(.headline)
                            .foregroundColor(.gray)
                        Text("de delivery")
                            .font(.subheadline)
                            .foregroundColor(Color(white: 0.4))
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(vm.filteredOrders) { order in
                                DeliveryOrderCard(order: order, vm: vm)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 100)
                    }
                }
            }
            
            // New Order Notification
            if vm.showNewOrderNotification, let order = vm.newOrder {
                NewOrderNotificationModal(order: order, vm: vm)
                    .transition(.scale.combined(with: .opacity))
                    .zIndex(100)
            }
            
            // Toast
            if let toast = vm.toastMessage {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Image(systemName: vm.toastIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundColor(vm.toastIsError ? .red : .green)
                        Text(toast)
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color(white: 0.15))
                    .cornerRadius(10)
                    .padding(.bottom, 100)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(), value: vm.toastMessage)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await vm.loadOrders(showLoading: true)
            // Poll for new orders every 10 seconds (sin loading)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                await vm.loadOrders(showLoading: false)
            }
        }
    }
    
    private func filterButton(_ label: String, value: String) -> some View {
        Button {
            vm.statusFilter = value
        } label: {
            Text(label)
                .font(.caption.bold())
                .foregroundColor(vm.statusFilter == value ? .black : .white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(vm.statusFilter == value ? Color.white : Color(white: 0.1))
                .cornerRadius(8)
        }
    }
}
