import Foundation

enum APIError: LocalizedError, Equatable {
    case unauthorized
    case serverError
    case decodingError
    case notFound
    case badRequest(String)
    case offlineQueued
    case offline(String)
    
    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Código o PIN inválido"
        case .serverError: return "Error de servidor"
        case .decodingError: return "Error procesando respuesta"
        case .notFound: return "No encontrado"
        case .badRequest(let msg): return msg
        case .offlineQueued: return "Guardado offline — se sincronizará automáticamente"
        case .offline(let msg): return msg
        }
    }
}

class APIService {
    static let shared = APIService()
    
    var baseURL: String {
        AppEnvironment.current.baseURL
    }
    
    var printServerURL: String {
        AppEnvironment.current.printServerURL
    }
    
    private init() {}
    
    // MARK: - Connectivity
    
    var isConnected: Bool {
        SyncEngine.shared.isOnline
    }
    
    // MARK: - Generic Helpers
    
    private func request<T: Decodable>(_ url: URL, method: String = "GET", body: [String: Any]? = nil) async throws -> T {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15
        if let body = body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.serverError }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 404 { throw APIError.notFound }
        guard (200...299).contains(http.statusCode) else {
            if let errJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errMsg = errJson["error"] as? String {
                throw APIError.badRequest(errMsg)
            }
            throw APIError.serverError
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            print("[API] Decoding error for \(url): \(error)")
            if let jsonString = String(data: data, encoding: .utf8) {
                print("[API] Response: \(jsonString.prefix(500))")
            }
            throw APIError.decodingError
        }
    }
    
    private func requestRaw(_ url: URL, method: String = "GET", body: [String: Any]? = nil) async throws -> (Data, HTTPURLResponse) {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15
        if let body = body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.serverError }
        return (data, http)
    }
    
    // MARK: - Auth
    
    func verifyPin(pin: String) async throws -> Employee {
        let url = URL(string: "\(baseURL)/api/employees/verify-pin")!
        let result: VerifyPinResponse = try await request(url, method: "POST", body: [
            "pin": pin
        ])
        return result.employee
    }
    
    // MARK: - Employees
    
    func fetchEmployees() async throws -> [Employee] {
        let url = URL(string: "\(baseURL)/api/employees")!
        return try await request(url)
    }
    
    func fetchEmployeeOrders(userId: String, source: String = "employee") async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?userId=\(userId)&source=\(source)&limit=50")!
        return try await request(url)
    }
    
    func fetchAllEmployeeOrders() async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?source=employee&paymentStatus=pending")!
        return try await request(url)
    }
    
    func fetchActiveEmployeeOrder(userId: String) async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?userId=\(userId)&source=employee&paymentStatus=pending")!
        return try await request(url)
    }
    
    // MARK: - Cash Register
    
    func checkCashRegister() async throws -> Bool {
        let url = URL(string: "\(baseURL)/api/cash-register/current")!
        let (data, http) = try await requestRaw(url)
        guard http.statusCode == 200 else { return false }
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], json["id"] != nil {
            return true
        }
        return false
    }
    
    // MARK: - Tables
    
    func fetchTables() async throws -> [Table] {
        let url = URL(string: "\(baseURL)/api/tables")!
        return try await request(url)
    }
    
    func fetchTableDetail(tableId: String) async throws -> Table {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        return try await request(url)
    }
    
    func updateTable(tableId: String, body: [String: Any]) async throws -> Table {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        return try await request(url, method: "PATCH", body: body)
    }
    
    func updateTableStatus(tableId: String, status: String) async throws {
        let url = URL(string: "\(baseURL)/api/tables/\(tableId)")!
        let _: Table = try await request(url, method: "PATCH", body: ["status": status])
    }
    
    // MARK: - Orders
    
    func deleteOrder(orderId: String) async throws {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }
    }
    
    // MARK: - Order Items
    
    @discardableResult
    func updateOrderItem(itemId: String, productId: String, productName: String, unitPrice: Double, notes: String? = nil) async throws -> OrderItem {
        let url = URL(string: "\(baseURL)/api/order-items/\(itemId)")!
        var body: [String: Any] = [
            "productId": productId,
            "productName": productName,
            "unitPrice": unitPrice
        ]
        if let notes = notes { body["notes"] = notes }
        return try await request(url, method: "PATCH", body: body)
    }
    
    @discardableResult
    func updateOrderItemQuantity(itemId: String, quantity: Int, unitPrice: Double) async throws -> OrderItem {
        let url = URL(string: "\(baseURL)/api/order-items/\(itemId)")!
        return try await request(url, method: "PATCH", body: [
            "quantity": quantity,
            "unitPrice": unitPrice
        ])
    }
    
    @discardableResult
    func updateOrderItemGuest(itemId: String, isGuest: Bool) async throws -> OrderItem {
        let url = URL(string: "\(baseURL)/api/order-items/\(itemId)/guest")!
        return try await request(url, method: "PATCH", body: ["isGuest": isGuest])
    }
    
    // MARK: - Products & Categories
    
    func fetchProducts() async throws -> [Product] {
        let url = URL(string: "\(baseURL)/api/products?active=true")!
        return try await request(url)
    }
    
    func fetchCategories() async throws -> [Category] {
        let url = URL(string: "\(baseURL)/api/categories")!
        return try await request(url)
    }
    
    func fetchFrostings() async throws -> [Frosting] {
        let url = URL(string: "\(baseURL)/api/frostings")!
        return try await request(url)
    }
    
    func fetchToppings() async throws -> [DryTopping] {
        let url = URL(string: "\(baseURL)/api/dry-toppings")!
        return try await request(url)
    }
    
    func fetchExtras() async throws -> [Extra] {
        let url = URL(string: "\(baseURL)/api/extras")!
        return try await request(url)
    }
    
    func fetchCategoryFlow(categoryId: String) async throws -> CategoryFlow {
        let url = URL(string: "\(baseURL)/api/categories/\(categoryId)/flow")!
        do {
            return try await request(url)
        } catch {
            return CategoryFlow(categoryId: categoryId, useDefaultFlow: true, steps: [])
        }
    }
    
    // Fetch product flow (hybrid: product-specific or inherited from category)
    func fetchProductFlow(productId: String) async throws -> CategoryFlow {
        let url = URL(string: "\(baseURL)/api/products/\(productId)/flow")!
        print("🌐 Fetching product flow from: \(url.absoluteString)")
        
        do {
            // First get raw data to see what we're receiving
            let (data, response) = try await URLSession.shared.data(from: url)
            
            if let httpResponse = response as? HTTPURLResponse {
                print("📡 HTTP Status: \(httpResponse.statusCode)")
            }
            
            // Print raw JSON for debugging
            if let jsonString = String(data: data, encoding: .utf8) {
                print("📥 Raw JSON received (first 500 chars):")
                print(String(jsonString.prefix(500)))
            }
            
            // Try to decode
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            
            let flowResponse: ProductFlowResponse
            do {
                flowResponse = try decoder.decode(ProductFlowResponse.self, from: data)
                print("✅ Successfully decoded ProductFlowResponse")
            } catch let decodingError {
                print("❌ Decoding error details:")
                print("   Error: \(decodingError)")
                if let decodingError = decodingError as? DecodingError {
                    switch decodingError {
                    case .keyNotFound(let key, let context):
                        print("   Missing key: \(key.stringValue)")
                        print("   Context: \(context.debugDescription)")
                    case .typeMismatch(let type, let context):
                        print("   Type mismatch for type: \(type)")
                        print("   Context: \(context.debugDescription)")
                    case .valueNotFound(let type, let context):
                        print("   Value not found for type: \(type)")
                        print("   Context: \(context.debugDescription)")
                    case .dataCorrupted(let context):
                        print("   Data corrupted: \(context.debugDescription)")
                    @unknown default:
                        print("   Unknown decoding error")
                    }
                }
                throw decodingError
            }
            
            print("📱 POS received flow for product \(productId):")
            print("   - Source: \(flowResponse.source ?? "unknown")")
            print("   - Steps: \(flowResponse.steps.count)")
            print("   - Use default: \(flowResponse.useDefaultFlow)")
            
            // Convert ProductFlowResponse to CategoryFlow for compatibility
            return CategoryFlow(
                categoryId: flowResponse.productId,
                useDefaultFlow: flowResponse.useDefaultFlow,
                steps: flowResponse.steps
            )
        } catch {
            print("❌ Error fetching product flow: \(error)")
            print("   Error type: \(type(of: error))")
            // Return empty flow on error
            return CategoryFlow(categoryId: productId, useDefaultFlow: true, steps: [])
        }
    }
    
    // Helper struct for product flow API response
    struct ProductFlowResponse: Codable {
        let productId: String
        let useDefaultFlow: Bool
        let steps: [ModifierStep]
        let source: String?
    }
    
    // MARK: - Orders (Offline-aware)
    
    func createOrder(body: [String: Any]) async throws -> Order {
        guard isConnected else {
            OfflineQueueService.shared.enqueue(type: .createOrder, payload: ["body": body])
            throw APIError.offlineQueued
        }
        let url = URL(string: "\(baseURL)/api/orders")!
        return try await request(url, method: "POST", body: body)
    }
    
    func addItemsToOrder(orderId: String, items: [[String: Any]]) async throws -> Order {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/items")!
        return try await request(url, method: "POST", body: ["items": items])
    }
    
    func sendToKitchen(orderId: String) async throws {
        guard isConnected else {
            OfflineQueueService.shared.enqueue(type: .sendToKitchen, payload: ["orderId": orderId])
            throw APIError.offlineQueued
        }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/send-to-kitchen")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.serverError
        }
    }
    
    func fetchOrder(orderId: String) async throws -> Order {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)")!
        return try await request(url)
    }
    
    func fetchOrdersByTable(tableId: String) async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?tableId=\(tableId)&status=preparing,ready,pending&paymentStatus=pending")!
        return try await request(url)
    }
    
    func fetchDeliveryOrders() async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders?status=preparing,ready,pending&noTable=true&paymentStatus=pending&excludeSource=employee")!
        return try await request(url)
    }
    
    func updateOrderStatus(orderId: String, status: String) async throws {
        guard isConnected else {
            OfflineQueueService.shared.enqueue(type: .updateOrderStatus, payload: ["orderId": orderId, "status": status])
            throw APIError.offlineQueued
        }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/status")!
        let (_, _) = try await requestRaw(url, method: "PATCH", body: ["status": status])
    }
    
    func payOrder(orderId: String, body: [String: Any]) async throws {
        guard isConnected else {
            throw APIError.offline("No se puede pagar en modo offline")
        }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/pay")!
        let (_, http) = try await requestRaw(url, method: "POST", body: body)
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    func openCashDrawer() async throws {
        guard isConnected else { return }
        let url = URL(string: "\(baseURL)/api/open-drawer")!
        let (_, http) = try await requestRaw(url, method: "POST")
        if !(200...299).contains(http.statusCode) {
            print("⚠️ openCashDrawer failed: \(http.statusCode)")
        } else {
            print("✅ Cajón abierto")
        }
    }
    
    func updateOrder(orderId: String, body: [String: Any]) async throws {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)")!
        let (_, _) = try await requestRaw(url, method: "PATCH", body: body)
    }
    
    func voidItem(orderId: String, itemId: String, reason: String, voidedBy: String?) async throws {
        guard isConnected else {
            OfflineQueueService.shared.enqueue(type: .voidItem, payload: [
                "orderId": orderId, "itemId": itemId, "reason": reason, "voidedBy": voidedBy ?? ""
            ])
            throw APIError.offlineQueued
        }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/items/\(itemId)/void")!
        var body: [String: Any] = ["voidReason": reason]
        if let voidedBy = voidedBy { body["voidedBy"] = voidedBy }
        let (_, _) = try await requestRaw(url, method: "PATCH", body: body)
    }
    
    func markItemDelivered(orderId: String, itemId: String) async throws {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/items/\(itemId)/deliver")!
        let (_, _) = try await requestRaw(url, method: "PATCH")
    }
    
    func transferOrder(orderId: String, newTableId: String) async throws {
        guard isConnected else {
            OfflineQueueService.shared.enqueue(type: .transferTable, payload: [
                "orderId": orderId, "newTableId": newTableId
            ])
            throw APIError.offlineQueued
        }
        let url = URL(string: "\(baseURL)/api/orders/transfer")!
        let body: [String: Any] = [
            "orderId": orderId,
            "newTableId": newTableId
        ]
        let (_, http) = try await requestRaw(url, method: "POST", body: body)
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    func rushOrder(orderId: String) async throws {
        guard isConnected else { return }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/rush")!
        let (_, http) = try await requestRaw(url, method: "PATCH")
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    func unrushOrder(orderId: String) async throws {
        guard isConnected else { return }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/unrush")!
        let (_, http) = try await requestRaw(url, method: "PATCH")
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    func holdOrder(orderId: String) async throws {
        guard isConnected else { return }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/hold")!
        let (_, http) = try await requestRaw(url, method: "PATCH")
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    func unholdOrder(orderId: String) async throws {
        guard isConnected else { return }
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/unhold")!
        let (_, http) = try await requestRaw(url, method: "PATCH")
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
    
    // MARK: - Tables with Ready Items
    
    func fetchTablesWithReadyItems() async throws -> Set<String> {
        let url = URL(string: "\(baseURL)/api/orders?status=ready&paymentStatus=pending")!
        let orders: [Order] = try await request(url)
        var tableIds = Set<String>()
        for order in orders {
            if let tableId = order.tableId {
                tableIds.insert(tableId)
            }
        }
        return tableIds
    }
    
    // MARK: - Promotions & Discounts
    
    func fetchActivePromotions() async throws -> [Promotion] {
        let url = URL(string: "\(baseURL)/api/promotions?active=true")!
        return try await request(url)
    }
    
    func fetchAvailableDiscounts() async throws -> [Discount] {
        let url = URL(string: "\(baseURL)/api/discounts?active=true")!
        return try await request(url)
    }
    
    // MARK: - Loyalty
    
    func searchLoyaltyCard(barcode: String) async throws -> LoyaltyCard {
        let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? barcode
        let url = URL(string: "\(baseURL)/api/loyalty/search?barcode=\(encoded)")!
        return try await request(url)
    }
    
    func searchLoyaltyCardByEmail(_ email: String) async throws -> LoyaltyCard {
        let encoded = email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? email
        let url = URL(string: "\(baseURL)/api/loyalty/search?email=\(encoded)")!
        return try await request(url)
    }
    
    func fetchLoyaltyCardByBarcode(_ barcode: String) async throws -> LoyaltyCard {
        let url = URL(string: "\(baseURL)/api/loyalty-cards/barcode/\(barcode)")!
        return try await request(url)
    }
    
    func addStamps(cardId: String, count: Int) async throws -> LoyaltyCard {
        let url = URL(string: "\(baseURL)/api/loyalty-cards/\(cardId)/stamps")!
        let body = ["stamps": count]
        return try await request(url, method: "POST", body: body)
    }
    
    func post(_ urlString: String, body: [String: Any]? = nil) async throws {
        guard let url = URL(string: urlString) else { throw APIError.decodingError }
        let (_, response) = try await requestRaw(url, method: "POST", body: body)
        guard let http = response as? HTTPURLResponse else { throw APIError.serverError }
        guard (200...299).contains(http.statusCode) else { throw APIError.serverError }
    }
    
    // MARK: - Reservations
    
    func fetchReservations(date: String? = nil) async throws -> [Reservation] {
        var urlStr = "\(baseURL)/api/reservations"
        if let date = date { urlStr += "?date=\(date)" }
        let url = URL(string: urlStr)!
        return try await request(url)
    }
    
    func createReservation(body: [String: Any]) async throws -> Reservation {
        let url = URL(string: "\(baseURL)/api/reservations")!
        return try await request(url, method: "POST", body: body)
    }
    
    func updateReservation(id: String, body: [String: Any]) async throws -> Reservation {
        let url = URL(string: "\(baseURL)/api/reservations/\(id)")!
        return try await request(url, method: "PATCH", body: body)
    }
    
    func cancelReservation(id: String) async throws {
        let url = URL(string: "\(baseURL)/api/reservations/\(id)")!
        let _: Reservation = try await request(url, method: "PATCH", body: ["status": "cancelled"])
    }
    
    // MARK: - Cash Register
    
    func fetchCurrentCashRegister() async throws -> CashRegister? {
        let url = URL(string: "\(baseURL)/api/cash-register/current")!
        do {
            return try await request(url)
        } catch {
            if case APIError.notFound = error {
                return nil
            }
            throw error
        }
    }
    
    func openCashRegister(initialCash: Double, employeeId: String) async throws -> CashRegister {
        let url = URL(string: "\(baseURL)/api/cash-register")!
        return try await request(url, method: "POST", body: [
            "initialCash": initialCash,
            "employeeId": employeeId
        ])
    }
    
    func closeCashRegister(registerId: String, body: [String: Any]) async throws {
        let url = URL(string: "\(baseURL)/api/cash-register/\(registerId)/close")!
        let (_, _) = try await requestRaw(url, method: "POST", body: body)
    }
    
    func depositToCashRegister(registerId: String, amount: Double, userId: String, description: String) async throws {
        let url = URL(string: "\(baseURL)/api/cash-register/\(registerId)/deposit")!
        let (_, _) = try await requestRaw(url, method: "POST", body: [
            "amount": amount,
            "userId": userId,
            "description": description
        ])
    }
    
    func withdrawFromCashRegister(registerId: String, amount: Double, userId: String, description: String) async throws {
        let url = URL(string: "\(baseURL)/api/cash-register/\(registerId)/withdraw")!
        let (_, _) = try await requestRaw(url, method: "POST", body: [
            "amount": amount,
            "userId": userId,
            "description": description
        ])
    }
    
    func fetchCashRegisterReport(registerId: String) async throws -> [String: Any] {
        let url = URL(string: "\(baseURL)/api/cash-register/\(registerId)/report")!
        let (data, _) = try await requestRaw(url)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
    
    func fetchOrdersHistory(registerId: String) async throws -> [Order] {
        let url = URL(string: "\(baseURL)/api/orders/history?registerId=\(registerId)")!
        return try await request(url)
    }
    
    // MARK: - Corte
    
    func fetchCorte(registerId: String) async throws -> CorteData {
        let url = URL(string: "\(baseURL)/api/cash-register/\(registerId)/corte")!
        return try await request(url)
    }
    
    // MARK: - Split Payments
    
    func payOrderSplit(orderId: String, payments: [[String: Any]], employeeId: String? = nil, discount: Double? = nil, discountName: String? = nil, discountId: String? = nil, subtotal: Double? = nil) async throws {
        let url = URL(string: "\(baseURL)/api/orders/\(orderId)/pay-split")!
        var body: [String: Any] = ["payments": payments]
        if let empId = employeeId, !empId.isEmpty {
            body["employeeId"] = empId
        }
        if let d = discount, d > 0 {
            body["discount"] = d
            body["discountName"] = discountName ?? "Descuento"
            if let did = discountId, !did.isEmpty {
                body["discountId"] = did
            }
        }
        if let s = subtotal {
            body["subtotal"] = s
        }
        let (_, http) = try await requestRaw(url, method: "POST", body: body)
        if !(200...299).contains(http.statusCode) {
            throw APIError.serverError
        }
    }
}
