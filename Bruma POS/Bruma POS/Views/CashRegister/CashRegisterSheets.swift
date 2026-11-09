import SwiftUI

// Hojas inferiores de la tab de Caja — mismo `BottomSheetCard` que el cobro
// (propina/efectivo/confirmar). Se montan con `.bottomSheet(...)` en
// `CashRegisterView`, así que siempre están en el árbol: cada hoja limpia su
// estado al cerrarse (onChange de `isPresented`), no al desmontarse.

private let accentBlue = Color(red: 30/255, green: 110/255, blue: 244/255)

/// Campo de monto en cápsula — mismo look que "Efectivo recibido" del cobro.
private struct AmountField: View {
    let placeholder: String
    @Binding var text: String
    var focus: FocusState<Bool>.Binding

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
            .focused(focus)
            .font(.system(size: 28, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .frame(height: 64)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.05))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1)))
            )
    }
}

/// Chips de opción rápida (motivos, porcentajes).
private struct QuickChips: View {
    let options: [String]
    let selected: String?
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { option in
                    Button {
                        Haptics.tap()
                        onSelect(option)
                    } label: {
                        Text(option)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .frame(height: 40)
                    }
                    .buttonStyle(selected == option ? .flatCapsule(accentBlue) : .flatCapsuleNeutral)
                }
            }
        }
    }
}

private struct SheetTitle: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3.weight(.semibold))
                .foregroundColor(color)
                .frame(width: 44, height: 44)
                .background(Circle().fill(color.opacity(0.15)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
        }
    }
}

private func parseAmount(_ text: String) -> Double? {
    Double(text.replacingOccurrences(of: ",", with: ""))
}

// MARK: - Depósito / Sangría

struct CashMovementSheet: View {
    enum Kind {
        case deposit, withdrawal

        var title: String { self == .deposit ? "Depósito a caja" : "Sangría de caja" }
        var subtitle: String { self == .deposit ? "Entra efectivo al cajón" : "Sale efectivo del cajón" }
        var icon: String { self == .deposit ? "arrow.down.circle.fill" : "arrow.up.circle.fill" }
        var color: Color { self == .deposit ? Color(red: 0, green: 137/255, blue: 50/255) : .orange }
        var reasons: [String] {
            self == .deposit
                ? ["Cambio", "Fondo extra", "Reposición"]
                : ["Proveedor", "Insumos", "Gas", "Propinas", "Caja fuerte"]
        }
        var defaultDescription: String { self == .deposit ? "Ingreso a caja" : "Sangría de caja" }
        var buttonTitle: String { self == .deposit ? "Registrar depósito" : "Registrar sangría" }
    }

    let kind: Kind
    let isPresented: Bool
    @ObservedObject var vm: CashRegisterViewModel
    let registerId: String
    let userId: String?
    let onDismiss: () -> Void

    @State private var amount = ""
    @State private var reason: String?
    @State private var detail = ""
    @State private var submitting = false
    @FocusState private var amountFocused: Bool

    private var amountValue: Double? {
        guard let value = parseAmount(amount), value > 0 else { return nil }
        return value
    }

    var body: some View {
        BottomSheetCard(onDismiss: onDismiss) {
            SheetTitle(icon: kind.icon, color: kind.color, title: kind.title, subtitle: kind.subtitle)

            AmountField(placeholder: "$0.00", text: $amount, focus: $amountFocused)

            VStack(alignment: .leading, spacing: 8) {
                Text("Motivo")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                QuickChips(options: kind.reasons, selected: reason) { option in
                    reason = reason == option ? nil : option
                }
                TextField("Detalle (opcional)", text: $detail)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 44)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.05))
                            .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                    )
            }

            Button {
                submit()
            } label: {
                HStack(spacing: 8) {
                    if submitting { ProgressView().tint(.white) }
                    Text(amountValue.map { "\(kind.buttonTitle) · \(vm.formatCurrency($0))" } ?? kind.buttonTitle)
                }
                .font(.headline.weight(.bold))
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(accentBlue))
            .disabled(amountValue == nil || userId == nil || submitting)
            .padding(.top, 4)
        }
        .onChange(of: isPresented) { _, open in
            if open {
                amountFocused = true
            } else {
                amountFocused = false
                amount = ""
                reason = nil
                detail = ""
            }
        }
    }

    private func submit() {
        guard let value = amountValue, let userId else { return }
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        let description = [reason, trimmed.isEmpty ? nil : trimmed]
            .compactMap { $0 }
            .joined(separator: " · ")
        submitting = true
        Task {
            switch kind {
            case .deposit:
                await vm.deposit(registerId: registerId, amount: value, userId: userId, description: description.isEmpty ? kind.defaultDescription : description)
            case .withdrawal:
                await vm.withdraw(registerId: registerId, amount: value, userId: userId, description: description.isEmpty ? kind.defaultDescription : description)
            }
            submitting = false
        }
    }
}

// MARK: - Reembolso (PIN de gerente)

struct RefundOrderSheet: View {
    let order: Order?
    let isPresented: Bool
    let formatCurrency: (Double) -> String
    let onConfirm: (_ reason: String, _ pin: String) async -> Bool
    let onDismiss: () -> Void

