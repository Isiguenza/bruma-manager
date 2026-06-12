import Foundation
import Network
import Combine

/// Monitorea conectividad y sincroniza automáticamente la cola offline
class SyncEngine: ObservableObject {
    static let shared = SyncEngine()
    
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "SyncEngine")
    
    @Published var isOnline = true
    @Published var isSyncing = false
    
    private var cancellables = Set<AnyCancellable>()
    
    private init() {
        startMonitoring()
    }
    
    // MARK: - Network Monitoring
    
    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                let wasOffline = self?.isOnline == false
                self?.isOnline = path.status == .satisfied
                
                if wasOffline && self?.isOnline == true {
                    print("📴 [Sync] Back online — starting sync...")
                    self?.sync()
                }
            }
        }
        monitor.start(queue: queue)
    }
    
    // MARK: - Sync
    
    func sync() {
        guard !OfflineQueueService.shared.isEmpty else { return }
        guard !isSyncing else { return }
        
        isSyncing = true
        print("🔄 [Sync] Starting sync of \(OfflineQueueService.shared.count) operations")
        
        Task {
            let operations = OfflineQueueService.shared.queue
            
            for operation in operations {
                do {
                    try await processOperation(operation)
                    OfflineQueueService.shared.dequeue(operation)
                    print("✅ [Sync] Completed: \(operation.type.rawValue)")
                } catch {
                    OfflineQueueService.shared.incrementRetry(operation)
                    print("❌ [Sync] Failed: \(operation.type.rawValue) — \(error.localizedDescription)")
                }
            }
            
            await MainActor.run {
                isSyncing = false
                print("🔄 [Sync] Sync complete — remaining: \(OfflineQueueService.shared.count)")
            }
        }
    }
    
    private func processOperation(_ operation: PendingOperation) async throws {
        guard let payload = OfflineQueueService.shared.payload(for: operation) else {
            throw SyncError.invalidPayload
        }
        
        switch operation.type {
        case .createOrder:
            guard let body = payload["body"] as? [String: Any] else { throw SyncError.invalidPayload }
            _ = try await APIService.shared.createOrder(body: body)
            
        case .sendToKitchen:
            guard let orderId = payload["orderId"] as? String else { throw SyncError.invalidPayload }
            _ = try await APIService.shared.sendToKitchen(orderId: orderId)
            
        case .updateOrderStatus:
            guard let orderId = payload["orderId"] as? String,
                  let status = payload["status"] as? String else { throw SyncError.invalidPayload }
            try await APIService.shared.updateOrderStatus(orderId: orderId, status: status)
            
        case .transferTable:
            guard let orderId = payload["orderId"] as? String,
                  let newTableId = payload["newTableId"] as? String else { throw SyncError.invalidPayload }
            try await APIService.shared.transferOrder(orderId: orderId, newTableId: newTableId)
            
        case .updateGuestCount:
            guard let tableId = payload["tableId"] as? String,
                  let count = payload["count"] as? Int else { throw SyncError.invalidPayload }
            try await APIService.shared.updateOrder(orderId: tableId, body: ["guestCount": count])
            
        case .voidItem:
            guard let orderId = payload["orderId"] as? String,
                  let itemId = payload["itemId"] as? String,
                  let reason = payload["reason"] as? String else { throw SyncError.invalidPayload }
            try await APIService.shared.voidItem(orderId: orderId, itemId: itemId, reason: reason, voidedBy: payload["voidedBy"] as? String)
            
        case .addItemToOrder:
            guard let orderId = payload["orderId"] as? String,
                  let body = payload["body"] as? [String: Any] else { throw SyncError.invalidPayload }
            _ = try await APIService.shared.addItemsToOrder(orderId: orderId, items: [body])
        }
    }
    
    deinit {
        monitor.cancel()
    }
}

enum SyncError: Error {
    case invalidPayload
    case networkUnavailable
}
