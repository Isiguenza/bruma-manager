import SwiftUI

struct ReservationsView: View {
    @StateObject private var vm = ReservationsViewModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                VStack(spacing: 16) {
                    HStack {
                        Text("Reservas")
                            .font(.title.bold())
                            .foregroundColor(.white)
                        Spacer()
                        Button {
                            vm.editingReservation = nil
                            vm.showNewReservation = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(.subheadline.bold())
                                Text("Nueva")
                                    .font(.subheadline.bold())
                            }
                            .foregroundColor(.black)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.white)
                            .cornerRadius(8)
                        }
                    }

                    // Filters
                    HStack(spacing: 10) {
                        // Date picker button
                        DatePickerButton(selectedDate: $vm.selectedDate) {
                            Task { await vm.loadData() }
                        }

                        // Status filter
                        StatusFilterPicker(selected: $vm.statusFilter) {
                            Task { await vm.loadData() }
                        }

                        // Search
                        HStack(spacing: 6) {
                            Image(systemName: "magnifyingglass")
                                .font(.caption)
                                .foregroundColor(.gray)
                            TextField("Buscar cliente...", text: $vm.search)
                                .font(.caption)
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.1))
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.2), lineWidth: 1))
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
                    ProgressView()
                        .tint(.white)
                    Spacer()
                } else if vm.groupedReservations.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "calendar.badge.exclamationmark")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("No hay reservas")
                            .font(.headline)
                            .foregroundColor(.gray)
                        Text("para esta fecha y filtro")
                            .font(.subheadline)
                            .foregroundColor(Color(white: 0.4))
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 24, pinnedViews: .sectionHeaders) {
                            ForEach(vm.groupedReservations, id: \.date) { group in
                                Section {
                                    VStack(spacing: 8) {
                                        ForEach(group.items) { reservation in
                                            ReservationRowView(
                                                reservation: reservation,
                                                vm: vm
                                            )
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                } header: {
                                    HStack {
                                        Text(vm.formatDisplayDate(group.date))
                                            .font(.subheadline.bold())
                                            .foregroundColor(.gray)
                                        Spacer()
                                        Text("\(group.items.count) reservas")
                                            .font(.caption)
                                            .foregroundColor(Color(white: 0.4))
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 8)
                                    .background(Color.black)
                                }
                            }
                        }
                        .padding(.top, 8)
                        .padding(.bottom, 100)
                    }
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
                    .padding(.bottom, 100)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(), value: vm.toastMessage)
            }
        }
        .preferredColorScheme(.dark)
        .task { await vm.loadData() }
        .sheet(isPresented: $vm.showNewReservation) {
            ReservationFormModal(vm: vm, reservation: nil)
        }
        .sheet(item: $vm.editingReservation) { res in
            ReservationFormModal(vm: vm, reservation: res)
        }
    }
}

// MARK: - Date Picker Button

struct DatePickerButton: View {
    @Binding var selectedDate: String
    var onChange: () -> Void
    @State private var showPicker = false

    var displayDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: selectedDate) else { return selectedDate }
        formatter.dateFormat = "d MMM"
        formatter.locale = Locale(identifier: "es_MX")
        return formatter.string(from: date)
    }

    var body: some View {
        Button {
            showPicker = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                    .font(.caption)
                    .foregroundColor(.white)
                Text(displayDate)
                    .font(.caption.bold())
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color(white: 0.1))
            .cornerRadius(8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.2), lineWidth: 1))
        }
        .sheet(isPresented: $showPicker) {
            DatePickerSheet(selectedDate: $selectedDate, onDone: {
                showPicker = false
                onChange()
            })
        }
    }
}

struct DatePickerSheet: View {
    @Binding var selectedDate: String
    var onDone: () -> Void
    @State private var date = Date()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    HStack {
                        Text("Seleccionar Fecha")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Spacer()
                        Button {
                            onDone()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.headline)
                                .foregroundColor(.gray)
                                .frame(width: 32, height: 32)
                                .background(Color.white.opacity(0.1))
                                .clipShape(Circle())
                        }
                    }
                    DatePicker("", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .colorScheme(.dark)
                        .accentColor(.blue)
                        .onChange(of: date) { _, newDate in
                            let formatter = DateFormatter()
                            formatter.dateFormat = "yyyy-MM-dd"
                            selectedDate = formatter.string(from: newDate)
                        }

                    Button {
                        onDone()
                    } label: {
                        Text("Confirmar")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color.blue)
                            .cornerRadius(12)
                    }
                }
                .padding(20)
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            // Initialize date from selectedDate
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            if let d = formatter.date(from: selectedDate) {
                date = d
            }
        }
    }
}

// MARK: - Status Filter Picker

struct StatusFilterPicker: View {
    @Binding var selected: String
    var onChange: () -> Void

    let options: [(value: String, label: String)] = [
        ("all", "Todos"),
        ("pending", "Pendiente"),
        ("confirmed", "Confirmada"),
        ("arrived", "Llegó"),
        ("cancelled", "Cancelada"),
        ("no_show", "No Show"),
    ]

    var currentLabel: String {
        options.first { $0.value == selected }?.label ?? "Todos"
    }

    var body: some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Button {
                    selected = option.value
                    onChange()
                } label: {
                    HStack {
                        Text(option.label)
                        if selected == option.value {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.caption)
                    .foregroundColor(.white)
                Text(currentLabel)
                    .font(.caption.bold())
                    .foregroundColor(.white)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color(white: 0.1))
            .cornerRadius(8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.2), lineWidth: 1))
        }
    }
}
