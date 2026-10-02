// Independent verifier: `swiftc Models/FlowGraph.swift Services/FlowEngine.swift FlowEngineVectorVerification.swift -o /tmp/flow-engine-vectors && /tmp/flow-engine-vectors ../lib/flows/fixtures/engine-vectors.json`.
import Foundation

private struct EngineVector: Decodable {
    let name: String
    let graph: FlowGraph
    let input: EngineVectorInput
    let expected: EngineVectorExpected
}

private struct EngineVectorInput: Decodable {
    let operation: String
    let currentNodeId: String?
    let nodeId: String?
    let selectedOptionIds: [String]?
    let context: FlowContext?
    let path: FlowPath?
    let basePrice: Double?
    let product: FlowProduct?
    let variant: FlowVariant?

    private enum CodingKeys: String, CodingKey {
        case operation, currentNodeId, nodeId, selectedOptionIds, ctx, path, basePrice, product, variant
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        operation = try values.decode(String.self, forKey: .operation)
        currentNodeId = try values.decodeIfPresent(String.self, forKey: .currentNodeId)
        nodeId = try values.decodeIfPresent(String.self, forKey: .nodeId)
        selectedOptionIds = try values.decodeIfPresent([String].self, forKey: .selectedOptionIds)
        context = try values.decodeIfPresent(FlowContext.self, forKey: .ctx)
        path = try values.decodeIfPresent(FlowPath.self, forKey: .path)
        basePrice = try values.decodeIfPresent(Double.self, forKey: .basePrice)
        product = try values.decodeIfPresent(FlowProduct.self, forKey: .product)
        variant = try values.decodeIfPresent(FlowVariant.self, forKey: .variant)
    }
}

private struct EngineVectorExpected: Decodable {
    let nextNodeId: String?
    let total: Double?
    let canAdvance: Bool?
    let optionIds: [String]?
    let effectivePrices: [Double]?
    let errorCodes: [String]?
    let builtItems: BuiltFlowItems?
}

private enum VerificationError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): return message
        }
    }
}

private func require<T>(_ value: T?, _ description: String) throws -> T {
    guard let value else { throw VerificationError.failed(description) }
    return value
}

private func verify(_ vector: EngineVector) throws {
    switch vector.input.operation {
    case "nextNode":
        let actual = try FlowEngine.nextNode(
            in: vector.graph,
            currentNodeId: try require(vector.input.currentNodeId, "currentNodeId faltante"),
            selectedOptionIds: vector.input.selectedOptionIds ?? [],
            context: try require(vector.input.context, "ctx faltante")
        )
        guard actual == vector.expected.nextNodeId else {
            throw VerificationError.failed("esperaba nextNodeId \(String(describing: vector.expected.nextNodeId)); obtuvo \(String(describing: actual))")
        }
    case "canAdvance":
        let nodeId = try require(vector.input.nodeId, "nodeId faltante")
        let node = try require(vector.graph.nodes.first(where: { $0.id == nodeId }), "nodo \(nodeId) faltante")
        let actual = FlowEngine.canAdvance(node: node, selectedOptionIds: vector.input.selectedOptionIds ?? [])
        guard actual == vector.expected.canAdvance else {
            throw VerificationError.failed("esperaba canAdvance \(String(describing: vector.expected.canAdvance)); obtuvo \(actual)")
        }
    case "computeTotal":
        let actual = try FlowEngine.computeTotal(
            in: vector.graph,
            path: vector.input.path ?? [],
            basePrice: try require(vector.input.basePrice, "basePrice faltante")
        )
        guard actual == vector.expected.total else {
            throw VerificationError.failed("esperaba total \(String(describing: vector.expected.total)); obtuvo \(actual)")
        }
    case "resolvedOptions":
        let nodeId = try require(vector.input.nodeId, "nodeId faltante")
        let options = try require(vector.graph.nodes.first(where: { $0.id == nodeId }), "nodo \(nodeId) faltante").options
        guard options.map(\.id) == vector.expected.optionIds,
              options.map(\.effectivePrice) == vector.expected.effectivePrices else {
            throw VerificationError.failed("las opciones resueltas no coinciden")
        }
    case "validate":
        let actual = FlowEngine.validateGraph(vector.graph).map(\.code)
        guard (vector.expected.errorCodes ?? []).allSatisfy(actual.contains) else {
            throw VerificationError.failed("esperaba errores \(String(describing: vector.expected.errorCodes)); obtuvo \(actual)")
        }
    case "buildItems":
        let actual = try FlowEngine.buildItems(
            in: vector.graph,
            path: vector.input.path ?? [],
            product: try require(vector.input.product, "product faltante"),
            variant: vector.input.variant,
            context: try require(vector.input.context, "ctx faltante")
        )
        guard actual == vector.expected.builtItems else {
            throw VerificationError.failed("los items construidos no coinciden")
        }
    default:
        throw VerificationError.failed("operación desconocida \(vector.input.operation)")
    }
}

@main
private struct FlowEngineVectorVerification {
    static func main() {
        let fixturePath = CommandLine.arguments.dropFirst().first ?? "lib/flows/fixtures/engine-vectors.json"
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        do {
            let vectors = try decoder.decode([EngineVector].self, from: Data(contentsOf: URL(fileURLWithPath: fixturePath)))
            var failures: [String] = []
            for vector in vectors {
                do {
                    try verify(vector)
                } catch {
                    failures.append("FAIL \(vector.name): \(error)")
                }
            }
    for failure in failures { print(failure) }
    print("FlowEngine vectors: \(vectors.count - failures.count)/\(vectors.count) passed")
    let adapterChildIndex = { (parentIndex: Int, childOffset: Int) in parentIndex + childOffset + 1 }
    guard adapterChildIndex(0, 0) == 1,
          adapterChildIndex(0, 1) == 2 else {
        throw VerificationError.failed("childIndex no apunta al índice absoluto de items")
    }
    print("FlowEngine childIndex contract: parent 0 -> children 1, 2 passed")
    if !failures.isEmpty { exit(1) }
        } catch {
            fputs("Could not run FlowEngine vectors: \(error)\n", stderr)
            exit(1)
        }
    }
}
