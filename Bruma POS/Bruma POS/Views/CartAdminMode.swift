import SwiftUI

// Modo admin del carrito: lo que antes pasaba dentro del modal del Menú Admin
// ahora se hace sobre el carrito real. El estado y la lógica viven en
// POSViewModel (`cartAdminAction` y compañía); aquí solo las piezas de UI:
// el aviso de arriba del carrito, la barra que reemplaza al pie, el aviso del
// menú de productos al reemplazar y el PIN final.

extension CartAdminAction {
    var color: Color {
        switch self {
        case .delete: return .red
        case .guest: return .blue
        case .replace: return .orange
        case .customModifier: return .purple
        }
    }

    var icon: String {
        switch self {
        case .delete: return "trash.fill"
        case .guest: return "gift.fill"
        case .replace: return "arrow.2.circlepath"
        case .customModifier: return "plus.circle.fill"
        }
    }

    /// Modos en los que cada renglón lleva casilla.
    var usesCheckboxes: Bool { self != .replace }
}

// MARK: - Aviso arriba del carrito

struct CartAdminBanner: View {
    @ObservedObject var vm: POSViewModel
    let action: CartAdminAction

    private var instruction: String {
        switch action {
        case .delete: return "Toca los platillos a eliminar."
        case .guest: return "Toca los platillos a invitar."
        case .customModifier: return "Toca un platillo, o no elijas ninguno para cobrarlo aparte en la cuenta."
        case .replace:
            if vm.replacementTarget == nil { return "Toca el platillo (o el incluido de un paquete) que vas a cambiar." }
            return "Ahora elige en el menú el producto nuevo."
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: action.icon)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(action.color))
                VStack(alignment: .leading, spacing: 2) {
                    Text(action.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                    Text(instruction)
                        .font(.caption)
                        .foregroundColor(Color(white: 0.65))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            if action == .replace, let target = vm.replacementTarget {
                replacementTargetRow(target)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(action.color.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(action.color.opacity(0.35), lineWidth: 1))
        )
    }

    @ViewBuilder
    private func replacementTargetRow(_ target: CartItem) -> some View {
        let isChild = target.parentLocalId != nil
        let isPackage = !isChild && vm.cart.contains { $0.parentLocalId == target.id }
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("Cambiando:")
                    .font(.caption2)
                    .foregroundColor(Color(white: 0.55))
                Text(target.productName)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
            }
            if isChild {
                Text("Incluido del paquete: el nuevo también va incluido ($0).")
                    .font(.caption2)
                    .foregroundColor(Color(white: 0.55))
            } else if isPackage {
                Text("Se cambia el paquete completo con sus incluidos.")
                    .font(.caption2)
                    .foregroundColor(Color(white: 0.55))
            } else if target.quantity > 1 {
                HStack(spacing: 10) {
                    Text("¿Cuántos?")
                        .font(.caption)
                        .foregroundColor(Color(white: 0.7))
                    Spacer()
                    Button {
                        vm.replacementQuantity = max(1, vm.replacementQuantity - 1)
                    } label: {
                        Image(systemName: "minus").font(.system(size: 12, weight: .semibold)).frame(width: 28, height: 28)
                    }
                    .buttonStyle(.flatCircleNeutral)
                    .disabled(vm.replacementQuantity <= 1)
                    Text("\(vm.replacementQuantity) de \(target.quantity)")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .frame(minWidth: 52)
                    Button {
                        vm.replacementQuantity = min(target.quantity, vm.replacementQuantity + 1)
                    } label: {
                        Image(systemName: "plus").font(.system(size: 12, weight: .semibold)).frame(width: 28, height: 28)
                    }
                    .buttonStyle(.flatCircleNeutral)
                    .disabled(vm.replacementQuantity >= target.quantity)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.black.opacity(0.25)))
    }
}

// MARK: - Barra que reemplaza al pie del carrito

struct CartAdminFooter: View {
    @ObservedObject var vm: POSViewModel
    let action: CartAdminAction

    private let quickReasons = ["Error del mesero", "Cambio de cliente", "No disponible", "Producto equivocado"]

    private var selectedCount: Int {
        action == .delete ? vm.cartAdminSelection.values.reduce(0, +) : vm.cartAdminSelection.count
    }

