import SwiftUI

struct OpenCashRegisterModal: View {
    @ObservedObject var vm: CashRegisterViewModel
    @ObservedObject var posVM: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var initialCash = ""
    @State private var submitting = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 24) {
                // Header
                HStack {
                    Text("Abrir Caja")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    
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
                
                Text("Ingresa el monto inicial de efectivo en caja")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                
                // Input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Efectivo inicial")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    TextField("0.00", text: $initialCash)
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
                        handleOpen()
                    } label: {
                        Text(submitting ? "Abriendo..." : "Abrir Caja")
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
        guard let amount = Double(initialCash), amount > 0 else { return false }
        return true
    }
    
    private func handleOpen() {
        guard let amount = Double(initialCash),
              let employeeId = posVM.employeeId else { return }
        
        submitting = true
        Task {
            await vm.openRegister(initialCash: amount, employeeId: employeeId)
            submitting = false
            if vm.register != nil {
                dismiss()
            }
        }
    }
}
