import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { composeFlowGraph } from "../compose"

interface Vector {
  name: string
  input: Parameters<typeof composeFlowGraph>[0]
  expected: unknown
}

const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/compose-vectors.json", import.meta.url), "utf8"),
) as Vector[]

const wire = (value: unknown) => JSON.parse(JSON.stringify(value))

export function runComposeVectors(): number {
  for (const vector of vectors) {
    assert.deepEqual(wire(composeFlowGraph(vector.input)), vector.expected, vector.name)
  }
  return vectors.length
}

if (process.argv[1]?.endsWith("compose.test.ts")) {
  console.log(`${runComposeVectors()} compose vectors passed`)
}
