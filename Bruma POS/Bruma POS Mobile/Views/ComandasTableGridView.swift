import SwiftUI

/// Rediseño real del grid de mesas para iPhone — no un port 1:1 del de POS
/// (que asume mucho más espacio horizontal). Reusa los datos y la lógica de
/// selección reales de `POSViewModel` (`vm.tables`/`vm.handleSelectTable`),
/// pero con tratamiento visual propio: tarjetas más grandes, press-scale,
/// badges de estado animados de verdad (en POS aparecen sin transición), y
/// tiempo transcurrido en vivo para mesas ocupadas.
///
/// Nota de alcance: solo soporta "Para Llevar" normal
/// (`vm.handleNewDeliveryOrder`), no pedidos de plataforma (Uber/Rappi/Didi)
/// — esos normalmente se crean en el POS físico cuando llega el repartidor,
/// no desde el celular de un mesero. Se puede agregar después si hace falta.
struct ComandasTableGridView: View {
    @ObservedObject var vm: POSViewModel

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    /// `table.number` es un String (viene del backend así, algunas mesas
    /// podrían no ser numéricas) — se ordena numéricamente cuando se puede
    /// parsear como número (1, 2, 3…) y las no-numéricas se van al final,
    /// ordenadas alfabéticamente entre ellas.
    private var sortedTables: [Table] {
        vm.tables.filter { $0.active }.sorted { a, b in
            switch (Int(a.number), Int(b.number)) {
            case let (na?, nb?): return na < nb
            case (nil, .some): return false
            case (.some, nil): return true
            default: return a.number.localizedStandardCompare(b.number) == .orderedAscending
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            if vm.loading && vm.tables.isEmpty {
                Spacer()
                ProgressView().tint(.white)
                Spacer()
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVGrid(columns: columns, spacing: 12) {
                        newParaLlevarCard

                        ForEach(vm.deliveryOrders) { order in
                            ParaLlevarCard(order: order) {
                                Haptics.tap()
                                vm.handleSelectDeliveryOrder(order)
                            }
                        }

                        ForEach(sortedTables) { table in
                            ComandasTableCard(table: table) {
                                Haptics.tap()
                                vm.handleSelectTable(table)
                            }
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 24)
                }
                .refreshable {
                    await vm.refreshTables()
                }
            }
        }
        .sheet(isPresented: $vm.showInitialGuestDialog) {
            GuestCountSheet(guestCount: $vm.tempGuestCount, tableLabel: vm.selectedTable?.displayName ?? "") {
                vm.confirmInitialGuestCount()
            }
            .presentationDetents([.height(320)])
            .presentationDragIndicator(.visible)
        }
        .alert("Nombre del cliente", isPresented: $vm.showCustomerNameDialog) {
            TextField("Nombre", text: $vm.customerName)
            Button("Continuar") { vm.handleConfirmCustomerName() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("¿A nombre de quién va este pedido para llevar?")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Mesas").font(.title3.weight(.bold)).foregroundColor(.white)
                if let name = vm.employeeName {
                    Text(name).font(.caption).foregroundColor(.gray)
                }
            }
            Spacer()
            Button {
                Haptics.tap()
                startPracticeSession()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "graduationcap.fill")
                    Text("Práctica")
                }
                .font(.caption.weight(.semibold))
                .foregroundColor(.purple)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.purple.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            Button {
                Haptics.tap()
                vm.clearSession()
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.red)
                    .padding(8)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// Modo Práctica: reusa el flujo REAL de comandar (mismo producto,
    /// mismo asiento/tiempo, misma impresión y mismo Pase) contra una mesa
    /// oculta dedicada ("PRACTICA", active=false — nunca aparece en este
    /// grid ni en el de iPad) para no inventar un tableId falso que
    /// tronaría en el backend (FK real a `tables`). `vm.isPracticeMode`
    /// etiqueta la orden para que imprima/aparezca en el Pase con el
    /// letrero "MODO PRÁCTICA" y quede excluida de caja/reportes.
    private func startPracticeSession() {
        guard let practiceTable = vm.tables.first(where: { $0.number == "PRACTICA" }) else {
            vm.showToast("Pide a un admin que configure la Mesa de Práctica", isError: true)
            return
        }
        vm.resetPaymentState()
        vm.isHomeDelivery = false
        vm.isEmployeeOrder = false
        vm.selectedEmployee = nil
        vm.selectedTable = practiceTable
        vm.guestCount = practiceTable.capacity > 0 ? practiceTable.capacity : 4
        vm.activeSeat = "A1"
        vm.activeCourse = 1
        vm.customerName = ""
        vm.currentOrderId = nil
        vm.currentOrderNumber = nil
        vm.cart = []
        vm.isPracticeMode = true
        vm.currentScreen = .pos
    }

    private var newParaLlevarCard: some View {
        Button {
            Haptics.tap()
            vm.handleNewDeliveryOrder()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: "bag.badge.plus")
                    .font(.system(size: 28))
                    .foregroundColor(.blue)
                Text("Para Llevar")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                Text("Nueva orden")
                    .font(.caption2)
                    .foregroundColor(.blue.opacity(0.8))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 140)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.blue.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.blue.opacity(0.3), lineWidth: 1))
            )
        }
        .buttonStyle(ComandasPressScaleStyle())
    }
}

