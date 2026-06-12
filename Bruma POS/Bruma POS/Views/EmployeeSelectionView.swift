import SwiftUI

struct EmployeeSelectionView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                header
                
                // Grid
                ScrollView {
                    if vm.loadingEmployees {
                        ProgressView()
                            .tint(.white)
                            .padding(.top, 60)
                    } else if vm.employees.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "person.2.slash")
                                .font(.system(size: 40))
                                .foregroundColor(.gray)
                            Text("No hay empleados")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        .padding(.top, 60)
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12)
                        ], spacing: 12) {
                            ForEach(vm.employees) { employee in
                                let hasActive = vm.employeeIdsWithActiveOrders.contains(employee.id)
                                EmployeeCardView(
                                    employee: employee,
                                    hasActiveOrder: hasActive
                                ) {
                                    vm.handleSelectEmployee(employee)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 50)
                    }
                }
                .refreshable {
                    await vm.fetchData()
                }
            }
        }
        .onAppear {
            Task {
                await vm.refreshEmployeeActiveOrders()
            }
        }
        .task {
            if vm.employees.isEmpty {
                await vm.fetchEmployees()
            }
        }
    }
    
    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Consumo Empleados")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Text("Selecciona un empleado para crear una orden")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }
}

// MARK: - Employee Card

struct EmployeeCardView: View {
    let employee: Employee
    let hasActiveOrder: Bool
    let action: () -> Void
    
    private var initials: String {
        let parts = employee.name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(employee.name.prefix(2)).uppercased()
    }
    
    private var roleLabel: String {
        switch employee.role {
        case "admin": return "Admin"
        case "manager": return "Gerente"
        case "cashier": return "Cajero"
        case "waiter", "mesero": return "Mesero"
        case "cocinero": return "Cocinero"
        case "bartender": return "Bartender"
        case "ayudante_general": return "Ayudante"
        default: return employee.role.capitalized
        }
    }
    
    private var roleColor: Color {
        switch employee.role {
        case "admin", "manager": return .purple
        case "cashier": return .blue
        case "waiter", "mesero": return .green
        case "cocinero": return .orange
        case "bartender": return .cyan
        default: return .gray
        }
    }
    
    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 8) {
                    Text(initials)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(roleColor)
                    
                    Text(employee.name)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    HStack(spacing: 4) {
                        Circle()
                            .fill(roleColor)
                            .frame(width: 6, height: 6)
                        Text(roleLabel)
                            .font(.caption2.weight(.medium))
                            .foregroundColor(roleColor)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 120)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.white.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(hasActiveOrder ? roleColor.opacity(0.6) : Color.white.opacity(0.1), lineWidth: hasActiveOrder ? 2 : 1)
                        )
                )
                
                if hasActiveOrder {
                    HStack(spacing: 3) {
                        Circle()
                            .fill(Color.orange)
                            .frame(width: 7, height: 7)
                        Text("Activa")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.orange)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.12))
                    .clipShape(Capsule())
                    .padding(8)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
