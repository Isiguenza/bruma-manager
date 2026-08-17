import SwiftUI

// Total de una línea del carrito ya con promo aplicada (precio de línea completa).
private func lineTotal(_ item: CartItem) -> Double {
    (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)
}

// Precio por unidad, prorrateado sobre el total de línea (consistente con
// cómo el backend reparte subtotales al partir un item entre tickets).
private func perUnitTotal(_ item: CartItem) -> Double {
    guard item.quantity > 0 else { return 0 }
    return lineTotal(item) / Double(item.quantity)
}

// MARK: - Split Bill Mode View

struct SplitBillModeView: View {
    @ObservedObject var vm: POSViewModel

    private var centroItemCount: Int {
        vm.cart.filter { $0.seat == "C" }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Dividir en Tickets")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "payment"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    // Info summary
                    HStack(spacing: 14) {
                        Image(systemName: "person.2.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(vm.guestCount) asiento\(vm.guestCount == 1 ? "" : "s")")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                            Text("\(vm.cart.count) producto\(vm.cart.count == 1 ? "" : "s") · \(centroItemCount) centro")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        Text(vm.formatCurrency(vm.cartTotal))
                            .font(.headline.weight(.bold))
                            .foregroundColor(.white)
                    }
                    .padding(16)
                    .modifier(FlatCard())

                    // Por Asiento
                    splitModeRow(
                        title: "Por Asiento",
                        subtitle: "Agrupa lo que ya está marcado A1, A2… — solo confirmas el centro",
                        icon: "person.crop.rectangle.stack.fill",
                        color: .blue
                    ) {
                        vm.initSplitBySeat()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-seat-assign"
                        }
                    }

                    // Personalizado
                    splitModeRow(
                        title: "Personalizado",
                        subtitle: "Tú eliges qué va a cada asiento, item por item (y cuántos si hay varios)",
                        icon: "hand.tap.fill",
                        color: .purple
                    ) {
                        vm.initSplitCustom()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-assign"
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }

    /// Fila compacta de una línea (icono + título + subtítulo + chevron) en
    /// vez de la tarjeta grande con círculo de color de 56px que había antes.
    @ViewBuilder
    private func splitModeRow(title: String, subtitle: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(color)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(color.opacity(0.16)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(white: 0.4))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 15)
        }
        .buttonStyle(.flatCapsuleNeutral)
    }
}

// MARK: - Quantity Stepper (para líneas con cantidad > 1)

/// Fila reusable para asignar cuántas unidades de un item le tocan al
/// asiento/ticket actual, cuando el item tiene cantidad > 1. Con cantidad 1
/// se comporta como un simple on/off.
private struct QuantityAssignRow: View {
    @ObservedObject var vm: POSViewModel
    let cartIndex: Int
    let personIndex: Int
    var accentColor: Color = .blue

    private var item: CartItem { vm.cart[cartIndex] }

    private var assignedHere: Int {
        vm.itemAssignments[personIndex]?[cartIndex] ?? 0
    }

    private var assignedElsewhere: Int {
        vm.itemAssignments
            .filter { $0.key != personIndex }
            .reduce(0) { $0 + ($1.value[cartIndex] ?? 0) }
    }

    private var availableToAssign: Int {
        max(0, item.quantity - assignedElsewhere - assignedHere)
    }

    private func setAssigned(_ qty: Int) {
        if qty <= 0 {
            vm.itemAssignments[personIndex]?.removeValue(forKey: cartIndex)
        } else {
            vm.itemAssignments[personIndex, default: [:]][cartIndex] = qty
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName)
                    .font(.subheadline)
                    .foregroundColor(.white)
                if item.quantity > 1 {
                    Text("\(assignedHere) de \(item.quantity) asignados aquí")
                        .font(.caption2)
                        .foregroundColor(.gray)
                } else if item.seat == "C" {
                    Text("Centro")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.orange)
                }
            }

            Spacer()

            Text(vm.formatCurrency(perUnitTotal(item) * Double(assignedHere)))
                .font(.caption.weight(.semibold))
                .foregroundColor(.gray)

            if item.quantity > 1 {
                HStack(spacing: 6) {
                    Button {
                        setAssigned(assignedHere - 1)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundColor(assignedHere > 0 ? .red.opacity(0.8) : .white.opacity(0.15))
                    }
                    .buttonStyle(.plain)
                    .disabled(assignedHere <= 0)

                    Text("\(assignedHere)")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 18)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: assignedHere)

                    Button {
                        Haptics.tap()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            setAssigned(assignedHere + 1)
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(availableToAssign > 0 ? accentColor : .white.opacity(0.15))
                    }
                    .buttonStyle(.plain)
                    .disabled(availableToAssign <= 0)
                }
            } else {
                Button {
                    Haptics.tap()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        setAssigned(assignedHere > 0 ? 0 : 1)
                    }
                } label: {
                    Image(systemName: assignedHere > 0 ? "checkmark.square.fill" : "square")
                        .font(.title3)
                        .foregroundColor(assignedHere > 0 ? accentColor : (assignedElsewhere > 0 ? .white.opacity(0.2) : .gray))
                }
                .buttonStyle(.plain)
                .disabled(assignedElsewhere > 0)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(assignedHere > 0 ? accentColor.opacity(0.1) : Color.white.opacity(0.04))
        )
    }
}

