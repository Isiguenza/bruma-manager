import SwiftUI

struct MainTabView: View {
    @ObservedObject var vm: POSViewModel
    @StateObject private var cashVM = CashRegisterViewModel()
    @StateObject private var deliveryVM = DeliveryViewModel()
    
    @State private var selectedTab = 0
    @State private var showPinModal = false
    @State private var cashTabAuthorized = false
    
    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                // Tab 1: Mesas (Table Selection)
                TableSelectionView(vm: vm)
                    .tabItem {
                        Label("Mesas", systemImage: "table.furniture.fill")
                    }
                    .tag(0)
                
                // Tab 2: Caja (Cash Register)
                CashRegisterView(vm: cashVM, posVM: vm)
                    .tabItem {
                        Label("Caja", systemImage: "dollarsign.circle.fill")
                    }
                    .tag(1)
                
                // Tab 3: Reservas
                ReservationsView()
                    .tabItem {
                        Label("Reservas", systemImage: "calendar")
                    }
                    .tag(2)
                
                // Tab 4: Delivery
                DeliveryView(vm: deliveryVM)
                    .tabItem {
                        Label("Delivery", systemImage: "box.truck.fill")
                    }
                    .tag(3)
            }
            .accentColor(.blue)
            .onChange(of: selectedTab) { oldValue, newValue in
                if newValue == 1 && !cashTabAuthorized {
                    // Intentando acceder a Caja sin autorización
                    showPinModal = true
                    // Volver a la tab anterior
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        selectedTab = oldValue
                    }
                }
            }
            
            // Alerta global de delivery (aparece en cualquier tab)
            GlobalDeliveryAlert(vm: deliveryVM)
                .zIndex(999)
        }
        .sheet(isPresented: $showPinModal) {
            CashRegisterPinModal(vm: vm, onSuccess: {
                showPinModal = false
                cashTabAuthorized = true
                selectedTab = 1
            }, onCancel: {
                showPinModal = false
            })
        }
        .sheet(isPresented: $vm.showDeliveryDialog) {
            DeliveryInfoDialog(vm: vm)
        }
        .task {
            // Polling global para delivery orders
            await deliveryVM.loadOrders(showLoading: false)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                await deliveryVM.loadOrders(showLoading: false)
            }
        }
    }
    
}
