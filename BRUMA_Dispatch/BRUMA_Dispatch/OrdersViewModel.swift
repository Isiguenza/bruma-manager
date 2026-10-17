//
//  OrdersViewModel.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import Foundation
import SwiftUI
import Combine

@MainActor
final class OrdersViewModel: ObservableObject {
    /// Rondas visibles en el riel, ya ordenadas (la más antigua a la izquierda).
    @Published private(set) var tickets: [PassTicket] = []
    /// Rondas que se están "enrollando" para salir del riel.
    @Published private(set) var leavingIds: Set<String> = []
    /// Rondas completadas hace poco — franja inferior con "Deshacer" (60s).
    @Published private(set) var recentlyCompleted: [CompletedOrder] = []
    /// Ronda cuya comanda se está reimprimiendo ahora (para el spinner).
    @Published private(set) var reprintingTicketId: String?
    @Published private(set) var toast: PassToast?
    @Published private(set) var hasLoaded = false

    /// all | food | beverages
    var viewMode: String = "all" {
        didSet {
            guard oldValue != viewMode else { return }
            // El filtro cambia qué platillos cuentan para cada ronda: las fotos
            // previas ya no son comparables.
            snapshots = [:]
            leavingIds = []
            rebuild(animated: false, allowLeaving: false)
        }
    }

    static let completedTTL: TimeInterval = 60

    // MARK: — Estado interno

    private struct Batch {
        let id: String
        let order: Order
        let index: Int          // número de ronda dentro de la orden (0 = primera)
        let startDate: Date
        let items: [OrderItem]  // no anulados, en orden estable
    }

    private struct Snapshot {
        let orderNumber: Int
        let label: String
        /// Lo que faltaba por entregar en esa foto: es justo lo que el último
        /// toque entregó, y por lo tanto lo único que "Deshacer" debe revertir
        /// (lo que ya estaba entregado desde antes se queda entregado).
        let pendingItemIds: [String]
        var allDelivered: Bool { pendingItemIds.isEmpty }
    }

    private var orders: [Order] = []
    /// Estado optimista de "entregado" por item. Se suelta cuando el servidor
    /// ya coincide y no queda ninguna petición en vuelo para ese item.
    private var deliveredOverride: [String: Bool] = [:]
    private var pendingItemOps: [String: Int] = [:]
    /// Pausa optimista por orden (valor + momento del toque).
    private var holdOverride: [String: (onHold: Bool, at: Date)] = [:]
    private var snapshots: [String: Snapshot] = [:]
    /// Items que ya sonaron alguna vez. El sonido depende de items nunca
    /// vistos, NO de ids de ronda ni del evento de socket: marcar un platillo,
    /// deshacer o un cambio en el orden del API ya no lo vuelven a disparar.
    private var seenItemIds: Set<String> = []
    /// Rondas cuya animación de salida ya terminó y deben quitarse del riel en
    /// el siguiente `rebuild`.
    private var expiredLeaving: Set<String> = []

    private var isFetching = false
    private var needsRefetch = false
    private var debounceTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var pruneTask: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private let soundPlayer = SoundPlayer.shared

    init() {
        setupSocketCallbacks()
        startTimers()
        refresh()
    }

    // MARK: — Red

    private func setupSocketCallbacks() {
        let socket = SocketService.shared
        socket.onConnect = { [weak self] in
            // Al (re)conectar puede haberse perdido cualquier evento.
            Task { @MainActor in self?.refresh() }
        }
        socket.onNewOrder = { [weak self] in
            Task { @MainActor in self?.scheduleRefresh() }
        }
        socket.onOrderUpdated = { [weak self] _ in
            Task { @MainActor in self?.scheduleRefresh() }
        }
        socket.onOrderRush = { [weak self] _ in
            Task { @MainActor in self?.scheduleRefresh() }
        }
        socket.onOrderHold = { [weak self] _ in
            Task { @MainActor in self?.scheduleRefresh() }
        }
        #if DEBUG
        if DemoBackend.isEnabled { return }
        #endif
        socket.connect(baseURL: APIService.shared.baseURL)
    }

