import SwiftUI

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
                Text("Dividir Cuenta")
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
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glass)
                .clipShape(Capsule())
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
                    .modifier(GlassCard())

                    // Por Asiento
                    Button {
                        vm.initSplitBySeat()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-seat-assign"
                        }
                    } label: {
                        HStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(Color.blue.opacity(0.15))
                                    .frame(width: 56, height: 56)
                                Image(systemName: "person.crop.rectangle.stack.fill")
                                    .font(.title2)
                                    .foregroundColor(.blue)
                            }
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Por Asiento")
                                    .font(.headline.weight(.semibold))
                                    .foregroundColor(.white)
                                Text("Items asignados automáticamente por asiento. Los del centro se asignan manualmente.")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.gray)
                        }
                        .padding(18)
                    }
                    .modifier(GlassCardTinted(color: .blue))

                    // Personalizado
                    Button {
                        vm.initSplitCustom()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-assign"
                        }
                    } label: {
                        HStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(Color.purple.opacity(0.15))
                                    .frame(width: 56, height: 56)
                                Image(systemName: "hand.tap.fill")
                                    .font(.title2)
                                    .foregroundColor(.purple)
                            }
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Personalizado")
                                    .font(.headline.weight(.semibold))
                                    .foregroundColor(.white)
                                Text("Elige manualmente qué items paga cada asiento. No es necesario asignar todos.")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.gray)
                        }
                        .padding(18)
                    }
                    .modifier(GlassCardTinted(color: .purple))
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }
}

// MARK: - Split Seat View (Por Asiento)

struct SplitSeatView: View {
    @ObservedObject var vm: POSViewModel

    private var centroIndices: [Int] {
        vm.cart.indices.filter { vm.cart[$0].seat == "C" }
    }

    private var allAssignedIndices: Set<Int> {
        Set(vm.itemAssignments.values.flatMap { $0 })
    }

    private var unassignedCentroIndices: [Int] {
        let assigned = allAssignedIndices
        return centroIndices.filter { !assigned.contains($0) }
    }

