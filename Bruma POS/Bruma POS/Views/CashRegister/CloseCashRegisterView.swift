import SwiftUI

/// Cierre de caja a pantalla completa: arqueo por denominación (o total
/// directo) contra el efectivo esperado del Corte. El esperado y el desglose
/// salen del MISMO `CorteViewModel` que la pantalla de Corte, así que lo que
/// ves al cerrar es exactamente lo que dice el Corte.
struct CloseCashRegisterView: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    @ObservedObject var corteVM: CorteViewModel
    let register: CashRegister
    @Environment(\.dismiss) private var dismiss

    private enum Mode: String, CaseIterable {
        case denominations = "Por denominación"
        case total = "Total"
    }

    private struct Denomination: Identifiable {
        let id: String
        let value: Double
        let isCoin: Bool

        var label: String {
            value < 1 ? "50¢" : "$\(Int(value))"
        }
    }

    private static let denominations: [Denomination] = [
        .init(id: "b1000", value: 1000, isCoin: false),
        .init(id: "b500", value: 500, isCoin: false),
        .init(id: "b200", value: 200, isCoin: false),
        .init(id: "b100", value: 100, isCoin: false),
        .init(id: "b50", value: 50, isCoin: false),
        .init(id: "b20", value: 20, isCoin: false),
        .init(id: "c20", value: 20, isCoin: true),
        .init(id: "c10", value: 10, isCoin: true),
        .init(id: "c5", value: 5, isCoin: true),
        .init(id: "c2", value: 2, isCoin: true),
        .init(id: "c1", value: 1, isCoin: true),
        .init(id: "c050", value: 0.5, isCoin: true)
    ]

    // Mismos tonos que PaymentView.
    private static let cashColor = Color(red: 0, green: 137/255, blue: 50/255)
    private static let accent = Color(red: 30/255, green: 110/255, blue: 244/255)

    @State private var mode: Mode = .denominations
    @State private var counts: [String: Int] = [:]
    @State private var selectedId: String = "b1000"
    @State private var totalInput = ""
    @State private var notes = ""
    @State private var submitting = false
    @State private var showDifferenceConfirm = false

    // MARK: - Cálculos

    /// Fuente única del esperado: el Corte; si aún no carga, el cálculo cliente.
    private var expectedCash: Double {
        corteVM.hasData ? corteVM.cashExpected : vm.expectedCash
    }

    private var countedCash: Double {
        switch mode {
        case .denominations:
            return Self.denominations.reduce(0) { $0 + $1.value * Double(counts[$1.id] ?? 0) }
        case .total:
            return Double(totalInput.replacingOccurrences(of: ",", with: "")) ?? 0
        }
    }

    private var hasCount: Bool {
        switch mode {
        case .denominations: return counts.values.contains { $0 > 0 }
        case .total: return Double(totalInput.replacingOccurrences(of: ",", with: "")) != nil
        }
    }

    private var difference: Double { countedCash - expectedCash }
    private var isSquared: Bool { abs(difference) < 0.5 }

    // MARK: - Body

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 16) {
                header

                HStack(alignment: .top, spacing: 12) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            Picker("Modo", selection: $mode) {
                                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 320)

                            if mode == .denominations {
                                denominationGroup("Billetes", Self.denominations.filter { !$0.isCoin })
                                denominationGroup("Monedas", Self.denominations.filter(\.isCoin))
                            } else {
                                totalEntry
                            }

                            expectedBreakdown
                        }
                        .padding(20)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .modifier(PanelBackground())

                    rightPanel
                        .frame(width: 380)
                        .frame(maxHeight: .infinity)
                        .modifier(PanelBackground())
                }
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
        // La Caja se re-bloquea a los 2 min sin toques en su vista; esta
        // pantalla va encima, así que sus toques tienen que reiniciar ese
        // contador o se cerraría a media cuenta (y se perdería el conteo).
        .simultaneousGesture(TapGesture().onEnded { vm.resetInactivityTimer() })
        .task { await corteVM.loadCorte(registerId: register.id) }
        .alert("Cerrar con diferencia", isPresented: $showDifferenceConfirm) {
            Button("Volver a contar", role: .cancel) { }
            Button("Cerrar caja", role: .destructive) { performClose() }
        } message: {
            Text("\(differenceText). Queda registrado en el corte. ¿Cerrar de todos modos?")
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Cerrar caja")
                    .font(.title.bold())
                    .foregroundColor(.white)
                Text("Cuenta el efectivo del cajón")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.flatCircleNeutral)
        }
    }

    // MARK: - Izquierda

    private func denominationGroup(_ title: String, _ items: [Denomination]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundColor(.gray)
                .tracking(1.4)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(items) { denomination in
                    denominationCell(denomination)
                }
            }
        }
    }

    private func denominationCell(_ denomination: Denomination) -> some View {
        let count = counts[denomination.id] ?? 0
        let isSelected = selectedId == denomination.id
        return Button {
            Haptics.tap()
            selectedId = denomination.id
        } label: {
            HStack(spacing: 12) {
                Text(denomination.label)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .frame(width: 72, alignment: .leading)
                Text("×")
                    .foregroundColor(.gray)
                Text("\(count)")
                    .font(.system(size: 20, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundColor(count > 0 ? .white : Color(white: 0.35))
                Spacer()
                Text(count > 0 ? vm.formatCurrency(denomination.value * Double(count)) : "")
                    .font(.subheadline.monospacedDigit())
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 16)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isSelected ? Self.accent.opacity(0.15) : Color.white.opacity(0.045))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(isSelected ? Self.accent : Color.white.opacity(0.1), lineWidth: isSelected ? 1.5 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var totalEntry: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TOTAL CONTADO")
                .font(.caption.weight(.bold))
                .foregroundColor(.gray)
                .tracking(1.4)
            TextField("0.00", text: $totalInput)
                .keyboardType(.decimalPad)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .frame(height: 64)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.05))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                )
            Text("Si ya contaste el cajón completo, captura solo el total.")
                .font(.caption)
                .foregroundColor(Color(white: 0.45))
        }
    }

    @ViewBuilder
    private var expectedBreakdown: some View {
        if let data = corteVM.corteData {
            VStack(alignment: .leading, spacing: 10) {
                Text("DE DÓNDE SALE EL ESPERADO")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.gray)
                    .tracking(1.4)
                VStack(spacing: 0) {
                    breakdownLine("", "Fondo inicial", data.register.initialCash)
                    breakdownLine("+", "Ventas en efectivo", data.sales.cash)
                    breakdownLine("+", "Propinas en efectivo", data.tips.cash)
                    breakdownLine("+", "Depósitos", data.movements.deposits.total)
                    breakdownLine("−", "Sangrías", data.movements.withdrawals.total)
                    Divider().background(Color.white.opacity(0.15)).padding(.vertical, 4)
                    HStack {
                        Text("Esperado")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                        Spacer()
                        Text(vm.formatCurrency(corteVM.cashExpected))
                            .fontWeight(.bold)
                            .monospacedDigit()
                            .foregroundColor(.white)
                    }
                    .font(.subheadline)
                    .padding(.vertical, 8)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .modifier(FlatCard(cornerRadius: 14))
            }
        }
    }

    private func breakdownLine(_ sign: String, _ label: String, _ value: Double) -> some View {
        HStack {
            Text(sign).foregroundColor(.gray).frame(width: 14, alignment: .leading)
            Text(label).foregroundColor(.gray)
            Spacer()
            Text(vm.formatCurrency(value))
                .monospacedDigit()
                .foregroundColor(value == 0 ? Color(white: 0.35) : .white)
        }
        .font(.subheadline)
        .padding(.vertical, 7)
    }

    // MARK: - Derecha

    private var rightPanel: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Esperado")
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatCurrency(expectedCash))
                        .monospacedDigit()
                        .foregroundColor(.white)
                }
                .font(.subheadline)

                VStack(alignment: .leading, spacing: 2) {
                    Text("CONTADO")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.gray)
                        .tracking(1.4)
                    Text(vm.formatCurrency(countedCash))
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: countedCash)
                }

                statusBadge
            }
            .padding(.horizontal, 4)

            if mode == .denominations {
                VStack(spacing: 4) {
                    Text(selectedLabel)
                        .font(.caption)
                        .foregroundColor(.gray)
                    PaymentNumpadView(
                        onKey: appendDigit,
                        onClear: { setCount(0) },
                        onBackspace: removeDigit,
                        onDone: advance
                    )
                }
            }

            Spacer(minLength: 0)

            TextField("Nota de cierre (opcional)", text: $notes)
                .font(.subheadline)
                .foregroundColor(.white)
                .padding(.horizontal, 18)
                .frame(height: 48)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.05))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1)))
                )

            Button {
                if isSquared { performClose() } else { showDifferenceConfirm = true }
            } label: {
                HStack(spacing: 8) {
                    if submitting { ProgressView().tint(.white) } else { Image(systemName: "lock.fill") }
                    Text(submitting ? "Cerrando…" : "Cerrar caja")
                }
                .font(.headline.weight(.bold))
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(.red))
            .disabled(!hasCount || submitting)
        }
        .padding(20)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if hasCount {
            let color: Color = isSquared ? Self.cashColor : (difference < 0 ? .red : .orange)
            HStack(spacing: 8) {
                Image(systemName: isSquared ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                Text(differenceText).fontWeight(.semibold)
                Spacer()
            }
            .font(.subheadline)
            .foregroundColor(color)
            .padding(12)
            .modifier(FlatCardTinted(color: color, cornerRadius: 12))
            .animation(.snappy, value: isSquared)
        } else {
            Text("Empieza a contar para ver si cuadra")
                .font(.subheadline)
                .foregroundColor(Color(white: 0.45))
                .padding(.vertical, 12)
        }
    }

    private var differenceText: String {
        if isSquared { return "Cuadra" }
        return difference < 0 ? "Faltan \(vm.formatCurrency(-difference))" : "Sobran \(vm.formatCurrency(difference))"
    }

    // MARK: - Numpad

    private var selectedLabel: String {
        guard let d = Self.denominations.first(where: { $0.id == selectedId }) else { return "" }
        return "Cuántos \(d.isCoin ? "monedas" : "billetes") de \(d.label)  ·  ✓ pasa al siguiente"
    }

    private func setCount(_ value: Int) {
        counts[selectedId] = value
    }

    private func appendDigit(_ digit: String) {
        let current = counts[selectedId] ?? 0
        let next = current * 10 + (Int(digit) ?? 0)
        guard next < 10_000 else { return }
        setCount(next)
    }

    private func removeDigit() {
        setCount((counts[selectedId] ?? 0) / 10)
    }

    private func advance() {
        Haptics.tap()
        guard let idx = Self.denominations.firstIndex(where: { $0.id == selectedId }) else { return }
        selectedId = Self.denominations[(idx + 1) % Self.denominations.count].id
    }

    // MARK: - Cerrar

    /// "Conteo: 12×$500, 3×$200" — queda en la nota de cierre para auditoría.
    private var countSummary: String? {
        guard mode == .denominations else { return nil }
        let parts = Self.denominations.compactMap { d -> String? in
            guard let c = counts[d.id], c > 0 else { return nil }
            return "\(c)×\(d.label)\(d.isCoin && d.value >= 1 ? " mon." : "")"
        }
        return parts.isEmpty ? nil : "Conteo: " + parts.joined(separator: ", ")
    }

    private func performClose() {
        guard let employeeId = posVM.employeeId else { return }
        let data = corteVM.corteData
        let note = [notes.trimmingCharacters(in: .whitespacesAndNewlines), countSummary ?? ""]
            .filter { !$0.isEmpty }
            .joined(separator: "\n")

        // Las columnas de ventas de cash_registers se escriben al cerrar (no se
        // leen después); se mandan las del Corte para que coincidan con él.
        var body: [String: Any] = [
            "finalCash": countedCash,
            "closedBy": employeeId,
            "expectedCash": expectedCash,
            "totalSales": data?.sales.total ?? vm.actualTotalSales,
            "cashSales": data?.sales.cash ?? vm.actualCashSales,
            "terminalSales": data?.sales.card ?? vm.actualTerminalSales,
            "transferSales": data?.sales.transfer ?? vm.actualTransferSales
        ]
        if !note.isEmpty { body["notes"] = note }

        submitting = true
        Task {
            await vm.closeRegister(registerId: register.id, body: body)
            submitting = false
            if !vm.showCloseDialog { dismiss() }
        }
    }
}
