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
    
    private var timer: Timer?
    private var uiTimer: Timer?
    private let soundPlayer = SoundPlayer.shared
    
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
                self?.soundPlayer.playNotification()
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
    
    // Fetch orders from API and convert to batches
    func fetchOrders() async {
        do {
            let orders = try await APIService.shared.fetchPreparingOrders()
            
            // Convert orders to batches
            let newBatches = convertOrdersToBatches(orders)
            let newBatchIds = Set(newBatches.map { $0.id })
            
            // Check for new batches
            let hasNewBatch = newBatches.contains { !previousBatchIds.contains($0.id) }
            
            // Play sound for new batches
            if hasNewBatch {
                print("🔔 New batch detected!")
                soundPlayer.playNotification()
                
                // Auto-expand new batches
                for batch in newBatches where !previousBatchIds.contains(batch.id) {
                    expandedBatchIds.insert(batch.id)
                }
            }
            
            // Update tracking
            previousBatchIds = newBatchIds
            
            // Sort: rush first, then by effective elapsed time (oldest first = FIFO)
            batches = newBatches.sorted { a, b in
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
            // Filter out voided and delivered items
            let activeItems = (order.items ?? []).filter { 
                $0.voided != true && $0.deliveredToTable != true 
            }
            
            // Apply KDS view mode filter (food / beverages / all)
            let filteredItems: [OrderItem]
            switch viewMode {
            case "food":
                filteredItems = activeItems.filter { $0.product?.category?.isBeverage != true }
            case "beverages":
                filteredItems = activeItems.filter { $0.product?.category?.isBeverage == true }
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
                        holdAccumulatedSeconds: order.holdAccumulatedSeconds ?? 0
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