    private func seatTotal(_ seatIndex: Int) -> Double {
        (vm.itemAssignments[seatIndex] ?? []).reduce(0.0) { sum, ci in
            guard ci < vm.cart.count else { return sum }
            let item = vm.cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0))
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
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glass)
                .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 4)

            // Seat tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<vm.guestCount, id: \.self) { idx in
                        let isSelected = vm.currentPersonIndex == idx
                        let count = (vm.itemAssignments[idx] ?? []).count
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
                            .padding(.vertical, 8)
                        }
                        .modifier(GlassPill(isSelected: isSelected, color: .blue))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    let currentIdx = vm.currentPersonIndex
                    let assigned = vm.itemAssignments[currentIdx] ?? []

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
                            ForEach(assigned, id: \.self) { ci in
                                if ci < vm.cart.count {
                                    let item = vm.cart[ci]
                                    HStack(spacing: 10) {
                                        Button {
                                            vm.itemAssignments[currentIdx]?.removeAll { $0 == ci }
                                        } label: {
                                            Image(systemName: "minus.circle.fill")
                                                .font(.title3)
                                                .foregroundColor(.red.opacity(0.75))
                                        }
                                        .buttonStyle(.plain)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("\(item.quantity)x \(item.productName)")
                                                .font(.subheadline)
                                                .foregroundColor(.white)
                                            if item.seat == "C" {
                                                Text("Centro")
                                                    .font(.caption2.weight(.semibold))
                                                    .foregroundColor(.orange)
                                            }
                                        }
                                        Spacer()
                                        let t = (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)
                                        Text(vm.formatCurrency(t))
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundColor(.white)
                                    }
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(Color.white.opacity(0.04))
                                    )
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
                                .frame(height: 40)
                            }
                            .buttonStyle(.glass)
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Unassigned centro items
                    if !unassignedCentroIndices.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 6) {
                                Image(systemName: "circle.grid.2x2.fill")
                                    .foregroundColor(.orange)
                                Text("Centro — sin asignar (\(unassignedCentroIndices.count))")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.orange)
                            }

                            ForEach(unassignedCentroIndices, id: \.self) { ci in
                                if ci < vm.cart.count {
                                    let item = vm.cart[ci]
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("\(item.quantity)x \(item.productName)")
                                                .font(.subheadline)
                                                .foregroundColor(.white)
                                        }
                                        Spacer()
                                        Text(vm.formatCurrency(item.unitPrice * Double(item.quantity)))
                                            .font(.caption.weight(.semibold))
                                            .foregroundColor(.gray)

                                        Menu {
                                            ForEach(0..<vm.guestCount, id: \.self) { seatIdx in
                                                Button("Asiento \(seatIdx + 1)") {
                                                    vm.itemAssignments[seatIdx, default: []].append(ci)
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
                        }
                        .padding(16)
                        .modifier(GlassCardTinted(color: .orange))
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
                if !unassignedCentroIndices.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundColor(.orange)
                        Text("\(unassignedCentroIndices.count) producto\(unassignedCentroIndices.count == 1 ? "" : "s") del centro sin asignar")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-overview"
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Continuar al Cobro")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(.white)
                }
                .buttonStyle(.glassProminent)
                .tint(.green)
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

// MARK: - Split Assign View (Personalizado)

struct SplitAssignView: View {
    @ObservedObject var vm: POSViewModel

    private var currentSeat: Int { vm.currentPersonIndex }

    private func seatTotal(_ idx: Int) -> Double {
        (vm.itemAssignments[idx] ?? []).reduce(0.0) { sum, ci in
            guard ci < vm.cart.count else { return sum }
            let item = vm.cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0))
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
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glass)
                .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 4)

            // Seat tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<vm.guestCount, id: \.self) { idx in
                        let isSelected = vm.currentPersonIndex == idx
                        let count = (vm.itemAssignments[idx] ?? []).count
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
                            .padding(.vertical, 8)
                        }
                        .modifier(GlassPill(isSelected: isSelected, color: .purple))
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

                        ForEach(Array(vm.cart.enumerated()), id: \.element.id) { cartIdx, item in
                            let assignedNow = (vm.itemAssignments[currentSeat] ?? []).contains(cartIdx)
                            let assignedOther = vm.itemAssignments
                                .filter { $0.key != currentSeat }
                                .flatMap { $0.value }
                                .contains(cartIdx)
                            let itemTotal = (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)

                            Button {
                                guard !assignedOther else { return }
                                if assignedNow {
                                    vm.itemAssignments[currentSeat]?.removeAll { $0 == cartIdx }
                                } else {
                                    vm.itemAssignments[currentSeat, default: []].append(cartIdx)
                                }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: assignedNow ? "checkmark.square.fill" : "square")
                                        .font(.title3)
                                        .foregroundColor(
                                            assignedNow ? .purple : (assignedOther ? .white.opacity(0.2) : .gray)
                                        )

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(item.quantity)x \(item.productName)")
                                            .font(.subheadline)
                                            .foregroundColor(assignedOther ? .white.opacity(0.3) : .white)
                                        if assignedOther {
                                            Text("Asignado a otro asiento")
                                                .font(.caption2)
                                                .foregroundColor(.gray.opacity(0.5))
                                        }
                                    }

                                    Spacer()

                                    Text(vm.formatCurrency(itemTotal))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(
                                            assignedNow ? .purple : (assignedOther ? .gray.opacity(0.3) : .gray)
                                        )
                                }
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(assignedNow ? Color.purple.opacity(0.1) : Color.white.opacity(0.03))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(assignedNow ? Color.purple.opacity(0.3) : Color.white.opacity(0.06))
                                        )
                                )
                                .opacity(assignedOther ? 0.45 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(assignedOther)
                        }

                        let currentAssigned = vm.itemAssignments[currentSeat] ?? []
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
                                .frame(height: 40)
                            }
                            .buttonStyle(.glass)
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)

            // Footer
            let totalAssigned = vm.itemAssignments.values.flatMap { $0 }.count
            let unassigned = vm.cart.count - totalAssigned
            VStack(spacing: 10) {
                if unassigned > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Text("\(unassigned) producto\(unassigned == 1 ? "" : "s") sin asignar")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-overview"
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.right.circle.fill")
                        Text("Continuar al Cobro")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(.white)
                }
                .buttonStyle(.glassProminent)
                .tint(.purple)
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

