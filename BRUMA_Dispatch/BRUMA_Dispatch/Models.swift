//
//  Models.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import Foundation

// MARK: - Order
struct Order: Codable, Identifiable {
    let id: String
    let orderNumber: Int
    let status: String
    let total: String
    let paymentStatus: String
    let paymentMethod: String?
    let customerName: String?
    let notes: String?
    let tableId: String?
    let createdAt: String
    let updatedAt: String
    let items: [OrderItem]?
    let table: Table?
    let preparationTime: Int?
    let priority: Int?         // 0=normal, 1=rush
    let onHold: Bool?
    let holdStartedAt: String?
    let holdAccumulatedSeconds: Int?
    let isPractice: Bool?      // Modo Práctica (Bruma POS Mobile) — orden real, solo entrenamiento
}

// MARK: - OrderItem
struct OrderItem: Identifiable {
    let id: String
    let orderId: String
    let productId: String
    let productName: String
    let quantity: Int
    let unitPrice: String
    let subtotal: String
    let notes: String?
    let voided: Bool?
    let course: Int?
    let seat: String?
    let frostingName: String?
    let dryToppingName: String?
    let extraName: String?
    let customModifiers: String?
    let product: Product?
    let createdAt: String?
    let deliveredToTable: Bool?
    let isBeverage: Bool?  // categoría es bebida O flujo del producto marcado como bebida
    let parentItemId: String?
    let packageLabel: String?

    /// Bebida efectiva: usa el flag del backend (categoría o flujo) y cae a la
    /// categoría por compatibilidad si el backend no lo mandó.
    var effectiveIsBeverage: Bool {
        isBeverage ?? (product?.category?.isBeverage ?? false)
    }
}

extension OrderItem: Codable {
    enum CodingKeys: String, CodingKey {
        case id, orderId, productId, productName, quantity, unitPrice, subtotal
        case notes, voided, course, seat
        case frostingName, dryToppingName, extraName, customModifiers
        case product, createdAt, deliveredToTable, isBeverage, parentItemId, packageLabel
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        orderId = try container.decode(String.self, forKey: .orderId)
        productId = try container.decode(String.self, forKey: .productId)
        productName = try container.decode(String.self, forKey: .productName)
        quantity = try container.decode(Int.self, forKey: .quantity)
        unitPrice = try container.decode(String.self, forKey: .unitPrice)
        subtotal = try container.decode(String.self, forKey: .subtotal)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        voided = try container.decodeIfPresent(Bool.self, forKey: .voided)
        course = try container.decodeIfPresent(Int.self, forKey: .course)
        seat = try container.decodeIfPresent(String.self, forKey: .seat)
        frostingName = try container.decodeIfPresent(String.self, forKey: .frostingName)
        dryToppingName = try container.decodeIfPresent(String.self, forKey: .dryToppingName)
        extraName = try container.decodeIfPresent(String.self, forKey: .extraName)
        customModifiers = try container.decodeIfPresent(String.self, forKey: .customModifiers)
        product = try container.decodeIfPresent(Product.self, forKey: .product)
        deliveredToTable = try container.decodeIfPresent(Bool.self, forKey: .deliveredToTable)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        isBeverage = try container.decodeIfPresent(Bool.self, forKey: .isBeverage)
        parentItemId = try container.decodeIfPresent(String.self, forKey: .parentItemId)
        packageLabel = try container.decodeIfPresent(String.self, forKey: .packageLabel)
    }
}

// MARK: - Product
struct Product: Codable {
    let id: String
    let categoryId: String?
    let category: Category?
}

// MARK: - Category
struct Category: Codable {
    let id: String
    let name: String
    let isBeverage: Bool?
}

// MARK: - Table
struct Table: Codable {
    let id: String
    let number: String
    let status: String
    let guestCount: Int?
}

// MARK: - Custom Modifiers
struct CustomModifier: Codable {
    let stepName: String
    let options: [ModifierOption]
}

