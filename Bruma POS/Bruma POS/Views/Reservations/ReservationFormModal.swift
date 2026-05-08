import SwiftUI

struct ReservationFormModal: View {
    @ObservedObject var vm: ReservationsViewModel
    let reservation: Reservation?
    @Environment(\.dismiss) private var dismiss

    @State private var tableId = ""
    @State private var customerName = ""
    @State private var customerPhone = ""
    @State private var guestCount = 2
    @State private var reservationDate = ""
    @State private var reservationTime = ""
    @State private var duration = 120
    @State private var notes = ""
    @State private var submitting = false
    @State private var errorMessage = ""

    private var isEditing: Bool { reservation != nil }

    private var availableTables: [Table] {
        vm.tables.filter { $0.capacity >= guestCount }
    }

    private var isValid: Bool {
        !tableId.isEmpty && !customerName.trimmingCharacters(in: .whitespaces).isEmpty
            && !reservationDate.isEmpty && !reservationTime.isEmpty
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    HStack {
                        Text(isEditing ? "Editar Reserva" : "Nueva Reserva")
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

                    // Date & Time
                    HStack(spacing: 12) {
                        formField(label: "Fecha *") {
                            DateField(value: $reservationDate)
                        }
                        formField(label: "Hora *") {
                            TimeField(value: $reservationTime)
                        }
                    }

                    // Duration
                    formField(label: "Duración") {
                        Menu {
                            ForEach([60, 90, 120, 150, 180], id: \.self) { mins in
                                Button("\(durationLabel(mins))") { duration = mins }
                            }
                        } label: {
                            HStack {
                                Text(durationLabel(duration))
                                    .foregroundColor(.white)
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .foregroundColor(.gray)
                                    .font(.caption)
                            }
                            .padding(14)
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
                        }
                    }

                    // Name & Phone
                    HStack(spacing: 12) {
                        formField(label: "Nombre *") {
                            styledTextField("Juan Pérez", text: $customerName)
                        }
                        formField(label: "Teléfono") {
                            styledTextField("555-1234", text: $customerPhone)
                                .keyboardType(.phonePad)
                        }
                    }

                    // Guests & Table
                    HStack(spacing: 12) {
                        formField(label: "Personas *") {
                            HStack(spacing: 0) {
                                Button {
                                    if guestCount > 1 { guestCount -= 1 }
                                } label: {
                                    Image(systemName: "minus")
                                        .font(.headline)
                                        .foregroundColor(guestCount > 1 ? .white : .gray)
                                        .frame(width: 44, height: 44)
                                }
                                .disabled(guestCount <= 1)

                                Text("\(guestCount)")
                                    .font(.title2.bold())
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)

                                Button {
                                    if guestCount < 20 { guestCount += 1 }
                                } label: {
                                    Image(systemName: "plus")
                                        .font(.headline)
                                        .foregroundColor(guestCount < 20 ? .white : .gray)
                                        .frame(width: 44, height: 44)
                                }
                                .disabled(guestCount >= 20)
                            }
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
                        }

                        formField(label: "Mesa *") {
                            Menu {
                                if availableTables.isEmpty {
                                    Text("Sin mesas disponibles")
                                } else {
                                    ForEach(availableTables) { table in
                                        Button("Mesa \(table.number) (Cap: \(table.capacity))") {
                                            tableId = table.id
                                        }
                                    }
                                }
                            } label: {
                                HStack {
                                    Text(selectedTableText)
                                        .foregroundColor(tableId.isEmpty ? Color(white: 0.4) : .white)
                                    Spacer()
                                    Image(systemName: "chevron.down")
                                        .foregroundColor(.gray)
                                        .font(.caption)
                                }
                                .padding(14)
                                .background(Color(white: 0.1))
                                .cornerRadius(10)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
                            }
                        }
                    }

                    if availableTables.isEmpty && guestCount > 1 {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                                .font(.caption)
                            Text("No hay mesas con capacidad para \(guestCount) personas")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }

                    // Notes
                    formField(label: "Notas especiales") {
                        ZStack(alignment: .topLeading) {
                            if notes.isEmpty {
                                Text("Alergias, ocasión especial...")
                                    .font(.body)
                                    .foregroundColor(Color(white: 0.4))
                                    .padding(.horizontal, 14)
                                    .padding(.top, 14)
                            }
                            TextEditor(text: $notes)
                                .font(.body)
                                .foregroundColor(.white)
                                .frame(height: 80)
                                .padding(10)
                                .scrollContentBackground(.hidden)
                        }
                        .background(Color(white: 0.1))
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
                    }

                    // Error
                    if !errorMessage.isEmpty {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.red)
                                .font(.caption)
                            Text(errorMessage)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                    }

                    // Buttons
                    HStack(spacing: 12) {
                        Button { dismiss() } label: {
                            Text("Cancelar")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color(white: 0.12))
                                .cornerRadius(12)
                        }

