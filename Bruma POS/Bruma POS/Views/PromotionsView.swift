import SwiftUI

/// Administración de promociones para el POS de iPad. La selección y el
/// formulario viven aquí (en vez de POSViewModel) para mantener el estado de
/// edición exclusivo de esta pantalla y compartida únicamente la capa API.
struct PromotionsView: View {
    @ObservedObject var vm: POSViewModel
    @State private var promotions: [Promotion] = []
    @State private var isLoading = true
    @State private var isShowingEditor = false
    @State private var editingPromotion: Promotion?
    @State private var errorMessage: String?

    private var orderedPromotions: [Promotion] {
        promotions.sorted {
            if $0.active != $1.active { return $0.active && !$1.active }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Cargando promociones…")
                        .tint(.white)
                        .foregroundStyle(.white)
                } else if promotions.isEmpty {
                    ContentUnavailableView(
                        "Sin promociones",
                        systemImage: "tag",
                        description: Text("Crea una promoción para que aparezca en el POS.")
                    )
                    .foregroundStyle(.white)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(orderedPromotions) { promotion in
                                PromotionAdminRow(
                                    promotion: promotion,
                                    onEdit: {
                                        editingPromotion = promotion
                                        isShowingEditor = true
                                    },
                                    onToggle: { toggle(promotion) },
                                    onDelete: { delete(promotion) }
                                )
                            }
                        }
                        .padding(14)
                        .modifier(FlatSection(cornerRadius: 18))
                        .padding(20)
                    }
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea())
            .navigationTitle("Promociones")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editingPromotion = nil
                        isShowingEditor = true
                    } label: {
                        Label("Nueva promoción", systemImage: "plus")
                    }
                }
            }
            .task { await loadPromotions() }
            .refreshable { await loadPromotions() }
            .sheet(isPresented: $isShowingEditor) {
                PromotionEditorView(vm: vm, promotion: editingPromotion) { savedPromotion in
                    replace(savedPromotion)
                }
                .id(editingPromotion?.id ?? "new-promotion")
            }
            .alert("No se pudo completar la acción", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("Aceptar", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Error desconocido")
            }
        }
    }

    private func loadPromotions() async {
        isLoading = true
        defer { isLoading = false }
        do {
            promotions = try await APIService.shared.fetchPromotions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func replace(_ promotion: Promotion) {
        if let index = promotions.firstIndex(where: { $0.id == promotion.id }) {
            promotions[index] = promotion
        } else {
            promotions.append(promotion)
        }
    }

    private func toggle(_ promotion: Promotion) {
        Task {
            do {
                let updated = try await APIService.shared.updatePromotion(id: promotion.id, body: ["active": !promotion.active])
                replace(updated)
                vm.showToast(updated.active ? "Promoción activada" : "Promoción desactivada")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func delete(_ promotion: Promotion) {
        Task {
            do {
                try await APIService.shared.deletePromotion(id: promotion.id)
                promotions.removeAll { $0.id == promotion.id }
                vm.showToast("Promoción eliminada")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct PromotionAdminRow: View {
    let promotion: Promotion
    let onEdit: () -> Void
    let onToggle: () -> Void
    let onDelete: () -> Void

    private var typeLabel: String {
        switch promotion.type {
        case "buy_x_get_y": return "Compra \(promotion.buyQuantity ?? 0), lleva \(promotion.getQuantity ?? 0)"
        case "percentage_discount": return "\(String(format: "%.0f", promotion.discountPercentage ?? 0))% de descuento"
        case "fixed_discount": return "$\(String(format: "%.2f", promotion.discountAmount ?? 0)) de descuento"
        case "combo": return "Combo"
        default: return promotion.type
        }
    }

    private var appliesTo: String {
        switch promotion.applyTo {
        case "all_products": return "Todos los productos"
        case "specific_products": return "\(promotion.parsedProductIds.count) producto(s)"
        case "category": return "Una categoría"
        default: return promotion.applyTo
        }
    }

    private var schedule: String {
        var parts: [String] = []
        if let startDate = promotion.startDate { parts.append("Desde \(startDate)") }
        if let endDate = promotion.endDate { parts.append("Hasta \(endDate)") }
        if let startTime = promotion.startTime { parts.append(startTime) }
        if let endTime = promotion.endTime { parts.append("– \(endTime)") }
        return parts.isEmpty ? "Sin vigencia limitada" : parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Button(action: onEdit) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(promotion.name)
                            .font(.headline)
                            .foregroundStyle(.white)
                        Spacer()
                        Text(promotion.active ? "Activa" : "Inactiva")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(promotion.active ? .green : .secondary)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .modifier(FlatPill(isSelected: promotion.active, color: .green))
                    }
                    Text(typeLabel).font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
                    Text("\(appliesTo) · \(schedule)")
                        .font(.caption)
                        .foregroundStyle(Color.white.opacity(0.6))
                        .multilineTextAlignment(.leading)
                    if let description = promotion.description, !description.isEmpty {
                        Text(description).font(.caption).foregroundStyle(Color.white.opacity(0.45))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            VStack(spacing: 10) {
                Button(action: onToggle) {
                    Image(systemName: promotion.active ? "pause.circle.fill" : "play.circle.fill")
                        .font(.title3)
                        .foregroundStyle(promotion.active ? .orange : .green)
                }
                .accessibilityLabel(promotion.active ? "Desactivar promoción" : "Activar promoción")

                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                }
                .accessibilityLabel("Eliminar promoción")
            }
            .buttonStyle(.borderless)
        }
        .padding(16)
        .modifier(FlatCard(cornerRadius: 12))
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) {
                Label("Eliminar", systemImage: "trash")
            }
            Button(action: onToggle) {
                Label(promotion.active ? "Desactivar" : "Activar", systemImage: promotion.active ? "pause" : "play")
            }
            .tint(promotion.active ? .orange : .green)
        }
    }
}

private struct PromotionEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: POSViewModel
    let promotion: Promotion?
    let onSaved: (Promotion) -> Void

    @State private var name: String
    @State private var description: String
    @State private var type: String
    @State private var buyQuantity: Int
    @State private var getQuantity: Int
    @State private var discountPercentage: Double
    @State private var discountAmount: Double
    @State private var applyTo: String
    @State private var productIds: Set<String>
    @State private var categoryId: String
    @State private var active: Bool
    @State private var hasStartDate: Bool
    @State private var startDate: Date
    @State private var hasEndDate: Bool
    @State private var endDate: Date
    @State private var daysOfWeek: Set<Int>
    @State private var hasStartTime: Bool
    @State private var startTime: String
    @State private var hasEndTime: Bool
    @State private var endTime: String
    @State private var priority: Int
    @State private var isSaving = false
    @State private var errorMessage: String?

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    init(vm: POSViewModel, promotion: Promotion?, onSaved: @escaping (Promotion) -> Void) {
        self.vm = vm
        self.promotion = promotion
        self.onSaved = onSaved
        _name = State(initialValue: promotion?.name ?? "")
        _description = State(initialValue: promotion?.description ?? "")
        _type = State(initialValue: promotion?.type ?? "buy_x_get_y")
        _buyQuantity = State(initialValue: promotion?.buyQuantity ?? 2)
        _getQuantity = State(initialValue: promotion?.getQuantity ?? 1)
        _discountPercentage = State(initialValue: promotion?.discountPercentage ?? 10)
        _discountAmount = State(initialValue: promotion?.discountAmount ?? 10)
        _applyTo = State(initialValue: promotion?.applyTo ?? "all_products")
        _productIds = State(initialValue: Set(promotion?.parsedProductIds ?? []))
        _categoryId = State(initialValue: promotion?.categoryId ?? "")
        _active = State(initialValue: promotion?.active ?? true)
        _hasStartDate = State(initialValue: promotion?.startDate != nil)
        _startDate = State(initialValue: promotion.flatMap { Self.dateFormatter.date(from: $0.startDate ?? "") } ?? Date())
        _hasEndDate = State(initialValue: promotion?.endDate != nil)
        _endDate = State(initialValue: promotion.flatMap { Self.dateFormatter.date(from: $0.endDate ?? "") } ?? Date())
        _daysOfWeek = State(initialValue: Set(promotion?.parsedDaysOfWeek ?? []))
        _hasStartTime = State(initialValue: promotion?.startTime != nil)
        _startTime = State(initialValue: promotion?.startTime ?? "09:00")
        _hasEndTime = State(initialValue: promotion?.endTime != nil)
        _endTime = State(initialValue: promotion?.endTime ?? "18:00")
        _priority = State(initialValue: promotion?.priority ?? 0)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Información") {
                    TextField("Nombre", text: $name)
                    TextField("Descripción (opcional)", text: $description, axis: .vertical)
                    Toggle("Activa", isOn: $active)
                    Stepper("Prioridad: \(priority)", value: $priority, in: 0...100)
                }

                Section("Tipo de promoción") {
                    Picker("Tipo", selection: $type) {
                        Text("Compra X lleva Y").tag("buy_x_get_y")
                        Text("Descuento porcentual").tag("percentage_discount")
                        Text("Descuento fijo").tag("fixed_discount")
                    }
                    .pickerStyle(.menu)

                    if type == "buy_x_get_y" {
                        Stepper("Compra: \(buyQuantity)", value: $buyQuantity, in: 1...50)
                        Stepper("Lleva: \(getQuantity)", value: $getQuantity, in: 1...50)
                    } else if type == "percentage_discount" {
                        Stepper("Descuento: \(String(format: "%.0f", discountPercentage))%", value: $discountPercentage, in: 1...100, step: 1)
                    } else {
                        Stepper("Descuento: $\(String(format: "%.2f", discountAmount))", value: $discountAmount, in: 1...10_000, step: 5)
                    }
                }

                Section("Aplica a") {
                    Picker("Alcance", selection: $applyTo) {
                        Text("Todos los productos").tag("all_products")
                        Text("Productos específicos").tag("specific_products")
                        Text("Categoría").tag("category")
                    }
                    .pickerStyle(.menu)

                    if applyTo == "specific_products" {
                        NavigationLink("Productos seleccionados: \(productIds.count)") {
                            PromotionProductPicker(products: vm.products, selectedIds: $productIds)
                        }
                    } else if applyTo == "category" {
                        Picker("Categoría", selection: $categoryId) {
                            Text("Selecciona una categoría").tag("")
                            ForEach(vm.categories) { category in
                                Text(category.name).tag(category.id)
                            }
                        }
                    }
                }

                Section("Vigencia") {
                    Toggle("Fecha de inicio", isOn: $hasStartDate)
                    if hasStartDate { DatePicker("Inicia", selection: $startDate, displayedComponents: .date) }
                    Toggle("Fecha de fin", isOn: $hasEndDate)
                    if hasEndDate { DatePicker("Termina", selection: $endDate, displayedComponents: .date) }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Días de la semana (vacío = todos)").font(.subheadline)
                        HStack {
                            ForEach(0...6, id: \.self) { day in
                                Button(["D", "L", "M", "M", "J", "V", "S"][day]) { toggleDay(day) }
                                    .font(.caption.weight(.bold))
                                    .frame(width: 30, height: 30)
                                    .modifier(FlatPill(isSelected: daysOfWeek.contains(day), color: .blue))
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    Toggle("Hora de inicio", isOn: $hasStartTime)
                    if hasStartTime { TextField("HH:mm", text: $startTime).keyboardType(.numbersAndPunctuation) }
                    Toggle("Hora de fin", isOn: $hasEndTime)
                    if hasEndTime { TextField("HH:mm", text: $endTime).keyboardType(.numbersAndPunctuation) }
                }
            }
            .navigationTitle(promotion == nil ? "Nueva promoción" : "Editar promoción")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Guardando…" : "Guardar") { save() }
                        .disabled(isSaving)
                }
            }
            .alert("Revisa la promoción", isPresented: Binding(
                get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
            )) { Button("Aceptar", role: .cancel) { errorMessage = nil } } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func toggleDay(_ day: Int) {
        if daysOfWeek.contains(day) { daysOfWeek.remove(day) } else { daysOfWeek.insert(day) }
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { errorMessage = "Escribe un nombre para la promoción"; return }
        guard applyTo != "specific_products" || !productIds.isEmpty else { errorMessage = "Selecciona al menos un producto"; return }
        guard applyTo != "category" || !categoryId.isEmpty else { errorMessage = "Selecciona una categoría"; return }

        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                let payload = payload(name: trimmedName)
                let saved: Promotion
                if let promotion {
                    saved = try await APIService.shared.updatePromotion(id: promotion.id, body: payload)
                } else {
                    saved = try await APIService.shared.createPromotion(body: payload)
                }
                onSaved(saved)
                vm.showToast(promotion == nil ? "Promoción creada" : "Promoción actualizada")
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func payload(name: String) -> [String: Any] {
        [
            "name": name,
            "description": description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? NSNull() : description,
            "type": type,
            "buyQuantity": type == "buy_x_get_y" ? buyQuantity : NSNull(),
            "getQuantity": type == "buy_x_get_y" ? getQuantity : NSNull(),
            "discountPercentage": type == "percentage_discount" ? discountPercentage : NSNull(),
            "discountAmount": type == "fixed_discount" ? discountAmount : NSNull(),
            "applyTo": applyTo,
            "productIds": applyTo == "specific_products" ? Array(productIds).sorted() : NSNull(),
            "categoryId": applyTo == "category" ? categoryId : NSNull(),
            "active": active,
            "startDate": hasStartDate ? Self.dateFormatter.string(from: startDate) : NSNull(),
            "endDate": hasEndDate ? Self.dateFormatter.string(from: endDate) : NSNull(),
            "daysOfWeek": daysOfWeek.isEmpty ? NSNull() : daysOfWeek.sorted(),
            "startTime": hasStartTime ? startTime : NSNull(),
            "endTime": hasEndTime ? endTime : NSNull(),
            "priority": priority,
            "comboRules": NSNull(),
        ]
    }
}

private struct PromotionProductPicker: View {
    let products: [Product]
    @Binding var selectedIds: Set<String>
    @State private var searchText = ""

    private var filteredProducts: [Product] {
        guard !searchText.isEmpty else { return products }
        return products.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        List(filteredProducts) { product in
            Button {
                if selectedIds.contains(product.id) { selectedIds.remove(product.id) }
                else { selectedIds.insert(product.id) }
            } label: {
                HStack {
                    VStack(alignment: .leading) {
                        Text(product.name)
                        if let category = product.category?.name { Text(category).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    Image(systemName: selectedIds.contains(product.id) ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(selectedIds.contains(product.id) ? .blue : .secondary)
                }
            }
            .foregroundStyle(.primary)
        }
        .navigationTitle("Productos")
        .searchable(text: $searchText, prompt: "Buscar producto")
    }
}
