"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type Scope = "category" | "subcategory" | "product"
type Field = "categoryId" | "subcategoryId" | "productId"
const noun: Record<Scope, string> = { category: "esta categoría", subcategory: "esta subcategoría", product: "este platillo" }

/**
 * Opens the flow that belongs to a category / subcategory / product. It used to
 * CREATE one just by visiting the page: an active, empty product flow that went
 * first by scope and hid every other flow of that platillo. Creating is now a
 * deliberate tap, and the flow is born switched off.
 */
export function FlowEntryRedirect({ scopeKind, targetId, targetField }: { scopeKind: Scope; targetId: string; targetField: Field }) {
  const router = useRouter()
  const [state, setState] = useState<"looking" | "missing" | "creating">("looking")

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/flows")
        if (!response.ok) throw new Error()
        const flows = (await response.json()) as Array<{ id: string; scopeKind: string; targets: Array<Record<string, string | null>> }>
        const flow = flows.find((item) => item.scopeKind === scopeKind && item.targets.some((target) => target.mode === "include" && target[targetField] === targetId))
        if (!active) return
        if (flow) router.replace(`/flows/${flow.id}`)
        else setState("missing")
      } catch {
        toast.error("No se pudo abrir el editor de flujos")
      }
    })()
    return () => {
      active = false
    }
  }, [router, scopeKind, targetField, targetId])

  const create = async () => {
    setState("creating")
    try {
      const created = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Flujo de ${noun[scopeKind]}`, scopeKind, active: false, firstStepTitle: "Primera pregunta" }) })
      if (!created.ok) throw new Error()
      const id = (await created.json()).definition.id as string
      const targets = await fetch(`/api/flows/${id}/targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: [{ mode: "include", categoryId: targetField === "categoryId" ? targetId : null, subcategoryId: targetField === "subcategoryId" ? targetId : null, productId: targetField === "productId" ? targetId : null }] }),
      })
      if (!targets.ok) throw new Error()
      router.replace(`/flows/${id}`)
    } catch {
      toast.error("No se pudo crear el flujo")
      setState("missing")
    }
  }

  return (
    <div className="grid h-[60vh] place-items-center">
      {state === "looking" ? (
        <p className="text-sm text-muted-foreground">Buscando su flujo…</p>
      ) : (
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-base font-semibold">Aquí no hay un flujo propio</p>
          <p className="text-sm text-muted-foreground">Puede que ya le salgan flujos generales (como Paquete). Crea uno propio solo si {noun[scopeKind]} necesita preguntas que los demás no.</p>
          <Button disabled={state === "creating"} onClick={create}>
            {state === "creating" ? "Creando…" : "Crear flujo propio"}
          </Button>
          <p className="text-xs text-muted-foreground">Nace apagado; lo prendes cuando esté listo.</p>
        </div>
      )}
    </div>
  )
}
