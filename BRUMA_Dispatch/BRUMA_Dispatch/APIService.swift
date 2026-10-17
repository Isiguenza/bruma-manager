 //
//  APIService.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import Foundation

class APIService {
    static let shared = APIService()
    
    // Configuración de entorno
    enum Environment {
        case development
        case production
        
        var baseURL: String {
            switch self {
            case .development:
                return "http://192.168.0.69:3000"
            case .production:
                return "https://api.cocinabruma.com.mx"
            }
        }
    }
    
    // Cambiar a .production cuando estés listo para usar en producción
    private let environment: Environment = .production
    var baseURL: String {
        environment.baseURL
    }
    
    /// Timeout corto: en el Pase una petición colgada 60s (el default) deja el
    /// board congelado sin avisar.
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 12
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    private init() {}
    
    // Fetch orders with status "preparing"
    func fetchPreparingOrders() async throws -> [Order] {
        #if DEBUG
        if DemoBackend.isEnabled { return try DemoBackend.shared.fetchOrders() }
        #endif
        guard let url = URL(string: "\(baseURL)/api/orders?status=preparing") else {
            throw URLError(.badURL)
        }
        
        // Nunca servir una respuesta cacheada: el board debe ser el estado real.
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        
        let decoder = JSONDecoder()
        let orders = try decoder.decode([Order].self, from: data)
        return orders
    }
    
    // Rush order (toggle priority)
    func rushOrder(orderId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/rush") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    func unrushOrder(orderId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/unrush") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    // Hold order (pause)
    func holdOrder(orderId: String) async throws {
        #if DEBUG
        if DemoBackend.isEnabled { return DemoBackend.shared.setHold(orderId, true) }
        #endif
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/hold") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    // Unhold order (resume)
    func unholdOrder(orderId: String) async throws {
        #if DEBUG
        if DemoBackend.isEnabled { return DemoBackend.shared.setHold(orderId, false) }
        #endif
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/unhold") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    /// Reimprime la comanda de cocina. Si `itemIds` no está vacío, reimprime
    /// solo esa ronda; si no, toda la orden. El backend espera el resultado de
    /// la impresora, así que si truena aquí es que la impresora/conexión falló.
    func reprintComanda(orderId: String, itemIds: [String]) async throws {
        #if DEBUG
        if DemoBackend.isEnabled { try await Task.sleep(nanoseconds: 1_200_000_000); return }
        #endif
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/reprint-comanda") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["itemIds": itemIds])
        request.timeoutInterval = 30  // espera a la impresora
        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    /// Marca / desmarca items como entregados (tap por platillo en el Pase, o
    /// "Deshacer" en la franja de completadas). `delivered: false` regresa la
    /// orden a "preparando" si se había auto-completado.
    func setItemsDelivered(_ itemIds: [String], delivered: Bool) async throws {
        #if DEBUG
        if DemoBackend.isEnabled { return DemoBackend.shared.setDelivered(itemIds, delivered) }
        #endif
        guard !itemIds.isEmpty else { return }
        let path = delivered ? "batch-ready" : "batch-unready"
        guard let url = URL(string: "\(baseURL)/api/order-items/\(path)") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["itemIds": itemIds])

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
}
