import SwiftUI

struct MainTabView: View {
    @ObservedObject var vm: POSViewModel
    @StateObject private var cashVM = CashRegisterViewModel()
    
    var body: some View {
        TabView(selection: $vm.selectedTab) {
            // Tab 1: Mesas (Table Selection) — visible para cualquier empleado.
            TableSelectionView(vm: vm)
                .tabItem {
                    Label("Mesas", systemImage: "table.furniture.fill")
                }
                .tag(0)

            // Tab 2: Reservas — igual que Mesas, visible para cualquier
            // empleado (no requiere admin).
            ReservationsView()
                .tabItem {
                    Label("Reservas", systemImage: "calendar")
                }
                .tag(1)

            // Tabs admin-only: Caja, Promociones y Empleados desaparecen del
            // TabView si el rol deja de ser admin (el onChange de abajo
            // regresa la selección a Mesas en ese caso).
            if vm.employeeRole == "admin" {
                // Tab 3: Caja (Cash Register)
                CashRegisterView(vm: cashVM, posVM: vm)
                    .tabItem {
                        Label("Caja", systemImage: "dollarsign.circle.fill")
                    }
                    .tag(2)
                    .onChange(of: vm.selectedTab) { _, newValue in
                        if newValue != 2 {
                            cashVM.isAuthenticated = false
                        }
                    }

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
            // Mesas (0) y Reservas (1) siguen disponibles para cualquier rol —
            // solo hay que regresar a Mesas si el empleado estaba en una tab
            // admin-only (Caja/Promociones/Empleados) cuando perdió el rol.
            if newRole != "admin" && vm.selectedTab > 1 {
                vm.selectedTab = 0
                cashVM.isAuthenticated = false
            }
        }
    }
    
}
