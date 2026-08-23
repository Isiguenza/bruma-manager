import SwiftUI

/// Login de "Bruma Comandas" — reusa el PIN real de `POSViewModel`
/// (`vm.pin`/`vm.handleNumberClick`/`vm.handleBackspace`/`vm.handleClear`/
/// `vm.handlePinSubmit`), pero A PROPÓSITO nunca llama
/// `vm.handleOpenComanda()` — ese es el único candado de "caja abierta" en
/// todo el flujo de login, y esta app no cobra ni maneja caja, así que no
/// tiene sentido bloquear a un mesero por eso. En vez de eso, el botón
/// "Iniciar Sesión" manda directo a `vm.authStep = .pin`.
struct ComandasLoginView: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Text("BRUMA")
                    .font(.system(size: 40, weight: .black))
                    .foregroundColor(.white)
                Text("Comandas")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.gray)
                Rectangle()
                    .fill(Color.blue)
                    .frame(width: 60, height: 3)
                    .cornerRadius(2)
                    .padding(.top, 4)
            }
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
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Text("Presiona para iniciar tu turno")
                .font(.subheadline)
                .foregroundColor(.gray)

            Button {
                Haptics.tap()
                vm.authStep = .pin
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.circle")
                        .font(.title3)
                    Text("Iniciar Sesión")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(.flatCapsule(.blue))
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

            // Puntos — mismo lenguaje que Bruma POS: blanco lleno, gris hueco.
            HStack(spacing: 14) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < vm.pin.count ? Color.white : Color(white: 0.3))
                        .frame(width: 16, height: 16)
                        .overlay(
                            Circle().stroke(Color.gray.opacity(0.5), lineWidth: i < vm.pin.count ? 0 : 1)
                        )
                        .scaleEffect(i == vm.pin.count - 1 ? 1.15 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.6), value: vm.pin.count)
                }
            }

            ComandasNumpad(
                onNumber: { vm.handleNumberClick($0) },
                onBackspace: { vm.handleBackspace() },
                onClear: { vm.handleClear() }
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

/// Numpad propio de Comandas (no el de POS — ese archivo no se comparte).
/// Botones circulares con el mismo estilo `FlatCircleStyle` que el resto de
/// la app comparte vía `Styles/FlatStyles.swift`.
private struct ComandasNumpad: View {
    let onNumber: (String) -> Void
    let onBackspace: () -> Void
    let onClear: () -> Void

    private let rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["C", "0", "⌫"]]

    var body: some View {
        VStack(spacing: 14) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 14) {
                    ForEach(row, id: \.self) { key in
                        numpadKey(key)
                    }
                }
            }
        }
    }

    private func numpadKey(_ key: String) -> some View {
        Button {
            Haptics.tap()
            switch key {
            case "⌫": onBackspace()
            case "C": onClear()
            default: onNumber(key)
            }
        } label: {
            Text(key)
                .font(.title2.weight(.semibold))
                .frame(width: 72, height: 72)
        }
        // FlatCircleStyle no tiene un factory con color propio (solo
        // .flatCircleNeutral) — se construye directo con el fill deseado.
        .buttonStyle(FlatCircleStyle(fill: key == "C" ? Color.red.opacity(0.85) : FlatCapsuleStyle.neutralFill))
    }
}
