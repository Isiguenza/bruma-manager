import SwiftUI

struct ReservationRowView: View {
    let reservation: Reservation
    @ObservedObject var vm: ReservationsViewModel
    @State private var showDeleteConfirm = false
    @State private var confirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Top row: time + status + actions
            HStack(spacing: 10) {
                // Time
                HStack(spacing: 4) {
                    Image(systemName: "clock.fill")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(reservation.reservationTime)
                        .font(.headline.bold())
                        .foregroundColor(.white)
                }

                // Status badge
                Text(vm.statusLabel(reservation.status))
                    .font(.caption2.bold())
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(vm.statusColor(reservation.status).opacity(0.25))
                    .overlay(
                        Capsule().stroke(vm.statusColor(reservation.status), lineWidth: 1)
                    )
                    .clipShape(Capsule())

                Spacer()

                // Actions menu
                Menu {
                    if reservation.status == "pending" || reservation.status == "confirmed" {
                        Button {
                            confirming = true
                            Task {
                                await vm.confirm(id: reservation.id)
                                confirming = false
                            }
                        } label: {
                            Label("Marcar como llegó", systemImage: "checkmark.circle")
                        }
                    }

                    Button {
                        vm.editingReservation = reservation
                    } label: {
                        Label("Editar", systemImage: "pencil")
                    }

                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Cancelar reserva", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: confirming ? "ellipsis" : "ellipsis")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .frame(width: 32, height: 32)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(8)
                }
                .disabled(confirming)
            }

            // Customer name
            Text(reservation.customerName)
                .font(.subheadline.bold())
                .foregroundColor(.white)

            // Details row
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("\(reservation.guestCount) personas")
                        .font(.caption)
                        .foregroundColor(.gray)
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

                HStack(spacing: 4) {
                    Image(systemName: "timer")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("\(reservation.duration) min")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            // Phone
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

            // Notes
            if let notes = reservation.notes, !notes.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "note.text")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text(notes)
                        .font(.caption)
                        .foregroundColor(Color(white: 0.5))
                        .italic()
                }
            }
        }
        .padding(14)
        .background(Color(white: 0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(white: 0.13), lineWidth: 1)
        )
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            // Swipe derecha → Confirmar llegada
            if reservation.status == "pending" || reservation.status == "confirmed" {
                Button {
                    confirming = true
                    Task {
                        await vm.confirm(id: reservation.id)
                        confirming = false
                    }
                } label: {
                    Label("Llegó", systemImage: "checkmark.circle.fill")
                }
                .tint(.green)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            // Swipe izquierda → Editar
            Button {
                vm.editingReservation = reservation
            } label: {
                Label("Editar", systemImage: "pencil")
            }
            .tint(.blue)
        }
        .confirmationDialog("¿Cancelar esta reserva?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Cancelar reserva", role: .destructive) {
                Task { await vm.delete(id: reservation.id) }
            }
            Button("Mantener", role: .cancel) {}
        }
    }
}
