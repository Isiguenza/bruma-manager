import SwiftUI

/// Tab "Empleados" (admin-only, ver gate en `ComandasRootView.tabsContainer`)
/// — mismo propósito que `EmployeeSelectionView` de Bruma POS (crear/abrir
/// una orden a cuenta de un empleado, "consumo empleados"), pero en lista
/// simple para iPhone en vez del grid de iPad, con un historial de órdenes
/// por empleado agregado aparte (pedido explícito — en iPad ese historial
/// solo existe dentro de Caja, atado a una caja registradora abierta).
struct ComandasEmployeesView: View {
    @ObservedObject var vm: POSViewModel
    @State private var historyEmployee: Employee?

    var body: some View {
        VStack(spacing: 0) {
            header

            if vm.employees.isEmpty {
                emptyState
            } else {
                list
            }
        }
        .background(Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea())
        .task {
            await vm.fetchEmployees()
            await vm.refreshEmployeeActiveOrders()
        }
        .comandasBottomSheet(isPresented: historyEmployee != nil, onDismiss: { historyEmployee = nil }) {
            if let employee = historyEmployee {
                BottomSheetCard(maxHeight: UIScreen.main.bounds.height * 0.75, onDismiss: { historyEmployee = nil }) {
                    ComandasEmployeeHistoryView(vm: vm, employee: employee)
                }
            }
        }
    }

    private var header: some View {
        HStack {
            Text("Empleados").font(.title3.weight(.bold)).foregroundColor(.white)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "person.2").font(.system(size: 40)).foregroundColor(Color(white: 0.35))
            Text("No hay empleados").font(.subheadline).foregroundColor(Color(white: 0.45))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var list: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 10) {
                ForEach(vm.employees) { employee in
                    ComandasEmployeeRow(
                        employee: employee,
                        hasActiveOrder: vm.employeeIdsWithActiveOrders.contains(employee.id),
                        onSelect: {
                            Haptics.tap()
                            vm.handleSelectEmployee(employee)
                        },
                        onHistory: {
                            Haptics.tap()
                            historyEmployee = employee
                        }
                    )
                }
            }
            .padding(16)
        }
        .refreshable {
            await vm.fetchEmployees()
            await vm.refreshEmployeeActiveOrders()
        }
    }
}

// MARK: - Row

private struct ComandasEmployeeRow: View {
    let employee: Employee
    let hasActiveOrder: Bool
    let onSelect: () -> Void
    let onHistory: () -> Void

    private var initials: String {
        let parts = employee.name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(employee.name.prefix(2)).uppercased()
    }

    // Mismo mapeo que EmployeeCardView (Bruma POS/Views/EmployeeSelectionView.swift)
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
        HStack(spacing: 10) {
            Button(action: onSelect) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(roleColor.opacity(0.15)).frame(width: 44, height: 44)
                        Text(initials)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(roleColor)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(employee.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                        HStack(spacing: 4) {
                            Circle().fill(roleColor).frame(width: 6, height: 6)
                            Text(roleLabel)
                                .font(.caption2.weight(.medium))
                                .foregroundColor(roleColor)
                            if hasActiveOrder {
                                Text("· Activa")
                                    .font(.caption2.weight(.bold))
                                    .foregroundColor(.orange)
                            }
                        }
                    }

                    Spacer()
                }
            }
            .buttonStyle(.plain)

            Button(action: onHistory) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.05))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .modifier(FlatCard(cornerRadius: 12))
    }
}

// MARK: - Historial

private struct ComandasEmployeeHistoryView: View {
    @ObservedObject var vm: POSViewModel
    let employee: Employee
    @State private var orders: [Order] = []
    @State private var loading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Historial · \(employee.name)")
                .font(.headline.weight(.bold))
                .foregroundColor(.white)

            if loading {
                ProgressView().tint(.white).frame(maxWidth: .infinity, minHeight: 120)
            } else if orders.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray").font(.system(size: 32)).foregroundColor(Color(white: 0.35))
                    Text("Sin órdenes registradas").font(.subheadline).foregroundColor(Color(white: 0.45))
                }
                .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 8) {
                        ForEach(orders) { order in
                            orderRow(order)
                        }
                    }
                }
            }
        }
        .task {
            loading = true
            orders = (try? await APIService.shared.fetchEmployeeOrders(userId: employee.id)) ?? []
            loading = false
        }
    }

    private func orderRow(_ order: Order) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Orden #\(order.orderNumber)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                Text(formatDate(order.createdAt ?? ""))
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(vm.formatCurrency(Double(order.total ?? "") ?? 0))
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                Text(order.statusLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.gray)
            }
        }
        .padding(12)
        .modifier(FlatCard(cornerRadius: 10))
    }

    private func formatDate(_ dateString: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: dateString) else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date)
    }
}
