import Foundation

enum FlowTraversalError: Error, LocalizedError, Equatable {
    case missingNode(String)
    case missingPathNode(String)
    case missingPathOption(optionId: String, nodeId: String)
    case stepNodeHopLimitExceeded
    case childOptionWithoutProductReference(String)

    var errorDescription: String? {
        switch self {
        case .missingNode(let nodeId):
            return "La arista apunta al nodo inexistente \"\(nodeId)\"."
        case .missingPathNode(let nodeId):
            return "El path contiene el nodo inexistente \"\(nodeId)\"."
        case .missingPathOption(let optionId, let nodeId):
            return "El path contiene la opción inexistente \"\(optionId)\" en \"\(nodeId)\"."
        case .stepNodeHopLimitExceeded:
            return "Se excedió el límite de nodos de paso; el grafo probablemente tiene un ciclo."
        case .childOptionWithoutProductReference(let optionId):
            return "La opción hija \"\(optionId)\" no tiene refProductId."
        }
    }
}

/// A pure evaluator for the graph supplied by the flow endpoint.
enum FlowEngine {
    private static let maximumStepNodeHops = 1_000

    static func nextNode(
        in graph: FlowGraph,
        currentNodeId: String,
        selectedOptionIds: [String],
        context: FlowContext
    ) throws -> String? {
        var nextId = matchingNextId(
            in: graph,
            nodeId: currentNodeId,
            selectedOptionIds: selectedOptionIds,
            context: context
        )
        var hops = 0

        while let nodeId = nextId {
            guard let node = graph.nodes.first(where: { $0.id == nodeId }) else {
                throw FlowTraversalError.missingNode(nodeId)
            }
            if !node.options.isEmpty {
                return node.id
            }
            hops += 1
            if hops > maximumStepNodeHops {
                throw FlowTraversalError.stepNodeHopLimitExceeded
            }
            nextId = matchingNextId(in: graph, nodeId: node.id, selectedOptionIds: [], context: context)
        }
        return nil
    }

    static func canAdvance(node: FlowNode, selectedOptionIds: [String]) -> Bool {
        selectedOptionIds.count >= node.minSelections
            && (node.maxSelections == nil || selectedOptionIds.count <= node.maxSelections!)
    }

    static func computeTotal(in graph: FlowGraph, path: FlowPath, basePrice: Double) throws -> Double {
        let selections = try selectedOptions(in: graph, path: path)
        return basePrice + selections.reduce(0) { total, selection in total + selection.option.effectivePrice }
    }

    static func buildItems(
        in graph: FlowGraph,
        path: FlowPath,
        product: FlowProduct,
        variant: FlowVariant?,
        context: FlowContext
    ) throws -> BuiltFlowItems {
        let selectionsInPath = try selectedOptions(in: graph, path: path)
        let basePrice = variant?.price ?? product.price ?? 0
        let total = basePrice + selectionsInPath.reduce(0) { $0 + $1.option.effectivePrice }
        let parent = BuiltParentItem(
            productId: product.id,
            productName: preparedProductName(
                variant.map { "\(product.name) - \($0.name)" } ?? product.name,
                selections: selectionsInPath
            ),
            unitPrice: total,
            subtotal: total,
            packageLabel: packageLabel(in: graph, selections: selectionsInPath),
            seat: product.seat,
            course: product.course
        )

        var children: [BuiltChildItem] = []
        var builtSelections: [BuiltSelection] = []
        for selection in selectionsInPath {
            let node = selection.node
            let option = selection.option
            var childItemIndex: Int?
            if option.emitsChildItem {
                guard let productId = option.refProductId else {
                    throw FlowTraversalError.childOptionWithoutProductReference(option.id)
                }
                childItemIndex = children.count
                children.append(BuiltChildItem(
                    productId: productId,
                    productName: referencedProductName(option),
                    unitPrice: 0,
                    subtotal: 0,
                    parentItemId: "parent",
                    seat: parent.seat,
                    course: parent.course,
                    isBeverage: option.isBeverage
                ))
            }
            builtSelections.append(BuiltSelection(
                flowId: node.flowId,
                nodeId: node.id,
                optionId: option.id,
                nodeTitle: node.title,
                optionLabel: option.label,
                priceDelta: option.effectivePrice,
                refProductId: option.refProductId,
                refVariantName: option.refVariantName,
                refListPrice: option.refListPrice,
                childItemIndex: childItemIndex,
                sortOrder: builtSelections.count
            ))
        }
        return BuiltFlowItems(parent: parent, children: children, selections: builtSelections)
    }