// MARK: - Split Overview View

struct SplitOverviewView: View {
    @ObservedObject var vm: POSViewModel

    private var seatIndices: [Int] { Array(0..<vm.guestCount) }

    private var totalPaid: Double {
        vm.individualPayments.values.reduce(0) { $0 + ($1.paid ? $1.amount : 0) }
    }

    private var remaining: Double {
        max(0, vm.cartTotal - totalPaid)
    }

    private var seatsWithItems: [Int] {
        (0..<vm.guestCount).filter { !(vm.itemAssignments[$0] ?? []).isEmpty }
    }

    private var allPaid: Bool {
        !seatsWithItems.isEmpty && seatsWithItems.allSatisfy { vm.individualPayments[$0]?.paid == true }
    }

    private func seatTotal(_ idx: Int) -> Double {
        (vm.itemAssignments[idx] ?? []).reduce(0.0) { sum, ci in
            guard ci < vm.cart.count else { return sum }
            let item = vm.cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Cobro Dividido")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = vm.splitBillType == "by-seat" ? "split-seat-assign" : "split-assign"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Editar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glass)
                .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    // Totals bar
                    HStack(spacing: 10) {
                        overviewBadge("Total", vm.formatCurrency(vm.cartTotal), .white)
                        overviewBadge("Pagado", vm.formatCurrency(totalPaid), .green)
                        overviewBadge("Restante", vm.formatCurrency(remaining), remaining > 0.01 ? .orange : .green)
                    }

                    // Seat cards
                    ForEach(seatIndices, id: \.self) { idx in
                        SeatOverviewCard(vm: vm, idx: idx, subtotal: seatTotal(idx))
                    }

                    // Finalize section
                    if allPaid {
                        VStack(spacing: 14) {
                            HStack(spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 30))
                                    .foregroundColor(.green)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Todos los asientos pagaron")
                                        .font(.headline.weight(.semibold))
                                        .foregroundColor(.green)
                                    Text("Total cobrado: \(vm.formatCurrency(totalPaid))")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                Spacer()
                            }
                            .padding(16)
                            .modifier(GlassCard())

                            Button {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                                    vm.paymentStep = "split-bill-confirmation"
                                }
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.circle.fill")
                                    Text("Confirmar Pago")
                                        .font(.headline.weight(.semibold))
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 56)
                                .foregroundStyle(.white)
                            }
                            .buttonStyle(.glassProminent)
                            .tint(.green)
                        }
                    }

                    // Cancel
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "payment"
                        }
                    } label: {
                        Text("Cancelar cobro dividido")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.gray)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.glass)
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .frame(maxWidth: 520)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
    }

    @ViewBuilder
    private func overviewBadge(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
            Text(value)
                .font(.headline.weight(.bold))
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .modifier(GlassCard())
    }
}

// MARK: - Seat Overview Card

private struct SeatOverviewCard: View {
    @ObservedObject var vm: POSViewModel
    let idx: Int
    let subtotal: Double

    private var payment: IndividualPayment? { vm.individualPayments[idx] }
    private var hasPaid: Bool { payment?.paid == true }
    private var assignedItems: [Int] { vm.itemAssignments[idx] ?? [] }
    private var hasItems: Bool { !assignedItems.isEmpty }

