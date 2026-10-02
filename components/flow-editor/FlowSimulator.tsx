"use client"

import { useMemo, useState } from "react"
import { buildItems, canAdvance, computeTotal, nextNode, type FlowTraversalError } from "@/lib/flows/engine"
import type { FlowContext, FlowGraph, FlowPath } from "@/lib/flows/types"
import type { Category, Product } from "@/lib/types"
import type { EditorOption, FlowDocument } from "./types"

type Variant = { name: string; price: number }
const variants = (product: Product): Variant[] => { try { return product.variants ? JSON.parse(product.variants).map((item: { name: string; price: string }) => ({ name: item.name, price: Number(item.price) })) : [] } catch { return [] } }

function resolvedPrice(option: EditorOption, referenced: Product | undefined, base: Product) {
  if (option.priceMode === "free") return 0
  if (option.priceMode === "product_price") return Number(referenced?.price ?? 0)
  const override = option.priceOverrides.find((item) => item.productId === base.id || item.subcategoryId === base.subcategoryId || item.categoryId === base.categoryId)
  return Number(override?.priceDelta ?? option.priceDelta) || 0
}

function materialize(document: FlowDocument, products: Product[], base: Product): FlowGraph {
  const explicitProductIds = new Set(document.nodes.flatMap((node) => node.options.filter((option) => option.source === "product" && option.refProductId).map((option) => option.refProductId!)))
  const nodes = document.nodes.map((node) => ({ ...node, flowId: document.definition.id, options: node.options.flatMap((option) => {
    const references = option.source === "category" ? products.filter((product) => product.active && product.categoryId === option.refCategoryId && !explicitProductIds.has(product.id)) : [option.refProductId ? products.find((product) => product.id === option.refProductId) : undefined]
    return references.map((reference, index) => ({ id: option.source === "category" ? `${option.id}:${reference?.id ?? index}` : option.id, label: option.label || reference?.name || "Opción", source: option.source, priceMode: option.priceMode, effectivePrice: resolvedPrice(option, reference, base), refProductId: reference?.id ?? option.refProductId, refCategoryId: option.refCategoryId, refVariantName: option.refVariantName, variantChoices: option.allowVariantChoice && reference ? variants(reference) : null, emitsChildItem: option.emitsChildItem, isBeverage: Boolean(reference?.category?.isBeverage), refListPrice: reference ? Number(reference.price) : null }))
  }) }))
  return { productId: base.id, format: "graph", source: "editor-preview", flows: [{ id: document.definition.id, name: document.definition.name, scopeKind: document.definition.scopeKind, priority: document.definition.priority }], entryNodeId: nodes.find((node) => node.isEntry)?.id ?? "", nodes, edges: document.edges }
}

export function FlowSimulator({ document, products, categories }: { document: FlowDocument; products: Product[]; categories: Category[] }) {
  const [productId, setProductId] = useState("")
  const [variantName, setVariantName] = useState("")
  const [path, setPath] = useState<FlowPath>([])
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState("")
  const product = products.find((item) => item.id === productId)
  const graph = useMemo(() => product ? materialize(document, products, product) : null, [document, products, product])
  const selectedVariant = product ? variants(product).find((item) => item.name === variantName) ?? null : null
  const ctx = (pathOptionIds: string[]): FlowContext => ({ productId, categoryId: product?.categoryId ?? null, subcategoryId: product?.subcategoryId ?? null, variantName: selectedVariant?.name ?? null, flowTags: Array.isArray((product as Product & { flowTags?: unknown }).flowTags) ? (product as Product & { flowTags: string[] }).flowTags : [], pathOptionIds })
  const node = graph?.nodes.find((item) => item.id === nodeId) ?? null
  const start = () => {
    if (!graph || !product) return
    try { setPath([]); setSelected([]); setError(""); setNodeId(nextNode(graph, graph.entryNodeId, [], ctx([]))) } catch (cause) { setError((cause as FlowTraversalError).message) }
  }
  const advance = () => {
    if (!graph || !node || !canAdvance(node, selected)) return
    const nextPath = [...path, { nodeId: node.id, selectedOptionIds: selected }]
    const optionIds = nextPath.flatMap((visit) => visit.selectedOptionIds)
    try { setPath(nextPath); setSelected([]); setNodeId(nextNode(graph, node.id, selected, ctx(optionIds))) } catch (cause) { setError((cause as FlowTraversalError).message) }
  }
  const total = graph && product ? computeTotal(graph, path, selectedVariant?.price ?? Number(product.price)) : 0
  const result = graph && product && nodeId === null ? buildItems(graph, path, { id: product.id, name: product.name, price: Number(product.price) }, selectedVariant, ctx(path.flatMap((visit) => visit.selectedOptionIds))) : null
  return <section className="space-y-3 rounded-xl border bg-card p-4"><div><h2 className="font-semibold">Simulador</h2><p className="text-xs text-muted-foreground">Usa el mismo motor del POS; prueba el camino antes de publicarlo.</p></div><div className="grid gap-2 sm:grid-cols-3"><select className="rounded-md border bg-background p-2 text-sm" value={productId} onChange={(event) => { setProductId(event.target.value); setVariantName(""); setNodeId(null); setPath([]) }}><option value="">Producto base…</option>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="rounded-md border bg-background p-2 text-sm" value={variantName} onChange={(event) => setVariantName(event.target.value)} disabled={!product || variants(product).length === 0}><option value="">{product && variants(product).length ? "Variante…" : "Sin variante"}</option>{product && variants(product).map((item) => <option key={item.name} value={item.name}>{item.name} · ${item.price}</option>)}</select><button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!product || (variants(product).length > 0 && !variantName)} onClick={start}>Iniciar recorrido</button></div>{error && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}{node && <div className="space-y-3 rounded-lg bg-muted/40 p-3"><div className="flex items-center justify-between"><div><p className="font-medium">{node.title}</p>{node.subtitle && <p className="text-sm text-muted-foreground">{node.subtitle}</p>}</div><span className="font-semibold">${total.toFixed(2)}</span></div><div className="grid gap-2 sm:grid-cols-2">{node.options.map((option) => { const on = selected.includes(option.id); return <button key={option.id} onClick={() => setSelected(node.selectMode === "single" ? [option.id] : on ? selected.filter((id) => id !== option.id) : [...selected, option.id])} className={`rounded-md border p-2 text-left text-sm ${on ? "border-primary bg-primary/10" : "bg-background"}`}><span>{option.label}</span><span className="float-right text-muted-foreground">{option.effectivePrice ? `+$${option.effectivePrice}` : "Incluido"}</span></button> })}</div><button disabled={!canAdvance(node, selected)} onClick={advance} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Continuar</button></div>}{result && <div className="rounded-lg bg-emerald-500/10 p-3 text-sm"><p className="font-semibold">{result.parent.productName} · ${result.parent.unitPrice.toFixed(2)}</p><p className="text-xs text-muted-foreground">{result.children.length} item(s) hijo(s): {result.children.map((child) => child.productName).join(", ") || "ninguno"}</p></div>}</section>
}
