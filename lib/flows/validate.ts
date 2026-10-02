import type { FlowGraph, FlowNode, Problem } from "./types"

function error(code: string, message: string, nodeId?: string, edgeId?: string): Problem {
  return { severity: "error", code, nodeId, edgeId, message }
}

function hasCycle(graph: FlowGraph, nodeId: string, visiting: Set<string>, visited: Set<string>): Problem | null {
  if (visiting.has(nodeId)) return error("cycle", "El grafo contiene un ciclo.", nodeId)
  if (visited.has(nodeId)) return null
  visiting.add(nodeId)
  for (const edge of graph.edges.filter((candidate) => candidate.fromNodeId === nodeId)) {
    if (edge.toNodeId === null) continue
    const problem = hasCycle(graph, edge.toNodeId, visiting, visited)
    if (problem !== null) return edge.id === undefined ? problem : { ...problem, edgeId: edge.id }
  }
  visiting.delete(nodeId)
  visited.add(nodeId)
  return null
}

function reachableIds(graph: FlowGraph, entryNodeId: string): Set<string> {
  const reached = new Set<string>()
  const pending = [entryNodeId]
  while (pending.length > 0) {
    const id = pending.pop()!
    if (reached.has(id)) continue
    reached.add(id)
    for (const edge of graph.edges) {
      if (edge.fromNodeId === id && edge.toNodeId !== null) pending.push(edge.toNodeId)
    }
  }
  return reached
}

function validateNode(graph: FlowGraph, node: FlowNode): Problem[] {
  const problems: Problem[] = []
  if (node.maxSelections !== null && node.minSelections > node.maxSelections) {
    problems.push(error("invalid-selection-range", "El mínimo de selecciones no puede ser mayor que el máximo.", node.id))
  }
  if (node.minSelections > node.options.length) {
    problems.push(error("minimum-exceeds-options", "El mínimo de selecciones supera el número de opciones del nodo.", node.id))
  }
  if (node.options.length === 0 && !graph.edges.some((edge) => edge.fromNodeId === node.id)) {
    problems.push(error("step-node-without-exit", "El nodo de paso no tiene una arista de salida.", node.id))
  }
  if (node.selectMode === "single" && !node.includeNoneOption && node.minSelections >= 1) {
    const ownEdges = graph.edges.filter((edge) => edge.fromNodeId === node.id)
    const hasDefault = ownEdges.some((edge) => edge.fromOptionId === null)
    for (const option of node.options) {
      if (!hasDefault && !ownEdges.some((edge) => edge.fromOptionId === option.id)) {
        problems.push(error("option-without-edge", "Cada opción obligatoria debe tener una arista propia o existir una arista por defecto.", node.id))
      }
    }
  }
  for (const option of node.options) {
    if (option.source === "product" && option.refProductId === null) {
      problems.push(error("missing-product-reference", "La opción de producto no tiene producto de referencia.", node.id))
    }
    if (option.source === "category" && option.refCategoryId == null) {
      problems.push(error("missing-category-reference", "La opción de categoría no tiene categoría de referencia.", node.id))
    }
    if (option.refProductActive === false) {
      problems.push(error("inactive-product-reference", "La opción referencia un producto inexistente o inactivo.", node.id))
    }
    if (option.refCategoryActive === false) {
      problems.push(error("inactive-category-reference", "La opción referencia una categoría inexistente o inactiva.", node.id))
    }
  }
  return problems
}

export function validateGraph(graph: FlowGraph): Problem[] {
  const problems: Problem[] = []
  const entries = graph.nodes.filter((node) => node.isEntry)
  if (entries.length !== 1) {
    problems.push(error("invalid-entry-count", "El grafo debe tener exactamente un nodo de entrada."))
  }
  for (const edge of graph.edges) {
    if (!graph.nodes.some((node) => node.id === edge.fromNodeId)) {
      problems.push(error("missing-edge-source", "La arista sale de un nodo inexistente.", undefined, edge.id))
    }
    if (edge.toNodeId !== null && !graph.nodes.some((node) => node.id === edge.toNodeId)) {
      problems.push(error("missing-edge-target", "La arista apunta a un nodo inexistente.", undefined, edge.id))
    }
  }
  for (const node of graph.nodes) problems.push(...validateNode(graph, node))
  const cycleVisited = new Set<string>()
  for (const node of graph.nodes) {
    const cycle = hasCycle(graph, node.id, new Set(), cycleVisited)
    if (cycle !== null) {
      problems.push(cycle)
      break
    }
  }
  if (entries.length === 1) {
    const reached = reachableIds(graph, entries[0].id)
    for (const node of graph.nodes) {
      if (!reached.has(node.id)) {
        problems.push(error("unreachable-node", "El nodo no es alcanzable desde la entrada.", node.id))
      }
    }
  }
  return problems
}