    private var card: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(
                        hasPaid ? Color.green.opacity(0.18) :
                        hasItems ? Color.blue.opacity(0.12) :
                        Color.white.opacity(0.05)
                    )
                    .frame(width: 44, height: 44)
                Image(systemName: hasPaid ? "checkmark.circle.fill" : (hasItems ? "person.fill" : "person"))
                    .font(.body.weight(.semibold))
                    .foregroundColor(hasPaid ? .green : (hasItems ? .blue : .gray))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("Asiento \(idx + 1)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                Text(hasItems ? "\(assignedItems.count) producto\(assignedItems.count == 1 ? "" : "s")" : "Sin items")
                    .font(.caption)
                    .foregroundColor(.gray)
            }

            Spacer()

            if hasItems {
                VStack(alignment: .trailing, spacing: 3) {
                    Text(vm.formatCurrency(hasPaid ? (payment?.amount ?? 0) : subtotal))
                        .font(.headline.weight(.bold))
                        .foregroundColor(.white)
                    Text(hasPaid ? "Pagado" : "Pendiente")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(hasPaid ? .green : .orange)
                }

                if !hasPaid {
                    Button {
                        Task { await vm.printSeatPreAccount(seatIndex: idx) }
                    } label: {
                        Image(systemName: "printer.fill")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.glass)

                    Button {
                        vm.selectedSplitPersonIndex = idx
                        vm.splitPaymentMethod = nil
                        vm.splitTipPaymentMethod = nil
                        vm.splitCashReceived = ""
                        vm.splitPersonDiscountAmount = 0
                        vm.splitPersonDiscountName = ""
                        vm.individualTips[idx] = IndividualTip()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                            vm.paymentStep = "split-pay-person"
                        }
                    } label: {
                        Text("Cobrar")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.blue)
                }
            }
        }
        .padding(14)
        .opacity(hasItems ? 1 : 0.4)
    }

    @ViewBuilder
    var body: some View {
        card.modifier(GlassCard())
    }
}

// MARK: - Split Pay Person View

struct SplitPayPersonView: View {
    @ObservedObject var vm: POSViewModel

    @State private var showDiscountInput = false

    private var pIdx: Int { vm.selectedSplitPersonIndex }
    private var assignedItems: [Int] { vm.itemAssignments[pIdx] ?? [] }

    private var subtotal: Double {
        assignedItems.reduce(0.0) { sum, ci in
            guard ci < vm.cart.count else { return sum }
            let item = vm.cart[ci]
            return sum + ((item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0))
        }
    }

    private var tipData: IndividualTip { vm.individualTips[pIdx] ?? IndividualTip() }

    private var tipAmt: Double {
        tipData.showCustom ? (Double(tipData.custom) ?? 0) : subtotal * Double(tipData.percentage) / 100
    }

    private var finalTotal: Double {
        max(0, subtotal + tipAmt - vm.splitPersonDiscountAmount)
    }

    private var canProceed: Bool {
        guard vm.splitPaymentMethod != nil else { return false }
        if vm.splitPaymentMethod == "cash" {
            return (Double(vm.splitCashReceived) ?? 0) >= finalTotal
        }
        return true
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Asiento \(pIdx + 1)")
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                    Text("Cuenta dividida")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                        vm.paymentStep = "split-overview"
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glass)
                .clipShape(Capsule())
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    // Items list
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Productos")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gray)
                            .textCase(.uppercase)

