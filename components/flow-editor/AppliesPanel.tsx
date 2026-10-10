"use client"

import { X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/lib/types"
import { ChipGrid, type ChipTile } from "./ChipGrid"
import { variantsOf } from "./model"
import type { FlowDocument, FlowTarget } from "./types"

interface Props {
  document: FlowDocument
  products: Product[]
  categories: Category[]
  onChange: (targets: FlowTarget[]) => void
}

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
const target = (patch: Partial<FlowTarget>): FlowTarget => ({ mode: "include", categoryId: null, subcategoryId: null, productId: null, variantName: null, ...patch })

/**
 * "¿En qué platillos sale?" as squares. Including a category lights up every
 * platillo and variant in it; tapping one writes an exclusion, so the flow keeps
 * following the category as the menu grows.
 */
export function AppliesPanel({ document, products, categories, onChange }: Props) {
  const targets = document.targets
  const includedCategories = targets.filter((item) => item.mode === "include" && item.categoryId)
  const includedSubcategories = targets.filter((item) => item.mode === "include" && item.subcategoryId)
  const includedProducts = targets.filter((item) => item.mode === "include" && item.productId)
  const productOff = (productId: string) => targets.some((item) => item.mode === "exclude" && item.productId === productId && !item.variantName)
  const variantOff = (productId: string, name: string) => targets.some((item) => item.mode === "exclude" && item.productId === productId && item.variantName?.trim() === name)
  const withoutProductExcludes = (productId: string) => targets.filter((item) => !(item.mode === "exclude" && item.productId === productId))

  const tile = (product: Product): ChipTile => {
    const off = productOff(product.id)
    const chips = variantsOf(product).map((variant) => ({ id: variant.name, label: variant.name, on: !off && !variantOff(product.id, variant.name) }))
    return { id: product.id, title: product.name, on: chips.length ? chips.some((chip) => chip.on) : !off, chips }
  }

  const toggleProduct = (productId: string, isOn: boolean) => onChange(isOn ? [...withoutProductExcludes(productId), target({ mode: "exclude", productId })] : withoutProductExcludes(productId))

  const toggleVariant = (product: Product, name: string) => {
    if (productOff(product.id)) {
      // Back from fully off with only the tapped variant on.
      const others = variantsOf(product).filter((variant) => variant.name !== name)
      onChange([...withoutProductExcludes(product.id), ...others.map((variant) => target({ mode: "exclude", productId: product.id, variantName: variant.name }))])
      return
    }
    onChange(
      variantOff(product.id, name)
        ? targets.filter((item) => !(item.mode === "exclude" && item.productId === product.id && item.variantName?.trim() === name))
        : [...targets, target({ mode: "exclude", productId: product.id, variantName: name })],
    )
  }

  const grid = (list: Product[], noun: string, onSetAll?: (on: boolean) => void) => (
    <ChipGrid
      noun={noun}
      tiles={list.map(tile)}
      onToggleTile={(productId) => toggleProduct(productId, tile(list.find((product) => product.id === productId)!).on)}
      onToggleChip={(productId, name) => toggleVariant(list.find((product) => product.id === productId)!, name)}
      onSetAll={onSetAll}
      empty="No hay platillos activos aquí."
    />
  )

  const availableCategories = categories.filter((category) => !includedCategories.some((item) => item.categoryId === category.id))
  const everywhere = document.definition.scopeKind === "global" && !targets.some((item) => item.mode === "include")

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-5 pb-3 pt-4">
        <h2 className="text-lg font-semibold tracking-[-0.015em]">¿En qué platillos sale?</h2>
        <p className="text-sm text-muted-foreground">Agrega categorías o platillos. Todo empieza prendido: toca lo que NO debe llevar este flujo.</p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {everywhere && (
          <p className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            Sin elegir nada, este flujo sale en <strong>todos</strong> los platillos del menú.
          </p>
        )}

        {includedCategories.map((item) => {
          const category = categories.find((candidate) => candidate.id === item.categoryId)
          const list = products.filter((product) => product.active && product.categoryId === item.categoryId).sort((a, b) => a.name.localeCompare(b.name))
          return (
            <section key={item.categoryId} className="flow-row-in space-y-2.5 rounded-2xl border bg-card p-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{category?.name ?? item.targetName ?? "Categoría"}</h3>
                <button
                  type="button"
                  aria-label="Quitar categoría"
                  className="rounded-md p-1 text-muted-foreground transition-transform duration-100 hover:bg-muted active:scale-95"
                  onClick={() => onChange(targets.filter((candidate) => candidate !== item && !(candidate.mode === "exclude" && list.some((product) => product.id === candidate.productId))))}
                >
                  <X className="size-4" />
                </button>
              </div>
              {grid(list, "llevan el flujo", (on) => {
                const ids = new Set(list.map((product) => product.id))
                const kept = targets.filter((candidate) => !(candidate.mode === "exclude" && candidate.productId && ids.has(candidate.productId)))
                onChange(on ? kept : [...kept, ...list.map((product) => target({ mode: "exclude", productId: product.id }))])
              })}
            </section>
          )
        })}

        {includedSubcategories.map((item) => (
          <div key={item.subcategoryId} className="flex items-center justify-between rounded-2xl border bg-card p-3.5 text-sm">
            <span>
              Subcategoría <strong>{item.targetName ?? ""}</strong>
            </span>
            <button type="button" aria-label="Quitar subcategoría" className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => onChange(targets.filter((candidate) => candidate !== item))}>
              <X className="size-4" />
            </button>
          </div>
        ))}

        {includedProducts.length > 0 && (
          <section className="flow-row-in space-y-2.5 rounded-2xl border bg-card p-3.5">
            <h3 className="text-sm font-semibold">Platillos sueltos</h3>
            <div className="space-y-2">
              {includedProducts.map((item) => {
                const product = products.find((candidate) => candidate.id === item.productId)
                if (!product) return null
                const variants = variantsOf(product)
                return (
                  <div key={item.productId} className="rounded-xl border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{product.name}</span>
                      <button type="button" aria-label="Quitar platillo" className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => onChange(withoutProductExcludes(product.id).filter((candidate) => candidate !== item))}>
                        <X className="size-4" />
                      </button>
                    </div>
                    {variants.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {variants.map((variant) => {
                          const on = !variantOff(product.id, variant.name)
                          return (
                            <button
                              key={variant.name}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleVariant(product, variant.name)}
                              className={cn(
                                "rounded-md border px-2 py-1 text-xs leading-none transition-transform duration-100 active:scale-[0.97]",
                                on ? "border-primary/50 bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/40 text-muted-foreground line-through",
                              )}
                            >
                              {variant.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2">
          <select className={field} value="" onChange={(event) => event.target.value && onChange([...targets, target({ categoryId: event.target.value })])}>
            <option value="">+ Categoría completa…</option>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select className={field} value="" onChange={(event) => event.target.value && onChange([...targets, target({ productId: event.target.value })])}>
            <option value="">+ Un platillo…</option>
            {categories.map((category) => (
              <optgroup key={category.id} label={category.name}>
                {products
                  .filter((product) => product.active && product.categoryId === category.id && !includedProducts.some((item) => item.productId === product.id))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