    private static let reasons = ["Error de cobro", "Orden duplicada", "Cliente inconforme", "Prueba"]

    @State private var reason: String?
    @State private var detail = ""
    @State private var pin = ""
    @State private var submitting = false
    @State private var failed = false

    private var fullReason: String {
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        return [reason, trimmed.isEmpty ? nil : trimmed].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        BottomSheetCard(onDismiss: onDismiss) {
            SheetTitle(
                icon: "arrow.uturn.backward.circle.fill",
                color: .red,
                title: "Reembolsar orden #\(order.map { String($0.orderNumber) } ?? "")",
                subtitle: "\(order?.total.flatMap(Double.init).map(formatCurrency) ?? "") · se anula y queda en auditoría"
            )

            VStack(alignment: .leading, spacing: 8) {
                Text("Motivo")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                QuickChips(options: Self.reasons, selected: reason) { option in
                    reason = reason == option ? nil : option
                }
                TextField("Detalle (opcional)", text: $detail)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 44)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.05))
                            .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                    )
            }

            VStack(spacing: 14) {
                Text(fullReason.isEmpty ? "Elige un motivo para continuar" : (failed ? "PIN inválido, intenta de nuevo" : "PIN de gerente"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(failed ? .red : (fullReason.isEmpty ? .gray : .white))

                HStack(spacing: 16) {
                    ForEach(0..<4, id: \.self) { index in
                        Circle()
                            .fill(index < pin.count ? (failed ? Color.red : Color.white) : Color.white.opacity(0.12))
                            .frame(width: 14, height: 14)
                    }
                }
                .overlay {
                    if submitting { ProgressView().tint(.white).offset(x: 70) }
                }

                PinNumpadView(
                    onNumber: { digit in
                        guard !fullReason.isEmpty, !submitting, pin.count < 4 else { return }
                        failed = false
                        pin += digit
                        if pin.count == 4 { submit() }
                    },
                    onClear: { pin = ""; failed = false },
                    onBackspace: { if !pin.isEmpty { pin.removeLast() } }
                )
                .opacity(fullReason.isEmpty ? 0.35 : 1)
                .allowsHitTesting(!fullReason.isEmpty)
            }
            .frame(maxWidth: .infinity)
        }
        .onChange(of: isPresented) { _, open in
            if !open {
                reason = nil
                detail = ""
                pin = ""
                failed = false
            }
        }
    }

    private func submit() {
        submitting = true
        Task {
            let ok = await onConfirm(fullReason, pin)
            submitting = false
            if ok {
                Haptics.success()
            } else {
                Haptics.error()
                failed = true
                pin = ""
            }
        }
    }
}

// MARK: - Agregar propina

struct AddTipSheet: View {
    let order: Order?
    let isPresented: Bool
    let methodName: String
    let formatCurrency: (Double) -> String
    let onSave: (Double) async -> Bool
    let onDismiss: () -> Void

    @State private var amount = ""
    @State private var selectedPercent: String?
    @State private var saving = false
    @FocusState private var amountFocused: Bool

    /// Base para los %: lo cobrado sin la propina que ya tuviera.
    private var base: Double {
        let total = order?.total.flatMap(Double.init) ?? 0
        let tip = order?.tip.flatMap(Double.init) ?? 0
        return max(total - tip, 0)
    }

    private var amountValue: Double? {
        guard let value = parseAmount(amount), value >= 0 else { return nil }
        return value
    }

    var body: some View {
        BottomSheetCard(onDismiss: onDismiss) {
            SheetTitle(
                icon: "heart.fill",
                color: .pink,
                title: "Propina · orden #\(order.map { String($0.orderNumber) } ?? "")",
                subtitle: "Se cobra por \(methodName) · actualiza corte y ventas"
            )

            AmountField(placeholder: "$0.00", text: $amount, focus: $amountFocused)

            if base > 0 {
                QuickChips(options: ["10%", "15%", "20%"], selected: selectedPercent) { option in
                    selectedPercent = option
                    let percent = Double(option.dropLast()) ?? 0
                    amount = String(format: "%.2f", (base * percent / 100).rounded(toPlaces: 2))
                }
            }

            Button {
                guard let value = amountValue else { return }
                saving = true
                Task {
                    _ = await onSave(value)
                    saving = false
                }
            } label: {
                HStack(spacing: 8) {
                    if saving { ProgressView().tint(.white) }
                    Text(amountValue.map { "Guardar propina · \(formatCurrency($0))" } ?? "Guardar propina")
                }
                .font(.headline.weight(.bold))
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(accentBlue))
            .disabled(amountValue == nil || saving)
            .padding(.top, 4)
        }
        .onChange(of: amount) { _, newValue in
            // Si se edita a mano, el chip deja de estar seleccionado.
            if let percent = selectedPercent, let p = Double(percent.dropLast()),
               newValue != String(format: "%.2f", (base * p / 100).rounded(toPlaces: 2)) {
                selectedPercent = nil
            }
        }
        .onChange(of: isPresented) { _, open in
            if open {
                amountFocused = true
            } else {
                amountFocused = false
                amount = ""
                selectedPercent = nil
            }
        }
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let factor = pow(10, Double(places))
        return (self * factor).rounded() / factor
    }
}
