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
    }
    
    // Start polling for orders every 3 seconds
    func startPolling() async {
        await fetchOrders()
        
        // Timer para actualizar órdenes cada 3 segundos
        timer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.fetchOrders()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
        
        // Timer para actualizar UI cada segundo (para el reloj)
        uiTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.currentTime = Date()
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
            
            // Sort batches by creation date (newest first)
            batches = newBatches.sorted { batch1, batch2 in
                guard let date1 = parseDate(batch1.createdAt),
                      let date2 = parseDate(batch2.createdAt) else {
                    return false
                }
                return date1 > date2
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
            
            guard !activeItems.isEmpty else { continue }
            
            print("🔍 Order #\(order.orderNumber): \(activeItems.count) active items (total: \(order.items?.count ?? 0))")
            
            // Sort items by createdAt
            let sortedItems = activeItems.sorted { item1, item2 in
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
                        preparationTime: order.preparationTime
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
                    preparationTime: order.preparationTime
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
    
    // Toggle batch expansion
    func toggleExpand(batchId: String) {
        if expandedBatchIds.contains(batchId) {
            expandedBatchIds.remove(batchId)
        } else {
            expandedBatchIds.insert(batchId)
        }
    }
    
    // Get elapsed time string for batch
    func getElapsedTime(batch: OrderBatch) -> String {
        guard let createdDate = parseDate(batch.createdAt) else {
            return "0m 0s"
        }
        
        let elapsed = Int(currentTime.timeIntervalSince(createdDate))
        let minutes = elapsed / 60
        let seconds = elapsed % 60
        
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
        
        return try? JSONDecoder().decode([String: CustomModifier].self, from: data)
    }
}
