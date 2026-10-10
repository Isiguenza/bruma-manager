"use client"

import { useMemo, useState } from "react"
import { ArrowUp, CaretLeft, CaretRight, Plus, Trash, X } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/lib/types"
import { ChipGrid, type ChipTile } from "./ChipGrid"
import {
  addBranchStep,
  addRule,
  conditionText,
  defaultEdge,
  flowsForProduct,
  optionEdge,
  optionName,
  removeEdge,
  removeOption,
  ruleEdges,
  setDefaultNext,
  setOptionNext,
  toggleRef,
  updateNode,
  updateOption,
  variantRef,
  variantsOf,
} from "./model"
import { newOption, type EditorNode, type EditorOption, type FlowDocument, type FlowListItem } from "./types"

interface Props {
  document: FlowDocument
  node: EditorNode
  products: Product[]
  categories: Category[]
  flows: FlowListItem[]
  /** Variant names of the platillos this flow applies to, for "solo si la variante es…". */
  targetVariantNames: string[]
  canMoveUp: boolean
  onChange: (document: FlowDocument) => void
  onSelectNode: (nodeId: string) => void
  onMoveUp: () => void
  onDelete: () => void
  onCreateSubflow: (optionId: string, name: string) => void
  onOpenSubflow: (flowId: string) => void
}

