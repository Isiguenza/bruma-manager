import Foundation

/// Un renglón del carrito, visto por el motor de promociones. El motor no
/// conoce `CartItem` a propósito: así se compila solo con `Promotion.swift`
/// para correr los vectores compartidos (`PromotionEngineVectorVerification.swift`).
struct PromoLine {
    let productId: String
    let variantName: String?
    let categoryId: String?
    let unitPrice: Double
    let quantity: Int
    /// Hijos de paquete, invitados y renglones excluidos a mano no participan.
    let eligible: Bool
}

struct PromoLineResult: Equatable {
    var promotionId: String?
    var promotionName: String?
    /// Descuento total del renglón (todas sus piezas).
    var discount: Double = 0
    /// Precio unitario nuevo, solo cuando TODAS las piezas llevan el mismo
    /// descuento (2x1 en renglones sueltos, % a un platillo, refresco gratis).
    /// Si solo algunas piezas tienen descuento, el precio se queda y el
    /// descuento vive en `discount`.
    var newUnitPrice: Double?
}

/// Motor de promociones del POS. Espejo exacto de `lib/promotions/engine.ts`
/// (simulador del dashboard); los vectores
/// `lib/promotions/fixtures/engine-vectors.json` fijan los dos.
///
/// Reglas:
/// 1. Cada pieza (unidad) del carrito cuenta una sola vez: lo que toma una
///    promoción ya no lo toma otra.
/// 2. Primero los combos (más específicos), luego 2x1 / % / $; dentro de cada
///    bloque, mayor `priority` primero.
/// 3. Todo es sobre la orden completa, sin importar el asiento.
/// 4. Siempre gana el negocio en los empates: lo gratis es lo más barato.
enum PromotionEngine {

    private struct Unit {
        let line: Int
        let cents: Int
    }

    private struct LineAcc {
        var unitDiscounts: [Int] = []          // centavos por pieza tomada
        var byPromo: [(id: String, name: String, cents: Int)] = []
        var claimedUnits = 0
    }