                        ForEach(assignedItems, id: \.self) { ci in
                            if ci < vm.cart.count {
                                let item = vm.cart[ci]
                                HStack {
                                    Text("\(item.quantity)x \(item.productName)")
                                        .font(.subheadline)
                                        .foregroundColor(.white)
                                    Spacer()
                                    let t = (item.originalPrice ?? item.unitPrice) * Double(item.quantity) - (item.promotionDiscount ?? 0)
                                    Text(vm.formatCurrency(t))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Payment method
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Método de pago")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gray)
                            .textCase(.uppercase)

                        HStack(spacing: 8) {
                            payMethodBtn("cash", "Efectivo", "banknote.fill", Color(red: 0, green: 0.54, blue: 0.2))
                            payMethodBtn("terminal_mercadopago", "Terminal", "creditcard.fill", Color(red: 0.12, green: 0.43, blue: 0.95))
                            payMethodBtn("transfer", "Transfer.", "building.columns.fill", Color(red: 0.34, green: 0.29, blue: 0.87))
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Tip
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Propina")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gray)
                            .textCase(.uppercase)

                        HStack(spacing: 8) {
                            ForEach([0, 10, 15, 20], id: \.self) { pct in
                                Button {
                                    vm.individualTips[pIdx] = IndividualTip(percentage: pct, custom: "", showCustom: false)
                                } label: {
                                    Text(pct == 0 ? "Sin" : "\(pct)%")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.white)
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 44)
                                }
                                .buttonStyle(.glassProminent)
                                .tint(tipData.percentage == pct && !tipData.showCustom ? .blue : Color(.systemGray5))
                            }
                            Button {
                                vm.individualTips[pIdx] = IndividualTip(percentage: 0, custom: "", showCustom: true)
                            } label: {
                                Text("Otro")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 44)
                            }
                            .buttonStyle(.glassProminent)
                            .tint(tipData.showCustom ? .blue : Color(.systemGray5))
                        }

                        if tipData.showCustom {
                            TextField("0.00", text: Binding(
                                get: { tipData.custom },
                                set: { vm.individualTips[pIdx]?.custom = $0 }
                            ))
                            .keyboardType(.decimalPad)
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.white.opacity(0.04))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1)))
                            )
                        }

                        // Tip payment method
                        if let method = vm.splitPaymentMethod, method != "cash", tipAmt > 0 {
                            Divider().background(Color.white.opacity(0.1))
                            Text("¿Cómo se paga la propina?")
                                .font(.caption)
                                .foregroundColor(.gray)
                            HStack(spacing: 8) {
                                tipMethodBtn(method, "En \(methodLabel(method))", .blue)
                                tipMethodBtn("cash", "En efectivo", .green)
                            }
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Cash received
                    if vm.splitPaymentMethod == "cash" {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Efectivo recibido")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.gray)
                                .textCase(.uppercase)

                            TextField("0.00", text: $vm.splitCashReceived)
                                .keyboardType(.decimalPad)
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                                .padding(16)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(Color.white.opacity(0.04))
                                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1)))
                                )

                            if let cash = Double(vm.splitCashReceived), cash > 0 {
                                HStack {
                                    Text("Cambio")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                    Spacer()
                                    Text(vm.formatCurrency(max(0, cash - finalTotal)))
                                        .font(.headline.weight(.bold))
                                        .foregroundColor(cash >= finalTotal ? .green : .red)
                                }
                                .padding(12)
                                .modifier(cash >= finalTotal ? GlassCardTinted(color: .green) : GlassCardTinted(color: .red))
                            }
                        }
                        .padding(16)
                        .modifier(GlassCard())
                    }

                    // Discount
                    if !vm.availableDiscounts.isEmpty {
                        HStack {
                            Text("Descuento")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.gray)
                                .textCase(.uppercase)
                            Spacer()
                            discountMenu
                        }
                        .padding(16)
                        .modifier(GlassCard())
                    }

                    // Totals
                    VStack(spacing: 10) {
                        totalRow("Subtotal", vm.formatCurrency(subtotal), .white)
                        if vm.splitPersonDiscountAmount > 0 {
                            totalRow(
                                vm.splitPersonDiscountName.isEmpty ? "Descuento" : vm.splitPersonDiscountName,
                                "-\(vm.formatCurrency(vm.splitPersonDiscountAmount))",
                                .yellow
                            )
                        }
                        if tipAmt > 0 {
                            totalRow("Propina", vm.formatCurrency(tipAmt), .blue)
                        }
                        Divider().background(Color.white.opacity(0.12))
                        HStack {
                            Text("Total")
                                .font(.title3.weight(.semibold))
                                .foregroundColor(.white)
                            Spacer()
                            Text(vm.formatCurrency(finalTotal))
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(16)
                    .modifier(GlassCard())

                    // Confirm
                    SlideToConfirmView {
                        vm.handleSplitPayPerson()
                    }
                    .disabled(!canProceed)
                    .opacity(canProceed ? 1 : 0.5)
                    .padding(.horizontal, 4)
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .frame(maxWidth: 500)
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
        }
        .onChange(of: vm.showFlexibleDiscountDialog) { _, showing in
            if !showing, let discount = vm.selectedDiscount, discount.type == "flexible", vm.paymentStep == "split-pay-person" {
                vm.splitPersonDiscountAmount = vm.flexibleDiscountAmount
                vm.splitPersonDiscountName = discount.name
                vm.selectedDiscount = nil
            }
        }
    }

    private func methodLabel(_ method: String) -> String {
        switch method {
        case "cash": return "Efectivo"
        case "transfer": return "Transferencia"
        case "terminal_mercadopago": return "Terminal"
        default: return method
        }
    }

    @ViewBuilder
    private func payMethodBtn(_ method: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        let isSelected = vm.splitPaymentMethod == method
        Button {
            vm.splitPaymentMethod = method
            if method != "cash" { vm.splitCashReceived = "" }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.body)
                Text(label)
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .buttonStyle(.glassProminent)
        .tint(isSelected ? color : Color(.systemGray5))
    }

    @ViewBuilder
    private func tipMethodBtn(_ method: String, _ label: String, _ color: Color) -> some View {
        let current = vm.splitTipPaymentMethod ?? vm.splitPaymentMethod
        let isSelected = current == method
        Button {
            vm.splitTipPaymentMethod = method
        } label: {
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
        }
        .buttonStyle(.glassProminent)
        .tint(isSelected ? color : Color(.systemGray5))
    }

    @ViewBuilder
    private func totalRow(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundColor(.gray)
            Spacer()
            Text(value).font(.subheadline.weight(.semibold)).foregroundColor(color)
        }
    }

    private func discountLabel(_ d: Discount) -> String {
        switch d.type {
        case "percentage": return "\(Int(d.value))%"
        case "fixed_amount": return "\(Int(d.value))"
        default: return "Flexible"
        }
    }

    @ViewBuilder
    private var discountMenu: some View {
        let content = Menu {
            Button("Sin descuento") {
                vm.splitPersonDiscountAmount = 0
                vm.splitPersonDiscountName = ""
            }
            ForEach(vm.availableDiscounts) { discount in
                Button {
                    if discount.type == "flexible" {
                        vm.selectedDiscount = discount
                        vm.showFlexibleDiscountDialog = true
                    } else {
                        vm.splitPersonDiscountName = discount.name
                        switch discount.type {
                        case "percentage":
                            vm.splitPersonDiscountAmount = subtotal * discount.value / 100
                        case "fixed_amount":
                            vm.splitPersonDiscountAmount = discount.value
                        default:
                            break
                        }
                    }
                } label: {
                    Text("\(discount.name) (\(discountLabel(discount)))")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "tag.fill")
                    .font(.caption)
                Text(vm.splitPersonDiscountAmount > 0 ? vm.splitPersonDiscountName : "Descuento")
                    .font(.caption.weight(.medium))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }

        if vm.splitPersonDiscountAmount > 0 {
            content
                .buttonStyle(.glassProminent)
                .tint(.orange)
        } else {
            content
                .buttonStyle(.glass)
        }
    }
}