    static func validateGraph(_ graph: FlowGraph) -> [FlowProblem] {
        var problems: [FlowProblem] = []
        let entries = graph.nodes.filter { $0.isEntry == true }
        if entries.count != 1 {
            problems.append(problem("invalid-entry-count", "El grafo debe tener exactamente un nodo de entrada."))
        }

        for edge in graph.edges {
            if !graph.nodes.contains(where: { $0.id == edge.fromNodeId }) {
                problems.append(problem("missing-edge-source", "La arista sale de un nodo inexistente.", edgeId: edge.id))
            }
            if let target = edge.toNodeId, !graph.nodes.contains(where: { $0.id == target }) {
                problems.append(problem("missing-edge-target", "La arista apunta a un nodo inexistente.", edgeId: edge.id))
            }
        }
        for node in graph.nodes {
            problems.append(contentsOf: validate(node: node, in: graph))
        }

        var cycleVisited = Set<String>()
        for node in graph.nodes {
            if let cycle = findCycle(in: graph, nodeId: node.id, visiting: [], visited: &cycleVisited) {
                problems.append(cycle)
                break
            }
        }

        if let entry = entries.first {
            let reached = reachableNodeIds(in: graph, from: entry.id)
            for node in graph.nodes where !reached.contains(node.id) {
                problems.append(problem("unreachable-node", "El nodo no es alcanzable desde la entrada.", nodeId: node.id))
            }
        }
        return problems
    }

    private static func conditionMatches(_ condition: FlowEdgeCondition, context: FlowContext) -> Bool {
        (condition.variantNameIn == nil || (context.variantName != nil && condition.variantNameIn!.contains(context.variantName!)))
            && (condition.productHasTag == nil || context.flowTags.contains(condition.productHasTag!))
            && (condition.productIdIn == nil || condition.productIdIn!.contains(context.productId))
            && (condition.categoryIdIn == nil || (context.categoryId != nil && condition.categoryIdIn!.contains(context.categoryId!)))
            && (condition.optionSelected == nil || context.pathOptionIds.contains(condition.optionSelected!))
    }

    private static func matchingNextId(
        in graph: FlowGraph,
        nodeId: String,
        selectedOptionIds: [String],
        context: FlowContext
    ) -> String? {
        graph.edges
            .filter { $0.fromNodeId == nodeId }
            .sorted { $0.sortOrder < $1.sortOrder }
            .first {
                ($0.fromOptionId == nil || selectedOptionIds.contains($0.fromOptionId!))
                    && ($0.condition == nil || conditionMatches($0.condition!, context: context))
            }?
            .toNodeId
    }

    private static func selectedOptions(
        in graph: FlowGraph,
        path: FlowPath
    ) throws -> [(node: FlowNode, option: FlowNodeOption)] {
        var result: [(node: FlowNode, option: FlowNodeOption)] = []
        for visit in path {
            guard let node = graph.nodes.first(where: { $0.id == visit.nodeId }) else {
                throw FlowTraversalError.missingPathNode(visit.nodeId)
            }
            for optionId in visit.selectedOptionIds {
                guard let option = node.options.first(where: { $0.id == optionId }) else {
                    throw FlowTraversalError.missingPathOption(optionId: optionId, nodeId: node.id)
                }
                result.append((node, option))
            }
        }
        return result
    }

    private static func referencedProductName(_ option: FlowNodeOption) -> String {
        option.label + (option.refVariantName.map { " - \($0)" } ?? "")
    }

