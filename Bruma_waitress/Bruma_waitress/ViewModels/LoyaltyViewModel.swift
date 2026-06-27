import Foundation
import SwiftUI
import Combine

@MainActor
class LoyaltyViewModel: ObservableObject {
    @Published var card: LoyaltyCard?
    @Published var isSearching = false
    @Published var isAddingStamp = false
    @Published var errorMessage: String?
    @Published var stampAddedSuccess = false
    @Published var showCardSheet = false
    @Published var emailInput = ""

    func searchByBarcode(_ barcode: String) async {
        guard !isSearching, !showCardSheet else { return }
        isSearching = true
        errorMessage = nil
        do {
            card = try await APIService.shared.searchLoyaltyCard(barcode: barcode)
            showCardSheet = true
        } catch {
            errorMessage = "Tarjeta no encontrada"
        }
        isSearching = false
    }

    func searchByEmail() async {
        let query = emailInput.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty, !isSearching else { return }
        isSearching = true
        errorMessage = nil
        do {
            card = try await APIService.shared.searchLoyaltyCard(email: query)
            showCardSheet = true
            emailInput = ""
        } catch {
            errorMessage = "Tarjeta no encontrada"
        }
        isSearching = false
    }

    func addStamp() async {
        guard let card, !isAddingStamp else { return }
        isAddingStamp = true
        errorMessage = nil
        do {
            self.card = try await APIService.shared.addStamps(cardId: card.id, stamps: 1)
            stampAddedSuccess = true
        } catch {
            errorMessage = "Error al agregar sello"
        }
        isAddingStamp = false
    }

    func resetScan() {
        card = nil
        showCardSheet = false
        errorMessage = nil
        stampAddedSuccess = false
    }
}
