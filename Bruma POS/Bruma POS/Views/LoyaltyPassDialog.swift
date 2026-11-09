import SwiftUI

/// Menú Admin → Pase de lealtad. La cámara vive DENTRO del modal; al leer el
/// pase, el mismo modal muestra al cliente, sus sellos y premios. El pase queda
/// ligado a la orden (`linkLoyaltyCard`), suma sellos al cobrar, y desde aquí se
/// entra a elegir en el carrito el platillo que es el premio.
struct LoyaltyPassDialog: View {
    @ObservedObject var vm: POSViewModel
    /// Cambiarlo recrea el lector (QRScannerUIView solo lee una vez por sesión).
    @State private var scannerKey = UUID()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pase de lealtad")
                        .font(.title2.bold())
                        .foregroundColor(.white)
                    Text(vm.loyaltyCard == nil ? "Escanea el pase del cliente" : "Ligado a esta cuenta · los sellos se suman al cobrar")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                Spacer()
                Button {
                    vm.showLoyaltyPassSheet = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.flatCircleNeutral)
            }

            if let card = vm.loyaltyCard {
                cardDetails(card)
            } else {
                scanner
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Color(white: 0.09))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    // MARK: - Lector

    private var scanner: some View {
        VStack(spacing: 16) {
            ZStack {
                QRScannerView { code in
                    vm.handleQRCodeDetected(code)
                }
                .id(scannerKey)

                // Marco de enfoque
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Color.loyaltyGold.opacity(0.9), style: StrokeStyle(lineWidth: 3, dash: [28, 14]))
                    .padding(36)

                if vm.loadingCard {
                    Color.black.opacity(0.55)
                    ProgressView("Buscando pase…")
                        .tint(.white)
                        .foregroundColor(.white)
                }
            }
            .frame(height: 340)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text("Apunta la cámara al código QR del pase en el celular del cliente.")
                .font(.caption)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)

            // Respaldo: por correo
            HStack(spacing: 8) {
                Image(systemName: "envelope.fill").foregroundColor(.gray)
                TextField("O busca por correo", text: $vm.loyaltyEmailInput)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundColor(.white)
                    .onSubmit { vm.searchLoyaltyByEmail() }
                Button("Buscar") { vm.searchLoyaltyByEmail() }
                    .font(.subheadline.weight(.semibold))
                    .disabled(vm.loyaltyEmailInput.trimmingCharacters(in: .whitespaces).isEmpty || vm.loadingCard)
            }
            .padding(.horizontal, 16)
            .frame(height: 48)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.05))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1)))
            )
        }
    }

    // MARK: - Datos del pase

    private func cardDetails(_ card: LoyaltyCard) -> some View {
        let redeemable = vm.loyaltyRedeemableCartItems
        let perReward = max(card.stampsPerReward, 1)
        let current = card.stamps % perReward

        return VStack(alignment: .leading, spacing: 16) {
            // Tarjeta
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(card.displayName)
                            .font(.title3.bold())
                            .foregroundColor(.white)
                        if let contact = card.customerPhone ?? card.customerEmail {
                            Text(contact)
                                .font(.caption)
                                .foregroundColor(Color(white: 0.6))
                        }
                    }
                    Spacer()
                    if card.rewardsAvailable > 0 {
                        Label("\(card.rewardsAvailable) premio\(card.rewardsAvailable == 1 ? "" : "s")", systemImage: "gift.fill")
                            .font(.caption.weight(.bold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(Color.loyaltyGold))
                    }
                }

                // Sellos
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        ForEach(0..<perReward, id: \.self) { index in
                            Circle()
                                .fill(index < current ? Color.loyaltyGold : Color.white.opacity(0.1))
                                .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
                                .frame(width: 22, height: 22)
                                .overlay {
                                    if index < current {
                                        Image(systemName: "star.fill")
                                            .font(.system(size: 9, weight: .bold))
                                            .foregroundColor(.black.opacity(0.6))
                                    }
                                }
                        }
                    }
                    Text("\(current) de \(perReward) sellos · \(card.rewardsRedeemed) premios canjeados")
                        .font(.caption)
                        .foregroundColor(Color(white: 0.6))
                }
            }
            .padding(18)
            .background(
                LinearGradient(colors: [Color.loyaltyGold.opacity(0.22), Color(white: 0.12)], startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.loyaltyGold.opacity(0.35), lineWidth: 1))

            // Canjear
            Button {
                vm.beginLoyaltyRewardSelection()
            } label: {
                Label("Canjear premio", systemImage: "star.fill")
                    .font(.headline.weight(.bold))
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.flatCapsule(Color.loyaltyGold, foreground: .black))
            .disabled(card.rewardsAvailable == 0 || redeemable.isEmpty)

            if card.rewardsAvailable == 0 {
                hint("Aún no tiene premios: le faltan \(perReward - current) sellos.")
            } else if redeemable.isEmpty {
                hint("Ningún platillo de esta cuenta aplica como premio. Agrega uno marcado como \"Premio de lealtad\".")
            } else {
                hint("Después eliges en el carrito cuál platillo es el premio (\(redeemable.count) aplican).")
            }

            HStack(spacing: 10) {
                Button {
                    vm.loyaltyCard = nil
                    scannerKey = UUID()
                } label: {
                    Label("Leer otro pase", systemImage: "qrcode.viewfinder")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.flatCapsuleNeutral)

                Button {
                    vm.unlinkLoyaltyCard()
                    scannerKey = UUID()
                } label: {
                    Label("Quitar de la cuenta", systemImage: "xmark.circle")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.flatCapsuleNeutral)
            }
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundColor(.gray)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
    }
}
