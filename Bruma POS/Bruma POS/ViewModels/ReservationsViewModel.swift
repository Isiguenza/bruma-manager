import Foundation
import SwiftUI
import Combine

@MainActor
class ReservationsViewModel: ObservableObject {
    /// Todas las reservas del `selectedDate` (SIN filtrar por status) — el
    /// filtro de status se aplica en `filteredReservations`, no aquí, para
    /// poder mostrar los conteos por status en la barra de filtros sin tener
    /// que volver a pedirle datos al backend cada vez que cambia el filtro.
    @Published var reservations: [Reservation] = []
    @Published var tables: [Table] = []
    @Published var loading = false
    @Published var selectedDate: String = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }()
    @Published var statusFilter = "all"
    @Published var search = ""

    // Toast
    @Published var toastMessage: String?
    @Published var toastIsError = false

    init(initialStatusFilter: String = "all") {
        statusFilter = initialStatusFilter
    }

    var filteredReservations: [Reservation] {
        reservations
            .filter { statusFilter == "all" || $0.status == statusFilter }
            .filter { search.isEmpty || $0.customerName.localizedCaseInsensitiveContains(search) }
            .sorted { $0.reservationTime < $1.reservationTime }
    }

    func count(for status: String) -> Int {
        status == "all" ? reservations.count : reservations.filter { $0.status == status }.count
    }

    func loadData() async {
        loading = true
        async let tablesResult: [Table] = (try? APIService.shared.fetchTables()) ?? []
        async let reservationsResult: [Reservation] = (try? APIService.shared.fetchReservations(date: selectedDate)) ?? []
        let (t, r) = await (tablesResult, reservationsResult)
        tables = t
        reservations = r
        loading = false
    }

    func confirm(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/reservations/\(id)/confirm")!
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Cliente confirmado")
            await loadData()
        } catch {
            showToast("Error confirmando reserva", isError: true)
        }
    }

    func delete(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/reservations/\(id)")!
            var req = URLRequest(url: url)
            req.httpMethod = "DELETE"
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Reserva cancelada")
            await loadData()
        } catch {
            showToast("Error cancelando reserva", isError: true)
        }
    }

    func save(body: [String: Any], editingId: String?) async -> Bool {
        do {
            let urlStr = editingId != nil
                ? "\(APIService.shared.baseURL)/api/reservations/\(editingId!)"
                : "\(APIService.shared.baseURL)/api/reservations"
            let url = URL(string: urlStr)!
            var req = URLRequest(url: url)
            req.httpMethod = editingId != nil ? "PATCH" : "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else { throw APIError.serverError }
            if !(200...299).contains(http.statusCode) {
                let errorText = String(data: data, encoding: .utf8) ?? "Unknown error"
                print("❌ Error guardando reserva: \(errorText)")
                throw APIError.serverError
            }
            showToast(editingId != nil ? "Reserva actualizada" : "Reserva creada")
            await loadData()
            return true
        } catch {
            showToast("Error guardando la reserva", isError: true)
            return false
        }
    }

    func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": return "Pendiente"
        case "confirmed": return "Confirmada"
        case "arrived": return "Llegó"
        case "cancelled": return "Cancelada"
        case "no_show": return "No show"
        default: return status
        }
    }

    func statusColor(_ status: String) -> Color {
        switch status {
        case "pending": return .orange
        case "confirmed": return .blue
        case "arrived": return .green
        case "cancelled": return Color.white.opacity(0.3)
        case "no_show": return .red
        default: return .gray
        }
    }

    func showToast(_ msg: String, isError: Bool = false) {
        toastMessage = msg
        toastIsError = isError
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            toastMessage = nil
        }
    }
}
