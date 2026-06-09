import Foundation
import SocketIO
import Combine

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    @Published var isConnected = false
    
    // Callbacks for events
    var onNewOrder: (() -> Void)?
    var onOrderUpdated: ((String) -> Void)?
    
    private init() {}
    
    func connect(baseURL: String) {
        guard let url = URL(string: baseURL) else { return }
        
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
    }
    
    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
    }
    
    private func setupEventHandlers() {
        socket?.on(clientEvent: .connect) { [weak self] data, ack in
            print("🔌 Socket connected (Dispatch)")
            self?.isConnected = true
            self?.joinRooms()
        }
        
        socket?.on(clientEvent: .disconnect) { [weak self] data, ack in
            print("🔌 Socket disconnected (Dispatch)")
            self?.isConnected = false
        }
        
        socket?.on(clientEvent: .error) { data, ack in
            print("❌ Socket error: \(data)")
        }
        
        // Business events
        socket?.on("order:new") { [weak self] data, ack in
            print("🆕 New order received")
            self?.onNewOrder?()
        }
        
        socket?.on("order:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["orderId"] as? String else { return }
            print("📦 Order updated: \(orderId)")
            self?.onOrderUpdated?(orderId)
        }
    }
    
    private func joinRooms() {
        // Join kitchen room to receive new orders
        socket?.emit("join", ["room": "room:kitchen"])
        print("🏠 Joined room: kitchen")
    }
}
