import Foundation
import SwiftUI
import Combine
import AVFoundation

@MainActor
class DeliveryViewModel: ObservableObject {
    @Published var deliveryOrders: [DeliveryOrder] = []
    @Published var loading = false
    @Published var statusFilter = "all"
    @Published var autoAccept = UserDefaults.standard.bool(forKey: "delivery_auto_accept")
    
    // Notification
    @Published var showNewOrderNotification = false
    @Published var newOrder: DeliveryOrder?
    
    // Toast
    @Published var toastMessage: String?
    @Published var toastIsError = false
    
    private var audioPlayer: AVAudioPlayer?
    private var webSocketTask: URLSessionWebSocketTask?
    
    var filteredOrders: [DeliveryOrder] {
        if statusFilter == "all" {
            return deliveryOrders
        }
        return deliveryOrders.filter { $0.status == statusFilter }
    }
    
    var pendingCount: Int {
        deliveryOrders.filter { $0.status == "pending" }.count
    }
    
    init() {
        setupWebSocket()
        loadAutoAcceptSetting()
    }
    
    func loadOrders() async {
        loading = true
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/delivery/orders")!
            let (data, _) = try await URLSession.shared.data(from: url)
            let orders = try JSONDecoder().decode([DeliveryOrder].self, from: data)
            deliveryOrders = orders
        } catch {
            print("Error loading delivery orders:", error)
            showToast("Error cargando pedidos", isError: true)
        }
        loading = false
    }
    
    func acceptOrder(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/delivery/orders/\(id)/accept")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Pedido aceptado ✓")
            await loadOrders()
        } catch {
            showToast("Error aceptando pedido", isError: true)
        }
    }
    
    func denyOrder(id: String, reason: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/delivery/orders/\(id)/deny")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["reason": reason])
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Pedido rechazado")
            await loadOrders()
        } catch {
            showToast("Error rechazando pedido", isError: true)
        }
    }
    
    func markReady(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/delivery/orders/\(id)/ready")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Pedido listo para recoger ✓")
            await loadOrders()
        } catch {
            showToast("Error marcando pedido", isError: true)
        }
    }
    
    func markComplete(id: String) async {
        do {
            let url = URL(string: "\(APIService.shared.baseURL)/api/delivery/orders/\(id)/complete")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw APIError.serverError
            }
            showToast("Pedido completado ✓")
            await loadOrders()
        } catch {
            showToast("Error completando pedido", isError: true)
        }
    }
    
    func toggleAutoAccept() {
        autoAccept.toggle()
        UserDefaults.standard.set(autoAccept, forKey: "delivery_auto_accept")
        showToast(autoAccept ? "Auto-aceptar activado" : "Auto-aceptar desactivado")
    }
    
    func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": return "Pendiente"
        case "accepted": return "Aceptado"
        case "preparing": return "Preparando"
        case "ready": return "Listo"
        case "completed": return "Completado"
        case "cancelled": return "Cancelado"
        default: return status
        }
    }
    
    func statusColor(_ status: String) -> Color {
        switch status {
        case "pending": return .red
        case "accepted", "preparing": return .orange
        case "ready": return .green
        case "completed": return .gray
        case "cancelled": return Color(white: 0.4)
        default: return .gray
        }
    }
    
    func platformName(_ platform: String) -> String {
        switch platform {
        case "uber_eats": return "Uber Eats"
        case "rappi": return "Rappi"
        case "didi_food": return "Didi Food"
        default: return platform
        }
    }
    
    func platformColor(_ platform: String) -> Color {
        switch platform {
        case "uber_eats": return Color(red: 0.02, green: 0.76, blue: 0.40) // #06C167
        case "rappi": return .orange
        case "didi_food": return .blue
        default: return .gray
        }
    }
    
    private func setupWebSocket() {
        // TODO: Conectar WebSocket para recibir notificaciones en tiempo real
        // let wsURL = URL(string: "wss://bruma.drinksespantapajaros.com.mx/ws")!
        // webSocketTask = URLSession.shared.webSocketTask(with: wsURL)
        // webSocketTask?.resume()
        // receiveMessage()
    }
    
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                if case .string(let text) = message {
                    self?.handleWebSocketMessage(text)
                }
                self?.receiveMessage() // Continue listening
            case .failure(let error):
                print("WebSocket error:", error)
            }
        }
    }
    
    private func handleWebSocketMessage(_ message: String) {
        guard let data = message.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = json["event"] as? String else {
            return
        }
        
        if event == "delivery.new_order" {
            Task { @MainActor in
                await loadOrders()
                if let orderData = json["data"] as? [String: Any],
                   let orderJson = try? JSONSerialization.data(withJSONObject: orderData),
                   let order = try? JSONDecoder().decode(DeliveryOrder.self, from: orderJson) {
                    handleNewOrder(order)
                }
            }
        }
    }
    
    private func handleNewOrder(_ order: DeliveryOrder) {
        newOrder = order
        playNotificationSound()
        
        if autoAccept {
            // Auto-aceptar después de 2 segundos
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await acceptOrder(id: order.id)
                showNewOrderNotification = false
            }
        } else {
            showNewOrderNotification = true
            // Auto-cerrar notificación después de 30 segundos
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                showNewOrderNotification = false
            }
        }
    }
    
    private func playNotificationSound() {
        // Reproducir sonido de notificación
        guard let soundURL = Bundle.main.url(forResource: "notification", withExtension: "wav") else {
            print("Notification sound not found")
            return
        }
        
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
            audioPlayer?.play()
        } catch {
            print("Error playing notification sound:", error)
        }
    }
    
    private func loadAutoAcceptSetting() {
        autoAccept = UserDefaults.standard.bool(forKey: "delivery_auto_accept")
    }
    
    func showToast(_ msg: String, isError: Bool = false) {
        toastMessage = msg
        toastIsError = isError
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            toastMessage = nil
        }
    }
}

// MARK: - DeliveryOrder Model

struct DeliveryOrder: Codable, Identifiable {
    let id: String
    let platform: String
    let externalId: String
    let status: String
    let customerName: String
    let customerPhone: String?
    let deliveryAddress: String?
    let deliveryInstructions: String?
    let subtotal: String
    let deliveryFee: String
    let platformFee: String
    let total: String
    let estimatedPickupTime: String?
    let createdAt: String
    let acceptedAt: String?
    let readyAt: String?
    let completedAt: String?
    let cancelledAt: String?
    let orderId: String?
    let rawData: String?
}
