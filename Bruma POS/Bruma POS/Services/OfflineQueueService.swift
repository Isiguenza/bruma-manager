import Foundation
import Combine

/// Operación pendiente para sincronizar cuando vuelva internet
struct PendingOperation: Codable, Identifiable {
    let id: String
    let type: OperationType
    let payload: Data
    let createdAt: Date
    var retryCount: Int = 0
    
    enum OperationType: String, Codable {
        case createOrder
        case sendToKitchen
        case updateOrderStatus
        case transferTable
        case updateGuestCount
        case voidItem
        case addItemToOrder
    }
}

/// Cola de operaciones offline — guarda en UserDefaults
class OfflineQueueService: ObservableObject {
    static let shared = OfflineQueueService()
    
    private let queueKey = "offline_queue"
    
    @Published private(set) var queue: [PendingOperation] = []
    
    private init() {
        loadQueue()
    }
    
    var count: Int { queue.count }
    var isEmpty: Bool { queue.isEmpty }
    
    // MARK: - Queue Operations
    
    func enqueue(type: PendingOperation.OperationType, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        
        let operation = PendingOperation(
            id: UUID().uuidString,
            type: type,
            payload: data,
            createdAt: Date()
        )
        
        queue.append(operation)
        saveQueue()
        print("📴 [Offline] Enqueued: \(type.rawValue) — Queue: \(queue.count)")
    }
    
    func dequeue(_ operation: PendingOperation) {
        queue.removeAll { $0.id == operation.id }
        saveQueue()
    }
    
    func incrementRetry(_ operation: PendingOperation) {
        if let index = queue.firstIndex(where: { $0.id == operation.id }) {
            queue[index].retryCount += 1
            // Remove if retried too many times
            if queue[index].retryCount > 5 {
                queue.remove(at: index)
                print("📴 [Offline] Removed after 5 retries: \(operation.type.rawValue)")
            }
            saveQueue()
        }
    }
    
    func clear() {
        queue.removeAll()
        saveQueue()
    }
    
    // MARK: - Helpers
    
    func payload(for operation: PendingOperation) -> [String: Any]? {
        return try? JSONSerialization.jsonObject(with: operation.payload) as? [String: Any]
    }
    
    // MARK: - Persistence
    
    private func loadQueue() {
        guard let data = UserDefaults.standard.data(forKey: queueKey),
              let decoded = try? JSONDecoder().decode([PendingOperation].self, from: data) else {
            queue = []
            return
        }
        queue = decoded
    }
    
    private func saveQueue() {
        if let data = try? JSONEncoder().encode(queue) {
            UserDefaults.standard.set(data, forKey: queueKey)
        }
    }
}
