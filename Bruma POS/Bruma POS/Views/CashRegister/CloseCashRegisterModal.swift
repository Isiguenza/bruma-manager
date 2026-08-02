import SwiftUI

struct CloseCashRegisterModal: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    let register: CashRegister
    /// Efectivo esperado calculado por el Corte (backend). Si es nil, cae al cálculo cliente.
    var corteExpectedCash: Double? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var finalCash = ""
    @State private var notes = ""
    @State private var submitting = false
    @State private var showDifferenceConfirm = false

    /// Fuente única del efectivo esperado: prioriza el Corte, cae al cálculo cliente.
    private var expectedCash: Double {
        corteExpectedCash ?? vm.expectedCash
    }

    private var finalCashDecimal: Decimal {
        Decimal(string: finalCash.replacingOccurrences(of: ",", with: "")) ?? 0
    }

    private var finalCashAmount: Double {
        NSDecimalNumber(decimal: finalCashDecimal).doubleValue
    }

    private var difference: Double {
        finalCashAmount - expectedCash
    }
    
    private var hasDifference: Bool {
        abs(difference) > 0.01
    }
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Cerrar Caja")
                                .font(.title.bold())
                                .foregroundColor(.white)
                            
                            Text("Realiza el arqueo y cierra la caja")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.headline)
                                .foregroundColor(.gray)
                                .frame(width: 32, height: 32)
                                .background(Color.white.opacity(0.1))
                                .clipShape(Circle())
                        }
                    }
                    
                    // Summary
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Resumen de Caja")
                            .font(.headline)
                            .foregroundColor(.white)
                        
                        summaryRow(title: "Efectivo inicial", value: vm.formatCurrency(register.initialCash))
                        summaryRow(title: "Ventas en efectivo", value: vm.formatCurrency(vm.actualCashSales + vm.actualCashTips))
                        summaryRow(title: "Ventas con terminal", value: vm.formatCurrency(vm.actualTerminalSales))
                        summaryRow(title: "Ventas con transferencia", value: vm.formatCurrency(vm.actualTransferSales))
                        summaryRow(title: "Depósitos", value: vm.formatCurrency(register.deposits))
                        summaryRow(title: "Sangrías", value: vm.formatCurrency(register.withdrawals))
                        
                        Divider()
                            .background(Color.white.opacity(0.2))
                        
                        summaryRow(title: "Efectivo esperado", value: vm.formatCurrency(expectedCash), bold: true)
                    }
                    .padding(16)
                    .background(Color(white: 0.08))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(white: 0.15), lineWidth: 1)
                    )
                    
                    // Final Cash Input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Efectivo final (contado)")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        TextField("0.00", text: $finalCash)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                            .padding(16)
                            .background(Color(white: 0.08))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(white: 0.2), lineWidth: 1)
                            )
                    }
                    
                    // Difference
                    if !finalCash.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Diferencia")
                                .font(.subheadline.bold())
                                .foregroundColor(.white)
                            
                            HStack {
                                Text(vm.formatCurrency(difference))
                                    .font(.title.bold())
                                    .foregroundColor(hasDifference ? (difference > 0 ? Color.accentColor : .red) : .white)
                                
                                Spacer()
                                
                                if hasDifference {
                                    Text(difference > 0 ? "Sobrante" : "Faltante")
                                        .font(.caption.bold())
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(difference > 0 ? Color.accentColor.opacity(0.3) : Color.red.opacity(0.3))
                                        .cornerRadius(8)
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.08))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(hasDifference ? (difference > 0 ? Color.accentColor : Color.red) : Color(white: 0.15), lineWidth: 1)
                            )
                        }
                    }
                    
                    // Notes
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Notas (opcional)")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        TextEditor(text: $notes)
                            .font(.body)
                            .foregroundColor(.white)
                            .frame(height: 100)
                            .padding(12)
                            .background(Color(white: 0.08))
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color(white: 0.2), lineWidth: 1)
                            )
                    }
                    
                    // Buttons
                    HStack(spacing: 12) {
                        Button {
                            dismiss()
                        } label: {
                            Text("Cancelar")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color(white: 0.15))
                                .cornerRadius(12)
                        }
                        
                        Button {
                            handleClose()
                        } label: {
                            Text(submitting ? "Cerrando..." : "Cerrar Caja")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(isValid ? Color.accentColor : Color.gray)
                                .cornerRadius(12)
                        }
                        .disabled(!isValid || submitting)
                    }
                    .padding(.bottom, 20)
                }
                .padding(20)
            }
        }
        .preferredColorScheme(.dark)
        .alert("Confirmar cierre con diferencia", isPresented: $showDifferenceConfirm) {
            Button("Cancelar", role: .cancel) { }
            Button("Confirmar", role: .destructive) {
                performClose()
            }
        } message: {
            Text("Hay una diferencia de \(vm.formatCurrency(difference)). ¿Deseas continuar?")
        }
    }
    
    private var isValid: Bool {
        !finalCash.isEmpty && Double(finalCash) != nil
    }
    
    private func summaryRow(title: String, value: String, bold: Bool = false) -> some View {
        HStack {
            Text(title)
                .font(bold ? .subheadline.bold() : .subheadline)
                .foregroundColor(.gray)
            Spacer()
            Text(value)
                .font(bold ? .subheadline.bold() : .subheadline)
                .foregroundColor(.white)
        }
    }
    
    private func handleClose() {
        if hasDifference {
            showDifferenceConfirm = true
        } else {
            performClose()
        }
    }
    
    private func performClose() {
        guard let employeeId = posVM.employeeId else { return }
        
        let body: [String: Any] = [
            "finalCash": finalCashAmount,
            "closedBy": employeeId,
            "notes": notes.isEmpty ? nil : notes,
            "expectedCash": expectedCash,
            "totalSales": vm.actualTotalSales,
            "cashSales": vm.actualCashSales,
            "terminalSales": vm.actualTerminalSales,
            "transferSales": vm.actualTransferSales
        ].compactMapValues { $0 }
        
        submitting = true
        Task {
            await vm.closeRegister(registerId: register.id, body: body)
            submitting = false
            if !vm.showCloseDialog {
                dismiss()
            }
        }
    }
}