    static func evaluate(lines: [PromoLine], promotions: [Promotion]) -> [PromoLineResult] {
        var results = Array(repeating: PromoLineResult(), count: lines.count)
        guard !promotions.isEmpty else { return results }

        // Una entrada por pieza; el orden (más barata primero, luego orden del
        // carrito) define quién sale gratis.
        var units: [Unit] = []
        for (index, line) in lines.enumerated() where line.eligible && line.quantity > 0 {
            let cents = Int((line.unitPrice * 100).rounded())
            guard cents > 0 else { continue }
            for _ in 0..<line.quantity { units.append(Unit(line: index, cents: cents)) }
        }
        units = units.enumerated()
            .sorted { a, b in a.element.cents != b.element.cents ? a.element.cents < b.element.cents : a.offset < b.offset }
            .map(\.element)
        var claimed = Array(repeating: false, count: units.count)
        var acc = Array(repeating: LineAcc(), count: lines.count)

        func record(_ promo: Promotion, unitIndex: Int, cents: Int) {
            let line = units[unitIndex].line
            claimed[unitIndex] = true
            acc[line].claimedUnits += 1
            acc[line].unitDiscounts.append(cents)
            if let i = acc[line].byPromo.firstIndex(where: { $0.id == promo.id }) {
                acc[line].byPromo[i].cents += cents
            } else {
                acc[line].byPromo.append((promo.id, promo.name, cents))
            }
        }

        let ordered = promotions.enumerated().sorted { a, b in
            let pa = a.element.priority ?? 0, pb = b.element.priority ?? 0
            return pa != pb ? pa > pb : a.offset < b.offset
        }.map(\.element)

        for promo in ordered where promo.type == "combo" {
            guard let config = promo.comboConfig else { continue }
            for (u, cents) in comboPicks(config, lines: lines, units: units, claimed: claimed) {
                record(promo, unitIndex: u, cents: cents)
            }
        }
        for promo in ordered where promo.type != "combo" {
            let matching = units.indices.filter { !claimed[$0] && matchesPromotion(promo, line: lines[units[$0].line]) }
            guard !matching.isEmpty else { continue }
            switch promo.type {
            case "buy_x_get_y":
                let buy = max(1, promo.buyQuantity ?? 2)
                let get = min(buy, max(0, promo.getQuantity ?? 1))
                let sets = matching.count / buy
                guard sets > 0, get > 0 else { continue }
                // Gratis: las más baratas. Pagadas: las más caras. Lo que sobra
                // de un set incompleto queda libre para otra promoción.
                let free = Array(matching.prefix(sets * get))
                let paid = Array(matching.suffix(sets * (buy - get)))
                for u in free { record(promo, unitIndex: u, cents: units[u].cents) }
                for u in paid { record(promo, unitIndex: u, cents: 0) }
            case "percentage_discount":
                let pct = promo.discountPercentage ?? 0
                guard pct > 0 else { continue }
                for u in matching { record(promo, unitIndex: u, cents: percentCents(units[u].cents, pct)) }
            case "fixed_discount":
                let amount = Int(((promo.discountAmount ?? 0) * 100).rounded())
                guard amount > 0 else { continue }
                for u in matching { record(promo, unitIndex: u, cents: min(units[u].cents, amount)) }
            default:
                break
            }
        }

        for index in lines.indices {
            let a = acc[index]
            guard a.claimedUnits > 0 else { continue }
            // El renglón se agrupa bajo la promoción que más le descontó (en
            // empate, la primera que lo tomó).
            var best = a.byPromo[0]
            for entry in a.byPromo.dropFirst() where entry.cents > best.cents { best = entry }
            let total = a.unitDiscounts.reduce(0, +)
            var result = PromoLineResult(promotionId: best.id, promotionName: best.name, discount: Double(total) / 100)
            let unitCents = Int((lines[index].unitPrice * 100).rounded())
            if total > 0, a.claimedUnits == lines[index].quantity, Set(a.unitDiscounts).count == 1 {
                result.newUnitPrice = Double(unitCents - a.unitDiscounts[0]) / 100
            }
            results[index] = result
        }
        return results
    }

    // MARK: - Combos

    /// Piezas que toma el combo (todas sus repeticiones) con el descuento de
    /// cada una en centavos.
    private static func comboPicks(
        _ config: ComboConfig,
        lines: [PromoLine],
        units: [Unit],
        claimed initialClaimed: [Bool]
    ) -> [(Int, Int)] {
        var claimed = initialClaimed
        var result: [(Int, Int)] = []
        let groups = config.groups.filter { $0.quantity > 0 }
        guard !groups.isEmpty else { return result }
        // El grupo con menos candidatos se llena primero: así "cualquier
        // platillo" no se come la pieza que solo sirve para "refresco".
        let candidateCounts = groups.map { g in units.indices.filter { !claimed[$0] && matchesGroup(g, line: lines[units[$0].line]) }.count }
        let fillOrder = groups.indices.sorted { a, b in
            candidateCounts[a] != candidateCounts[b] ? candidateCounts[a] < candidateCounts[b] : a < b
        }

        while true {
            var taken: [[Int]] = Array(repeating: [], count: groups.count)
            var used = Set<Int>()
            var complete = true
            for g in fillOrder {
                let picks = units.indices.filter { !claimed[$0] && !used.contains($0) && matchesGroup(groups[g], line: lines[units[$0].line]) }
                    .prefix(groups[g].quantity)
                guard picks.count == groups[g].quantity else { complete = false; break }
                taken[g] = Array(picks)
                used.formUnion(picks)
            }
            guard complete else { return result }

            var discounts: [Int: Int] = [:]   // unitIndex → centavos
            let all = taken.flatMap { $0 }
            switch config.reward.type {
            case "percent", "amount", "price":
                let total = all.reduce(0) { $0 + units[$1].cents }
                let value = config.reward.value ?? 0
                let target: Int
                switch config.reward.type {
                case "percent": target = percentCents(total, value)
                case "amount": target = min(total, Int((value * 100).rounded()))
                default: target = max(0, total - Int((value * 100).rounded()))
                }
                for (u, cents) in distribute(target, over: all, units: units) { discounts[u] = cents }
            default: // "items"
                for (g, picks) in taken.enumerated() {
                    guard let reward = groups[g].reward, reward.type != "none" else { continue }
                    let rewarded = picks.prefix(min(picks.count, reward.quantity ?? picks.count))
                    for u in rewarded {
                        discounts[u] = itemRewardCents(reward, unitCents: units[u].cents)
                    }
                }
            }

            // Un combo que no descuenta nada no "se come" platillos.
            guard discounts.values.reduce(0, +) > 0 else { return result }
            for u in all {
                claimed[u] = true
                result.append((u, discounts[u] ?? 0))
            }
            if !config.repeats { return result }
        }
    }

