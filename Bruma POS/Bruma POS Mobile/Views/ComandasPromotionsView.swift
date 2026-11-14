import SwiftUI

/// Administrador de promociones propio de iPhone. Comparte modelos y API con
/// POS, pero no la vista de iPad para conservar un layout de lista compacto.
/// Solo pausar/activar y eliminar: las promociones se crean y editan en el dashboard.
struct ComandasPromotionsView: View {
    @ObservedObject var vm: POSViewModel
    @State private var promotions: [Promotion] = []
    @State private var isLoading = true
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
                    ProgressView("Cargando promociones…").tint(.white).foregroundStyle(.white)
                } else if promotions.isEmpty {
                    ContentUnavailableView("Sin promociones", systemImage: "tag", description: Text("Se crean en el dashboard, en Promociones."))
                        .foregroundStyle(.white)
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 10) {
                            ForEach(orderedPromotions) { promotion in
                                ComandasPromotionRow(
                                    promotion: promotion,
                                    onToggle: { toggle(promotion) },
                                    onDelete: { delete(promotion) }
                                )
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea())
            .navigationTitle("Promociones")
            .task { await loadPromotions() }
            .refreshable { await loadPromotions() }
            .alert("No se pudo completar la acción", isPresented: Binding(
                get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
            )) { Button("Aceptar", role: .cancel) { errorMessage = nil } } message: {
                Text(errorMessage ?? "Error desconocido")
            }
        }
    }

    private func loadPromotions() async {
        isLoading = true
        defer { isLoading = false }
        do { promotions = try await APIService.shared.fetchPromotions() }
        catch { errorMessage = error.localizedDescription }
    }

    private func replace(_ promotion: Promotion) {
        if let index = promotions.firstIndex(where: { $0.id == promotion.id }) { promotions[index] = promotion }
        else { promotions.append(promotion) }
    }

    private func toggle(_ promotion: Promotion) {
        Task {
            do {
                let updated = try await APIService.shared.updatePromotion(id: promotion.id, body: ["active": !promotion.active])
                replace(updated)
                vm.showToast(updated.active ? "Promoción activada" : "Promoción desactivada")
            } catch { errorMessage = error.localizedDescription }
        }
    }

    private func delete(_ promotion: Promotion) {
        Task {
            do {
                try await APIService.shared.deletePromotion(id: promotion.id)
                promotions.removeAll { $0.id == promotion.id }
                vm.showToast("Promoción eliminada")
            } catch { errorMessage = error.localizedDescription }
        }
    }
}

private struct ComandasPromotionRow: View {
    let promotion: Promotion
    let onToggle: () -> Void
    let onDelete: () -> Void

    private var detail: String {
        switch promotion.type {
        case "buy_x_get_y": return "Compra \(promotion.buyQuantity ?? 0), lleva \(promotion.getQuantity ?? 0)"
        case "percentage_discount": return "\(String(format: "%.0f", promotion.discountPercentage ?? 0))% de descuento"
        case "fixed_discount": return "$\(String(format: "%.2f", promotion.discountAmount ?? 0)) de descuento"
        case "combo": return "Combo"
        default: return promotion.type
        }
    }

    private var scope: String {
        switch promotion.applyTo {
        case "all_products": return "Todos los productos"
        case "specific_products": return "\(promotion.parsedProductIds.count) producto(s)"
        case "category": return "Una categoría"
        default: return promotion.applyTo
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(promotion.name).font(.subheadline.weight(.bold)).foregroundStyle(.white).lineLimit(1)
                    Spacer()
                    Circle().fill(promotion.active ? .green : .gray).frame(width: 8, height: 8)
                }
                Text(detail).font(.caption.weight(.semibold)).foregroundStyle(.orange)
                Text(scope).font(.caption2).foregroundStyle(Color.white.opacity(0.55))
                if let startDate = promotion.startDate { Text("Desde \(startDate)").font(.caption2).foregroundStyle(Color.white.opacity(0.45)) }
            }

            Button(action: onToggle) {
                Image(systemName: promotion.active ? "pause.circle.fill" : "play.circle.fill")
                    .foregroundStyle(promotion.active ? .orange : .green)
                    .font(.title3)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(promotion.active ? "Desactivar promoción" : "Activar promoción")
        }
        .padding(12)
        .modifier(FlatCard(cornerRadius: 12))
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) { Label("Eliminar", systemImage: "trash") }
            Button(action: onToggle) {
                Label(promotion.active ? "Desactivar" : "Activar", systemImage: promotion.active ? "pause" : "play")
            }
            .tint(promotion.active ? .orange : .green)
        }
    }
}