const screens = ["Pregunta", "Opciones", "Precios", "Qué sigue"] as const
const END = "__end__"
const SAME = "__same__"
const BRANCH = "__branch__"
const NEW_SUBFLOW = "__new__"

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
const press = "transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm", press, option.value === value ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function StepWizard({ document, node, products, categories, flows, targetVariantNames, canMoveUp, onChange, onSelectNode, onMoveUp, onDelete, onCreateSubflow, onOpenSubflow }: Props) {
  const [screen, setScreen] = useState(0)
  const categoryName = (id: string | null) => categories.find((category) => category.id === id)?.name ?? "…"
  const activeProducts = useMemo(() => products.filter((product) => product.active).sort((a, b) => a.name.localeCompare(b.name)), [products])
  const patchNode = (patch: Partial<EditorNode>) => onChange(updateNode(document, node.id, patch))
  const patchOption = (optionId: string, patch: Partial<EditorOption>) => onChange(updateOption(document, node.id, optionId, patch))
  const otherNodes = document.nodes.filter((candidate) => candidate.id !== node.id)
  const required = node.minSelections > 0

  const inheritedNames = (option: EditorOption, product: Product) => flowsForProduct(flows, product, document.definition.id).map((flow) => flow.name)
  const productsOf = (option: EditorOption) =>
    option.source === "category" ? activeProducts.filter((product) => product.categoryId === option.refCategoryId) : activeProducts.filter((product) => product.id === option.refProductId)

  // ---- 1. Pregunta
  const question = (
    <div className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Qué le pregunta el POS al mesero</span>
        <Input className="h-11 text-base font-semibold" value={node.title} placeholder="¿Paquete?, Entrada, Tipo de leche…" onChange={(event) => patchNode({ title: event.target.value })} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Texto de ayuda (opcional)</span>
        <Input value={node.subtitle ?? ""} onChange={(event) => patchNode({ subtitle: event.target.value || null })} />
      </label>
      <Row title="Cuántas puede elegir">
        <Segmented
          value={node.selectMode}
          options={[
            { value: "single", label: "Una" },
            { value: "multi", label: "Varias" },
          ]}
          onChange={(selectMode) => patchNode(selectMode === "single" ? { selectMode, maxSelections: 1, minSelections: Math.min(node.minSelections, 1) } : { selectMode, maxSelections: null })}
        />
      </Row>
      {node.selectMode === "single" ? (
        <Row title="Es obligatoria" hint={required ? "No avanza hasta elegir una." : "Aparece la tarjeta para saltársela."}>
          <Switch checked={required} onCheckedChange={(on) => patchNode(on ? { minSelections: 1, maxSelections: 1, includeNoneOption: false } : { minSelections: 0, maxSelections: 1, includeNoneOption: true })} />
        </Row>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Mínimo</span>
            <Input type="number" min={0} value={node.minSelections} onChange={(event) => patchNode({ minSelections: Math.max(0, Number(event.target.value) || 0) })} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Máximo</span>
            <Input type="number" min={1} placeholder="Sin límite" value={node.maxSelections ?? ""} onChange={(event) => patchNode({ maxSelections: event.target.value === "" ? null : Math.max(1, Number(event.target.value) || 1) })} />
          </label>
        </div>
      )}
      {node.selectMode === "single" && !required && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Cómo se llama la tarjeta para saltársela</span>
          <Input value={node.noneLabel ?? ""} placeholder={`Sin ${node.title.toLowerCase() || "selección"}`} onChange={(event) => patchNode({ noneLabel: event.target.value || null })} />
        </label>
      )}
    </div>
  )

  // ---- 2. Opciones
  const addOption = (patch: Partial<EditorOption>) => patchNode({ options: [...node.options, newOption(node.options.length, patch)] })

  const visibilityTiles = (option: EditorOption): ChipTile[] =>
    productsOf(option).map((product) => {
      const variants = variantsOf(product)
      const chips = variants.map((variant) => ({ id: variant.name, label: variant.name, on: !option.hiddenRefs.includes(product.id) && !option.hiddenRefs.includes(variantRef(product.id, variant.name)) }))
      return { id: product.id, title: product.name, on: chips.length ? chips.some((chip) => chip.on) : !option.hiddenRefs.includes(product.id), chips }
    })

  const toggleTile = (option: EditorOption, productId: string) => {
    const product = products.find((candidate) => candidate.id === productId)
    const variantRefs = variantsOf(product).map((variant) => variantRef(productId, variant.name))
    const isOn = visibilityTiles(option).find((tile) => tile.id === productId)?.on ?? true
    const cleaned = option.hiddenRefs.filter((ref) => ref !== productId && !variantRefs.includes(ref))
    patchOption(option.id, { hiddenRefs: isOn ? [...cleaned, productId] : cleaned })
  }

  const toggleChip = (option: EditorOption, productId: string, variantName: string) => {
    const product = products.find((candidate) => candidate.id === productId)
    const all = variantsOf(product).map((variant) => variantRef(productId, variant.name))
    // A product that was off as a whole comes back with only the tapped variant on.
    const base = option.hiddenRefs.includes(productId) ? [...option.hiddenRefs.filter((ref) => ref !== productId), ...all] : option.hiddenRefs
    patchOption(option.id, { hiddenRefs: toggleRef(base, variantRef(productId, variantName)) })
  }

  const subflowControl = (option: EditorOption) => {
    const referenced = productsOf(option)
    const withFlow = referenced.map((product) => ({ product, names: inheritedNames(option, product) })).filter((entry) => entry.names.length > 0)
    const canInherit = option.emitsChildItem && option.source !== "manual"
    const value = option.childFlowMode === "custom" ? (option.childFlowId ?? "none") : option.childFlowMode === "none" || !canInherit ? "none" : "inherit"
    return (
      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-xs font-medium">Al elegirla, ¿abre más preguntas?</p>
        <select
          className={field}
          value={value}
          onChange={(event) => {
            const next = event.target.value
            if (next === NEW_SUBFLOW) return onCreateSubflow(option.id, `Subflujo de ${optionName(option, products, categoryName)}`)
            if (next === "inherit" || next === "none") return patchOption(option.id, { childFlowMode: next, childFlowId: null })
            patchOption(option.id, { childFlowMode: "custom", childFlowId: next })
          }}
        >
          {canInherit && <option value="inherit">Las que ya trae el platillo{withFlow.length ? ` (${[...new Set(withFlow.flatMap((entry) => entry.names))].join(", ")})` : " (hoy ninguna)"}</option>}
          <option value="none">No, ninguna</option>
          {document.subflows.map((flow) => (
            <option key={flow.id} value={flow.id}>
              Subflujo propio: {flow.name}
            </option>
          ))}
          <option value={NEW_SUBFLOW}>+ Crear un subflujo propio de este flujo…</option>
        </select>
        {option.childFlowMode === "custom" && option.childFlowId && (
          <Button size="sm" variant="outline" onClick={() => onOpenSubflow(option.childFlowId!)}>
            Configurar ese subflujo
          </Button>
        )}
        {value === "inherit" && option.source === "category" && withFlow.length > 0 && (
          <ChipGrid
            noun="abren su flujo"
            tiles={withFlow.map(({ product, names }) => ({ id: product.id, title: product.name, detail: names.join(", "), on: !option.subflowHiddenRefs.includes(product.id), chips: [] }))}
            onToggleTile={(productId) => patchOption(option.id, { subflowHiddenRefs: toggleRef(option.subflowHiddenRefs, productId) })}
            onToggleChip={() => undefined}
            onSetAll={(on) => patchOption(option.id, { subflowHiddenRefs: on ? [] : withFlow.map((entry) => entry.product.id) })}
          />
        )}
      </div>
    )
  }

  const optionCard = (option: EditorOption) => {
    const product = products.find((candidate) => candidate.id === option.refProductId)
    const productVariants = variantsOf(product)
    return (
      <div key={option.id} className="flow-row-in space-y-3 rounded-2xl border bg-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {option.source === "manual" ? "Texto" : option.source === "product" ? "Platillo" : "Categoría"}
          </span>
          <button type="button" aria-label="Quitar opción" className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive", press)} onClick={() => onChange(removeOption(document, node.id, option.id))}>
            <Trash className="size-4" />
          </button>
        </div>

        {option.source === "manual" && <Input value={option.label ?? ""} placeholder="Texto de la tarjeta" onChange={(event) => patchOption(option.id, { label: event.target.value })} />}

        {option.source === "product" && (
          <>
            <select
              className={field}
              value={option.refProductId ?? ""}
              onChange={(event) => {
                const next = products.find((candidate) => candidate.id === event.target.value)
                patchOption(option.id, { refProductId: next?.id ?? null, label: next?.name ?? "", refVariantName: null, hiddenRefs: [], variantPriceDeltas: {}, subflowHiddenRefs: [] })
              }}
            >
              <option value="">Elige un platillo…</option>
              {categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {activeProducts
                    .filter((candidate) => candidate.categoryId === category.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <Input value={option.label ?? ""} placeholder="Cómo se lee en la tarjeta" onChange={(event) => patchOption(option.id, { label: event.target.value })} />
            {productVariants.length > 0 && (
              <div className="space-y-2">
                <Row title="Variante">
                  <Segmented
                    value={option.allowVariantChoice ? "ask" : "fixed"}
                    options={[
                      { value: "fixed", label: "Fija" },
                      { value: "ask", label: "La elige el mesero" },
                    ]}
                    onChange={(mode) => patchOption(option.id, mode === "ask" ? { allowVariantChoice: true, refVariantName: null } : { allowVariantChoice: false, hiddenRefs: [] })}
                  />
                </Row>
                {option.allowVariantChoice ? (
                  <ChipGrid noun="variantes aparecen" tiles={visibilityTiles(option)} onToggleTile={(id) => toggleTile(option, id)} onToggleChip={(id, chip) => toggleChip(option, id, chip)} />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {[null, ...productVariants.map((variant) => variant.name)].map((name) => (
                      <button
                        key={name ?? "none"}
                        type="button"
                        aria-pressed={option.refVariantName === name}
                        onClick={() => patchOption(option.id, { refVariantName: name })}
                        className={cn("rounded-md border px-2.5 py-1.5 text-xs", press, option.refVariantName === name ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
                      >
                        {name ?? "Sin variante"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {option.source === "category" && (
          <>
            <select className={field} value={option.refCategoryId ?? ""} onChange={(event) => patchOption(option.id, { refCategoryId: event.target.value || null, hiddenRefs: [], variantPriceDeltas: {}, subflowHiddenRefs: [] })}>
              <option value="">Elige una categoría…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {option.refCategoryId && (
              <>
                <Row title="Variantes" hint={option.allowVariantChoice ? "Una tarjeta por platillo; después pregunta la variante." : "Una tarjeta por cada variante."}>
                  <Segmented
                    value={option.allowVariantChoice ? "ask" : "flat"}
                    options={[
                      { value: "ask", label: "Preguntar después" },
                      { value: "flat", label: "Todas a la vista" },
                    ]}
                    onChange={(mode) => patchOption(option.id, { allowVariantChoice: mode === "ask" })}
                  />
                </Row>
                <div>
                  <p className="mb-1.5 text-xs font-medium">Toca lo que NO debe aparecer</p>
                  <ChipGrid
                    noun="aparecen"
                    tiles={visibilityTiles(option)}
                    onToggleTile={(id) => toggleTile(option, id)}
                    onToggleChip={(id, chip) => toggleChip(option, id, chip)}
                    onSetAll={(on) => patchOption(option.id, { hiddenRefs: on ? [] : productsOf(option).map((candidate) => candidate.id) })}
                    empty="Esta categoría no tiene platillos activos."
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">Un platillo nuevo de la categoría aparece solo; no hay que volver aquí.</p>
                </div>
              </>
            )}
          </>
        )}

        {option.source !== "manual" && (
          <Row title="Sale como platillo aparte" hint="Se imprime en la comanda y se marca en el Pase por separado.">
            <Switch checked={option.emitsChildItem} onCheckedChange={(emitsChildItem) => patchOption(option.id, { emitsChildItem })} />
          </Row>
        )}
        {subflowControl(option)}
      </div>
    )
  }

  const options = (
    <div className="space-y-3">
      {node.options.length === 0 && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Sin opciones, este paso es <strong>invisible</strong>: el mesero no lo ve y el POS solo decide el camino con las reglas de «Qué sigue».
        </p>
      )}
      {node.options.map(optionCard)}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Texto", { source: "manual", label: "" }],
            ["Platillo", { source: "product", emitsChildItem: true, priceMode: "free" }],
            ["Categoría", { source: "category", label: null, emitsChildItem: true, allowVariantChoice: true, priceMode: "free" }],
          ] as Array<[string, Partial<EditorOption>]>
        ).map(([label, patch]) => (
          <button key={label} type="button" onClick={() => addOption(patch)} className={cn("flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground", press)}>
            <Plus className="size-4" weight="bold" /> {label}
          </button>
        ))}
      </div>
    </div>
  )

  // ---- 3. Precios
  const scopeValue = (override: EditorOption["priceOverrides"][number]) => (override.productId ? `p:${override.productId}` : override.subcategoryId ? `s:${override.subcategoryId}` : override.categoryId ? `c:${override.categoryId}` : "")
  const prices = (
    <div className="space-y-3">
      {node.options.length === 0 && <p className="text-sm text-muted-foreground">Agrega opciones primero.</p>}
      {node.options.map((option) => {
        const patchOverride = (index: number, patch: Partial<EditorOption["priceOverrides"][number]>) =>
          patchOption(option.id, { priceOverrides: option.priceOverrides.map((current, position) => (position === index ? { ...current, ...patch } : current)) })
        const variantRows = option.allowVariantChoice
          ? productsOf(option).flatMap((product) =>
              variantsOf(product)
                .filter((variant) => !option.hiddenRefs.includes(product.id) && !option.hiddenRefs.includes(variantRef(product.id, variant.name)))
                .map((variant) => ({ key: option.source === "category" ? variantRef(product.id, variant.name) : variant.name, label: option.source === "category" ? `${product.name} · ${variant.name}` : variant.name })),
            )
          : []
        return (
          <div key={option.id} className="space-y-3 rounded-2xl border bg-card p-3.5">
            <p className="truncate text-sm font-semibold">{optionName(option, products, categoryName)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={option.priceMode}
                options={[
                  { value: "free", label: "Sin costo" },
                  { value: "delta", label: "Cobra extra" },
                  ...(option.source === "manual" ? [] : [{ value: "product_price" as const, label: "Su precio de carta" }]),
                ]}
                onChange={(priceMode) => patchOption(option.id, { priceMode })}
              />
              {option.priceMode === "delta" && (
                <label className="flex items-center gap-1 text-sm">
                  +$
                  <Input className="w-24 tabular-nums" type="number" step="0.01" value={option.priceDelta} onChange={(event) => patchOption(option.id, { priceDelta: event.target.value })} />
                </label>
              )}
            </div>
            {option.priceMode === "delta" && (
              <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                <p className="text-xs font-medium">Excepciones</p>
                <p className="text-xs text-muted-foreground">El extra de arriba aplica a todo. Aquí solo va lo que cobra distinto según el platillo que se está pidiendo.</p>
                {option.priceOverrides.map((override, index) => (
                  <div key={override.id ?? index} className="flex items-center gap-2">
                    <select
                      className={cn(field, "min-w-0 flex-1 py-1.5")}
                      value={scopeValue(override)}
                      onChange={(event) => {
                        const [kind, id] = [event.target.value.slice(0, 1), event.target.value.slice(2)]
                        patchOverride(index, { categoryId: kind === "c" ? id : null, subcategoryId: kind === "s" ? id : null, productId: kind === "p" ? id : null })
                      }}
                    >
                      <option value="">Cuando el platillo es…</option>
                      <optgroup label="Categorías">
                        {categories.map((category) => (
                          <option key={category.id} value={`c:${category.id}`}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Platillos">
                        {activeProducts.map((candidate) => (
                          <option key={candidate.id} value={`p:${candidate.id}`}>
                            {candidate.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <span className="text-sm">+$</span>
                    <Input className="w-20 tabular-nums" type="number" step="0.01" value={override.priceDelta} onChange={(event) => patchOverride(index, { priceDelta: event.target.value })} />
                    <button type="button" aria-label="Quitar excepción" className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted", press)} onClick={() => patchOption(option.id, { priceOverrides: option.priceOverrides.filter((_, position) => position !== index) })}>
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => patchOption(option.id, { priceOverrides: [...option.priceOverrides, { categoryId: null, subcategoryId: null, productId: null, priceDelta: option.priceDelta }] })}>
                  Agregar excepción
                </Button>
              </div>
            )}
            {variantRows.length > 0 && (
              <div className="space-y-1.5 rounded-xl bg-muted/40 p-3">
                <p className="text-xs font-medium">Extra por variante</p>
                {variantRows.map((row) => (
                  <label key={row.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{row.label}</span>
                    <span className="flex items-center gap-1">
                      +$
                      <Input className="w-20 tabular-nums" type="number" step="0.01" value={option.variantPriceDeltas[row.key] ?? "0"} onChange={(event) => patchOption(option.id, { variantPriceDeltas: { ...option.variantPriceDeltas, [row.key]: event.target.value } })} />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ---- 4. Qué sigue
  const [ruleVariants, setRuleVariants] = useState<string[]>([])
  const [ruleTag, setRuleTag] = useState("")
  const [ruleNext, setRuleNext] = useState<string>(END)
  const stepNext = defaultEdge(document, node.id)?.toNodeId ?? null
  const destinations = (
    <>
      {otherNodes.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          Ir a «{candidate.title || "Paso sin título"}»
        </option>
      ))}
      <option value={END}>Terminar este flujo</option>
    </>
  )
  const next = (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Después de este paso</span>
        <select className={field} value={stepNext ?? END} onChange={(event) => onChange(setDefaultNext(document, node.id, event.target.value === END ? null : event.target.value))}>
          {destinations}
        </select>
      </label>

      {node.options.some((option) => option.source !== "category") && (
        <div className="space-y-2">
          <p className="text-sm font-medium">¿Alguna opción toma otro camino?</p>
          <p className="text-xs text-muted-foreground">Así nacen las ramas: una opción puede abrir pasos que las demás no ven.</p>
          {node.options
            .filter((option) => option.source !== "category")
            .map((option) => {
              const own = optionEdge(document, node.id, option.id)
              return (
                <div key={option.id} className="flex items-center gap-2 rounded-xl border bg-card p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{optionName(option, products, categoryName)}</span>
                  <select
                    className={cn(field, "w-52 py-1.5")}
                    value={own === undefined ? SAME : (own.toNodeId ?? END)}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === BRANCH) {
                        const created = addBranchStep(document, node.id, option.id, `Después de ${optionName(option, products, categoryName)}`)
                        onChange(created.document)
                        onSelectNode(created.nodeId)
                        return
                      }
                      onChange(setOptionNext(document, node.id, option.id, value === SAME ? undefined : value === END ? null : value))
                    }}
                  >
                    <option value={SAME}>Igual que el paso</option>
                    {destinations}
                    <option value={BRANCH}>+ Abrir una rama nueva…</option>
                  </select>
                </div>
              )
            })}
        </div>
      )}

      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-sm font-medium">Reglas según el platillo</p>
        <p className="text-xs text-muted-foreground">Para caminos que dependen de lo que se pidió, no de lo que elige el mesero. Se revisan antes que lo de arriba.</p>
        {ruleEdges(document, node.id).map((rule) => (
          <div key={rule.id} className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-2 text-sm">
            <span className="min-w-0 flex-1">
              Si {conditionText(rule.condition)} → {rule.toNodeId === null ? "termina" : `«${document.nodes.find((candidate) => candidate.id === rule.toNodeId)?.title ?? "?"}»`}
            </span>
            <button type="button" aria-label="Quitar regla" className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted", press)} onClick={() => onChange(removeEdge(document, rule.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
        {targetVariantNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {targetVariantNames.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={ruleVariants.includes(name)}
                onClick={() => setRuleVariants(toggleRef(ruleVariants, name))}
                className={cn("rounded-md border px-2 py-1 text-xs", press, ruleVariants.includes(name) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-40" placeholder="o etiqueta del platillo" value={ruleTag} onChange={(event) => setRuleTag(event.target.value)} />
          <select className={cn(field, "w-48 py-1.5")} value={ruleNext} onChange={(event) => setRuleNext(event.target.value)}>
            {destinations}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={ruleVariants.length === 0 && ruleTag.trim() === ""}
            onClick={() => {
              onChange(addRule(document, node.id, { ...(ruleVariants.length ? { variantNameIn: ruleVariants } : {}), ...(ruleTag.trim() ? { productHasTag: ruleTag.trim() } : {}) }, ruleNext === END ? null : ruleNext))
              setRuleVariants([])
              setRuleTag("")
            }}
          >
            Agregar regla
          </Button>
        </div>
      </div>
    </div>
  )

  const body = [question, options, prices, next][screen]

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-3 border-b px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold tracking-[-0.015em]">{node.title || "Paso sin título"}</h2>
          <span className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp} aria-label="Subir el paso">
              <ArrowUp className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={document.nodes.length <= 1} onClick={onDelete} aria-label="Borrar el paso">
              <Trash className="size-4" />
            </Button>
          </span>
        </div>
        <nav className="grid grid-cols-4 gap-1" aria-label="Pantallas del paso">
          {screens.map((label, index) => (
            <button key={label} type="button" aria-current={index === screen ? "step" : undefined} onClick={() => setScreen(index)} className={cn("space-y-1.5 text-left", press)}>
              <span className={cn("block h-1 rounded-full transition-colors duration-200", index <= screen ? "bg-primary" : "bg-muted")} />
              <span className={cn("block text-xs", index === screen ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {index + 1}. {label}
              </span>
            </button>
          ))}
        </nav>
      </header>
      <div key={screen} className="flow-screen-in min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {body}
      </div>
      <footer className="flex items-center justify-between border-t px-5 py-3">
        <Button variant="ghost" size="sm" disabled={screen === 0} onClick={() => setScreen(screen - 1)}>
          <CaretLeft className="size-4" /> Atrás
        </Button>
        {screen < screens.length - 1 ? (
          <Button size="sm" onClick={() => setScreen(screen + 1)}>
            Siguiente: {screens[screen + 1]} <CaretRight className="size-4" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Listo. Guarda arriba para aplicarlo.</span>
        )}
      </footer>
    </div>
  )
}