/// Botón con press-scale de verdad — gap real que tienen las tarjetas de
/// mesa en Bruma POS (`.buttonStyle(.plain)`, sin feedback táctil visual).
private struct ComandasPressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Table card

private struct ComandasTableCard: View {
    let table: Table
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Text(table.number)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                if table.isOccupied, let order = table.activeOrder {
                    HStack(spacing: 4) {
                        Image(systemName: "person.fill").font(.caption2)
                        Text("\(table.guestCount ?? 1)").font(.caption2.weight(.semibold))
                    }
                    .foregroundColor(.white.opacity(0.85))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.white.opacity(0.12))
                    .clipShape(Capsule())

                    // Tiempo transcurrido en vivo — se actualiza solo, sin
                    // timers propios, vía el estilo .relative de SwiftUI.
                    if let created = ComandasDateParsing.parse(order.createdAt) {
                        Text(created, style: .relative)
                            .font(.caption2)
                            .foregroundColor(.gray)
                            .contentTransition(.numericText())
                    }
                } else {
                    Text("Mesa").font(.caption2).foregroundColor(.gray)
                }

                HStack(spacing: 4) {
                    Circle().fill(table.statusColor).frame(width: 6, height: 6)
                    Text(table.statusLabel)
                        .font(.caption2.weight(.medium))
                        .foregroundColor(table.statusColor)
                }

                badges
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .frame(height: 140)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(table.backgroundColor)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(table.borderColor, lineWidth: 1))
            )
            .opacity(table.isReserved ? 0.55 : 1)
        }
        .buttonStyle(ComandasPressScaleStyle())
        .disabled(table.isReserved)
    }

    @ViewBuilder
    private var badges: some View {
        HStack(spacing: 4) {
            if table.activeOrder?.onHold == true {
                badge("En espera", color: .red, icon: "pause.fill")
            }
            if table.activeOrder?.priority == 1 {
                badge("Rush", color: .orange, icon: "flame.fill")
            }
            if table.activeOrder?.status == "ready" {
                badge("Listo", color: .green, icon: "checkmark.circle.fill")
            }
        }
        // Animación de verdad al aparecer/desaparecer — en POS estos badges
        // saltan sin transición.
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: table.activeOrder?.status)
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: table.activeOrder?.onHold)
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: table.activeOrder?.priority)
    }

    private func badge(_ label: String, color: Color, icon: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 8))
            Text(label).font(.system(size: 9, weight: .bold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(color.opacity(0.85))
        .clipShape(Capsule())
        .transition(.scale.combined(with: .opacity))
    }
}

// MARK: - Para llevar card

private struct ParaLlevarCard: View {
    let order: Order
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "bag.fill").font(.caption).foregroundColor(.green)
                    Text(order.customerName ?? "Sin nombre")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                }
                HStack {
                    Text("#\(order.orderNumber)").font(.caption2).foregroundColor(.gray)
                    Spacer()
                    if let count = order.items?.count {
                        Text("\(count) items").font(.caption2).foregroundColor(.green.opacity(0.8))
                    }
                }
                Spacer()
                HStack(spacing: 4) {
                    Circle().fill(Color.green).frame(width: 6, height: 6)
                    Text("Activa").font(.caption2.weight(.semibold)).foregroundColor(.white)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.green.opacity(0.85))
                .clipShape(Capsule())
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 140)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.green.opacity(0.08))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.green.opacity(0.3), lineWidth: 1))
            )
        }
        .buttonStyle(ComandasPressScaleStyle())
    }
}

// MARK: - Guest count sheet

private struct GuestCountSheet: View {
    @Binding var guestCount: Int
    let tableLabel: String
    let onConfirm: () -> Void

    var body: some View {
        ZStack {
            Color(white: 0.08).ignoresSafeArea()
            VStack(spacing: 24) {
                Text(tableLabel.isEmpty ? "¿Cuántas personas?" : "\(tableLabel) — ¿Cuántas personas?")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)

                HStack(spacing: 24) {
                    Button {
                        Haptics.tap()
                        if guestCount > 1 { guestCount -= 1 }
                    } label: {
                        Image(systemName: "minus").font(.title.weight(.semibold)).frame(width: 56, height: 56)
                    }
                    .buttonStyle(FlatCircleStyle())

                    Text("\(guestCount)")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(width: 80)
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: guestCount)

                    Button {
                        Haptics.tap()
                        if guestCount < 20 { guestCount += 1 }
                    } label: {
                        Image(systemName: "plus").font(.title.weight(.semibold)).frame(width: 56, height: 56)
                    }
                    .buttonStyle(FlatCircleStyle(fill: .blue, bordered: false))
                }

                Button {
                    Haptics.tap()
                    onConfirm()
                } label: {
                    Text("Confirmar").font(.headline).frame(maxWidth: .infinity).frame(height: 52)
                }
                .buttonStyle(.flatCapsule(.blue))
                .padding(.horizontal, 32)
            }
            .padding()
        }
    }
}

/// `Order.createdAt`/`ActiveOrder.createdAt` llegan como string ISO8601 del
/// backend — este helper los parsea una sola vez por celda.
enum ComandasDateParsing {
    private static let formatter = ISO8601DateFormatter()
    static func parse(_ string: String?) -> Date? {
        guard let string else { return nil }
        return formatter.date(from: string)
    }
}