    private static func preparedProductName(
        _ productName: String,
        selections: [(node: FlowNode, option: FlowNodeOption)]
    ) -> String {
        let isPrepared = selections.contains {
            ["preparado", "preparada"].contains($0.option.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        }
        return isPrepared && !productName.localizedCaseInsensitiveContains("(prep)")
            ? "\(productName) (Prep)"
            : productName
    }

    private static func packageLabel(
        in graph: FlowGraph,
        selections: [(node: FlowNode, option: FlowNodeOption)]
    ) -> String? {
        let childFlowIds = Set(selections.filter { $0.option.emitsChildItem }.map { $0.node.flowId })
        guard !childFlowIds.isEmpty else { return nil }
        return graph.flows.first(where: { childFlowIds.contains($0.id) })?.name
    }

    private static func problem(_ code: String, _ message: String, nodeId: String? = nil, edgeId: String? = nil) -> FlowProblem {
        FlowProblem(severity: "error", code: code, nodeId: nodeId, edgeId: edgeId, message: message)
    }

    private static func validate(node: FlowNode, in graph: FlowGraph) -> [FlowProblem] {
        var problems: [FlowProblem] = []
        if let maximum = node.maxSelections, node.minSelections > maximum {
            problems.append(problem("invalid-selection-range", "El mínimo de selecciones no puede ser mayor que el máximo.", nodeId: node.id))
        }
        if node.minSelections > node.options.count {
            problems.append(problem("minimum-exceeds-options", "El mínimo de selecciones supera el número de opciones del nodo.", nodeId: node.id))
        }
        if node.options.isEmpty && !graph.edges.contains(where: { $0.fromNodeId == node.id }) {
            problems.append(problem("step-node-without-exit", "El nodo de paso no tiene una arista de salida.", nodeId: node.id))
        }
        if node.selectMode == "single" && !node.includeNoneOption && node.minSelections >= 1 {
            let ownEdges = graph.edges.filter { $0.fromNodeId == node.id }
            let hasDefault = ownEdges.contains { $0.fromOptionId == nil }
            if !hasDefault {
                for option in node.options where !ownEdges.contains(where: { $0.fromOptionId == option.id }) {
                    problems.append(problem("option-without-edge", "Cada opción obligatoria debe tener una arista propia o existir una arista por defecto.", nodeId: node.id))
                }
            }
        }
        for option in node.options {
            if option.source == "product" && option.refProductId == nil {
                problems.append(problem("missing-product-reference", "La opción de producto no tiene producto de referencia.", nodeId: node.id))
            }
            if option.source == "category" && option.refCategoryId == nil {
                problems.append(problem("missing-category-reference", "La opción de categoría no tiene categoría de referencia.", nodeId: node.id))
            }
            if option.refProductActive == false {
                problems.append(problem("inactive-product-reference", "La opción referencia un producto inexistente o inactivo.", nodeId: node.id))
            }
            if option.refCategoryActive == false {
                problems.append(problem("inactive-category-reference", "La opción referencia una categoría inexistente o inactiva.", nodeId: node.id))
            }
        }
        return problems
    }

    private static func findCycle(
        in graph: FlowGraph,
        nodeId: String,
        visiting: Set<String>,
        visited: inout Set<String>
    ) -> FlowProblem? {
        if visiting.contains(nodeId) {
            return problem("cycle", "El grafo contiene un ciclo.", nodeId: nodeId)
        }
        if visited.contains(nodeId) { return nil }
        var nextVisiting = visiting
        nextVisiting.insert(nodeId)
        for edge in graph.edges where edge.fromNodeId == nodeId {
            guard let target = edge.toNodeId else { continue }
            if let cycle = findCycle(in: graph, nodeId: target, visiting: nextVisiting, visited: &visited) {
                return edge.id.map { FlowProblem(severity: cycle.severity, code: cycle.code, nodeId: cycle.nodeId, edgeId: $0, message: cycle.message) } ?? cycle
            }
        }
        visited.insert(nodeId)
        return nil
    }

    private static func reachableNodeIds(in graph: FlowGraph, from entryNodeId: String) -> Set<String> {
        var reached = Set<String>()
        var pending = [entryNodeId]
        while let id = pending.popLast() {
            if reached.contains(id) { continue }
            reached.insert(id)
            pending.append(contentsOf: graph.edges.compactMap { edge in
                edge.fromNodeId == id ? edge.toNodeId : nil
            })
        }
        return reached
    }
}
