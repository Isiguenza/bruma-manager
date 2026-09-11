//
//  OrdersViewModel.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import Foundation
import SwiftUI
import Combine

@MainActor
class OrdersViewModel: ObservableObject {
    @Published var batches: [OrderBatch] = [] // Changed from orders to batches
    @Published var previousBatchIds: Set<String> = [] // Track batch IDs instead of order IDs
    @Published var expandedBatchIds: Set<String> = [] // Track expanded batches
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentTime = Date() // Para forzar actualización del timer
    @Published var viewMode: String = "all" // all | food | beverages

    /// Estado optimista de "entregado" por item (itemId → entregado). Se aplica
    /// al instante al tocar un platillo y se limpia cuando un fetch lo confirma.
    @Published var deliveredOverride: [String: Bool] = [:]
    /// Rondas (batches) que se completaron hace poco — franja arriba del board
    /// con "Deshacer" durante 60s, para que una ronda no desaparezca en
    /// silencio si faltó marcar un plato.
    @Published var recentlyCompleted: [CompletedOrder] = []

    /// Batch cuya comanda se está reimprimiendo ahora (para el spinner).
    @Published var reprintingBatchId: String?

    private var timer: Timer?
    private var uiTimer: Timer?
    private let soundPlayer = SoundPlayer.shared

    /// Última foto conocida de cada BATCH (ronda). Cada ronda enviada a cocina
    /// es una tarjeta independiente aunque sea de la misma mesa/orden — se va
    /// del board cuando SUS platillos están entregados, sin esperar a las demás.
    private var batchSnapshots: [String: (orderNumber: Int, label: String, itemIds: [String], allDelivered: Bool)] = [:]
    private let completedTTL: TimeInterval = 60
    
    init() {
        Task {
            await startPolling()
            setupSocketCallbacks()
        }
    }
    
    deinit {
        timer?.invalidate()
        timer = nil
        uiTimer?.invalidate()
        uiTimer = nil
    }
    
    @MainActor
    private func setupSocketCallbacks() {
        SocketService.shared.connect(baseURL: APIService.shared.baseURL)
        
        SocketService.shared.onNewOrder = { [weak self] in
            Task { @MainActor in
                print("📦 Dispatch: New order received via WebSocket")
                self?.soundPlayer.playNotification(viewMode: self?.viewMode ?? "all")
                await self?.fetchOrders()
            }
        }
        
        SocketService.shared.onOrderUpdated = { [weak self] orderId in
            Task { @MainActor in
                print("📦 Dispatch: Order updated via WebSocket: \(orderId)")
                await self?.fetchOrders()
            }
        }
        
        SocketService.shared.onOrderRush = { [weak self] orderId in
            Task { @MainActor in
                print("🔥 Dispatch: Order rush via WebSocket: \(orderId)")
                await self?.fetchOrders()
            }
        }
        
        SocketService.shared.onOrderHold = { [weak self] orderId in
            Task { @MainActor in
                print("⏸️ Dispatch: Order hold via WebSocket: \(orderId)")
                await self?.fetchOrders()
            }
        }
    }
    