                        Button { handleSave() } label: {
                            Text(submitting ? "Guardando..." : (isEditing ? "Actualizar" : "Crear Reserva"))
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(isValid && !submitting ? Color.blue : Color.gray)
                                .cornerRadius(12)
                        }
                        .disabled(!isValid || submitting)
                    }

                    Spacer(minLength: 20)
                }
                .padding(20)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { prefillIfEditing() }
    }

    private var selectedTableText: String {
        guard !tableId.isEmpty,
              let table = vm.tables.first(where: { $0.id == tableId }) else {
            return "Seleccionar mesa"
        }
        return "Mesa \(table.number)"
    }

    private func durationLabel(_ mins: Int) -> String {
        let h = mins / 60
        let m = mins % 60
        if m == 0 { return "\(h) hora\(h > 1 ? "s" : "")" }
        return "\(h)h \(m)min"
    }

    private func prefillIfEditing() {
        guard let r = reservation else {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            reservationDate = formatter.string(from: Date())
            return
        }
        tableId = r.tableId
        customerName = r.customerName
        customerPhone = r.customerPhone ?? ""
        guestCount = r.guestCount
        reservationDate = r.reservationDate
        reservationTime = r.reservationTime
        duration = r.duration
        notes = r.notes ?? ""
    }

    private func handleSave() {
        submitting = true
        errorMessage = ""
        let body: [String: Any] = [
            "tableId": tableId,
            "customerName": customerName.trimmingCharacters(in: .whitespaces),
            "customerPhone": customerPhone.isEmpty ? "" : customerPhone,
            "guestCount": guestCount,
            "reservationDate": reservationDate,
            "reservationTime": reservationTime,
            "duration": duration,
            "notes": notes.trimmingCharacters(in: .whitespaces)
        ]
        Task {
            let success = await vm.save(body: body, editingId: reservation?.id)
            submitting = false
            if success {
                dismiss()
            } else {
                errorMessage = "Error al guardar la reserva"
            }
        }
    }

    @ViewBuilder
    private func formField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.bold())
                .foregroundColor(.gray)
            content()
        }
        .frame(maxWidth: .infinity)
    }

    private func styledTextField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .font(.body)
            .foregroundColor(.white)
            .padding(14)
            .background(Color(white: 0.1))
            .cornerRadius(10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
    }
}

// MARK: - Date Field

struct DateField: View {
    @Binding var value: String
    @State private var show = false
    @State private var date = Date()

    var displayValue: String {
        if value.isEmpty { return "Seleccionar" }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: value) else { return value }
        f.dateFormat = "d MMM yyyy"
        f.locale = Locale(identifier: "es_MX")
        return f.string(from: d)
    }

    var body: some View {
        Button { show = true } label: {
            HStack {
                Image(systemName: "calendar")
                    .foregroundColor(.blue)
                    .font(.caption)
                Text(displayValue)
                    .foregroundColor(value.isEmpty ? Color(white: 0.4) : .white)
                Spacer()
            }
            .padding(14)
            .background(Color(white: 0.1))
            .cornerRadius(10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
        }
        .sheet(isPresented: $show) {
            ZStack {
                Color.black.ignoresSafeArea()
                VStack(spacing: 20) {
                    HStack {
                        Text("Seleccionar Fecha")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Spacer()
                    }
                    DatePicker("", selection: $date, in: Date()..., displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .colorScheme(.dark)
                        .accentColor(.blue)
                    Button {
                        let f = DateFormatter()
                        f.dateFormat = "yyyy-MM-dd"
                        value = f.string(from: date)
                        show = false
                    } label: {
                        Text("Confirmar")
                            .font(.headline).foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                            .background(Color.blue).cornerRadius(12)
                    }
                }
                .padding(20)
            }
            .presentationDetents([.medium])
        }
    }
}

// MARK: - Time Field

struct TimeField: View {
    @Binding var value: String
    @State private var show = false
    @State private var date = Calendar.current.date(bySettingHour: 19, minute: 0, second: 0, of: Date()) ?? Date()

    var displayValue: String {
        value.isEmpty ? "Seleccionar" : value
    }

    var body: some View {
        Button { show = true } label: {
            HStack {
                Image(systemName: "clock.fill")
                    .foregroundColor(.blue)
                    .font(.caption)
                Text(displayValue)
                    .foregroundColor(value.isEmpty ? Color(white: 0.4) : .white)
                Spacer()
            }
            .padding(14)
            .background(Color(white: 0.1))
            .cornerRadius(10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2), lineWidth: 1))
        }
        .sheet(isPresented: $show) {
            ZStack {
                Color.black.ignoresSafeArea()
                VStack(spacing: 20) {
                    HStack {
                        Text("Seleccionar Hora")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Spacer()
                    }
                    DatePicker("", selection: $date, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .colorScheme(.dark)
                        .labelsHidden()
                    Button {
                        let f = DateFormatter()
                        f.dateFormat = "HH:mm"
                        value = f.string(from: date)
                        show = false
                    } label: {
                        Text("Confirmar")
                            .font(.headline).foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                            .background(Color.blue).cornerRadius(12)
                    }
                }
                .padding(20)
            }
            .presentationDetents([.medium])
        }
    }
}
