import Foundation
import SocketIO
import Combine

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    @Published var isConnected = false
    
    // Callbacks for events
    var onOrderUpdated: (([String: Any]) -> Void)?
    var onOrderPaid: ((String) -> Void)?
    var onTableUpdated: ((String) -> Void)?
    var onOrderRush: (([String: Any]) -> Void)?
    var onOrderHold: (([String: Any]) -> Void)?
    var onCashRegisterOpened: (() -> Void)?
    var onCashRegisterClosed: (() -> Void)?
    var onCustomerDisplayUpdate: (([String: Any]) -> Void)?
    
    private init() {}
    
    func connect() {
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
    }
    
    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
    }
    
    private func setupEventHandlers() {
        socket?.on(clientEvent: .connect) { [weak self] data, ack in
            print("🔌 Socket connected")
            self?.isConnected = true
            self?.joinRooms()
        }
        
        socket?.on(clientEvent: .disconnect) { [weak self] data, ack in
            print("🔌 Socket disconnected")
            self?.isConnected = false
        }
        
        socket?.on(clientEvent: .error) { data, ack in
            print("❌ Socket error: \(data)")
        }
        
        // Business events
        socket?.on("order:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["id"] as? String else {
                print("⚠️ order:updated received but no id field found")
                return
            }
            print("📦 Order updated: \(orderId)")
            self?.onOrderUpdated?(dict)
        }
        
        socket?.on("order:paid") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["id"] as? String else {
                print("⚠️ order:paid received but no id field found")
                return
            }
            print("💰 Order paid: \(orderId)")
            self?.onOrderPaid?(orderId)
        }
        
        socket?.on("order:rush") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["id"] as? String else {
                print("⚠️ order:rush received but no id field found")
                return
            }
            print("🔥 Order rush: \(orderId)")
            self?.onOrderRush?(dict)
        }
        
        socket?.on("order:hold") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let orderId = dict["id"] as? String else {
                print("⚠️ order:hold received but no id field found")
                return
            }
            print("⏸️ Order hold: \(orderId)")
            self?.onOrderHold?(dict)
        }
        
        socket?.on("table:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let tableId = dict["id"] as? String else {
                print("⚠️ table:updated received but no id field found")
                return
            }
            print("🪑 Table updated: \(tableId)")
            self?.onTableUpdated?(tableId)
        }
        
        socket?.on("cash_register:opened") { [weak self] data, ack in
            print("💵 Cash register opened")
            self?.onCashRegisterOpened?()
        }
        
        socket?.on("cash_register:closed") { [weak self] data, ack in
            print("💵 Cash register closed")
            self?.onCashRegisterClosed?()
        }
        
        socket?.on("customer_display:update") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any] else { return }
            print("📺 customer_display:update received")
            self?.onCustomerDisplayUpdate?(dict)
        }
    }
    
    private func joinRooms() {
        // Join POS room to receive updates
        socket?.emit("join", "room:pos")
        socket?.emit("join", "room:tables")
        socket?.emit("join", "room:customer_display")
        print("🏠 Joined rooms: pos, tables, customer_display")
    }
    
    func joinCustomerDisplayRoom() {
        socket?.emit("join", "room:customer_display")
        print("📺 Joined room: customer_display")
    }
    
    func emitCustomerDisplayUpdate(_ payload: [String: Any]) {
        socket?.emit("customer_display:update", payload)
    }
}
