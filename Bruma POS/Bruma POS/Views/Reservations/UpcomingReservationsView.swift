import SwiftUI
import Combine

@MainActor
class UpcomingReservationsViewModel: ObservableObject {
    @Published var groups: [(date: String, items: [Reservation])] = []
    @Published var loading = false
    @Published var toastMessage: String?
    @Published var toastIsError = false
    @Published var editingReservation: Reservation?

    private let todayStr: String = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }()

    func load() async {
        loading = true
        if let all = try? await APIService.shared.fetchReservations(status: "pending") {
            let upcoming = all
                .filter { $0.reservationDate >= todayStr }
                .sorted { a, b in
                    if a.reservationDate != b.reservationDate {
                        return a.reservationDate < b.reservationDate
                    }
                    return a.reservationTime < b.reservationTime
                }
            let grouped = Dictionary(grouping: upcoming) { $0.reservationDate }
            groups = grouped.keys.sorted().map { date in (date: date, items: grouped[date]!) }
        }
        loading = false
    }

    func confirm(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/reservations/\(id)/confirm")!
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw URLError(.badServerResponse) }
            showToast("Cliente confirmado ✓")
            await load()
        } catch {
            showToast("Error confirmando", isError: true)
        }
    }

    func delete(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/reservations/\(id)")!
            var req = URLRequest(url: url)
            req.httpMethod = "DELETE"
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw URLError(.badServerResponse) }
            showToast("Reserva cancelada")
            await load()
        } catch {
            showToast("Error cancelando", isError: true)
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

    func formatDayHeader(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let date = f.date(from: dateStr) else { return dateStr }
        f.dateFormat = "EEEE d 'de' MMMM"
        f.locale = Locale(identifier: "es_MX")
        let str = f.string(from: date).capitalized

        let todayCal = Calendar.current
        if todayCal.isDateInToday(date) { return "Hoy — \(str)" }
        if todayCal.isDateInTomorrow(date) { return "Mañana — \(str)" }
        return str
    }
}

struct UpcomingReservationsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = UpcomingReservationsViewModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Reservaciones")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Text("Próximas pendientes")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.gray)
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.08))
                            .clipShape(Circle())
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 16)

                Rectangle()
                    .fill(Color(white: 0.1))
                    .frame(height: 1)

                // Content
                if vm.loading {
                    Spacer()
                    ProgressView().tint(.white)
                    Spacer()
                } else if vm.groups.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "calendar.badge.checkmark")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("Sin reservaciones pendientes")
                            .font(.headline)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    List {
                        ForEach(vm.groups, id: \.date) { group in
                            Section {
                                ForEach(group.items) { reservation in
                                    UpcomingReservationRow(reservation: reservation, vm: vm)
                                        .listRowBackground(Color.clear)
                                        .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))
                                        .listRowSeparator(.hidden)
                                }
                            } header: {
                                Text(vm.formatDayHeader(group.date))
                                    .font(.caption.bold())
                                    .foregroundColor(.gray)
                                    .textCase(nil)
                                    .padding(.top, 12)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .refreshable { await vm.load() }
                }
            }

            // Toast
            if let toast = vm.toastMessage {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Image(systemName: vm.toastIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundColor(vm.toastIsError ? .red : .green)
                        Text(toast)
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color(white: 0.15))
                    .cornerRadius(10)
                    .padding(.bottom, 40)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(), value: vm.toastMessage)
            }
        }
        .preferredColorScheme(.dark)
        .task { await vm.load() }
        .sheet(item: $vm.editingReservation) { res in
            ReservationFormModal(vm: ReservationsViewModel(), reservation: res)
        }
    }
}

// MARK: - Row

struct UpcomingReservationRow: View {
    let reservation: Reservation
    @ObservedObject var vm: UpcomingReservationsViewModel
    @State private var showDeleteConfirm = false
    @State private var confirming = false

    private func statusColor(_ s: String) -> Color {
        switch s {
        case "pending":   return .orange
        case "confirmed": return .blue
        default:          return .gray
        }
    }

    private func statusLabel(_ s: String) -> String {
        switch s {
        case "pending":   return "Pendiente"
        case "confirmed": return "Confirmada"
        default:          return s
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Time + status + menu
            HStack(spacing: 8) {
                Text(reservation.reservationTime)
                    .font(.headline.bold())
                    .foregroundColor(.white)
                    .monospacedDigit()

                Text(statusLabel(reservation.status))
                    .font(.caption2.bold())
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusColor(reservation.status).opacity(0.2))
                    .overlay(Capsule().stroke(statusColor(reservation.status), lineWidth: 1))
                    .clipShape(Capsule())

                Spacer()

                Menu {
                    Button {
                        confirming = true
                        Task { await vm.confirm(id: reservation.id); confirming = false }
                    } label: {
                        Label("Marcar como llegó", systemImage: "checkmark.circle")
                    }
                    Button(role: .destructive) { showDeleteConfirm = true } label: {
                        Label("Cancelar reserva", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .frame(width: 32, height: 32)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(8)
                }
                .disabled(confirming)
            }

            // Name + guests
            HStack(spacing: 12) {
                Text(reservation.customerName)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)

                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("\(reservation.guestCount)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            // Phone + table + notes in one line
            HStack(spacing: 12) {
                if let phone = reservation.customerPhone, !phone.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "phone.fill")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text(phone)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                if let table = reservation.table {
                    HStack(spacing: 4) {
                        Image(systemName: "table.furniture.fill")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text("Mesa \(table.number)")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
            }

            if let occasion = reservation.occasion, !occasion.isEmpty {
                Text(occasion)
                    .font(.caption)
                    .foregroundColor(.purple.opacity(0.8))
            }

            if let notes = reservation.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundColor(Color(white: 0.45))
                    .italic()
            }
        }
        .padding(14)
        .background(Color(white: 0.07))
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.12), lineWidth: 1))
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                confirming = true
                Task { await vm.confirm(id: reservation.id); confirming = false }
            } label: {
                Label("Llegó", systemImage: "checkmark.circle.fill")
            }
            .tint(.green)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { showDeleteConfirm = true } label: {
                Label("Cancelar", systemImage: "trash")
            }
        }
        .confirmationDialog("¿Cancelar esta reserva?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Cancelar reserva", role: .destructive) {
                Task { await vm.delete(id: reservation.id) }
            }
            Button("Mantener", role: .cancel) {}
        }
    }
}
