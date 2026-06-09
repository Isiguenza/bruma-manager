import Foundation
// import SocketIO // TODO: Agregar Socket.IO package en Xcode
import Combine

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    // private var manager: SocketManager?
    // private var socket: SocketIOClient?
    
    @Published var isConnected = false
    
    // Callbacks for events
    var onOrderUpdated: ((String) -> Void)?
    var onTableUpdated: ((String) -> Void)?
    var onOrderItemsReady: (([String]) -> Void)?
    
    private init() {}
    
    func connect() {
        print("⚠️ Socket.IO no disponible - agrega el package primero")
        // TODO: Descomentar cuando agregues Socket.IO package
        /*
        let url = URL(string: AppEnvironment.current.baseURL)!
        
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .reconnects(true),
            .reconnectAttempts(-1),
            .reconnectWait(2),
        ])
        
        socket = manager?.defaultSocket
        
        setupEventHandlers()
        socket?.connect()
        */
    }
    
    func disconnect() {
        // socket?.disconnect()
        // socket = nil
        // manager = nil
    }
    
    private func setupEventHandlers() {
        /*
        socket?.on(clientEvent: .connect) { [weak self] data, ack in
            print("🔌 Socket connected (Waitress)")
            self?.isConnected = true
            self?.joinRooms()
        }
        
        socket?.on(clientEvent: .disconnect) { [weak self] data, ack in
            print("🔌 Socket disconnected (Waitress)")
            self?.isConnected = false
        }
        
        socket?.on(clientEvent: .error) { data, ack in
            print("❌ Socket error: \(data)")
        }
        
        // Business events
        socket?.on("order:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["orderId"] as? String else { return }
            print("📦 Order updated: \(orderId)")
            self?.onOrderUpdated?(orderId)
        }
        
        socket?.on("table:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let tableId = dict["tableId"] as? String else { return }
            print("🪑 Table updated: \(tableId)")
            self?.onTableUpdated?(tableId)
        }
        
        socket?.on("order:items_ready") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let itemIds = dict["itemIds"] as? [String] else { return }
            print("✅ Items ready: \(itemIds.count)")
            self?.onOrderItemsReady?(itemIds)
        }
        */
    }
    
    private func joinRooms() {
        /*
        // Join waitress room to receive updates
        socket?.emit("join", ["room": "room:waitress"])
        socket?.emit("join", ["room": "room:tables"])
        print("🏠 Joined rooms: waitress, tables")
        */
    }
}
