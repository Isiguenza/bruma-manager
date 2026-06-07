import SwiftUI

struct WithdrawModal: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    let registerId: String
    @Environment(\.dismiss) private var dismiss
    
    @State private var amount = ""
    @State private var description = ""
    @State private var submitting = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 24) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sangría de Caja")
                            .font(.title.bold())
                            .foregroundColor(.white)
                        
                        Text("Registra un retiro de efectivo")
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
                
                // Amount Input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Monto")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    TextField("0.00", text: $amount)
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
                
                // Description Input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Descripción (opcional)")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    TextField("Ej: Pago a proveedor", text: $description)
                        .font(.body)
                        .foregroundColor(.white)
                        .padding(16)
                        .background(Color(white: 0.08))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(white: 0.2), lineWidth: 1)
                        )
                }
                
                Spacer()
                
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
                        handleWithdraw()
                    } label: {
                        Text(submitting ? "Registrando..." : "Registrar Sangría")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(isValid ? Color.accentColor : Color.gray)
                            .cornerRadius(12)
                    }
                    .disabled(!isValid || submitting)
                }
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
    }
    
    private var isValid: Bool {
        guard let amt = Double(amount), amt > 0 else { return false }
        return true
    }
    
    private func handleWithdraw() {
        guard let amt = Double(amount),
              let userId = posVM.employeeId else { return }
        
        submitting = true
        Task {
            await vm.withdraw(registerId: registerId, amount: amt, userId: userId, description: description.isEmpty ? "Sangría de caja" : description)
            submitting = false
            if !vm.showWithdrawDialog {
                dismiss()
            }
        }
    }
}
