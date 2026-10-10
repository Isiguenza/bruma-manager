"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowCounterClockwise, CaretLeft, Check } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { buildItems, canAdvance, nextNode } from "@/lib/flows/engine"
import type { FlowContext, FlowGraph, FlowPath } from "@/lib/flows/types"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/lib/types"
import { variantsOf, type Variant } from "./model"

interface Props {
  products: Product[]
  categories: Category[]
  /** Platillos this flow applies to, offered first. */
  suggestedProductIds: string[]
  dirty: boolean
}

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
const money = (value: number) => `$${value.toFixed(2)}`

/**
 * Walks the graph the SERVER resolves for a real platillo, with the same engine
 * the POS mirrors. It shows what a mesero would see, not what the editor believes:
 * which flows got chained, in what order, and at what price.
 */
export function TestPanel({ products, categories, suggestedProductIds, dirty }: Props) {
  const [productId, setProductId] = useState("")
  const [variant, setVariant] = useState<Variant | null>(null)
  const [graph, setGraph] = useState<FlowGraph | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "none" | "error">("idle")
  const [path, setPath] = useState<FlowPath>([])
  const [done, setDone] = useState(false)

  const product = products.find((candidate) => candidate.id === productId)
  const variants = useMemo(() => variantsOf(product), [product])
  const needsVariant = variants.length > 0 && variant === null
  const active = products.filter((candidate) => candidate.active).sort((a, b) => a.name.localeCompare(b.name))
  const suggested = active.filter((candidate) => suggestedProductIds.includes(candidate.id))

  const context = (visits: FlowPath): FlowContext => ({
    productId,
    categoryId: product?.categoryId ?? null,
    subcategoryId: product?.subcategoryId ?? null,
    variantName: variant?.name ?? null,
    flowTags: ((product as unknown as { flowTags?: string[] })?.flowTags ?? []) as string[],
    pathOptionIds: visits.flatMap((visit) => visit.selectedOptionIds),
  })

  const start = (flow: FlowGraph) => {
    const entry = flow.nodes.find((node) => node.id === flow.entryNodeId)
    const first = entry && entry.options.length > 0 ? entry.id : nextNode(flow, flow.entryNodeId, [], context([]))
    setPath(first ? [{ nodeId: first, selectedOptionIds: [] }] : [])
    setDone(first === null)
  }

  useEffect(() => {
    setGraph(null)
    setPath([])
    setDone(false)
    if (!productId) return setStatus("idle")
    let alive = true
    setStatus("loading")
    fetch(`/api/products/${productId}/flow?format=graph`, { cache: "no-store" })
      .then(async (response) => {
        if (!alive) return
        if (response.status === 404) return setStatus("none")
        if (!response.ok) throw new Error()
        setGraph(await response.json())
        setStatus("idle")
      })
      .catch(() => alive && setStatus("error"))
    return () => {
      alive = false
    }
  }, [productId])

  // The variant is part of the context the rules read, so the walk restarts with it.
  useEffect(() => {
    if (graph && !needsVariant) start(graph)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, variant, needsVariant])

  const visit = path[path.length - 1]
  const node = graph && visit ? graph.nodes.find((candidate) => candidate.id === visit.nodeId) : undefined

  const advance = (selectedOptionIds: string[]) => {
    if (!graph || !node) return
    const visits = [...path.slice(0, -1), { nodeId: node.id, selectedOptionIds }]
    try {
      const next = nextNode(graph, node.id, selectedOptionIds, context(visits))
      setPath(next ? [...visits, { nodeId: next, selectedOptionIds: [] }] : visits)
      setDone(next === null)
    } catch {
      setStatus("error")
    }
  }

  const pick = (optionId: string) => {
    if (!node) return
    if (node.selectMode === "single") return advance([optionId])
    const selected = visit.selectedOptionIds.includes(optionId) ? visit.selectedOptionIds.filter((id) => id !== optionId) : [...visit.selectedOptionIds, optionId]
    setPath([...path.slice(0, -1), { nodeId: node.id, selectedOptionIds: selected }])
  }

  const built = useMemo(() => {
    if (!graph || !product || !done) return null
    try {
      return buildItems(graph, path, { id: product.id, name: product.name, price: Number(product.price) || 0 }, variant, context(path))
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, product, done, path, variant])

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-3 border-b px-5 pb-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.015em]">Probar como platillo</h2>
          <p className="text-sm text-muted-foreground">Lo que resuelve el servidor para un platillo real: lo mismo que recibe el iPad.</p>
        </div>
        {dirty && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Tienes cambios sin guardar. La prueba usa lo último que guardaste.</p>}
        <select
          className={field}
          value={productId}
          onChange={(event) => {
            setVariant(null)
            setProductId(event.target.value)
          }}
        >
          <option value="">Elige un platillo…</option>
          {suggested.length > 0 && (
            <optgroup label="Donde aplica este flujo">
              {suggested.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </optgroup>
          )}
          {categories.map((category) => (
            <optgroup key={category.id} label={category.name}>
              {active
                .filter((candidate) => candidate.categoryId === category.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {variants.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {variants.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                aria-pressed={variant?.name === candidate.name}
                onClick={() => setVariant(candidate)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-transform duration-100 active:scale-[0.97]",
                  variant?.name === candidate.name ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {candidate.name} · {money(candidate.price)}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status === "loading" && <p className="text-sm text-muted-foreground">Resolviendo…</p>}
        {status === "error" && <p className="text-sm text-destructive">No se pudo resolver el flujo de este platillo.</p>}
        {status === "none" && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">A este platillo no le sale ningún flujo: el POS lo manda directo a comentarios.</p>}
        {graph && needsVariant && <p className="text-sm text-muted-foreground">Elige la variante: en el POS se elige antes de arrancar el flujo.</p>}

        {graph && !needsVariant && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Flujos encadenados: <span className="font-medium text-foreground">{graph.flows.map((flow) => flow.name).join(" → ")}</span>
            </p>

            {!done && node && (
              <div key={node.id} className="flow-screen-in space-y-3 rounded-2xl border bg-card p-4">
                <div>
                  <h3 className="text-base font-semibold">{node.title}</h3>
                  {node.subtitle && <p className="text-sm text-muted-foreground">{node.subtitle}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {node.includeNoneOption && node.selectMode === "single" && (
                    <button type="button" onClick={() => advance([])} className="rounded-xl border border-dashed p-3 text-left text-sm text-muted-foreground transition-transform duration-100 active:scale-[0.97]">
                      {node.noneLabel ?? `Sin ${node.title.toLowerCase()}`}
                    </button>
                  )}
                  {node.options.map((option) => {
                    const selected = visit.selectedOptionIds.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => pick(option.id)}
                        className={cn("rounded-xl border p-3 text-left text-sm transition-transform duration-100 active:scale-[0.97]", selected ? "border-primary bg-primary/10" : "hover:bg-muted/40")}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{option.label}</span>
                          {selected && <Check className="size-4 text-primary" weight="bold" />}
                        </span>
                        {option.effectivePrice !== 0 && <span className="text-xs text-primary">+{money(option.effectivePrice)}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="ghost" disabled={path.length <= 1} onClick={() => setPath(path.slice(0, -1))}>
                    <CaretLeft className="size-4" /> Atrás
                  </Button>
                  {node.selectMode === "multi" && (
                    <Button size="sm" disabled={!canAdvance(node, visit.selectedOptionIds)} onClick={() => advance(visit.selectedOptionIds)}>
                      Continuar
                    </Button>
                  )}
                </div>
              </div>
            )}

            {done && (
              <div className="flow-screen-in space-y-3 rounded-2xl border bg-card p-4">
                <h3 className="text-base font-semibold">Así queda en la comanda</h3>
                {built ? (
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex justify-between gap-3 font-medium">
                      <span>{built.parent.productName}</span>
                      <span className="tabular-nums">{money(built.parent.unitPrice)}</span>
                    </li>
                    {built.selections
                      .filter((selection) => selection.childItemIndex === null && selection.ownerChildItemIndex === null)
                      .map((selection) => (
                        <li key={selection.sortOrder} className="flex justify-between gap-3 pl-3 text-muted-foreground">
                          <span>
                            {selection.nodeTitle}: {selection.optionLabel}
                          </span>
                          {selection.priceDelta !== 0 && <span className="tabular-nums">+{money(selection.priceDelta)}</span>}
                        </li>
                      ))}
                    {built.children.map((child, index) => (
                      <li key={index} className="pl-3">
                        <span className="text-muted-foreground">↳ </span>
                        {child.productName}
                        {built.selections
                          .filter((selection) => selection.ownerChildItemIndex === index && selection.refVariantName === null)
                          .map((selection) => (
                            <span key={selection.sortOrder} className="block pl-5 text-xs text-muted-foreground">
                              {selection.optionLabel}
                              {selection.priceDelta !== 0 && ` +${money(selection.priceDelta)}`}
                            </span>
                          ))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">El platillo se agrega sin cambios.</p>
                )}
                <Button size="sm" variant="outline" onClick={() => graph && start(graph)}>
                  <ArrowCounterClockwise className="size-4" /> Probar otra vez
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
