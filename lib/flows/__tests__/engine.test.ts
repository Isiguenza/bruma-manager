import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { buildItems, canAdvance, computeTotal, nextNode } from "../engine"
import type { FlowGraph } from "../types"
import { validateGraph } from "../validate"

interface Vector {
  name: string
  graph: FlowGraph
  input: Record<string, unknown>
  expected: Record<string, unknown>
}

const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/engine-vectors.json", import.meta.url), "utf8"),
) as Vector[]

export function runEngineVectors(): number {
  for (const vector of vectors) {
    const { graph, input, expected } = vector
    switch (input.operation) {
      case "nextNode":
        assert.equal(
          nextNode(graph, input.currentNodeId as string, input.selectedOptionIds as string[], input.ctx as never),
          expected.nextNodeId,
          vector.name,
        )
        break
      case "canAdvance": {
        const node = graph.nodes.find((candidate) => candidate.id === input.nodeId)
        assert.ok(node, `${vector.name}: nodo no encontrado`)
        assert.equal(canAdvance(node, input.selectedOptionIds as string[]), expected.canAdvance, vector.name)
        break
      }
      case "computeTotal":
        assert.equal(computeTotal(graph, input.path as never, input.basePrice as number), expected.total, vector.name)
        break
      case "resolvedOptions": {
        const node = graph.nodes.find((candidate) => candidate.id === input.nodeId)
        assert.ok(node, `${vector.name}: nodo no encontrado`)
        assert.deepEqual(node.options.map((option) => option.id), expected.optionIds, vector.name)
        assert.deepEqual(node.options.map((option) => option.effectivePrice), expected.effectivePrices, vector.name)
        break
      }
      case "validate": {
        const codes = validateGraph(graph)
          .filter((problem) => problem.severity === "error")
          .map((problem) => problem.code)
        for (const code of expected.errorCodes as string[]) assert.ok(codes.includes(code), `${vector.name}: falta ${code}`)
        break
      }
      case "buildItems":
        assert.deepEqual(
          buildItems(graph, input.path as never, input.product as never, input.variant as never, input.ctx as never),
          expected.builtItems,
          vector.name,
        )
        break
      default:
        assert.fail(`${vector.name}: operación de vector desconocida`)
    }
  }
  return vectors.length
}

if (process.argv[1]?.endsWith("engine.test.ts")) {
  console.log(`${runEngineVectors()} engine vectors passed`)
}