// MARK: - Split Seat View (Por Asiento)

struct SplitSeatView: View {
    @ObservedObject var vm: POSViewModel

    private var allAssignedCartIndices: Set<Int> {
        Set(vm.itemAssignments.values.flatMap { $0.keys })
    }

    // Items del centro que todavía tienen cantidad sin repartir entre asientos.
    private var centroItemsWithRemaining: [Int] {
        vm.cart.indices.filter { ci in
            guard vm.cart[ci].seat == "C" else { return false }
            let assigned = vm.itemAssignments.values.reduce(0) { $0 + ($1[ci] ?? 0) }
            return assigned < vm.cart[ci].quantity
        }
    }

    private func seatTotal(_ seatIndex: Int) -> Double {
        (vm.itemAssignments[seatIndex] ?? [:]).reduce(0.0) { sum, entry in
            let (ci, qty) = entry
            guard ci < vm.cart.count else { return sum }
            return sum + perUnitTotal(vm.cart[ci]) * Double(qty)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Por Asiento")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-bill-mode"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 4)

            // Seat tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<vm.guestCount, id: \.self) { idx in
                        let isSelected = vm.currentPersonIndex == idx
                        let count = (vm.itemAssignments[idx] ?? [:]).values.reduce(0, +)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                vm.currentPersonIndex = idx
                            }
                        } label: {
                            VStack(spacing: 2) {
                                Text("A\(idx + 1)")
                                    .font(.subheadline.weight(.semibold))
                                Text("\(count)")
                                    .font(.caption2.weight(.medium))
                                    .opacity(0.7)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                        }
                        .modifier(FlatPill(isSelected: isSelected, color: .blue))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    let currentIdx = vm.currentPersonIndex
                    let assigned = vm.itemAssignments[currentIdx] ?? [:]

                    // Seat items card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Asiento \(currentIdx + 1)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                            Spacer()
                            Text(vm.formatCurrency(seatTotal(currentIdx)))
                                .font(.headline.weight(.bold))
                                .foregroundColor(seatTotal(currentIdx) > 0 ? .blue : .gray)
                        }

                        if assigned.isEmpty {
                            HStack {
                                Image(systemName: "tray")
                                    .foregroundColor(.gray.opacity(0.5))
                                Text("Sin items asignados")
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 12)
                        } else {
                            ForEach(assigned.keys.sorted(), id: \.self) { ci in
                                if ci < vm.cart.count {
                                    QuantityAssignRow(vm: vm, cartIndex: ci, personIndex: currentIdx, accentColor: .blue)
                                }
                            }
                        }

                        if !assigned.isEmpty {
                            Button {
                                Task { await vm.printSeatPreAccount(seatIndex: currentIdx) }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "printer.fill")
                                    Text("Imprimir Pre-cuenta A\(currentIdx + 1)")
                                        .font(.subheadline.weight(.medium))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                            }
                            .buttonStyle(.flatCapsuleNeutral)
                        }
                    }
                    .padding(16)
                    .modifier(FlatCard())

                    // Centro — items con cantidad sin repartir
                    if !centroItemsWithRemaining.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 6) {
                                Image(systemName: "circle.grid.2x2.fill")
                                    .foregroundColor(.orange)
                                Text("Centro — sin asignar (\(centroItemsWithRemaining.count))")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.orange)
                            }

                            ForEach(centroItemsWithRemaining, id: \.self) { ci in
                                CentroAssignRow(vm: vm, cartIndex: ci)
                            }
                        }
                        .padding(16)
                        .modifier(FlatCardTinted(color: .orange))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)

            // Footer
            VStack(spacing: 10) {
                if !centroItemsWithRemaining.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundColor(.orange)
                        Text("\(centroItemsWithRemaining.count) producto\(centroItemsWithRemaining.count == 1 ? "" : "s") del centro sin asignar")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-tickets-confirm"
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Continuar")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                }
                .buttonStyle(.flatCapsule(.green))
                .disabled(allAssignedCartIndices.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(
                LinearGradient(
                    colors: [Color.clear, Color(white: 0.02).opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }
}

/// Fila de un item del centro sin repartir, con un menú para ir sumando
/// unidades a cada asiento (soporta partir una línea con cantidad > 1).
private struct CentroAssignRow: View {
    @ObservedObject var vm: POSViewModel
    let cartIndex: Int

    private var item: CartItem { vm.cart[cartIndex] }
    private var assignedTotal: Int {
        vm.itemAssignments.values.reduce(0) { $0 + ($1[cartIndex] ?? 0) }
    }
    private var remaining: Int { max(0, item.quantity - assignedTotal) }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName)
                    .font(.subheadline)
                    .foregroundColor(.white)
                Text("\(remaining) de \(item.quantity) por asignar")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            Spacer()
            Text(vm.formatCurrency(perUnitTotal(item) * Double(item.quantity)))
                .font(.caption.weight(.semibold))
                .foregroundColor(.gray)

            Menu {
                ForEach(0..<vm.guestCount, id: \.self) { seatIdx in
                    Button("+1 a Asiento \(seatIdx + 1)") {
                        let current = vm.itemAssignments[seatIdx]?[cartIndex] ?? 0
                        vm.itemAssignments[seatIdx, default: [:]][cartIndex] = current + 1
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.right.circle.fill")
                    Text("Asignar")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(Color.orange.opacity(0.25))
                        .overlay(Capsule().stroke(Color.orange.opacity(0.4)))
                )
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.orange.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.orange.opacity(0.15)))
        )
    }
}

