import Foundation

class PrintService {
    static let shared = PrintService()
    private init() {}
    
    private var printServerURL: String { APIService.shared.printServerURL }
    
    // MARK: - Print Comanda (kitchen ticket)
    
    func printComanda(
        tableNumber: String?,
        orderNumber: String,
        customerName: String?,
        items: [[String: Any]],
        isDelivery: Bool = false,
        guestCount: Int? = nil
    ) async {
        guard let url = URL(string: "\(printServerURL)/print-comanda") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "orderNumber": orderNumber,
            "items": items,
            "isDelivery": isDelivery
        ]
        if let tn = tableNumber { body["tableNumber"] = tn }
        if let cn = customerName { body["customerName"] = cn }
        if let gc = guestCount { body["guestCount"] = gc }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: request)
    }
    
    // MARK: - Print Ticket (payment ticket)
    
    func printTicket(
        customerName: String,
        orderNumber: String,
        items: [String: [[String: Any]]],
        subtotal: Int,
        tip: Int,
        total: Int,
        tableNumber: String,
        isDelivery: Bool,
        discount: [String: Any]? = nil,
        paymentMethod: String? = nil,
        deliveryFee: Int = 0
    ) async {
        guard let url = URL(string: "\(printServerURL)/print") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "customerName": customerName,
            "orderNumber": orderNumber,
            "items": items,
            "subtotal": subtotal,
            "tip": tip,
            "total": total,
            "tableNumber": tableNumber,
            "isDelivery": isDelivery
        ]
        if let discount = discount { body["discount"] = discount }
        if let pm = paymentMethod { body["paymentMethod"] = pm }
        if deliveryFee > 0 { body["deliveryFee"] = deliveryFee }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: request)
    }
    
    // MARK: - Print Split Ticket (individual split bill ticket)
    
    func printSplitTicket(
        tableNumber: String?,
        orderNumber: String,
        customerName: String?,
        items: [[String: Any]],
        subtotal: Double,
        tip: Double,
        total: Double,
        paymentMethod: String?,
        splitInfo: String
    ) async {
        guard let url = URL(string: "\(printServerURL)/print-split") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "orderNumber": orderNumber,
            "items": items,
            "subtotal": subtotal,
            "tip": tip,
            "total": total,
            "splitInfo": splitInfo
        ]
        if let tn = tableNumber { body["tableNumber"] = tn }
        if let cn = customerName { body["customerName"] = cn }
        if let pm = paymentMethod { body["paymentMethod"] = pm }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: request)
    }
    
    // MARK: - Print Guest (courtesy ticket)
    
    func printGuestTicket(items: [[String: Any]], orderNumber: String) async {
        guard let url = URL(string: "\(printServerURL)/print-guest") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        let body: [String: Any] = [
            "items": items,
            "orderNumber": orderNumber
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: request)
    }
}
