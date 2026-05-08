import SwiftUI

struct CashRegisterPinModal: View {
    @ObservedObject var vm: POSViewModel
    let onSuccess: () -> Void
    let onCancel: () -> Void
    
    @State private var pin = ""
    @State private var verifying = false
    @State private var errorMessage = ""
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 32) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 64))
                        .foregroundColor(.blue)
                    
                    Text("Acceso a Caja")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    
                    Text("Solo administradores pueden acceder")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                
                // PIN Display
                HStack(spacing: 16) {
                    ForEach(0..<4) { index in
                        Circle()
                            .fill(index < pin.count ? Color.blue : Color(white: 0.15))
                            .frame(width: 20, height: 20)
                            .overlay(
                                Circle()
                                    .stroke(Color(white: 0.3), lineWidth: 1)
                            )
                    }
                }
                
                // Error Message
                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundColor(.red)
                        .padding(.horizontal, 20)
                        .multilineTextAlignment(.center)
                }
                
                // Numpad
                VStack(spacing: 12) {
                    ForEach(0..<3) { row in
                        HStack(spacing: 12) {
                            ForEach(1...3, id: \.self) { col in
                                let number = row * 3 + col
                                numpadButton(String(number))
                            }
                        }
                    }
                    
                    HStack(spacing: 12) {
                        numpadButton("", systemImage: "xmark") {
                            onCancel()
                        }
                        numpadButton("0")
                        numpadButton("", systemImage: "delete.left") {
                            if !pin.isEmpty {
                                pin.removeLast()
                                errorMessage = ""
                            }
                        }
                    }
                }
                .padding(.horizontal, 40)
                
                Spacer()
            }
            .padding(.top, 60)
            
            if verifying {
                Color.black.opacity(0.5).ignoresSafeArea()
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)
            }
        }
        .preferredColorScheme(.dark)
    }
    
    private func numpadButton(_ text: String, systemImage: String? = nil, action: (() -> Void)? = nil) -> some View {
        Button {
            if let customAction = action {
                customAction()
            } else if pin.count < 4 {
                pin += text
                errorMessage = ""
                
                if pin.count == 4 {
                    verifyPin()
                }
            }
        } label: {
            Group {
                if let image = systemImage {
                    Image(systemName: image)
                        .font(.title2)
                } else {
                    Text(text)
                        .font(.title.bold())
                }
            }
            .foregroundColor(.white)
            .frame(width: 80, height: 80)
            .background(Color(white: 0.15))
            .cornerRadius(40)
            .overlay(
                Circle()
                    .stroke(Color(white: 0.25), lineWidth: 1)
            )
        }
        .disabled(text.isEmpty && systemImage == nil)
        .opacity(text.isEmpty && systemImage == nil ? 0 : 1)
    }
    
    private func verifyPin() {
        verifying = true
        errorMessage = ""
        
        Task {
            do {
                let url = URL(string: "\(APIService.shared.baseURL)/api/employees/verify-pin")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["pin": pin])
                
                let (data, response) = try await URLSession.shared.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NSError(domain: "", code: -1)
                }
                
                if httpResponse.statusCode == 200 {
                    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    let employee = json?["employee"] as? [String: Any]
                    let role = employee?["role"] as? String
                    
                    if role == "admin" || role == "manager" {
                        onSuccess()
                    } else {
                        errorMessage = "Solo administradores pueden acceder a Caja"
                        pin = ""
                    }
                } else {
                    errorMessage = "PIN incorrecto"
                    pin = ""
                }
            } catch {
                errorMessage = "Error verificando PIN"
                pin = ""
            }
            
            verifying = false
        }
    }
}
