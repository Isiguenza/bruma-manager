// Independent verifier: `cd "Bruma POS/Bruma POS" && swiftc -parse-as-library Models/Promotion.swift Services/PromotionEngine.swift ../PromotionEngineVectorVerification.swift -o /tmp/promo-engine-vectors && /tmp/promo-engine-vectors ../../lib/promotions/fixtures/engine-vectors.json`.
// Mismos vectores que `lib/promotions/__tests__/engine.test.ts` (espejo TS del motor).
import Foundation

private struct VectorLine: Decodable {
    let productId: String
    let variantName: String?
    let categoryId: String?
    let unitPrice: Double
    let quantity: Int
    let eligible: Bool
}

private struct VectorExpected: Decodable {
    let promotionId: String?
    let discount: Double
    let newUnitPrice: Double?
}

private struct PromotionVector: Decodable {
    let name: String
    let promotions: [Promotion]
    let lines: [VectorLine]
    let expected: [VectorExpected]
}

@main
private enum PromotionEngineVectorVerification {
    static func main() throws {
        let path = CommandLine.arguments.dropFirst().first ?? "../../lib/promotions/fixtures/engine-vectors.json"
        let vectors = try JSONDecoder().decode([PromotionVector].self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        var failures = 0
        for vector in vectors {
            let lines = vector.lines.map {
                PromoLine(productId: $0.productId, variantName: $0.variantName, categoryId: $0.categoryId,
                          unitPrice: $0.unitPrice, quantity: $0.quantity, eligible: $0.eligible)
            }
            let results = PromotionEngine.evaluate(lines: lines, promotions: vector.promotions)
            for (i, (actual, expected)) in zip(results, vector.expected).enumerated() {
                let same = actual.promotionId == expected.promotionId
                    && abs(actual.discount - expected.discount) < 0.001
                    && ((actual.newUnitPrice == nil && expected.newUnitPrice == nil)
                        || (actual.newUnitPrice != nil && expected.newUnitPrice != nil && abs(actual.newUnitPrice! - expected.newUnitPrice!) < 0.001))
                if !same {
                    failures += 1
                    print("✘ \(vector.name) [línea \(i)]: \(actual) ≠ \(expected)")
                }
            }
        }
        print(failures == 0 ? "promotion engine vectors: \(vectors.count) ok" : "\(failures) fallas")
        if failures > 0 { exit(1) }
    }
}
