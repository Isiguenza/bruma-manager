import SwiftUI

struct MainTabView: View {
    @ObservedObject var vm: POSViewModel
    @StateObject private var cashVM = CashRegisterViewModel()
    
    var body: some View {
        TabView(selection: $vm.selectedTab) {
            // Tab 1: Mesas (Table Selection) — la única visible para un
            // empleado sin rol admin.
            TableSelectionView(vm: vm)
                .tabItem {
                    Label("Mesas", systemImage: "table.furniture.fill")
                }
                .tag(0)

            // Tabs admin-only: Caja, Reservas, Promociones y Empleados desaparecen del
            // TabView si el rol deja de ser admin (el onChange de abajo
            // regresa la selección a Mesas en ese caso).
            if vm.employeeRole == "admin" {
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

                // Tab 4: Promociones
                PromotionsView(vm: vm)
                    .tabItem {
                        Label("Promociones", systemImage: "tag.fill")
                    }
                    .tag(3)

                // Tab 5: Empleados
                EmployeeSelectionView(vm: vm)
                    .tabItem {
                        Label("Empleados", systemImage: "person.2.fill")
                    }
                    .tag(4)
            }
        }
        .accentColor(.blue)
        .onChange(of: vm.employeeRole) { _, newRole in
            if newRole != "admin" && vm.selectedTab != 0 {
                vm.selectedTab = 0
                cashVM.isAuthenticated = false
            }
        }
    }
    
}
