import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { composeFlowGraph } from "../flowCompose"

interface Vector {
  name: string
  input: Parameters<typeof composeFlowGraph>[0]
  expected: unknown
}

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../lib/flows/fixtures/compose-vectors.json"), "utf8"),
) as Vector[]

const wire = (value: unknown) => JSON.parse(JSON.stringify(value))

export function runFlowComposeVectors(): number {
  for (const vector of vectors) {
    assert.deepEqual(wire(composeFlowGraph(vector.input)), vector.expected, vector.name)
  }
  return vectors.length
}

if (process.argv[1]?.endsWith("flowCompose.test.ts")) {
  console.log(`${runFlowComposeVectors()} flow compose vectors passed`)
}