    private static func itemRewardCents(_ reward: ComboItemReward, unitCents: Int) -> Int {
        let value = reward.value ?? 0
        switch reward.type {
        case "free": return unitCents
        case "percent": return percentCents(unitCents, value)
        case "amount": return min(unitCents, Int((value * 100).rounded()))
        case "price": return max(0, unitCents - Int((value * 100).rounded()))
        default: return 0
        }
    }

    /// Reparte `target` centavos proporcional al precio; el residuo del
    /// redondeo va a la pieza más cara para que la suma cuadre exacto.
    private static func distribute(_ target: Int, over picks: [Int], units: [Unit]) -> [(Int, Int)] {
        let total = picks.reduce(0) { $0 + units[$1].cents }
        guard target > 0, total > 0 else { return picks.map { ($0, 0) } }
        var shares = picks.map { u in (u, units[u].cents * target / total) }
        let remainder = target - shares.reduce(0) { $0 + $1.1 }
        if remainder != 0, let maxIndex = shares.indices.max(by: { units[shares[$0].0].cents < units[shares[$1].0].cents }) {
            shares[maxIndex].1 += remainder
        }
        return shares
    }

    private static func percentCents(_ cents: Int, _ pct: Double) -> Int {
        min(cents, Int((Double(cents) * pct / 100).rounded()))
    }

    // MARK: - Matching

    nonisolated private static func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespaces) }

    /// `"<productId>::<variante>"` — mismo formato que guarda el picker del
    /// dashboard. Se compara sin espacios sobrantes: en datos reales hay
    /// variantes como "Orden " con espacio al final.
    private static func refMatches(_ refs: [String], line: PromoLine) -> Bool {
        if refs.contains(line.productId) { return true }
        guard let variant = line.variantName else { return false }
        let key = "\(line.productId)::\(trimmed(variant))"
        return refs.contains { ref in
            guard let sep = ref.range(of: "::") else { return false }
            return "\(ref[..<sep.lowerBound])::\(trimmed(String(ref[sep.upperBound...])))" == key
        }
    }

    static func matchesGroup(_ group: ComboGroup, line: PromoLine) -> Bool {
        if let category = line.categoryId, group.allCategoryIds.contains(category) { return true }
        let refs = group.allProductIds
        if refs.contains(line.productId) {
            // Legacy: `variantNames` filtra las variantes del producto; un
            // platillo sin variante siempre califica.
            guard let names = group.variantNames, !names.isEmpty else { return true }
            guard let variant = line.variantName else { return true }
            return names.map(trimmed).contains(trimmed(variant))
        }
        return refMatches(refs, line: line)
    }

    static func matchesPromotion(_ promo: Promotion, line: PromoLine) -> Bool {
        switch promo.applyTo {
        case "all_products": return true
        case "specific_products": return refMatches(promo.parsedProductIds, line: line)
        case "category": return line.categoryId != nil && promo.categoryId == line.categoryId
        default: return false
        }
    }

    // MARK: - Descuentos manuales

    static func calculateDiscount(subtotal: Double, discountType: String, discountValue: Double) -> Double {
        switch discountType {
        case "percentage":
            return (subtotal * discountValue) / 100
        case "fixed_amount":
            return min(discountValue, subtotal)
        default: // flexible
            return min(discountValue, subtotal)
        }
    }
}
