"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function FlowEntryRedirect({ scopeKind, targetId, targetField }: { scopeKind: "category" | "subcategory" | "product"; targetId: string; targetField: "categoryId" | "subcategoryId" | "productId" }) {
  const router = useRouter()
  const [message, setMessage] = useState("Preparando editor…")
  useEffect(() => { let active = true; void (async () => { try { const listResponse = await fetch("/api/flows"); if (!listResponse.ok) throw new Error(); const flows = await listResponse.json() as Array<{ id: string; scopeKind: string; targets: Array<Record<string, string | null>> }>; let flow = flows.find((item) => item.scopeKind === scopeKind && item.targets.some((target) => target[targetField] === targetId)); if (!flow) { setMessage("Creando flujo…"); const created = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Flujo de ${scopeKind}`, scopeKind }) }); if (!created.ok) throw new Error(); const body = await created.json(); flow = { id: body.definition.id, scopeKind, targets: [] }; const targets = await fetch(`/api/flows/${flow.id}/targets`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: [{ mode: "include", categoryId: targetField === "categoryId" ? targetId : null, subcategoryId: targetField === "subcategoryId" ? targetId : null, productId: targetField === "productId" ? targetId : null }] }) }); if (!targets.ok) throw new Error() } if (active) router.replace(`/flows/${flow.id}`) } catch { toast.error("No se pudo abrir el editor de flujos") } })(); return () => { active = false } }, [router, scopeKind, targetField, targetId])
  return <div className="grid h-[60vh] place-items-center"><p className="text-sm text-muted-foreground">{message}</p></div>
}
