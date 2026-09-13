import SwiftUI

/// Login de "Bruma Comandas" — reusa el PIN real de `POSViewModel`
/// (`vm.pin`/`vm.handleNumberClick`/`vm.handleBackspace`/`vm.handleClear`/
/// `vm.handlePinSubmit`). `handleOpenComanda()` ya no bloquea el login si la
/// caja está cerrada (solo informa vía el banner de `idleView`), así que este
/// botón ahora llama lo mismo que Bruma POS — el bloqueo real de "caja
/// cerrada" vive en `handleSendToKitchen`, no aquí.
struct ComandasLoginView: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Image("LogoBruma")
                .resizable()
                .scaledToFit()
                .frame(height: 110)
                .padding(.bottom, 32)

            if vm.authStep == .pin {
                pinEntry
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            } else {
                idleView
                    .transition(.opacity)
            }

            Spacer()
        }
        .padding(.horizontal, 32)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: vm.authStep)
        .onAppear { vm.refreshCashRegisterStatus() }
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Text("Presiona para iniciar tu turno")
                .font(.subheadline)
                .foregroundColor(.gray)

            if !vm.cashRegisterOpen && !vm.checkingRegister {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.red)
                    Text("Caja cerrada — podrás iniciar sesión, pero no comandar")
                        .font(.footnote.bold())
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.red.opacity(0.15))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.red.opacity(0.3)))
                )
            }

            Button {
                Haptics.tap()
                vm.handleOpenComanda()
            } label: {
                HStack(spacing: 10) {
                    if vm.checkingRegister {
                        ProgressView().tint(.white)
                    }
                    Image(systemName: "person.crop.circle")
                        .font(.title3)
                    Text("Iniciar Sesión")
                        .font(.title3.bold())
                }
                .frame(maxWidth: .infinity)
                .frame(height: 64)
            }
            .buttonStyle(.flatCapsule(.blue))
            .disabled(vm.checkingRegister)
        }
    }

    private var pinEntry: some View {
        VStack(spacing: 24) {
            VStack(spacing: 4) {
                Text("PIN de Seguridad")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                Text("Ingresa tu PIN de 4 dígitos")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }

            // Puntos — mismo lenguaje que Bruma POS: azul lleno, gris hueco.
            HStack(spacing: 14) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < vm.pin.count ? Color.blue : Color(white: 0.3))
                        .frame(width: 16, height: 16)
                        .overlay(
                            Circle().stroke(Color.gray.opacity(0.5), lineWidth: i < vm.pin.count ? 0 : 1)
                        )
                        .scaleEffect(i == vm.pin.count - 1 ? 1.15 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.6), value: vm.pin.count)
                }
            }

            PinNumpadView(
                onNumber: { vm.handleNumberClick($0) },
                onClear: { vm.handleClear() },
                onBackspace: { vm.handleBackspace() }
            )
            .disabled(vm.authenticating)
            .opacity(vm.authenticating ? 0.4 : 1)
            .overlay {
                if vm.authenticating {
                    ProgressView().tint(.white)
                }
            }

            Button {
                Haptics.tap()
                vm.handleCancel()
            } label: {
                Text("Cancelar")
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
            }
            .buttonStyle(.flatCapsuleNeutral)
        }
    }
}
