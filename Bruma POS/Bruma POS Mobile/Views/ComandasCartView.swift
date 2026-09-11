import SwiftUI

/// Carrito — mismo lenguaje visual y de interacción que `CartView.swift` de
/// Bruma POS (tarjetas de item, stepper de cantidad, botón morfante), pero
/// SIN las partes específicas de iPad que no aplican a una app de solo
/// comandar: sin panel de pago, sin tickets separados, sin órdenes de
/// empleado, sin agrupación visual de promociones (se simplifica a una
/// lista plana — el descuento sigue aplicado al precio, solo no se agrupa
/// visualmente). Lo que sí es innegociable, pedido explícito: los items ya
/// en cocina se ven claramente distintos a los pendientes, igual que POS.
struct ComandasCartView: View {
    @ObservedObject var vm: POSViewModel
    @Binding var isPresented: Bool

    var body: some View {
        VStack(spacing: 0) {
            header

            Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)

            if vm.cart.isEmpty {
                emptyState
            } else {
                itemsList
            }

            footer
        }
        // El éxito de enviar a cocina (haptics + animación + regresar a
        // mesas) se detecta y maneja arriba, en ComandasOrderTakingView, no
        // aquí — así funciona igual sin importar si el carrito sigue abierto
        // o ya se cerró en el momento en que termina el envío.
    }

    private var header: some View {
        HStack {
            Text("Carrito")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)
            Spacer()
            Button {
                Haptics.tap()
                isPresented = false
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.flatCircleNeutral)
        }
        .padding(.bottom, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "cart.badge.plus")
                .font(.system(size: 44, weight: .light))
                .foregroundColor(Color(white: 0.25))
            Text("Carrito vacío")
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(white: 0.45))
            Text("Selecciona productos del menú para comenzar")
                .font(.caption)
                .foregroundColor(Color(white: 0.35))
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity, minHeight: 200)
    }

    // Agrupado por asiento (pedido explícito) — el estado en cocina/pendiente
    // de cada item se sigue viendo claramente a nivel de fila
    // (`sentStatusRow`/`pendingControlsRow`), así que ya no hace falta la
    // súper-sección "En cocina"/"Pendientes" de arriba.
    private var itemsList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 8) {
                ForEach(seatsInCart, id: \.self) { seat in
                    seatSectionLabel(seat)
                    ForEach(Array(vm.cart.enumerated()).filter { $0.element.seat == seat }, id: \.element.id) { index, item in
                        ComandasCartItemRow(item: item, index: index, vm: vm, showCourseBadge: hasMultipleCourses)
                    }
                }
            }
            .padding(.bottom, 12)
        }
    }

    private var seatsInCart: [String] {
        var seen: [String] = []
        for item in vm.cart where !seen.contains(item.seat) {
            seen.append(item.seat)
        }
        return seen.sorted { a, b in
            if a == "C" { return false }
            if b == "C" { return true }
            return (Int(a.dropFirst()) ?? 0) < (Int(b.dropFirst()) ?? 0)
        }
    }

    private var hasMultipleCourses: Bool {
        Set(vm.cart.map { $0.course }).count > 1
    }

    private func seatSectionLabel(_ seat: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: seat == "C" ? "person.2.fill" : "person.fill")
                .font(.caption2)
            Text(seat == "C" ? "Compartido" : "Asiento \(seat)")
                .font(.caption.weight(.semibold))
            Spacer()
        }
        .foregroundColor(.gray)
        .padding(.top, 4)
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 10) {
            if !vm.cart.isEmpty {
                Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)

                HStack {
                    Text("Total").font(.subheadline.weight(.medium)).foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(vm.cartTotal))
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                        .contentTransition(.numericText())
                }

                if hasUnsentItems {
                    sendButton
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                        Text("Todo enviado a cocina").font(.subheadline.weight(.medium)).foregroundColor(.green)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                }

                // Imprimir cuenta: solo admin (pedido explícito — Mobile es
                // "solo comandar", el resto del equipo no debe imprimir).
                if vm.employeeRole == "admin" {
                    printButton
                }
            }
        }
        .padding(.top, 4)
    }

    private var printButton: some View {
        Button {
            Haptics.tap()
            Task { await vm.handlePrint() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "printer.fill").font(.callout)
                Text("Imprimir Cuenta").font(.callout.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.flatCapsule(Color(white: 0.2)))
    }

    private var hasUnsentItems: Bool {
        vm.cart.contains { !$0.sentToKitchen }
    }

    /// Mismo idiom que el botón morfante de Bruma POS: ícono y texto con
    /// `contentTransition`, todo animado junto con un spring — aquí solo
    /// tiene un estado real ("Enviar a Cocina"), a diferencia de POS donde
    /// también morfa a "Marcar listo"/"Pagar" (no aplica, esta app no cobra).
    private var sendButton: some View {
        Button {
            Haptics.tap()
            // handleSendToKitchen NO es async — dispara su propio Task
            // interno y regresa de inmediato; el éxito real se confirma
            // reaccionando a vm.submitting (ver .onChange en el body de
            // ComandasCartView), no aquí mismo.
            vm.handleSendToKitchen()
        } label: {
            HStack(spacing: 8) {
                if vm.submitting {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "flame.fill")
                        .font(.callout)
                        .contentTransition(.symbolEffect(.replace))
                    Text("Enviar a Cocina")
                        .font(.callout.weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .buttonStyle(.flatCapsule(.orange))
        .disabled(vm.submitting)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: vm.submitting)
    }
}

// MARK: - Item row (portado de CartItemRow.swift de Bruma POS)

private struct ComandasCartItemRow: View {
    let item: CartItem
    let index: Int
    @ObservedObject var vm: POSViewModel
    /// Solo se muestra si hay más de un tiempo en uso en todo el carrito —
    /// pedido explícito, para no ensuciar la fila cuando todo va al mismo
    /// tiempo (el caso más común).
    let showCourseBadge: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text("\(item.quantity)×")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.gray)

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.productName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .fixedSize(horizontal: false, vertical: true)

                    if showCourseBadge {
                        Text("T\(item.course)")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.blue)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.blue.opacity(0.15)))
                    }
                }

                Spacer()

                if !item.isGuest {
                    Text(vm.formatCurrency(item.unitPrice) + " c/u")
                        .font(.caption2)
                        .foregroundColor(Color(white: 0.4))
                }
            }

            if let f = item.frostingName { modifierLine(f) }
            if let t = item.dryToppingName { modifierLine(t) }
            if let e = item.extraName { modifierLine(e) }
            ForEach(customModifierLines, id: \.self) { modifierLine($0) }

            if !item.notes.isEmpty {
                HStack(spacing: 4) {
                    Text("↳").font(.caption2).foregroundColor(.orange.opacity(0.8))
                    Text(item.notes).italic().font(.caption2).foregroundColor(.orange.opacity(0.9))
                }
            }

            if item.sentToKitchen {
                sentStatusRow
            } else {
                pendingControlsRow
            }
        }
        .padding(12)
        .modifier(FlatCard(cornerRadius: 10))
        .contextMenu {
            if item.sentToKitchen {
                Text("Item ya enviado a cocina").foregroundColor(.gray)
            } else {
                if vm.selectedTable != nil && vm.guestCount > 0 {
                    Menu {
                        ForEach(1...vm.guestCount, id: \.self) { seatNum in
                            Button {
                                vm.changeSeat(at: index, to: "A\(seatNum)")
                            } label: {
                                HStack {
                                    Text("Asiento A\(seatNum)")
                                    if item.seat == "A\(seatNum)" { Image(systemName: "checkmark") }
                                }
                            }
                        }
                        Button {
                            vm.changeSeat(at: index, to: "C")
                        } label: {
                            HStack {
                                Text("Compartido")
                                if item.seat == "C" { Image(systemName: "checkmark") }
                            }
                        }
                    } label: {
                        Label("Cambiar Asiento", systemImage: "person.fill")
                    }
                }
                Menu {
                    ForEach(1...4, id: \.self) { courseNum in
                        Button {
                            vm.changeCourse(at: index, to: courseNum)
                        } label: {
                            HStack {
                                Text("Tiempo \(courseNum)")
                                if item.course == courseNum { Image(systemName: "checkmark") }
                            }
                        }
                    }
                } label: {
                    Label("Cambiar Tiempo", systemImage: "clock.fill")
                }
                Divider()
                Button(role: .destructive) {
                    vm.removeFromCart(at: index)
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            }
        }
    }

    private func modifierLine(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text("↳").foregroundColor(.gray)
            Text(text)
        }
        .font(.caption2)
        .foregroundColor(Color(white: 0.55))
    }

    private var customModifierLines: [String] {
        guard let cm = item.customModifiers,
              let data = cm.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        var lines: [String] = []
        for key in json.keys.sorted() {
            if let stepDict = json[key] as? [String: Any], let options = stepDict["options"] as? [[String: Any]] {
                for opt in options {
                    if let name = opt["name"] as? String { lines.append(name) }
                }
            }
        }
        return lines
    }

    private var itemTotal: Double {
        item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
    }

    private var sentStatusRow: some View {
        HStack(spacing: 8) {
            if item.deliveredToTable {
                Label("Entregado", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.semibold)).foregroundColor(.blue)
            } else if item.orderStatus == "ready" {
                Label("Listo", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.semibold)).foregroundColor(.green)
            } else {
                Label("En cocina", systemImage: "frying.pan")
                    .font(.caption2.weight(.semibold)).foregroundColor(.orange)
            }
            Spacer()
            Text(vm.formatCurrency(item.isGuest ? 0 : itemTotal))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(item.isGuest ? .gray : .white)
        }
    }

    private var pendingControlsRow: some View {
        HStack(spacing: 8) {
            Button {
                Haptics.tap()
                vm.updateCartQuantity(at: index, delta: -1)
            } label: {
                Image(systemName: "minus").font(.system(size: 12, weight: .semibold)).frame(width: 28, height: 28)
            }
            .buttonStyle(FlatCircleStyle())

            Text("\(item.quantity)")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(minWidth: 24)
                .contentTransition(.numericText())

            Button {
                Haptics.tap()
                vm.updateCartQuantity(at: index, delta: 1)
            } label: {
                Image(systemName: "plus").font(.system(size: 12, weight: .semibold)).frame(width: 28, height: 28)
            }
            .buttonStyle(FlatCircleStyle())

            Spacer()

            Text(vm.formatCurrency(item.isGuest ? 0 : itemTotal))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(item.isGuest ? .gray : .white)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: item.quantity)
    }
}