    private func startTimers() {
        // Poll de respaldo: el socket es la vía principal.
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                self?.refresh()
            }
        }
        // Solo vence la franja de completadas; los relojes de las tarjetas se
        // pintan con TimelineView, sin pasar por el ViewModel.
        pruneTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                self?.pruneCompleted()
            }
        }
    }

    /// Varios eventos de socket seguidos (una acción dispara 2-3) = un solo fetch.
    private func scheduleRefresh() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            self?.refresh()
        }
    }

    /// Pide las órdenes. Nunca hay dos fetch en vuelo: si llega otra petición
    /// mientras tanto, se hace UNA más al terminar.
    func refresh() {
        if isFetching {
            needsRefetch = true
            return
        }
        isFetching = true
        Task {
            repeat {
                needsRefetch = false
                await load()
            } while needsRefetch
            isFetching = false
        }
    }

    private func load() async {
        do {
            orders = try await APIService.shared.fetchPreparingOrders()
            reconcileOverrides()
            let firstLoad = !hasLoaded
            hasLoaded = true
            rebuild(animated: true, playSound: !firstLoad)
            if toast?.isError == true, toast?.message == Self.offlineMessage {
                toast = nil
            }
        } catch {
            print("❌ Error fetching orders: \(error)")
            showToast(Self.offlineMessage, isError: true, autoHide: false)
        }
    }

    private static let offlineMessage = "Sin conexión con el servidor — reintentando"

    /// Suelta el estado optimista que el servidor ya confirmó.
    private func reconcileOverrides() {
        for order in orders {
            for item in order.items ?? [] {
                guard let override = deliveredOverride[item.id],
                      (pendingItemOps[item.id] ?? 0) == 0,
                      override == (item.deliveredToTable == true) else { continue }
                deliveredOverride.removeValue(forKey: item.id)
            }
            if let hold = holdOverride[order.id], hold.onHold == (order.onHold ?? false) {
                holdOverride.removeValue(forKey: order.id)
            }
        }
    }

    // MARK: — Acciones

    /// Tap en un platillo → marca / desmarca entregado (optimista + API).
    func toggleItem(_ itemId: String) {
        let current = isDelivered(itemId)
        setDelivered([itemId], to: !current, failureMessage: "No se pudo marcar el platillo — reintenta")
    }

    /// "Entregar todo" — entrega lo que falta de la ronda (solo lo que esta
    /// estación está viendo según el filtro).
    func markRemaining(_ ticket: PassTicket) {
        let pending = ticket.pendingItemIds.filter { !isDelivered($0) }
        guard !pending.isEmpty else { return }
        setDelivered(pending, to: true, failureMessage: "No se pudo completar la ronda — reintenta")
    }

    private func setDelivered(_ itemIds: [String], to target: Bool, failureMessage: String) {
        let previous = itemIds.map { ($0, isDelivered($0)) }
        for id in itemIds {
            deliveredOverride[id] = target
            pendingItemOps[id, default: 0] += 1
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        rebuild(animated: true)

        Task {
            var failed = false
            do {
                try await APIService.shared.setItemsDelivered(itemIds, delivered: target)
            } catch {
                failed = true
            }
            for id in itemIds {
                let left = (pendingItemOps[id] ?? 1) - 1
                pendingItemOps[id] = left > 0 ? left : nil
            }
            if failed {
                for (id, value) in previous where (pendingItemOps[id] ?? 0) == 0 {
                    deliveredOverride[id] = value
                }
                rebuild(animated: true)
                showToast(failureMessage, isError: true)
            }
            refresh()
        }
    }

    /// "Deshacer" en la franja de completadas → la ronda vuelve al riel.
    func undoCompleted(_ completed: CompletedOrder) {
        recentlyCompleted.removeAll { $0.id == completed.id }
        for id in completed.itemIds {
            deliveredOverride[id] = false
            pendingItemOps[id, default: 0] += 1
        }
        rebuild(animated: true)

        Task {
            var failed = false
            do {
                try await APIService.shared.setItemsDelivered(completed.itemIds, delivered: false)
            } catch {
                failed = true
            }
            for id in completed.itemIds {
                let left = (pendingItemOps[id] ?? 1) - 1
                pendingItemOps[id] = left > 0 ? left : nil
            }
            if failed {
                // Sigue entregada en el servidor: regresa a la franja.
                for id in completed.itemIds { deliveredOverride[id] = true }
                if !recentlyCompleted.contains(where: { $0.id == completed.id }) {
                    recentlyCompleted.insert(completed, at: 0)
                }
                rebuild(animated: true)
                showToast("No se pudo deshacer — reintenta", isError: true)
            } else {
                showToast("\(completed.label) regresó al pase", isError: false)
            }
            refresh()
        }
    }

    func dismissCompleted(_ completed: CompletedOrder) {
        recentlyCompleted.removeAll { $0.id == completed.id }
    }

    /// Reimprime la comanda de cocina de esta ronda.
    func reprint(_ ticket: PassTicket) {
        guard reprintingTicketId == nil else { return }
        reprintingTicketId = ticket.id
        Task {
            do {
                try await APIService.shared.reprintComanda(orderId: ticket.orderId, itemIds: ticket.reprintItemIds)
                showToast("Comanda enviada a cocina · \(ticket.label)", isError: false)
            } catch {
                showToast("No se pudo reimprimir — revisa la impresora", isError: true)
            }
            reprintingTicketId = nil
        }
    }

    /// Pausar / reanudar la orden (la pausa es de la orden completa: aplica a
    /// todas sus rondas).
    func toggleHold(_ ticket: PassTicket) {
        let target = !ticket.isOnHold
        let previous = holdOverride[ticket.orderId]
        holdOverride[ticket.orderId] = (target, Date())
        rebuild(animated: true)

        Task {
            do {
                if target {
                    try await APIService.shared.holdOrder(orderId: ticket.orderId)
                } else {
                    try await APIService.shared.unholdOrder(orderId: ticket.orderId)
                }
            } catch {
                holdOverride[ticket.orderId] = previous
                rebuild(animated: true)
                showToast(target ? "No se pudo pausar la orden" : "No se pudo reanudar la orden", isError: true)
            }
            refresh()
        }
    }

    // MARK: — Toast

    private func showToast(_ message: String, isError: Bool, autoHide: Bool = true) {
        let new = PassToast(message: message, isError: isError)
        if toast != new { toast = new }
        toastTask?.cancel()
        guard autoHide else { return }
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    // MARK: — Armado del board

    private func isDelivered(_ itemId: String) -> Bool {
        if let override = deliveredOverride[itemId] { return override }
        for order in orders {
            if let item = order.items?.first(where: { $0.id == itemId }) {
                return item.deliveredToTable == true
            }
        }
        return false
    }

    private func isDelivered(_ item: OrderItem) -> Bool {
        deliveredOverride[item.id] ?? (item.deliveredToTable == true)
    }

    private func matchesViewMode(_ item: OrderItem) -> Bool {
        switch viewMode {
        case "food": return !item.effectiveIsBeverage
        case "beverages": return item.effectiveIsBeverage
        default: return true
        }
    }

    private func pruneCompleted() {
        let now = Date()
        let expired = recentlyCompleted.filter { now.timeIntervalSince($0.completedAt) > Self.completedTTL }
        guard !expired.isEmpty else { return }
        recentlyCompleted.removeAll { c in expired.contains { $0.id == c.id } }
    }

    /// Recalcula el riel a partir de `orders` + estado optimista. No toca red:
    /// se llama tras cada fetch Y tras cada toque, por eso la UI responde al
    /// instante.
    private func rebuild(animated: Bool, playSound: Bool = false, allowLeaving: Bool = true) {
        let batches = makeBatches()
        var built: [PassTicket] = []
        var doneById: [String: Bool] = [:]

        for batch in batches {
            let scoped = batch.items.filter(matchesViewMode)
            guard !scoped.isEmpty else { continue }
            let ticket = makeTicket(batch, scoped: scoped)
            built.append(ticket)
            doneById[ticket.id] = scoped.allSatisfy { isDelivered($0) }
        }
        let builtById = Dictionary(built.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        // Una ronda que volvió a tener algo pendiente (falló el POST, o alguien
        // la desmarcó en otro dispositivo) sale de la franja de completadas.
        recentlyCompleted.removeAll { doneById[$0.id] == false }

        // Rondas recién completadas: la foto previa tenía algo pendiente y
        // ahora todo está entregado (o la orden ya salió del fetch porque el
        // backend la pasó a "ready" con nuestro último toque).
        for (id, snap) in snapshots where !snap.allDelivered {
            guard !recentlyCompleted.contains(where: { $0.id == id }) else { continue }
            let doneNow: Bool
            if let done = doneById[id] {
                doneNow = done
            } else {
                doneNow = snap.pendingItemIds.allSatisfy { deliveredOverride[$0] == true }
            }
            guard doneNow else { continue }
            recentlyCompleted.insert(
                CompletedOrder(id: id, orderNumber: snap.orderNumber, label: snap.label,
                               itemIds: snap.pendingItemIds, completedAt: Date()),
                at: 0
            )
        }

        // Fotos de las rondas vigentes. Las que ya no vienen en el fetch
        // conservan su última foto solo mientras sigan en la franja.
        var nextSnapshots: [String: Snapshot] = [:]
        for ticket in built {
            nextSnapshots[ticket.id] = Snapshot(
                orderNumber: ticket.orderNumber,
                label: ticket.label,
                pendingItemIds: ticket.pendingItemIds
            )
        }
        snapshots = nextSnapshots

        // Overrides huérfanos (items que ya no existen ni están en la franja).
        let liveItemIds = Set(orders.flatMap { ($0.items ?? []).map(\.id) })
            .union(recentlyCompleted.flatMap(\.itemIds))
        deliveredOverride = deliveredOverride.filter {
            liveItemIds.contains($0.key) || (pendingItemOps[$0.key] ?? 0) > 0
        }
        let liveOrderIds = Set(orders.map(\.id))
        holdOverride = holdOverride.filter { liveOrderIds.contains($0.key) }

        // Sonido: solo por platillos que nunca habíamos visto.
        var hasNewWork = false
        for batch in batches {
            for item in batch.items where !seenItemIds.contains(item.id) {
                if matchesViewMode(item) && !isDelivered(item) { hasNewWork = true }
            }
        }
        for order in orders {
            for item in order.items ?? [] { seenItemIds.insert(item.id) }
        }
        if playSound && hasNewWork {
            soundPlayer.playNotification(viewMode: viewMode)
        }

        // Riel: rondas con algo pendiente + las que están saliendo (se quedan
        // un instante para la animación de enrollarse).
        let pending = built.filter { doneById[$0.id] == false }
        let pendingIds = Set(pending.map(\.id))
        let oldById = Dictionary(tickets.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        var nextLeaving = leavingIds.subtracting(pendingIds).subtracting(expiredLeaving)
        if allowLeaving {
            for old in tickets where !pendingIds.contains(old.id) && !nextLeaving.contains(old.id)
                && !expiredLeaving.contains(old.id) {
                nextLeaving.insert(old.id)
                scheduleLeave(old.id)
            }
        }

        var next = pending
        for id in nextLeaving {
            if let ticket = builtById[id] ?? oldById[id] { next.append(ticket) }
        }
        next.sort { a, b in
            if a.isRush != b.isRush { return a.isRush }
            if a.startDate != b.startDate { return a.startDate < b.startDate }
            return a.id < b.id
        }

        expiredLeaving = []

        // `tickets` y `leavingIds` cambian en la MISMA transacción. Si
        // `leavingIds` se publica antes por separado, la tarjeta ya enrollada
        // se vuelve a pintar completa un instante antes de quitarse (parpadeo).
        let apply = {
            if self.tickets != next { self.tickets = next }
            if self.leavingIds != nextLeaving { self.leavingIds = nextLeaving }
        }
        if animated {
            withAnimation(.snappy(duration: 0.42)) { apply() }
        } else {
            apply()
        }
    }

    private func scheduleLeave(_ id: String) {
        Task { [weak self] in
            // Espera a que la persiana termine de cerrarse antes de recorrer
            // a las vecinas.
            try? await Task.sleep(nanoseconds: 460_000_000)
            guard let self, self.leavingIds.contains(id) else { return }
            self.expiredLeaving.insert(id)
            self.rebuild(animated: true, allowLeaving: false)
        }
    }

    // MARK: — Órdenes → rondas

    /// Parte cada orden en rondas por gaps de 30s entre los platillos raíz. Un
    /// hijo (incluido de un paquete) siempre va en la ronda de su raíz.
    private func makeBatches() -> [Batch] {
        var result: [Batch] = []

        for order in orders {
            // Orden ESTABLE: el API no ordena los items, y Postgres los regresa
            // en otro orden cada vez que se actualiza una fila (p.ej. al
            // marcarla entregada). Sin esto los platillos brincaban de lugar.
            let all = (order.items ?? [])
                .map { (item: $0, date: PassDate.parse($0.createdAt) ?? .distantPast) }
                .sorted { a, b in
                    if a.date != b.date { return a.date < b.date }
                    return a.item.id < b.item.id
                }
            guard !all.isEmpty else { continue }

            let itemsById = Dictionary(all.map { ($0.item.id, $0.item) }, uniquingKeysWith: { first, _ in first })

            func rootId(for item: OrderItem) -> String {
                var current = item
                var visited: Set<String> = [item.id]
                while let parentId = current.parentItemId,
                      let parent = itemsById[parentId],
                      visited.insert(parentId).inserted {
                    current = parent
                }
                return current.id
            }

            // Los anulados también cuentan para partir rondas: así el id de la
            // ronda no cambia si se anula su primer platillo.
            var groups: [(rootIds: [String], firstRootId: String, start: Date)] = []
            var lastDate = Date.distantPast
            for entry in all where rootId(for: entry.item) == entry.item.id {
                if groups.isEmpty || entry.date.timeIntervalSince(lastDate) > 30 {
                    groups.append(([entry.item.id], entry.item.id, entry.date))
                } else {
                    groups[groups.count - 1].rootIds.append(entry.item.id)
                }
                lastDate = entry.date
            }

            var groupIndexByRoot: [String: Int] = [:]
            for (index, group) in groups.enumerated() {
                for id in group.rootIds { groupIndexByRoot[id] = index }
            }

            var itemsByGroup = Array(repeating: [OrderItem](), count: groups.count)
            for entry in all where entry.item.voided != true {
                guard let index = groupIndexByRoot[rootId(for: entry.item)] else { continue }
                itemsByGroup[index].append(entry.item)
            }

            let orderDate = PassDate.parse(order.createdAt) ?? Date()
            for (index, group) in groups.enumerated() where !itemsByGroup[index].isEmpty {
                result.append(Batch(
                    id: "\(order.id)_\(group.firstRootId)",
                    order: order,
                    index: index,
                    startDate: group.start == .distantPast ? orderDate : group.start,
                    items: itemsByGroup[index]
                ))
            }
        }
        return result
    }

    // MARK: — Ronda → tarjeta

    private func makeTicket(_ batch: Batch, scoped: [OrderItem]) -> PassTicket {
        let order = batch.order
        let isPractice = order.isPractice ?? false
        let byId = Dictionary(batch.items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let multipleCourses = Set(batch.items.compactMap(\.course)).count > 1

        // Bebidas hasta arriba, vengan sueltas o como incluido de un paquete.
        let beverages = scoped.filter(\.effectiveIsBeverage)
        let food = scoped.filter { !$0.effectiveIsBeverage }
        var sections: [PassSection] = []

        if !beverages.isEmpty {
            sections.append(PassSection(
                id: "beverages",
                title: "BEBIDAS · SALEN PRIMERO",
                isBeverages: true,
                items: beverages.map { item in
                    var parts: [String] = []
                    if let parentId = item.parentItemId, let parent = byId[parentId] {
                        parts.append("PAQUETE · \(parent.productName)")
                    } else if let label = item.packageLabel, !label.isEmpty {
                        parts.append(label)
                    }
                    let seat = seatKey(item)
                    if !seat.isEmpty { parts.append(seatTitle(seat)) }
                    if multipleCourses, let course = item.course { parts.append("TIEMPO \(course)") }
                    return passItem(item, context: parts.isEmpty ? nil : parts.joined(separator: " · "), isChild: false)
                }
            ))
        }

        let seats = Set(food.map(seatKey)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        for seat in seats {
            let seatItems = food.filter { seatKey($0) == seat }
            let courses = Set(seatItems.map { $0.course ?? 1 }).sorted()
            let groups: [(course: Int?, items: [OrderItem])] = courses.count > 1
                ? courses.map { c in (c, seatItems.filter { ($0.course ?? 1) == c }) }
                : [(nil, seatItems)]

            for group in groups {
                var titleParts: [String] = []
                if !seat.isEmpty { titleParts.append(seatTitle(seat)) }
                if let course = group.course { titleParts.append("TIEMPO \(course)") }
                if titleParts.isEmpty && !beverages.isEmpty { titleParts.append("PLATILLOS") }

                sections.append(PassSection(
                    id: "\(seat)|\(group.course ?? 0)",
                    title: titleParts.isEmpty ? nil : titleParts.joined(separator: " · "),
                    isBeverages: false,
                    items: hierarchical(group.items).map { entry in
                        let label = entry.item.packageLabel.flatMap { $0.isEmpty ? nil : $0 }
                        return passItem(entry.item, context: label, isChild: entry.isChild)
                    }
                ))
            }
        }

        // Pausa: valor del servidor, o el optimista si todavía no lo confirma.
        var isOnHold = order.onHold ?? false
        var holdStartedAt = PassDate.parse(order.holdStartedAt)
        var accumulated = order.holdAccumulatedSeconds ?? 0
        if let override = holdOverride[order.id], override.onHold != isOnHold {
            if override.onHold {
                holdStartedAt = override.at
            } else if let started = holdStartedAt {
                accumulated += max(0, Int(override.at.timeIntervalSince(started)))
            }
            isOnHold = override.onHold
        }

        let title: String
        let label: String
        var subtitleParts = ["#\(order.orderNumber)"]
        if isPractice {
            title = "PRÁCTICA"
            label = "PRÁCTICA · #\(order.orderNumber)"
        } else if let table = order.table {
            title = "MESA \(table.number)"
            label = "MESA \(table.number) · #\(order.orderNumber)"
        } else {
            title = "LLEVAR"
            if let name = order.customerName, !name.isEmpty {
                subtitleParts.append(name)
                label = "LLEVAR · \(name)"
            } else {
                label = "LLEVAR · #\(order.orderNumber)"
            }
        }
        if batch.index > 0 { subtitleParts.append("RONDA \(batch.index + 1)") }
        subtitleParts.append(PassDate.hour(batch.startDate))

        return PassTicket(
            id: batch.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            title: title,
            subtitle: subtitleParts.joined(separator: " · "),
            label: label,
            startDate: batch.startDate,
            isRush: order.priority == 1,
            isOnHold: isOnHold,
            holdStartedAt: holdStartedAt,
            holdAccumulatedSeconds: accumulated,
            isPractice: isPractice,
            sections: sections,
            reprintItemIds: batch.items.map(\.id)
        )
    }

    private func seatKey(_ item: OrderItem) -> String {
        (item.seat ?? "").trimmingCharacters(in: .whitespaces).uppercased()
    }

    private func seatTitle(_ seat: String) -> String {
        if seat == "C" { return "AL CENTRO" }
        if Int(seat) != nil { return "ASIENTO \(seat)" }
        return seat
    }

    /// Padre seguido de sus incluidos, sin cambiar el orden estable de entrada.
    private func hierarchical(_ items: [OrderItem]) -> [(item: OrderItem, isChild: Bool)] {
        let ids = Set(items.map(\.id))
        var childrenByParent: [String: [OrderItem]] = [:]
        for item in items {
            if let parentId = item.parentItemId, ids.contains(parentId) {
                childrenByParent[parentId, default: []].append(item)
            }
        }
        var result: [(item: OrderItem, isChild: Bool)] = []
        var emitted: Set<String> = []

        func append(_ item: OrderItem, isChild: Bool) {
            guard emitted.insert(item.id).inserted else { return }
            result.append((item, isChild))
            for child in childrenByParent[item.id] ?? [] { append(child, isChild: true) }
        }

        for item in items where item.parentItemId == nil || !ids.contains(item.parentItemId ?? "") {
            append(item, isChild: false)
        }
        for item in items { append(item, isChild: true) }  // ciclos raros: nunca perder un platillo
        return result
    }

    private func passItem(_ item: OrderItem, context: String?, isChild: Bool) -> PassItem {
        var modifiers: [String] = []
        if let f = item.frostingName, !f.isEmpty { modifiers.append(f) }
        if let t = item.dryToppingName, !t.isEmpty { modifiers.append(t) }
        if let e = item.extraName, !e.isEmpty { modifiers.append(e) }
        for (_, mod) in Self.parseCustomModifiers(item.customModifiers).sorted(by: { $0.key < $1.key }) {
            let names = mod.options.map(\.name).joined(separator: ", ")
            guard !names.isEmpty else { continue }
            modifiers.append(mod.stepName.isEmpty ? names : "\(mod.stepName): \(names)")
        }
        let note = item.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        return PassItem(
            id: item.id,
            quantity: item.quantity,
            name: item.productName,
            modifiers: modifiers,
            note: (note?.isEmpty ?? true) ? nil : note,
            context: context,
            isChild: isChild,
            delivered: isDelivered(item)
        )
    }

    /// `customModifiers` viene como JSON: diccionario por stepId (POS) o el
    /// arreglo legacy de Waitress.
    private static func parseCustomModifiers(_ json: String?) -> [String: CustomModifier] {
        guard let json, !json.isEmpty, let data = json.data(using: .utf8) else { return [:] }
        if let dict = try? JSONDecoder().decode([String: CustomModifier].self, from: data) {
            return dict
        }
        guard let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [:] }
        var dict: [String: CustomModifier] = [:]
        for entry in array {
            guard let stepId = entry["stepId"] as? String,
                  let optionName = entry["optionName"] as? String else { continue }
            let existing = dict[stepId]
            let stepName = entry["stepName"] as? String ?? existing?.stepName ?? ""
            dict[stepId] = CustomModifier(stepName: stepName,
                                          options: (existing?.options ?? []) + [ModifierOption(name: optionName)])
        }
        return dict
    }
}