    var body: some View {
        VStack(spacing: 12) {
            switch action {
            case .delete:
                if vm.cartAdminSelectionHasSentItems { reasonPicker }
            case .customModifier:
                modifierFields
            case .replace:
                Text(vm.replacementTarget == nil
                     ? "Elige primero el platillo a cambiar."
                     : "Al terminar el platillo nuevo se pide el PIN.")
                    .font(.caption)
                    .foregroundColor(Color(white: 0.55))
                    .frame(maxWidth: .infinity, alignment: .leading)
            case .guest:
                EmptyView()
            }

            HStack(spacing: 12) {
                Button {
                    vm.exitCartAdmin()
                } label: {
                    Text("Cancelar")
                        .font(.callout.weight(.semibold))
                        .frame(maxWidth: action == .replace ? .infinity : 110)
                        .frame(height: 52)
                }
                .buttonStyle(.flatCapsuleNeutral)
                .disabled(vm.cartAdminProcessing)

                if action != .replace {
                    Button {
                        vm.requestCartAdminConfirm()
                    } label: {
                        HStack(spacing: 8) {
                            if vm.cartAdminProcessing {
                                ProgressView().tint(.white)
                            }
                            Text(confirmLabel)
                                .font(.callout.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                    }
                    .buttonStyle(.flatCapsule(action.color))
                    .disabled(!vm.canConfirmCartAdmin || vm.cartAdminProcessing)
                    .opacity(vm.canConfirmCartAdmin ? 1 : 0.45)
                }
            }
        }
    }

    private var confirmLabel: String {
        switch action {
        case .delete: return "Eliminar (\(selectedCount))"
        case .guest: return "Invitar (\(selectedCount))"
        case .customModifier:
            if let id = vm.cartAdminSelection.keys.first, let item = vm.cart.first(where: { $0.id == id }) {
                return "Agregar a \(item.productName)"
            }
            return "Cobrar aparte en la cuenta"
        case .replace: return ""
        }
    }

    private var reasonPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Razón (ya se mandó a cocina)")
                .font(.caption)
                .foregroundColor(.gray)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(quickReasons, id: \.self) { reason in
                        Button {
                            vm.cartAdminReason = reason
                        } label: {
                            Text(reason)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(vm.cartAdminReason == reason ? Color.red : Color.white.opacity(0.08)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            TextField("Otra razón...", text: $vm.cartAdminReason)
                .font(.subheadline)
                .foregroundColor(.white)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(white: 0.06))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.1)))
                )
        }
    }

    private var modifierFields: some View {
        HStack(spacing: 8) {
            TextField("Nombre (ej. doble queso)", text: $vm.cartAdminModifierLabel)
                .font(.subheadline)
                .foregroundColor(.white)
                .padding(10)
                .background(fieldBackground)
            HStack(spacing: 4) {
                Text("$").foregroundColor(.gray)
                TextField("0.00", text: $vm.cartAdminModifierAmount)
                    .keyboardType(.decimalPad)
                    .foregroundColor(.white)
            }
            .font(.subheadline)
            .padding(10)
            .frame(width: 96)
            .background(fieldBackground)
        }
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color(white: 0.06))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.1)))
    }
}

// MARK: - Aviso del menú de productos (reemplazo)

struct ReplacementProductBanner: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.2.circlepath")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.orange)
            if let target = vm.replacementTarget {
                Text("Elige el producto que reemplaza a \(Text(target.productName).foregroundColor(.white).bold())")
                    .foregroundColor(Color(white: 0.75))
            } else {
                Text("Toca en el carrito el platillo a reemplazar")
                    .foregroundColor(Color(white: 0.75))
            }
            Spacer(minLength: 8)
            Button("Cancelar") { vm.exitCartAdmin() }
                .font(.caption.weight(.semibold))
                .buttonStyle(.flatCapsuleNeutral)
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.orange.opacity(0.12))
        .overlay(alignment: .bottom) { Rectangle().fill(Color.orange.opacity(0.35)).frame(height: 1) }
    }
}

// MARK: - PIN final

struct CartAdminPinDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var pin = ""
    @State private var verifying = false
    @State private var showError = false

    private var action: CartAdminAction? { vm.cartAdminAction }

    private var summary: String? {
        guard let action else { return nil }
        switch action {
        case .replace:
            guard let target = vm.replacementTarget, let first = vm.pendingReplacementItems?.first else { return nil }
            let extra = (vm.pendingReplacementItems?.count ?? 1) > 1 ? " (paquete)" : ""
            return "\(target.productName) → \(first.productName)\(extra)"
        case .delete:
            let count = vm.cartAdminSelection.values.reduce(0, +)
            return "\(count) platillo(s) a eliminar"
        case .guest:
            return "\(vm.cartAdminSelection.count) platillo(s) a invitar"
        case .customModifier:
            return "\(vm.cartAdminModifierLabel) · \(vm.formatCurrency(vm.cartAdminModifierAmountValue))"
        }
    }

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 6) {
                Text("PIN de admin")
                    .font(.title3.bold())
                    .foregroundColor(.white)
                if let summary {
                    Text(summary)
                        .font(.subheadline)
                        .foregroundColor(Color(white: 0.7))
                        .multilineTextAlignment(.center)
                }
                if showError {
                    Text("PIN incorrecto o sin permisos de admin")
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }

            HStack(spacing: 24) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < pin.count ? Color.white : Color(white: 0.25))
                        .frame(width: 16, height: 16)
                }
            }

            PinNumpadView(
                onNumber: { digit in
                    guard pin.count < 4, !verifying else { return }
                    pin.append(digit)
                    if pin.count == 4 { verify() }
                },
                onClear: { pin = "" },
                onBackspace: { if !pin.isEmpty { pin.removeLast() } }
            )
            .disabled(verifying)

            Button {
                vm.cancelCartAdminPin()
            } label: {
                Text("Cancelar")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .buttonStyle(.plain)
        }
        .padding(28)
        .frame(maxWidth: 380)
        .background(Color(white: 0.09))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 20)
    }

    private func verify() {
        showError = false
        verifying = true
        let entered = pin
        Task {
            let isAdmin: Bool
            do {
                let employee = try await APIService.shared.verifyPin(pin: entered)
                isAdmin = employee.role == "admin" || employee.role == "manager"
            } catch {
                isAdmin = false
            }
            verifying = false
            pin = ""
            if isAdmin {
                await vm.confirmCartAdminAction()
            } else {
                withAnimation { showError = true }
            }
        }
    }
}
