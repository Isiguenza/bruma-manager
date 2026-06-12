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
        splitPayments: [[String: Any]]? = nil,
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
        if let sp = splitPayments { body["splitPayments"] = sp }
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
    
    // MARK: - Reprint Order Ticket
    
    func reprintOrder(_ order: Order) async {
        let itemsBySeat: [String: [[String: Any]]] = ["A1": (order.items ?? []).map { item in
            var dict: [String: Any] = [
                "name": item.productName,
                "qty": item.quantity,
                "total": item.numericSubtotal
            ]
            // Try to extract variant info from productName
            let components = item.productName.split(separator: " - ", maxSplits: 1)
            if components.count == 2 {
                dict["name"] = String(components[0])
                dict["variant"] = String(components[1])
            }
            return dict
        }]
        
        let discountData: [String: Any]? = {
            if let discountAmt = order.discountAmount, let amt = Double(discountAmt), amt > 0 {
                return [
                    "name": order.discountName ?? "Descuento",
                    "amount": Int(amt)
                ]
            }
            return nil
        }()
        
        let isSplit = order.isSplitPayment
        let paymentMethodToShow = isSplit ? "Dividido" : order.paymentMethod
        let splitPaymentsData: [[String: Any]]? = isSplit ? (order.payments ?? []).map { p in
            var dict: [String: Any] = [
                "method": p.displayMethod,
                "amount": Double(p.amount) ?? 0
            ]
            if let tip = p.tip, let tipValue = Double(tip), tipValue > 0 {
                dict["tip"] = tipValue
                dict["tipMethod"] = p.tipPaymentMethod ?? p.paymentMethod
            }
            return dict
        } : nil
        
        await printTicket(
            customerName: order.customerName ?? "",
            orderNumber: String(order.orderNumber),
            items: itemsBySeat,
            subtotal: Int(Double(order.subtotal ?? "0") ?? 0),
            tip: Int(Double(order.tip ?? "0") ?? 0),
            total: Int(Double(order.total ?? "0") ?? 0),
            tableNumber: order.tableNumber ?? "",
            isDelivery: order.tableId == nil,
            discount: discountData,
            paymentMethod: paymentMethodToShow,
            splitPayments: splitPaymentsData,
            deliveryFee: 0
        )
    }
    
    // MARK: - Print Seat Bill (split bill per seat)
    
    func printSeatBill(
        tableNumber: String?,
        orderNumber: String,
        seatLabel: String,
        items: [[String: Any]],
        subtotal: Double,
        tip: Double,
        discount: [String: Any]?,
        total: Double,
        paymentMethod: String?
    ) async {
        guard let url = URL(string: "\(printServerURL)/print-seat-bill") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5
        
        var body: [String: Any] = [
            "orderNumber": orderNumber,
            "seatLabel": seatLabel,
            "items": items,
            "subtotal": subtotal,
            "tip": tip,
            "total": total
        ]
        if let tn = tableNumber { body["tableNumber"] = tn }
        if let pm = paymentMethod { body["paymentMethod"] = pm }
        if let disc = discount { body["discount"] = disc }
        
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