// MARK: - Split Assign View (Personalizado)

struct SplitAssignView: View {
    @ObservedObject var vm: POSViewModel

    private var currentSeat: Int { vm.currentPersonIndex }

    private var allAssignedCartIndices: Set<Int> {
        Set(vm.itemAssignments.values.flatMap { $0.keys })
    }

    private func seatTotal(_ idx: Int) -> Double {
        (vm.itemAssignments[idx] ?? [:]).reduce(0.0) { sum, entry in
            let (ci, qty) = entry
            guard ci < vm.cart.count else { return sum }
            return sum + perUnitTotal(vm.cart[ci]) * Double(qty)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Personalizado")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-bill-mode"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 42)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 4)

            // Seat tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<vm.guestCount, id: \.self) { idx in
                        let isSelected = vm.currentPersonIndex == idx
                        let count = (vm.itemAssignments[idx] ?? [:]).values.reduce(0, +)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                vm.currentPersonIndex = idx
                            }
                        } label: {
                            VStack(spacing: 2) {
                                Text("A\(idx + 1)")
                                    .font(.subheadline.weight(.semibold))
                                Text("\(count)")
                                    .font(.caption2.weight(.medium))
                                    .opacity(0.7)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                        }
                        .modifier(FlatPill(isSelected: isSelected, color: .purple))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Asiento \(currentSeat + 1)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                            Spacer()
                            let t = seatTotal(currentSeat)
                            if t > 0 {
                                Text(vm.formatCurrency(t))
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(.purple)
                            }
                        }

                        ForEach(Array(vm.cart.enumerated()), id: \.element.id) { cartIdx, _ in
                            QuantityAssignRow(vm: vm, cartIndex: cartIdx, personIndex: currentSeat, accentColor: .purple)
                        }

                        let currentAssigned = vm.itemAssignments[currentSeat] ?? [:]
                        if !currentAssigned.isEmpty {
                            Button {
                                Task { await vm.printSeatPreAccount(seatIndex: currentSeat) }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "printer.fill")
                                    Text("Imprimir Pre-cuenta A\(currentSeat + 1)")
                                        .font(.subheadline.weight(.medium))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                            }
                            .buttonStyle(.flatCapsuleNeutral)
                        }
                    }
                    .padding(16)
                    .modifier(FlatCard())
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)

            // Footer
            let totalAssigned = vm.itemAssignments.values.reduce(0) { $0 + $1.values.reduce(0, +) }
            let totalUnits = vm.cart.reduce(0) { $0 + $1.quantity }
            let unassigned = totalUnits - totalAssigned
            VStack(spacing: 10) {
                if unassigned > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Text("\(unassigned) unidad\(unassigned == 1 ? "" : "es") sin asignar")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-tickets-confirm"
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.right.circle.fill")
                        Text("Continuar")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                }
                .buttonStyle(.flatCapsule(.purple))
                .disabled(allAssignedCartIndices.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(
                LinearGradient(
                    colors: [Color.clear, Color(white: 0.02).opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }
}
