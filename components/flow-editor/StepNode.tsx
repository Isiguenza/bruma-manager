"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Badge } from "@/components/ui/badge"
import type { EditorNode } from "./types"

type StepFlowNode = Node<{ node: EditorNode; invalid?: boolean }, "step">

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  const { node, invalid } = data
  const stepNode = node.options.length === 0
  return <div className={`min-w-60 rounded-xl border bg-card shadow-sm ${invalid ? "border-destructive ring-2 ring-destructive/30" : selected ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
    <Handle type="target" position={Position.Top} className="!size-3 !border-2 !border-background !bg-primary" />
    <div className="p-3">
      <div className="mb-2 flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{node.title || "Nodo sin título"}</p>{node.subtitle && <p className="truncate text-xs text-muted-foreground">{node.subtitle}</p>}</div>{node.isEntry && <Badge className="shrink-0 text-[10px]">Entrada</Badge>}</div>
      {stepNode ? <p className="rounded-md bg-violet-500/10 px-2 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">Nodo de paso · invisible para el mesero</p> : <div className="space-y-1"><p className="text-xs text-muted-foreground">{node.selectMode === "multi" ? "Selección múltiple" : "Selección única"} · {node.options.length} opción(es)</p>{node.options.slice(0, 3).map((option) => <p key={option.id} className="truncate text-xs">• {option.label || "Sin etiqueta"}</p>)}{node.options.length > 3 && <p className="text-xs text-muted-foreground">+{node.options.length - 3} más</p>}</div>}
    </div>
    <Handle type="source" position={Position.Bottom} className="!size-3 !border-2 !border-background !bg-primary" />
  </div>
})
