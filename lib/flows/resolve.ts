import { asc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories, flowDefinitions, flowEdges, flowNodeOptions, flowNodes, flowOptionPriceOverrides, flowTargets, products } from "@/lib/db/schema"
import { composeFlowGraph } from "./compose"

/** Database adapter for the pure graph composer. */
export async function resolveFlowGraph(productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  if (!product) return null
  const [definitions, targets, allProducts, allCategories] = await Promise.all([db.select().from(flowDefinitions), db.select().from(flowTargets), db.select().from(products), db.select().from(categories)])
  const ids = definitions.map((flow) => flow.id)
  const nodes = ids.length ? await db.select().from(flowNodes).where(inArray(flowNodes.flowId, ids)).orderBy(asc(flowNodes.sortOrder)) : []
  const nodeIds = nodes.map((node) => node.id)
  const options = nodeIds.length ? await db.select().from(flowNodeOptions).where(inArray(flowNodeOptions.nodeId, nodeIds)).orderBy(asc(flowNodeOptions.sortOrder)) : []
  const optionIds = options.map((option) => option.id)
  const [overrides, edges] = await Promise.all([optionIds.length ? db.select().from(flowOptionPriceOverrides).where(inArray(flowOptionPriceOverrides.optionId, optionIds)) : Promise.resolve([]), ids.length ? db.select().from(flowEdges).where(inArray(flowEdges.flowId, ids)).orderBy(asc(flowEdges.sortOrder)) : Promise.resolve([])])
  return composeFlowGraph({ product, definitions, targets, nodes, options, overrides, edges, products: allProducts, categories: allCategories })
}