    // Polling backup every 30s, WebSocket is primary
    func startPolling() async {
        await fetchOrders()
        
        // Backup polling - only runs if WebSocket fails
        timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                print("🔄 Dispatch: Backup poll (WebSocket should handle real-time)")
                await self?.fetchOrders()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
        
        // Timer para actualizar UI cada segundo (para el reloj)
        uiTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            Task { @MainActor in
                self.currentTime = Date()
                self.pruneCompleted()
            }
        }
        RunLoop.main.add(uiTimer!, forMode: .common)
    }
    
    func stopPolling() {
        timer?.invalidate()
        timer = nil
        uiTimer?.invalidate()
        uiTimer = nil
    }
    
    // ¿Este item está entregado? (override optimista o dato del servidor)
    func isDelivered(_ item: OrderItem) -> Bool {
        deliveredOverride[item.id] ?? (item.deliveredToTable == true)
    }

    /// (entregados, total) de un batch — para la barra de progreso.
    func deliveredProgress(_ batch: OrderBatch) -> (done: Int, total: Int) {
        let active = batch.items.filter { $0.voided != true }
        return (active.filter { isDelivered($0) }.count, active.count)
    }

    /// Tap en un platillo → marca / desmarca entregado (optimista + API).
    func toggleItemDelivered(_ item: OrderItem) async {
        let target = !isDelivered(item)
        deliveredOverride[item.id] = target
        do {
            try await APIService.shared.setItemsDelivered([item.id], delivered: target)
            await fetchOrders()
        } catch {
            deliveredOverride[item.id] = !target // revertir
            errorMessage = "No se pudo marcar el platillo — reintenta"
        }
    }

    /// "Marcar lo que falta" — entrega todos los platillos pendientes del batch.
    func markRemaining(_ batch: OrderBatch) async {
        let pending = batch.items.filter { $0.voided != true && !isDelivered($0) }.map { $0.id }
        guard !pending.isEmpty else { return }
        for id in pending { deliveredOverride[id] = true }
        do {
            try await APIService.shared.setItemsDelivered(pending, delivered: true)
            await fetchOrders()
        } catch {
            for id in pending { deliveredOverride[id] = false }
            errorMessage = "No se pudo completar la orden — reintenta"
        }
    }

    /// Reimprime la comanda de cocina de esta ronda y la manda a la impresora.
    func reprintComanda(_ batch: OrderBatch) async {
        reprintingBatchId = batch.id
        defer { reprintingBatchId = nil }
        let itemIds = batch.items.filter { $0.voided != true }.map { $0.id }
        do {
            try await APIService.shared.reprintComanda(orderId: batch.orderId, itemIds: itemIds)
            errorMessage = nil
        } catch {
            errorMessage = "No se pudo reimprimir — revisa la impresora"
        }
    }

    /// "Deshacer" en la franja de completadas → revierte y la orden vuelve al board.
    func undoCompleted(_ completed: CompletedOrder) async {
        recentlyCompleted.removeAll { $0.id == completed.id }
        for id in completed.itemIds { deliveredOverride[id] = false }
        do {
            try await APIService.shared.setItemsDelivered(completed.itemIds, delivered: false)
            await fetchOrders()
        } catch {
            errorMessage = "No se pudo deshacer — reintenta"
        }
    }

    func dismissCompleted(_ completed: CompletedOrder) {
        recentlyCompleted.removeAll { $0.id == completed.id }
    }

    private func pruneCompleted() {
        let now = Date()
        let expired = recentlyCompleted.filter { now.timeIntervalSince($0.completedAt) > completedTTL }
        for c in expired {
            for id in c.itemIds { deliveredOverride.removeValue(forKey: id) }
        }
        recentlyCompleted.removeAll { now.timeIntervalSince($0.completedAt) > completedTTL }
    }

    private func batchLabel(_ batch: OrderBatch) -> String {
        if let t = batch.table { return "Mesa \(t.number)" }
        if let n = batch.customerName, !n.isEmpty { return "Llevar · \(n)" }
        return "Para llevar"
    }

    private func batchAllDelivered(_ batch: OrderBatch) -> Bool {
        let active = batch.items.filter { $0.voided != true }
        return !active.isEmpty && active.allSatisfy { isDelivered($0) }
    }

    // Fetch orders from API and convert to batches
    func fetchOrders() async {
        do {
            let orders = try await APIService.shared.fetchPreparingOrders()

            // Reconciliar overrides: si el servidor ya refleja lo que marcamos
            // localmente, soltar el override para no arrastrar estado viejo.
            for order in orders {
                for item in order.items ?? [] {
                    if let ov = deliveredOverride[item.id], ov == (item.deliveredToTable == true) {
                        deliveredOverride.removeValue(forKey: item.id)
                    }
                }
            }

            // TODAS las rondas (batches) de las órdenes vigentes, incluidas las
            // que ya están completas — el filtrado y la detección de completadas
            // se hacen aquí, a nivel batch.
            let allBatches = convertOrdersToBatches(orders)
            var batchDone: [String: Bool] = [:]
            for b in allBatches { batchDone[b.id] = batchAllDelivered(b) }
            let allBatchIds = Set(allBatches.map { $0.id })

            // Limpiar overrides huérfanos.
            let liveItemIds = Set(orders.flatMap { ($0.items ?? []).map { $0.id } })
                .union(recentlyCompleted.flatMap { $0.itemIds })
            deliveredOverride = deliveredOverride.filter { liveItemIds.contains($0.key) }

            // Detección de rondas recién completadas: la foto previa tenía algo
            // pendiente y ahora la ronda salió (todos sus platillos entregados, o
            // desapareció del fetch). Cada ronda es independiente aunque
            // comparta mesa/orden con otra.
            for (batchId, snap) in batchSnapshots {
                guard !snap.allDelivered,
                      !recentlyCompleted.contains(where: { $0.id == batchId }) else { continue }
                let gone = !allBatchIds.contains(batchId)
                let doneNow = gone
                    ? snap.itemIds.allSatisfy { deliveredOverride[$0] == true }
                    : (batchDone[batchId] ?? false)
                if doneNow {
                    recentlyCompleted.insert(
                        CompletedOrder(id: batchId, orderNumber: snap.orderNumber,
                                       label: snap.label, itemIds: snap.itemIds,
                                       completedAt: Date()),
                        at: 0
                    )
                }
            }

            // Actualizar fotos de las rondas vigentes.
            var snapshots: [String: (orderNumber: Int, label: String, itemIds: [String], allDelivered: Bool)] = [:]
            for b in allBatches {
                let active = b.items.filter { $0.voided != true }
                guard !active.isEmpty else { continue }
                snapshots[b.id] = (
                    b.orderNumber,
                    batchLabel(b),
                    active.map { $0.id },
                    batchDone[b.id] ?? false
                )
            }
            batchSnapshots = snapshots
            pruneCompleted()

            // Sonido / auto-expand de rondas nuevas — contra TODOS los batch ids
            // vistos (los completados siguen contando) para que "Deshacer" no
            // dispare el sonido otra vez.
            let hasNewBatch = allBatches.contains { !previousBatchIds.contains($0.id) }
            if hasNewBatch {
                soundPlayer.playNotification(viewMode: viewMode)
                for batch in allBatches where !previousBatchIds.contains(batch.id) {
                    expandedBatchIds.insert(batch.id)
                }
            }
            previousBatchIds = allBatchIds

            // El board solo muestra rondas con algo pendiente de entregar.
            batches = allBatches
                .filter { b in b.items.contains { $0.voided != true && !isDelivered($0) } }
                .sorted { a, b in
                    if a.isRush && !b.isRush { return true }
                    if !a.isRush && b.isRush { return false }
                    return a.effectiveElapsedMinutes > b.effectiveElapsedMinutes
                }
            errorMessage = nil
            
        } catch {
            print("❌ Error fetching orders: \(error)")
            errorMessage = "Error al cargar órdenes"
        }
    }
    
    // Convert orders to batches (group items by createdAt timestamp)
    private func convertOrdersToBatches(_ orders: [Order]) -> [OrderBatch] {
        var allBatches: [OrderBatch] = []
        
        for order in orders {
            // En el Pase los platillos ENTREGADOS siguen visibles (tachados) —
            // solo se ocultan los anulados. La orden entera desaparece del
            // board cuando ya está todo entregado (pasa a "ready" en el backend).
            let activeItems = (order.items ?? []).filter { $0.voided != true }
            
            // Apply KDS view mode filter (food / beverages / all)
            let filteredItems: [OrderItem]
            switch viewMode {
            case "food":
                filteredItems = activeItems.filter { !$0.effectiveIsBeverage }
            case "beverages":
                filteredItems = activeItems.filter { $0.effectiveIsBeverage }
            default:
                filteredItems = activeItems
            }
            
            guard !filteredItems.isEmpty else { continue }

            print("🔍 Order #\(order.orderNumber): \(filteredItems.count) filtered items (total: \(order.items?.count ?? 0))")
            
            // Sort items by createdAt
            let sortedItems = filteredItems.sorted { item1, item2 in
                guard let date1 = item1.createdAt.flatMap({ parseDate($0) }),
                      let date2 = item2.createdAt.flatMap({ parseDate($0) }) else {
                    return false
                }
                return date1 < date2
            }
            
            // Debug: print all item timestamps
            for (idx, item) in sortedItems.enumerated() {
                print("  📋 Item[\(idx)] \(item.productName): createdAt=\(item.createdAt ?? "nil"), deliveredToTable=\(item.deliveredToTable ?? false)")
            }
            
            // Group items into batches (items within 30 seconds of EACH OTHER = same batch)
            var currentBatch: [OrderItem] = [sortedItems[0]]
            var lastItemDate = sortedItems[0].createdAt.flatMap { parseDate($0) } ?? Date.distantPast
            
            for i in 1..<sortedItems.count {
                let itemDate = sortedItems[i].createdAt.flatMap { parseDate($0) } ?? Date.distantPast
                let gap = abs(itemDate.timeIntervalSince(lastItemDate))
                
                print("  ⏱️ Gap between item[\(i-1)] and item[\(i)]: \(Int(gap))s")
                
                // If within 30 seconds of the LAST item, same batch
                if gap <= 30 {
                    currentBatch.append(sortedItems[i])
                    lastItemDate = itemDate
                } else {
                    // Create batch from current items
                    let batchId = "\(order.id)_\(currentBatch[0].id)"
                    let batch = OrderBatch(
                        id: batchId,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        items: currentBatch,
                        createdAt: currentBatch[0].createdAt ?? order.createdAt,
                        table: order.table,
                        customerName: order.customerName,
                        preparationTime: order.preparationTime,
                        isRush: order.priority == 1,
                        isOnHold: order.onHold ?? false,
                        holdAccumulatedSeconds: order.holdAccumulatedSeconds ?? 0,
                        isPractice: order.isPractice ?? false
                    )
                    allBatches.append(batch)
                    print("  ✅ Batch created: \(currentBatch.count) items")
                    
                    // Start new batch
                    currentBatch = [sortedItems[i]]
                    lastItemDate = itemDate
                }
            }
            
            // Add final batch
            if !currentBatch.isEmpty {
                let batchId = "\(order.id)_\(currentBatch[0].id)"
                let batch = OrderBatch(
                    id: batchId,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    items: currentBatch,
                    createdAt: currentBatch[0].createdAt ?? order.createdAt,
                    table: order.table,
                    customerName: order.customerName,
                    preparationTime: order.preparationTime,
                    isRush: order.priority == 1,
                    isOnHold: order.onHold ?? false,
                    holdAccumulatedSeconds: order.holdAccumulatedSeconds ?? 0
                )
                allBatches.append(batch)
                print("  ✅ Final batch: \(currentBatch.count) items")
            }
            
            print("📊 Order #\(order.orderNumber) → \(allBatches.count) total batches")
        }
        
        return allBatches
    }
    
    // Mark batch as ready (delivered to table)
    func markBatchAsReady(batch: OrderBatch) async {
        do {
            let itemIds = batch.items.map { $0.id }
            try await APIService.shared.markBatchAsReady(itemIds: itemIds)
            print("✅ Batch marked as ready: \(batch.items.count) items")
            await fetchOrders()
        } catch {
            print("❌ Error marking batch as ready: \(error)")
            errorMessage = "Error al marcar batch como listo"
        }
    }
    
    // Rush order (toggle)
    func toggleRush(batch: OrderBatch) async {
        do {
            if batch.isRush {
                try await APIService.shared.unrushOrder(orderId: batch.orderId)
            } else {
                try await APIService.shared.rushOrder(orderId: batch.orderId)
            }
            await fetchOrders()
        } catch {
            print("❌ Error toggling rush: \(error)")
            errorMessage = "Error al activar/desactivar rush"
        }
    }
    
    // Hold order (toggle)
    func toggleHold(batch: OrderBatch) async {
        do {
            if batch.isOnHold {
                try await APIService.shared.unholdOrder(orderId: batch.orderId)
            } else {
                try await APIService.shared.holdOrder(orderId: batch.orderId)
            }
            await fetchOrders()
        } catch {
            print("❌ Error toggling hold: \(error)")
            errorMessage = "Error al detener/reanudar orden"
        }
    }
    
    // Toggle batch expansion
    func toggleExpand(batchId: String) {
        if expandedBatchIds.contains(batchId) {
            expandedBatchIds.remove(batchId)
        } else {
            expandedBatchIds.insert(batchId)
        }
    }
    
    // Get elapsed time string for batch (excludes hold time)
    func getElapsedTime(batch: OrderBatch) -> String {
        guard let createdDate = parseDate(batch.createdAt) else {
            return "0m 0s"
        }
        
        let total = Int(currentTime.timeIntervalSince(createdDate))
        let effective = max(0, total - batch.holdAccumulatedSeconds)
        let minutes = effective / 60
        let seconds = effective % 60
        
        return "\(minutes)m \(seconds)s"
    }
    
    // Robust date parser for multiple formats
    func parseDate(_ dateString: String) -> Date? {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSZ",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss.SSS",
            "yyyy-MM-dd HH:mm:ss",
        ]
        
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        
        for format in formats {
            df.dateFormat = format
            if let date = df.date(from: dateString) {
                return date
            }
        }
        
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: dateString) {
            return date
        }
        
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: dateString)
    }
    
    // Parse custom modifiers JSON
    func parseCustomModifiers(_ json: String?) -> [String: CustomModifier]? {
        guard let json = json,
              let data = json.data(using: .utf8) else {
            return nil
        }
        do {
            // Try POS format: dictionary keyed by stepId
            let result = try JSONDecoder().decode([String: CustomModifier].self, from: data)
            return result
        } catch {
            // Fallback: try legacy Waitress array format
            if let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                var dict: [String: CustomModifier] = [:]
                for entry in array {
                    if let stepId = entry["stepId"] as? String,
                       let optionName = entry["optionName"] as? String {
                        let existing = dict[stepId]
                        let stepName = entry["stepName"] as? String ?? existing?.stepName ?? ""
                        let opts = (existing?.options ?? []) + [ModifierOption(name: optionName)]
                        dict[stepId] = CustomModifier(stepName: stepName, options: opts)
                    }
                }
                if !dict.isEmpty { return dict }
            }
            print("❌ [parseCustomModifiers] Failed to decode: \(error)")
            print("   JSON: \(json)")
            return nil
        }
    }
}
