//
//  DemoBackend.swift
//  BRUMA_Dispatch
//
//  Backend falso SOLO para Debug: lanza la app con el argumento `-passDemo`
//  para probar el Pase sin tocar producción (marcar un platillo en el
//  simulador contra el API real lo marca entregado en el restaurante).
//

#if DEBUG
import Foundation

final class DemoBackend {
    static let shared = DemoBackend()
    static let isEnabled = ProcessInfo.processInfo.arguments.contains("-passDemo")

    private var orders: [[String: Any]] = []
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private init() {
        orders = [
            order("o1", 411, table: "2", ago: 772, items: [
                item("a1", "o1", "Aguachile Bruma", 2, ago: 772,
                     mods: #"{"s1":{"stepName":"Proteína","options":[{"name":"Camarón"}]}}"#, notes: "Sin cebolla"),
                item("a2", "o1", "Tostada de atún", 1, ago: 772, delivered: true),
                item("a3", "o1", "Ceviche de pescado", 1, ago: 772),
            ]),
            order("o2", 414, table: "7", ago: 493, items: [
                item("b1", "o2", "Tacos de pescadito - Orden de 3", 1, ago: 493, seat: "A1", pkg: "Paquete"),
                item("b2", "o2", "Limonada - Mineral", 1, ago: 493, seat: "A1", bev: true, parent: "b1"),
                item("b3", "o2", "Papas a la francesa", 1, ago: 493, seat: "A1", parent: "b1"),
                item("b4", "o2", "Burrito de camarón", 1, ago: 493, seat: "A2", notes: "Alergia a la nuez"),
                item("b5", "o2", "Guacamole", 1, ago: 493, seat: "C", delivered: true),
                // Segunda ronda de la misma mesa (más de 30s después).
                item("e1", "o2", "Capuccino - Frío", 2, ago: 71, bev: true,
                     mods: #"{"s1":{"stepName":"Leche","options":[{"name":"Avena"}]}}"#),
                item("e2", "o2", "Americano - Caliente", 1, ago: 71, bev: true),
            ]),
            order("o3", 415, table: nil, customer: "Karla", ago: 338, onHold: true, items: [
                item("c1", "o3", "Tostada de pulpo", 2, ago: 338),
                item("c2", "o3", "Agua de jamaica", 1, ago: 338, bev: true, notes: "Sin hielo"),
            ]),
            order("o4", 413, table: "11", ago: 187, items: [
                item("d1", "o4", "Tostada de atún", 1, ago: 187, course: 1, delivered: true),
                item("d2", "o4", "Taco de pescadito - Pieza", 2, ago: 187, course: 1),
                item("d4", "o4", "Cerveza Pacífico", 2, ago: 187, course: 1, bev: true),
                item("d3", "o4", "Pescado zarandeado", 1, ago: 187, course: 2),
            ]),
            order("o5", 416, table: "PRACTICA", ago: 18, practice: true, items: [
                item("f1", "o5", "Aguachile Bruma", 1, ago: 18),
                item("f2", "o5", "Limonada - Natural", 1, ago: 18, bev: true),
            ]),
            order("o6", 417, table: "5", ago: 9, items: [
                item("g1", "o6", "Ceviche de pescado", 2, ago: 9),
            ]),
        ]
    }

    private func date(_ secondsAgo: Int) -> String {
        iso.string(from: Date().addingTimeInterval(-Double(secondsAgo)))
    }

    private func order(_ id: String, _ number: Int, table: String?, customer: String? = nil, ago: Int,
                       onHold: Bool = false, practice: Bool = false, items: [[String: Any]]) -> [String: Any] {
        var o: [String: Any] = [
            "id": id, "orderNumber": number, "status": "preparing", "total": "0",
            "paymentStatus": "pending", "createdAt": date(ago), "updatedAt": date(ago),
            "items": items, "onHold": onHold, "holdAccumulatedSeconds": 0, "isPractice": practice,
        ]
        if onHold { o["holdStartedAt"] = date(60) }
        if let customer { o["customerName"] = customer }
        if let table {
            o["tableId"] = "t\(table)"
            o["table"] = ["id": "t\(table)", "number": table, "status": "occupied"]
        }
        return o
    }

    private func item(_ id: String, _ orderId: String, _ name: String, _ qty: Int, ago: Int,
                      seat: String? = nil, course: Int? = nil, bev: Bool = false, parent: String? = nil,
                      pkg: String? = nil, mods: String? = nil, notes: String? = nil,
                      delivered: Bool = false) -> [String: Any] {
        var i: [String: Any] = [
            "id": id, "orderId": orderId, "productId": "p-\(id)", "productName": name,
            "quantity": qty, "unitPrice": "0", "subtotal": "0", "voided": false,
            "createdAt": date(ago), "deliveredToTable": delivered, "isBeverage": bev,
        ]
        if let seat { i["seat"] = seat }
        if let course { i["course"] = course }
        if let parent { i["parentItemId"] = parent }
        if let pkg { i["packageLabel"] = pkg }
        if let mods { i["customModifiers"] = mods }
        if let notes { i["notes"] = notes }
        return i
    }

    /// Igual que el API real: sin `ORDER BY` en los items, así que cada
    /// respuesta los trae en otro orden. El board no debe moverse por eso.
    func fetchOrders() throws -> [Order] {
        let shuffled: [[String: Any]] = orders.map { order in
            var copy = order
            copy["items"] = (order["items"] as? [[String: Any]] ?? []).shuffled()
            return copy
        }
        let data = try JSONSerialization.data(withJSONObject: shuffled)
        return try JSONDecoder().decode([Order].self, from: data)
    }

    func setDelivered(_ itemIds: [String], _ delivered: Bool) {
        for index in orders.indices {
            guard var items = orders[index]["items"] as? [[String: Any]] else { continue }
            for i in items.indices where itemIds.contains(items[i]["id"] as? String ?? "") {
                items[i]["deliveredToTable"] = delivered
            }
            orders[index]["items"] = items
        }
    }

    func setHold(_ orderId: String, _ onHold: Bool) {
        guard let index = orders.firstIndex(where: { $0["id"] as? String == orderId }) else { return }
        orders[index]["onHold"] = onHold
        if onHold {
            orders[index]["holdStartedAt"] = date(0)
        } else {
            orders[index].removeValue(forKey: "holdStartedAt")
        }
    }
}
#endif
