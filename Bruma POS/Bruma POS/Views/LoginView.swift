import SwiftUI

struct LoginView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 24) {
                Image("LogoBruma")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 130)

                if vm.authStep == .idle {
                    idleView
                } else if vm.authStep == .pin {
                    pinView
                }
            }
            .frame(maxWidth: 400)
            .padding(40)
        }
        .onAppear { vm.refreshCashRegisterStatus() }
    }
    
    // MARK: - Idle
    
    private var idleView: some View {
        VStack(spacing: 16) {
            Text("Comandera")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text("Sistema POS")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            if !vm.cashRegisterOpen && !vm.checkingRegister {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.red)
                    Text("Caja cerrada")
                        .font(.subheadline.bold())
                        .foregroundColor(.red)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.red.opacity(0.15))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.red.opacity(0.3)))
                )
            }
            
            Button(action: vm.handleOpenComanda) {
                HStack {
                    if vm.checkingRegister {
                        ProgressView()
                            .tint(.white)
                    }
                    Text("Iniciar Sesión")
                        .font(.title3.bold())
                }
                .frame(maxWidth: .infinity)
                .frame(height: 64)
                .background(Capsule().fill(Color.blue))
                .foregroundColor(.white)
            }
            .disabled(vm.checkingRegister)
        }
    }
    
    // MARK: - PIN
    
    private var pinView: some View {
        VStack(spacing: 16) {
            Text("PIN de Seguridad")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text("4 dígitos")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            // Display — mete el PIN solo, sin botón de "Ingresar": se
            // auto-envía al llegar a 4 dígitos (POSViewModel.handleNumberClick).
            HStack(spacing: 20) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < vm.pin.count ? Color.blue : Color(white: 0.3))
                        .frame(width: 20, height: 20)
                }
            }
            .frame(height: 40)

            PinNumpadView(
                onNumber: vm.handleNumberClick,
                onClear: vm.handleClear,
                onBackspace: vm.handleBackspace
            )
            .disabled(vm.authenticating)
            .opacity(vm.authenticating ? 0.4 : 1)
            .overlay {
                if vm.authenticating {
                    ProgressView().tint(.white)
                }
            }

            Button("Cancelar", action: vm.handleCancel)
                .foregroundColor(.gray)
        }
    }
}
