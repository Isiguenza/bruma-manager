import Foundation
import SwiftUI
import Combine

@MainActor
class ReservationsViewModel: ObservableObject {
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

    // Modals
    @Published var showNewReservation = false
    @Published var editingReservation: Reservation? = nil

    // Toast
    @Published var toastMessage: String?
    @Published var toastIsError = false

    init(initialStatusFilter: String = "all") {
        statusFilter = initialStatusFilter
    }

    var filteredReservations: [Reservation] {
        reservations.filter { r in
            search.isEmpty || r.customerName.localizedCaseInsensitiveContains(search)
        }
    }

    var groupedReservations: [(date: String, items: [Reservation])] {
        let grouped = Dictionary(grouping: filteredReservations) { $0.reservationDate }
        return grouped.keys.sorted().map { date in
            let sorted = grouped[date]!.sorted { $0.reservationTime < $1.reservationTime }
            return (date: date, items: sorted)
        }
    }

    func loadData() async {
        loading = true
        print("📅 Loading reservations for date: \(selectedDate), status: \(statusFilter)")
        async let tablesResult: [Table] = (try? APIService.shared.fetchTables()) ?? []
        async let reservationsResult: [Reservation] = (try? APIService.shared.fetchReservations(date: selectedDate == "all" ? nil : selectedDate)) ?? []
        let (t, r) = await (tablesResult, reservationsResult)
        tables = t
        print("📊 Fetched \(r.count) reservations, \(t.count) tables")
        var filtered = r
        if statusFilter != "all" {
            filtered = filtered.filter { $0.status == statusFilter }
        }
        reservations = filtered
        print("✅ Showing \(filtered.count) reservations after filter")
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
            showToast("Cliente confirmado ✓")
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
            print("📝 Saving reservation to: \(urlStr)")
            print("📦 Body: \(body)")
            let url = URL(string: urlStr)!
            var req = URLRequest(url: url)
            req.httpMethod = editingId != nil ? "PATCH" : "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                print("❌ Invalid response")
                throw APIError.serverError
            }
            print("📡 Response status: \(http.statusCode)")
            if !(200...299).contains(http.statusCode) {
                let errorText = String(data: data, encoding: .utf8) ?? "Unknown error"
                print("❌ Error response: \(errorText)")
                throw APIError.serverError
            }
            showToast(editingId != nil ? "Reserva actualizada" : "Reserva creada")
            await loadData()
            return true
        } catch {
            showToast("Error guardando reserva", isError: true)
            return false
        }
    }

    func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": return "Pendiente"
        case "confirmed": return "Confirmada"
        case "arrived": return "Llegó"
        case "cancelled": return "Cancelada"
        case "no_show": return "No Show"
        default: return status
        }
    }

    func statusColor(_ status: String) -> Color {
        switch status {
        case "pending": return .orange
        case "confirmed": return .blue
        case "arrived": return .green
        case "cancelled": return Color(white: 0.4)
        case "no_show": return .red
        default: return .gray
        }
    }

    func formatDisplayDate(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: dateStr) else { return dateStr }
        formatter.dateFormat = "EEEE d 'de' MMMM"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date).capitalized
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
