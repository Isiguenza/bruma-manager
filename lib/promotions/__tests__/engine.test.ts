import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { evaluatePromotions, type EnginePromotion, type PromoLine, type PromoLineResult } from "../engine"

interface Vector {
  name: string
  promotions: EnginePromotion[]
  lines: PromoLine[]
  expected: Pick<PromoLineResult, "promotionId" | "discount" | "newUnitPrice">[]
}

const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/engine-vectors.json", import.meta.url), "utf8"),
) as Vector[]

export function runPromotionEngineVectors(): number {
  for (const vector of vectors) {
    const actual = evaluatePromotions(vector.lines, vector.promotions).map(({ promotionId, discount, newUnitPrice }) => ({
      promotionId,
      discount,
      newUnitPrice,
    }))
    assert.deepEqual(actual, vector.expected, vector.name)
  }
  return vectors.length
}

console.log(`promotion engine vectors: ${runPromotionEngineVectors()} ok`)
