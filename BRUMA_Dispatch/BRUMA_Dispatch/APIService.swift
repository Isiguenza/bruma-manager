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
                return "http://192.168.0.227:4000"
            case .production:
                return "https://api.cocinabruma.com.mx"
            }
        }
    }
    
    // Cambiar a .production cuando estés listo para usar en producción
    private let environment: Environment = .development
    private var baseURL: String {
        environment.baseURL
    }
    
    private init() {}
    
    // Fetch orders with status "preparing"
    func fetchPreparingOrders() async throws -> [Order] {
        guard let url = URL(string: "\(baseURL)/api/orders?status=preparing") else {
            throw URLError(.badURL)
        }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        
        // Debug: print raw JSON for first item to check field names
        if let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
           let firstOrder = jsonArray.first,
           let items = firstOrder["items"] as? [[String: Any]],
           let firstItem = items.first {
            print("🔬 RAW JSON first item keys: \(firstItem.keys.sorted())")
            print("🔬 RAW JSON createdAt value: \(firstItem["createdAt"] ?? "KEY_NOT_FOUND")")
            print("🔬 RAW JSON created_at value: \(firstItem["created_at"] ?? "KEY_NOT_FOUND")")
            print("🔬 RAW JSON deliveredToTable: \(firstItem["deliveredToTable"] ?? "KEY_NOT_FOUND")")
            print("🔬 RAW JSON delivered_to_table: \(firstItem["delivered_to_table"] ?? "KEY_NOT_FOUND")")
        }
        
        let decoder = JSONDecoder()
        let orders = try decoder.decode([Order].self, from: data)
        return orders
    }
    
    // Mark order as ready (deprecated - use markBatchAsReady instead)
    func markOrderAsReady(orderId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/orders/\(orderId)/status") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["status": "ready"]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
    
    // Mark batch of items as ready (delivered to table)
    func markBatchAsReady(itemIds: [String]) async throws {
        guard let url = URL(string: "\(baseURL)/api/order-items/batch-ready") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["itemIds": itemIds]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
}