struct ModifierOption: Codable {
    let name: String
}

// MARK: - Fechas del API

/// Parser único de fechas del API. Los formatters se crean una sola vez: antes
/// cada tarjeta armaba los suyos en cada render (y el reloj redibujaba todo el
/// board cada segundo).
enum PassDate {
    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let fallback: DateFormatter = {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        return df
    }()

    private static let fallbackFormats = [
        "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSSSSZ",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss.SSS",
        "yyyy-MM-dd HH:mm:ss",
    ]

    private static let hourFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "h:mm a"
        df.locale = Locale(identifier: "en_US")
        return df
    }()

    static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        if let d = isoFractional.date(from: string) { return d }
        if let d = isoPlain.date(from: string) { return d }
        for format in fallbackFormats {
            fallback.dateFormat = format
            if let d = fallback.date(from: string) { return d }
        }
        return nil
    }

    static func hour(_ date: Date) -> String {
        hourFormatter.string(from: date)
    }

    /// "mm:ss" (los minutos siguen creciendo después de 59).
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}

// MARK: - Modelo de pantalla del Pase
//
// Las vistas NO leen `Order`/`OrderItem` ni observan el ViewModel: reciben
// estos structs ya resueltos (entregado optimista incluido). Al ser Equatable,
// SwiftUI se salta las tarjetas que no cambiaron.

struct PassItem: Identifiable, Equatable {
    let id: String
    let quantity: Int
    let name: String
    let modifiers: [String]
    let note: String?
    /// De dónde viene una bebida que se subió a "BEBIDAS" (paquete, asiento,
    /// tiempo), o la etiqueta de paquete de un platillo.
    let context: String?
    let isChild: Bool
    let delivered: Bool
}

struct PassSection: Identifiable, Equatable {
    let id: String
    let title: String?
    let isBeverages: Bool
    let items: [PassItem]
}

/// Una RONDA (batch) de una orden: la unidad del board.
struct PassTicket: Identifiable, Equatable {
    let id: String
    let orderId: String
    let orderNumber: Int
    let title: String
    let subtitle: String
    /// Etiqueta para la franja de "recién entregadas".
    let label: String
    let startDate: Date
    let isRush: Bool
    let isOnHold: Bool
    let holdStartedAt: Date?
    let holdAccumulatedSeconds: Int
    let isPractice: Bool
    let sections: [PassSection]
    /// Todos los items no anulados de la ronda (para reimprimir completa).
    let reprintItemIds: [String]

    static let attentionSeconds = 4 * 60
    static let warningSeconds = 7 * 60
    static let lateSeconds = 10 * 60

    var items: [PassItem] { sections.flatMap(\.items) }
    var totalCount: Int { sections.reduce(0) { $0 + $1.items.count } }
    var doneCount: Int { sections.reduce(0) { $0 + $1.items.filter(\.delivered).count } }
    var pendingItemIds: [String] { items.filter { !$0.delivered }.map(\.id) }

    /// Segundos efectivos de preparación: el tiempo en pausa no cuenta, y
    /// mientras la orden está en pausa el reloj se queda congelado.
    func elapsedSeconds(at now: Date) -> Int {
        let end = (isOnHold ? holdStartedAt : nil) ?? now
        return max(0, Int(end.timeIntervalSince(startDate)) - holdAccumulatedSeconds)
    }

    func isLate(at now: Date) -> Bool {
        !isOnHold && elapsedSeconds(at: now) >= Self.lateSeconds
    }
}

// MARK: - CompletedOrder (franja de "recién entregadas" con deshacer)
struct CompletedOrder: Identifiable, Equatable {
    let id: String          // id de la ronda (batch)
    let orderNumber: Int
    let label: String       // "MESA 5" / "LLEVAR · Juan"
    let itemIds: [String]
    let completedAt: Date
}

struct PassToast: Equatable {
    let message: String
    let isError: Bool
}
