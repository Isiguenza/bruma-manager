import SwiftUI

struct MainTabView: View {
    @ObservedObject var vm: POSViewModel
    @StateObject private var cashVM = CashRegisterViewModel()
    @StateObject private var deliveryVM = DeliveryViewModel()
    
    var body: some View {
        ZStack {
            TabView(selection: $vm.selectedTab) {
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
                    .onChange(of: vm.selectedTab) { _, newValue in
                        if newValue != 1 {
                            cashVM.isAuthenticated = false
                        }
                    }
                
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
                
                // Tab 5: Empleados
                EmployeeSelectionView(vm: vm)
                    .tabItem {
                        Label("Empleados", systemImage: "person.2.fill")
                    }
                    .tag(4)
            }
            .accentColor(.blue)
            
            // Alerta global de delivery (aparece en cualquier tab)
            GlobalDeliveryAlert(vm: deliveryVM)
                .zIndex(999)
        }
        .sheet(isPresented: $vm.showDeliveryDialog) {
            DeliveryInfoDialog(vm: vm)
        }
        // DeliveryView maneja su propio polling, no necesitamos duplicar aqui
    }
    
}
