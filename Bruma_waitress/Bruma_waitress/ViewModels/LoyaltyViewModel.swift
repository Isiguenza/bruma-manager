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
    @Published var searchInput = ""

    private var searchTask: Task<Void, Never>?

    // Called on every keystroke — debounces 500ms then fires
    func scheduleSearch() {
        searchTask?.cancel()
        card = nil
        errorMessage = nil
        let query = searchInput.trimmingCharacters(in: .whitespaces)
        guard query.count >= 3 else { return }
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard let self, !Task.isCancelled else { return }
            await self.runSearch(query)
        }
    }

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

    private func runSearch(_ query: String) async {
        guard !isSearching else { return }
        isSearching = true
        errorMessage = nil
        do {
            if query.contains("@") {
                card = try await APIService.shared.searchLoyaltyCard(email: query.lowercased())
            } else {
                card = try await APIService.shared.searchLoyaltyCard(phone: query)
            }
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
        searchTask?.cancel()
        card = nil
        showCardSheet = false
        errorMessage = nil
        stampAddedSuccess = false
        stampAddedSuccess = false
    }
}
