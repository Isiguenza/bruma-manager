"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

type Flow = { id: string; name: string; scopeKind: string; priority: number; active: boolean; nodeCount: number; targets: Array<{ mode: string; targetName: string }> }
export default function FlowsPage() {
  const router = useRouter(); const [flows, setFlows] = useState<Flow[]>([]); const [loading, setLoading] = useState(true)
  const load = async () => { try { const response = await fetch("/api/flows"); if (!response.ok) throw new Error(); setFlows(await response.json()) } catch { toast.error("No se pudieron cargar los flujos") } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const create = async () => { const response = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nuevo flujo", scopeKind: "global" }) }); if (!response.ok) return toast.error("No se pudo crear el flujo"); const body = await response.json(); router.push(`/flows/${body.definition.id}`) }
  const duplicate = async (id: string) => { try {
    const source = await fetch(`/api/flows/${id}`).then((response) => response.json())
    const created = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...source.definition, name: `${source.definition.name} (copia)` }) }).then((response) => response.json())
    const nodeIds = new Map(source.nodes.map((node: { id: string }) => [node.id, `tmp-node-${crypto.randomUUID()}`]))
    const optionIds = new Map(source.nodes.flatMap((node: { options: Array<{ id: string }> }) => node.options).map((option: { id: string }) => [option.id, `tmp-option-${crypto.randomUUID()}`]))
    const nodes = source.nodes.map((node: { id: string; options: Array<{ id: string }> }) => ({ ...node, id: nodeIds.get(node.id), options: node.options.map((option) => ({ ...option, id: optionIds.get(option.id) })) }))
    const edges = source.edges.map((edge: { fromNodeId: string; toNodeId: string | null; fromOptionId: string | null }) => ({ ...edge, id: `tmp-edge-${crypto.randomUUID()}`, fromNodeId: nodeIds.get(edge.fromNodeId), toNodeId: edge.toNodeId === null ? null : nodeIds.get(edge.toNodeId), fromOptionId: edge.fromOptionId === null ? null : optionIds.get(edge.fromOptionId) }))
    const graph = await fetch(`/api/flows/${created.definition.id}/graph`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodes, edges }) })
    if (!graph.ok) throw new Error()
    await fetch(`/api/flows/${created.definition.id}/targets`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: source.targets }) })
    router.push(`/flows/${created.definition.id}`)
  } catch { toast.error("No se pudo duplicar el flujo") } }
  const toggle = async (flow: Flow) => { await fetch(`/api/flows/${flow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !flow.active }) }); void load() }
  const remove = async (id: string) => { if (!confirm("¿Eliminar este flujo?")) return; const response = await fetch(`/api/flows/${id}`, { method: "DELETE" }); if (!response.ok) return toast.error("No se pudo eliminar"); void load() }
  return <main className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-end justify-between"><div><h1 className="text-2xl font-bold">Flujos</h1><p className="text-sm text-muted-foreground">Grafos de modificadores, condiciones y paquetes.</p></div><Button onClick={create}>Crear flujo</Button></div>{loading ? <p className="text-muted-foreground">Cargando…</p> : <div className="overflow-hidden rounded-xl border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">Flujo</th><th className="p-3">Scope</th><th className="p-3">Targets</th><th className="p-3">Prioridad</th><th className="p-3">Nodos</th><th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody>{flows.map((flow) => <tr key={flow.id} className="border-b last:border-0"><td className="p-3 font-medium"><button className="text-left hover:underline" onClick={() => router.push(`/flows/${flow.id}`)}>{flow.name}</button></td><td className="p-3"><Badge variant="outline">{flow.scopeKind}</Badge></td><td className="max-w-64 p-3 text-xs">{flow.targets.map((target) => `${target.mode === "exclude" ? "−" : "+"} ${target.targetName}`).join(", ") || "Todos (global sin includes)"}</td><td className="p-3">{flow.priority}</td><td className="p-3">{flow.nodeCount}</td><td className="p-3"><button className={flow.active ? "text-emerald-600" : "text-muted-foreground"} onClick={() => toggle(flow)}>{flow.active ? "Activo" : "Inactivo"}</button></td><td className="space-x-2 p-3 text-right"><button className="text-primary" onClick={() => duplicate(flow.id)}>Duplicar</button><button className="text-destructive" onClick={() => remove(flow.id)}>Borrar</button></td></tr>)}</tbody></table>{flows.length === 0 && <p className="p-8 text-center text-muted-foreground">Todavía no hay flujos.</p>}</div>}</main>
}
