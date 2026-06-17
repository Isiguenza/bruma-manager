import SwiftUI

struct LoginView: View {
    @ObservedObject var authVM: AuthViewModel
    
    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.05, blue: 0.05)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                Spacer()
                
                // Logo / Title
                VStack(spacing: 8) {
                    Text("BRUMA")
                        .font(.system(size: 40, weight: .black))
                        .foregroundColor(.white)
                    
                    Text("Marisquería")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.gray)
                    
                    Rectangle()
                        .fill(Color.blue)
                        .frame(width: 60, height: 3)
                        .cornerRadius(2)
                        .padding(.top, 4)
                }
                .padding(.bottom, 32)
                
                if authVM.authStep == .idle {
                    idleView
                } else if authVM.authStep == .pin {
                    codeEntryView(
                        title: "PIN de Seguridad",
                        subtitle: "Ingresa tu PIN de 4 dígitos",
                        value: authVM.pin,
                        maxLength: 4,
                        onSubmit: {
                            Task { await authVM.submitPin() }
                        }
                    )
                }
                
                Spacer()
            }
            .padding(.horizontal, 32)
        }
    }
    
    // MARK: - Idle View
    
    private var idleView: some View {
        VStack(spacing: 16) {
            Text("Comandera")
                .font(.title2.weight(.semibold))
                .foregroundColor(.white)
            
            Text("Presiona para iniciar tu turno")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            if authVM.checkingRegister {
                ProgressView()
                    .tint(.white)
                    .padding(.top, 8)
            } else {
                Button(action: { authVM.startAuth() }) {
                    HStack(spacing: 10) {
                        Image(systemName: "person.crop.circle")
                            .font(.title3)
                        Text("Iniciar Sesión")
                            .font(.headline)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                }
                .buttonStyle(.glassProminent)
                .tint(.blue)
                .padding(.top, 8)
            }
            
            if let error = authVM.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
            }
        }
    }
    
    // MARK: - Code Entry View
    
    private func codeEntryView(
        title: String,
        subtitle: String,
        value: String,
        maxLength: Int,
        onSubmit: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 20) {
            VStack(spacing: 4) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            
            // Dots
            HStack(spacing: 12) {
                ForEach(0..<maxLength, id: \.self) { i in
                    Circle()
                        .fill(i < value.count ? Color.blue : Color.gray.opacity(0.3))
                        .frame(width: 16, height: 16)
                        .overlay(
                            Circle()
                                .stroke(Color.gray.opacity(0.5), lineWidth: i < value.count ? 0 : 1)
                        )
                }
            }
            .padding(.vertical, 8)
            
            if let error = authVM.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
            
            // Numpad
            NumpadView(
                onNumber: { authVM.numberTapped($0) },
                onBackspace: { authVM.backspace() },
                onClear: { authVM.clear() }
            )
            
            // Action buttons
            HStack(spacing: 12) {
                Button(action: { authVM.cancel() }) {
                    Text("Cancelar")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.glass)
                
                Button(action: onSubmit) {
                    Group {
                        if authVM.authenticating {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text(authVM.authStep == .pin ? "Entrar" : "Siguiente")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                }
                .buttonStyle(.glassProminent)
                .tint(value.count == maxLength && !authVM.authenticating ? .blue : .blue.opacity(0.3))
                .disabled(value.count != maxLength || authVM.authenticating)
            }
        }
    }
}

// MARK: - Numpad

struct NumpadView: View {
    let onNumber: (String) -> Void
    let onBackspace: () -> Void
    let onClear: () -> Void
    
    private let rows = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["C", "0", "⌫"],
    ]
    
    var body: some View {
        VStack(spacing: 16) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 16) {
                    ForEach(row, id: \.self) { key in
                        numpadButton(key: key)
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func numpadButton(key: String) -> some View {
        if #available(iOS 26.0, *) {
            Button(action: { handleTap(key) }) {
                Text(key)
                    .font(.title.weight(.medium))
                    .foregroundColor(key == "C" ? .red : .white)
                    .frame(maxWidth: .infinity, minHeight: 72)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .circle)
        } else {
            Button(action: { handleTap(key) }) {
                Text(key)
                    .font(.title.weight(.medium))
                    .foregroundColor(key == "C" ? .red : .white)
                    .frame(maxWidth: .infinity, minHeight: 72)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)
        }
    }
    
    private func handleTap(_ key: String) {
        switch key {
        case "⌫": onBackspace()
        case "C": onClear()
        default: onNumber(key)
        }
    }
}
