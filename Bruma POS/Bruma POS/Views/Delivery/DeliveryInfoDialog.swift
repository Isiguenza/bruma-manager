import SwiftUI

struct DeliveryInfoDialog: View {
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    HStack {
                        Text(vm.isCreatingPlatformDelivery ? "Delivery de Plataforma" : "Para Llevar")
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
                    
                    // Platform Delivery Fields
                    if vm.isCreatingPlatformDelivery {
                        // Platform Selector
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Plataforma *")
                                .font(.caption)
                                .foregroundColor(.gray)
                            
                            HStack(spacing: 12) {
                                ForEach(["Uber", "Rappi", "Didi"], id: \.self) { platform in
                                    Button {
                                        vm.deliveryPlatform = platform
                                    } label: {
                                        Text(platform)
                                            .font(.subheadline.bold())
                                            .foregroundColor(vm.deliveryPlatform == platform ? .black : .white)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(vm.deliveryPlatform == platform ? Color.blue : Color(white: 0.1))
                                            .cornerRadius(10)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 10)
                                                    .stroke(vm.deliveryPlatform == platform ? Color.blue : Color(white: 0.2), lineWidth: 1)
                                            )
                                    }
                                }
                            }
                        }
                        
                        // Order Digits
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Últimos 4 dígitos de la orden *")
                                .font(.caption)
                                .foregroundColor(.gray)
                            
                            TextField("1234", text: $vm.platformOrderDigits)
                                .keyboardType(.numberPad)
                                .font(.body)
                                .foregroundColor(.white)
                                .padding(14)
                                .background(Color(white: 0.1))
                                .cornerRadius(10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color(white: 0.2), lineWidth: 1)
                                )
                                .onChange(of: vm.platformOrderDigits) { _, newValue in
                                    // Limit to 4 characters, alphanumeric
                                    let filtered = newValue.filter { $0.isNumber || $0.isLetter }
                                    vm.platformOrderDigits = String(filtered.prefix(4))
                                }
                        }
                    }
                    
                    // Customer Name
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nombre del cliente *")
                            .font(.caption)
                            .foregroundColor(.gray)
                        
                        TextField("Juan Pérez", text: $vm.deliveryCustomerName)
                            .font(.body)
                            .foregroundColor(.white)
                            .padding(14)
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(white: 0.2), lineWidth: 1)
                            )
                    }
                    
                    // Confirm Button
                    Button {
                        handleConfirm()
                    } label: {
                        Text("Confirmar")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(isValid ? Color.blue : Color.gray)
                            .cornerRadius(12)
                    }
                    .disabled(!isValid)
                }
                .padding(20)
            }
        }
        .presentationDetents([.medium, .large])
    }
    
    private var isValid: Bool {
        let isPlatform = vm.isCreatingPlatformDelivery
        let platform = vm.deliveryPlatform
        let digits = vm.platformOrderDigits
        let name = vm.deliveryCustomerName.trimmingCharacters(in: .whitespaces)
        
        if isPlatform {
            return !platform.isEmpty && digits.count == 4 && !name.isEmpty
        } else {
            return !name.isEmpty
        }
    }
    
    private func handleConfirm() {
        let trimmedName = vm.deliveryCustomerName.trimmingCharacters(in: .whitespaces)
        
        if vm.isCreatingPlatformDelivery {
            // Format: "Uber #1234 - Juan Pérez"
            vm.customerName = "\(vm.deliveryPlatform) #\(vm.platformOrderDigits) - \(trimmedName)"
            vm.showToast("Delivery - \(vm.deliveryPlatform) #\(vm.platformOrderDigits)")
        } else {
            vm.customerName = trimmedName
            vm.showToast("Para Llevar - \(trimmedName)")
        }
        
        // Navigate to POS screen
        vm.currentScreen = .pos
        
        // Reset
        vm.showDeliveryDialog = false
        vm.deliveryPlatform = ""
        vm.platformOrderDigits = ""
        vm.deliveryCustomerName = ""
        
        dismiss()
    }
}
