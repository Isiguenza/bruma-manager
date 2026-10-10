"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CaretLeft, Play, Warning } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { validateGraph } from "@/lib/flows/validate"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/lib/types"
import { AppliesPanel } from "./AppliesPanel"
import { BranchTree, type Selection } from "./BranchTree"
import { addStepAfter, buildTree, flowsForProduct, moveStepUp, removeNode, trunkIds, updateOption, variantsOf, type TreeContext } from "./model"
import { StepWizard } from "./StepWizard"
import { TestPanel } from "./TestPanel"
import { normalizeDocument, toValidationGraph, type EditorOption, type FlowDocument, type FlowListItem } from "./types"

const emptyDocument = (id: string): FlowDocument => ({
  definition: { id, name: "Nuevo flujo", description: null, scopeKind: "global", priority: 0, active: true, parentFlowId: null },
  targets: [],
  nodes: [],
  edges: [],
  subflows: [],
})

const snapshot = (document: FlowDocument) => JSON.stringify([document.definition, document.nodes, document.edges, document.targets])

/**
 * Left: the flow drawn as branches (read-only, it is the map). Right: one thing at
 * a time, screen by screen. Raw edges and ids never surface; `model.ts` translates
 * "what comes next" into them.
 */
export function FlowEditor({ flowId, onBack }: { flowId: string; onBack?: () => void }) {
  const router = useRouter()
  const [document, setDocument] = useState<FlowDocument>(() => emptyDocument(flowId))
  const [saved, setSaved] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [flows, setFlows] = useState<FlowListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void Promise.all([fetch(`/api/flows/${flowId}`), fetch("/api/products"), fetch("/api/categories"), fetch("/api/flows")])
      .then(async ([flow, productRows, categoryRows, flowRows]) => {
        if (!flow.ok) throw new Error("No se pudo cargar el flujo")
        const loaded = normalizeDocument(await flow.json())
        if (!alive) return
        setDocument(loaded)
        setSaved(snapshot(loaded))
        setSelection(loaded.definition.parentFlowId || loaded.targets.length > 0 || loaded.nodes.some((node) => node.options.length > 0) ? null : { kind: "applies" })
        if (productRows.ok) setProducts(await productRows.json())
        if (categoryRows.ok) setCategories(await categoryRows.json())
        if (flowRows.ok) setFlows(await flowRows.json())
      })
      .catch((error) => toast.error(error.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [flowId])

  const dirty = saved !== "" && snapshot(document) !== saved
  const isSubflow = document.definition.parentFlowId !== null
  const parent = flows.find((flow) => flow.id === document.definition.parentFlowId)

  const evidence = useMemo(
    () => ({ products: new Map(products.map((product) => [product.id, product.active])), categories: new Map(categories.map((category) => [category.id, category.active])) }),
    [products, categories],
  )
  const problems = useMemo(() => validateGraph(toValidationGraph(document, evidence)).filter((problem) => problem.severity === "error"), [document, evidence])
  const invalidNodeIds = useMemo(() => new Set(problems.flatMap((problem) => (problem.nodeId ? [problem.nodeId] : []))), [problems])

  const context: TreeContext = useMemo(() => {
    const categoryName = (id: string | null) => categories.find((category) => category.id === id)?.name ?? "…"
    const inheritedFlowNames = (option: EditorOption) => {
      if (!option.emitsChildItem || option.source === "manual") return []
      const referenced = products.filter(
        (product) => product.active && (option.source === "category" ? product.categoryId === option.refCategoryId && !option.hiddenRefs.includes(product.id) && !option.subflowHiddenRefs.includes(product.id) : product.id === option.refProductId),
      )
      return [...new Set(referenced.flatMap((product) => flowsForProduct(flows, product, flowId).map((flow) => flow.name)))]
    }
    return { products, categoryName, inheritedFlowNames }
  }, [products, categories, flows, flowId])

  const tree = useMemo(() => buildTree(document, context), [document, context])

  const targetProducts = useMemo(() => {
    const includes = document.targets.filter((target) => target.mode === "include")
    const off = new Set(document.targets.filter((target) => target.mode === "exclude" && target.productId && !target.variantName).map((target) => target.productId))
    return products.filter(
      (product) =>
        product.active &&
        !off.has(product.id) &&
        includes.some((target) => target.productId === product.id || (target.categoryId !== null && target.categoryId === product.categoryId) || (target.subcategoryId !== null && target.subcategoryId === (product.subcategoryId ?? null))),
    )
  }, [document.targets, products])
  const targetVariantNames = useMemo(() => [...new Set(targetProducts.flatMap((product) => variantsOf(product).map((variant) => variant.name)))], [targetProducts])

  const appliesSummary = useMemo(() => {
    const names = document.targets.filter((target) => target.mode === "include").map((target) => target.targetName ?? categories.find((category) => category.id === target.categoryId)?.name ?? products.find((product) => product.id === target.productId)?.name ?? "…")
    const exceptions = document.targets.filter((target) => target.mode === "exclude").length
    if (names.length === 0) return document.definition.scopeKind === "global" ? "En todos los platillos" : "Todavía en ninguno"
    return `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}${exceptions ? ` · ${exceptions} apagado${exceptions === 1 ? "" : "s"}` : ""}`
  }, [document.targets, document.definition.scopeKind, categories, products])

  const selectedNode = selection?.kind === "step" ? (document.nodes.find((node) => node.id === selection.nodeId) ?? null) : null

  const leave = (path: string) => {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return
    router.push(path)
  }

  const save = async () => {
    if (problems.length > 0) return toast.error("Hay pasos con problemas; revísalos antes de guardar")
    const everywhere = !isSubflow && document.definition.scopeKind === "global" && !document.targets.some((target) => target.mode === "include") && document.nodes.some((node) => node.options.length > 0)
    if (everywhere && !confirm("No elegiste platillos: este flujo va a salir en TODOS. ¿Guardar así?")) return
    setSaving(true)
    // Ids are reassigned on save, so the selected step is found again by position.
    const selectedIndex = selection?.kind === "step" ? document.nodes.findIndex((node) => node.id === selection.nodeId) : -1
    try {
      const json = { method: "", headers: { "Content-Type": "application/json" } }
      const definition = await fetch(`/api/flows/${flowId}`, { ...json, method: "PATCH", body: JSON.stringify({ name: document.definition.name.trim() || "Flujo sin nombre", active: document.definition.active, priority: document.definition.priority }) })
      if (!definition.ok) throw new Error("No se pudo guardar el nombre del flujo")
      const graph = await fetch(`/api/flows/${flowId}/graph`, { ...json, method: "PUT", body: JSON.stringify({ nodes: document.nodes.map((node, sortOrder) => ({ ...node, sortOrder })), edges: document.edges }) })
      if (!graph.ok) throw new Error((await graph.json().catch(() => null))?.error ?? "El servidor rechazó el flujo")
      if (!isSubflow) {
        const targets = await fetch(`/api/flows/${flowId}/targets`, { ...json, method: "PUT", body: JSON.stringify({ targets: document.targets }) })
        if (!targets.ok) throw new Error("No se pudo guardar en qué platillos sale")
      }
      const fresh = normalizeDocument(await (await fetch(`/api/flows/${flowId}`)).json())
      setDocument(fresh)
      setSaved(snapshot(fresh))
      if (selectedIndex >= 0 && fresh.nodes[selectedIndex]) setSelection({ kind: "step", nodeId: fresh.nodes[selectedIndex].id })
      toast.success("Guardado. Los iPads lo toman al momento.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const addStep = (afterNodeId: string | null) => {
    const created = addStepAfter(document, afterNodeId, "Paso nuevo")
    setDocument(created.document)
    setSelection({ kind: "step", nodeId: created.nodeId })
  }

  const createSubflow = async (nodeId: string, optionId: string, name: string) => {
    // scopeKind "product" with no targets: a composer that predates parent_flow_id
    // would never apply it either, so an embedded flow cannot leak into the menu.
    const response = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopeKind: "product", parentFlowId: flowId, firstStepTitle: "Primera pregunta" }) })
    if (!response.ok) return toast.error("No se pudo crear el subflujo")
    const created = normalizeDocument(await response.json())
    setDocument((current) => ({ ...updateOption(current, nodeId, optionId, { childFlowMode: "custom", childFlowId: created.definition.id }), subflows: [...current.subflows, { id: created.definition.id, name: created.definition.name, active: true }] }))
    toast.success("Subflujo creado. Guarda y ábrelo para armar sus pasos.")
  }

  if (loading) return <div className="grid h-[70vh] place-items-center text-muted-foreground">Cargando flujo…</div>

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background">
      {/* Entrances only: these rows are not gesture-driven, so a short critically-damped ease is enough. */}
      <style>{`
        @keyframes flowRowIn { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes flowScreenIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
        .flow-row-in { animation: flowRowIn 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-origin: left top; }
        .flow-screen-in { animation: flowScreenIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .flow-row-in, .flow-screen-in { animation: flowFade 160ms ease both; }
          @keyframes flowFade { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>

      <header className="flex flex-wrap items-center gap-3 border-b bg-card/80 px-4 py-2.5 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => (isSubflow && parent ? leave(`/flows/${parent.id}`) : dirty && !confirm("Hay cambios sin guardar. ¿Salir de todos modos?") ? undefined : onBack ? onBack() : router.push("/flows"))}>
          <CaretLeft className="size-4" /> {isSubflow ? (parent?.name ?? "Flujo principal") : "Flujos"}
        </Button>
        <div className="min-w-48 flex-1">
          {isSubflow && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Subflujo propio</p>}
          <Input
            className="h-9 border-transparent bg-transparent px-1 text-lg font-semibold tracking-[-0.015em] shadow-none hover:border-border focus-visible:border-border"
            value={document.definition.name}
            onChange={(event) => setDocument((current) => ({ ...current, definition: { ...current.definition, name: event.target.value } }))}
            aria-label="Nombre del flujo"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={document.definition.active} onCheckedChange={(active) => setDocument((current) => ({ ...current, definition: { ...current.definition, active } }))} />
          {document.definition.active ? "Activo" : "Apagado"}
        </label>
        {!isSubflow && (
          <Button variant={selection?.kind === "test" ? "secondary" : "outline"} size="sm" onClick={() => setSelection({ kind: "test" })}>
            <Play className="size-4" weight="fill" /> Probar
          </Button>
        )}
        <Button size="sm" disabled={saving || !dirty || problems.length > 0} onClick={save}>
          {saving ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
        </Button>
      </header>

      {problems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-destructive/5 px-4 py-2 text-sm">
          <Warning className="size-4 shrink-0 text-destructive" weight="fill" />
          {problems.slice(0, 3).map((problem, index) => (
            <button
              key={index}
              type="button"
              className="rounded-md px-1.5 py-0.5 text-left text-destructive underline-offset-2 hover:underline"
              onClick={() => problem.nodeId && setSelection({ kind: "step", nodeId: problem.nodeId })}
            >
              {problem.nodeId ? `«${document.nodes.find((node) => node.id === problem.nodeId)?.title ?? "Paso"}»: ` : ""}
              {problem.message}
            </button>
          ))}
          {problems.length > 3 && <span className="text-muted-foreground">y {problems.length - 3} más</span>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r bg-muted/20">
          <BranchTree
            trunk={tree.trunk}
            orphans={tree.orphans}
            context={context}
            selection={selection}
            invalidNodeIds={invalidNodeIds}
            appliesSummary={appliesSummary}
            isSubflow={isSubflow}
            onSelect={setSelection}
            onAddAfter={addStep}
            onOpenSubflow={(id) => leave(`/flows/${id}`)}
          />
        </aside>
        <main className={cn("min-h-0 bg-card", selection === null && "grid place-items-center")}>
          {selection === null && (
            <div className="max-w-sm p-8 text-center">
              <p className="text-base font-semibold">Toca un paso para configurarlo</p>
              <p className="mt-1 text-sm text-muted-foreground">A la izquierda está el flujo como lo recorre el mesero: el tronco son los pasos y cada rama es un camino que solo abren ciertas opciones.</p>
            </div>
          )}
          {selection?.kind === "applies" && <AppliesPanel document={document} products={products} categories={categories} onChange={(targets) => setDocument((current) => ({ ...current, targets }))} />}
          {selection?.kind === "test" && <TestPanel products={products} categories={categories} suggestedProductIds={targetProducts.map((product) => product.id)} dirty={dirty} />}
          {selectedNode && (
            <StepWizard
              key={selectedNode.id}
              document={document}
              node={selectedNode}
              products={products}
              categories={categories}
              flows={flows}
              targetVariantNames={targetVariantNames}
              canMoveUp={trunkIds(document).indexOf(selectedNode.id) > 0}
              onChange={setDocument}
              onSelectNode={(nodeId) => setSelection({ kind: "step", nodeId })}
              onMoveUp={() => setDocument(moveStepUp(document, selectedNode.id))}
              onDelete={() => {
                if (!confirm(`¿Borrar el paso «${selectedNode.title}»? Lo que llegaba a él seguirá al paso siguiente.`)) return
                setDocument(removeNode(document, selectedNode.id))
                setSelection(null)
              }}
              onCreateSubflow={(optionId, name) => void createSubflow(selectedNode.id, optionId, name)}
              onOpenSubflow={(id) => leave(`/flows/${id}`)}
            />
          )}
        </main>
      </div>
    </div>
  )
}
