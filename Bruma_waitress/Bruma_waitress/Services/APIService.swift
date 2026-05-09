import Foundation

class APIService {
    static let shared = APIService()
    
    // URLs from Environment configuration
    var baseURL: String { AppEnvironment.current.baseURL }
    var printServerURL: String { AppEnvironment.current.printServerURL }
    
    private init() {}
    
    // MARK: - Auth
    
    func verifyPin(pin: String) async throws -> Employee {
        let url = URL(string: "\(baseURL)/api/employees/verify-pin")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "pin": pin
        ])
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                throw APIError.unauthorized
            }
            throw APIError.serverError
        }
        let result = try JSONDecoder().decode(VerifyPinResponse.self, from: data)
        return result.employee
    }
    
    // MARK: - Cash Register
    
    func checkCashRegister() async throws -> Bool {
        let url = URL(string: "\(baseURL)/api/cash-register/current")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return false
        }
        // If we get a valid JSON object back, register is open
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], json["id"] != nil {
            return true
        }
        return false
    }
    
    // MARK: - Tables
    
    func fetchTables() async throws -> [Table] {
        let url = URL(string: "\(baseURL)/api/tables")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode([Table].self, from: data)
    }
    
    func fetchTableDetail(tableId: String) async throws -> Table {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode(Table.self, from: data)
    }
    
    func updateTableStatus(tableId: String, table: Table, status: String) async throws {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "id": table.id,
            "number": table.number,
            "capacity": table.capacity,
            "status": status,
            "active": table.active,
        ] as [String: Any])
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
    }
    
    func updateTable(tableId: String, body: [String: Any]) async throws -> Table {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode(Table.self, from: data)
    }
    
    // MARK: - Products & Categories
    
    func fetchProducts() async throws -> [Product] {
        let url = URL(string: "\(baseURL)/api/products?active=true")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode([Product].self, from: data)
    }
    
    func fetchCategories() async throws -> [Category] {
        let url = URL(string: "\(baseURL)/api/categories")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode([Category].self, from: data)
    }
    
    func fetchCategoryFlow(categoryId: String) async throws -> CategoryFlow {
        let url = URL(string: "\(baseURL)/api/categories/\(categoryId)/flow")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return CategoryFlow(categoryId: categoryId, useDefaultFlow: true, steps: [])
        }
        return try JSONDecoder().decode(CategoryFlow.self, from: data)
    }
    
    // Fetch product flow (hybrid: product-specific or inherited from category)
    func fetchProductFlow(productId: String) async throws -> CategoryFlow {
        let url = URL(string: "\(baseURL)/api/products/\(productId)/flow")!
        print("🌐 Waitress API: Fetching from \(url.absoluteString)")
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        if let http = response as? HTTPURLResponse {
            print("📡 Waitress API: HTTP Status \(http.statusCode)")
        }
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            print("❌ Waitress API: Failed to fetch flow, returning empty")
            return CategoryFlow(categoryId: productId, useDefaultFlow: true, steps: [])
        }
        
        // Print raw JSON for debugging
        if let jsonString = String(data: data, encoding: .utf8) {
            print("📥 Waitress API: Raw JSON (first 300 chars): \(String(jsonString.prefix(300)))")
        }
        
        // Decode product flow response and convert to CategoryFlow format
        struct ProductFlowResponse: Codable {
            let productId: String
            let useDefaultFlow: Bool
            let steps: [ModifierStep]
        }
        
        let flowResponse = try JSONDecoder().decode(ProductFlowResponse.self, from: data)
        print("✅ Waitress API: Decoded flow - productId: \(flowResponse.productId), useDefault: \(flowResponse.useDefaultFlow), steps: \(flowResponse.steps.count)")
        
        return CategoryFlow(
            categoryId: flowResponse.productId,
            useDefaultFlow: flowResponse.useDefaultFlow,
            steps: flowResponse.steps
        )
    }
    
    // MARK: - Orders
    
    func createOrder(tableId: String?, items: [[String: Any]], customerName: String?) async throws -> Order {
        let url = URL(string: "\(baseURL)/api/orders")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var body: [String: Any] = [
            "items": items,
            "status": "preparing",
        ]
        if let tableId = tableId { body["tableId"] = tableId }
        if let name = customerName { body["customerName"] = name }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 || http.statusCode == 201 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode(Order.self, from: data)
    }
    
    func addItemsToOrder(orderId: String, items: [[String: Any]]) async throws {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/items")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["items": items])
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 || http.statusCode == 201 else {
            throw APIError.serverError
        }
    }
    
    func fetchActiveOrders() async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?status=preparing")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode([Order].self, from: data)
    }
    
    func fetchDeliveryOrders() async throws -> [Order] {
        // Fetch Para Llevar orders: no table, not paid, active statuses
        let url = URL(string: "\(baseURL)/api/orders?status=preparing,ready,pending&noTable=true&paymentStatus=pending")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.serverError
        }
        return try JSONDecoder().decode([Order].self, from: data)
    }
    
    // MARK: - Print Comanda
    
    func printComanda(tableNumber: String?, orderNumber: String, customerName: String?, items: [[String: Any]], guestCount: Int? = nil) async {
        guard let url = URL(string: "\(printServerURL)/print-comanda") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "orderNumber": orderNumber,
            "items": items,
        ]
        if let tn = tableNumber { body["tableNumber"] = tn }
        if let cn = customerName { body["customerName"] = cn }
        if let gc = guestCount { body["guestCount"] = gc }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        // Fire and forget
        _ = try? await URLSession.shared.data(for: request)
    }
}

enum APIError: LocalizedError {
    case unauthorized
    case serverError
    case decodingError
    
    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Código o PIN inválido"
        case .serverError: return "Error de servidor"
        case .decodingError: return "Error procesando respuesta"
        }
    }
}
