import Foundation
import SocketIO
import Combine

/// Sincronización en tiempo real para Waitress. El backend YA transmite
/// order:updated / order:items_ready / table:updated / table:layout:updated /
/// table:merged / table:unmerged a "room:waitress" (ver api-server/src/sockets/events.ts)
/// — antes esta clase estaba comentada por completo (nunca se conectaba a
/// nada), así que la app dependía solo de refrescos manuales.
class SocketService: ObservableObject {
    static let shared = SocketService()

    private var manager: SocketManager?
    private var socket: SocketIOClient?

    @Published var isConnected = false

    // Callbacks para que los ViewModels reaccionen sin acoplarse a Socket.IO.
    var onOrderUpdated: ((String?) -> Void)? // tableId del pedido actualizado, si viene
    var onOrderItemsReady: (() -> Void)?
    var onTableUpdated: ((String) -> Void)?
    var onTableLayoutUpdated: (() -> Void)?
    var onTableMerged: (() -> Void)?
    var onTableUnmerged: (() -> Void)?

    private init() {}

    func connect() {
        guard socket == nil else { return }
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
        isConnected = false
    }

    private func setupEventHandlers() {
        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            print("🔌 Socket conectado (Waitress)")
            self?.isConnected = true
            self?.joinRooms()
        }

        socket?.on(clientEvent: .disconnect) { [weak self] _, _ in
            print("🔌 Socket desconectado (Waitress)")
            self?.isConnected = false
        }

        socket?.on(clientEvent: .error) { data, _ in
            print("❌ Socket error: \(data)")
        }

        socket?.on("order:updated") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            let tableId = dict["tableId"] as? String
            print("📦 order:updated recibido (tableId=\(tableId ?? "nil"))")
            self?.onOrderUpdated?(tableId)
        }

        socket?.on("order:items_ready") { [weak self] _, _ in
            print("✅ order:items_ready recibido")
            self?.onOrderItemsReady?()
        }

        socket?.on("table:updated") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let tableId = dict["id"] as? String else { return }
            print("🪑 table:updated recibido: \(tableId)")
            self?.onTableUpdated?(tableId)
        }

        socket?.on("table:layout:updated") { [weak self] _, _ in
            print("🗺️ table:layout:updated recibido")
            self?.onTableLayoutUpdated?()
        }

        socket?.on("table:merged") { [weak self] _, _ in
            print("🔗 table:merged recibido")
            self?.onTableMerged?()
        }

        socket?.on("table:unmerged") { [weak self] _, _ in
            print("🔓 table:unmerged recibido")
            self?.onTableUnmerged?()
        }
    }

    private func joinRooms() {
        // IMPORTANTE: el backend espera el nombre del room como STRING plano
        // (`socket.on("join", (room: string) => socket.join(room))`) — antes
        // esto mandaba un diccionario (`["room": "room:waitress"]`), lo cual
        // nunca unía de verdad el socket al room correcto y por eso ningún
        // evento le llegaba a esta app.
        socket?.emit("join", "room:waitress")
        socket?.emit("join", "room:tables")
        print("🏠 Rooms unidos: waitress, tables")
    }
}
