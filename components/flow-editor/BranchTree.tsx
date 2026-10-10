"use client"

import { ArrowBendDownRight, ArrowElbowDownRight, FlagCheckered, GitBranch, Plus, Target, TreeStructure, Warning } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { optionName, type TreeBranch, type TreeContext, type TreeStep } from "./model"
import type { EditorNode } from "./types"

export type Selection = { kind: "applies" } | { kind: "step"; nodeId: string } | { kind: "test" } | null

interface Props {
  trunk: TreeStep[]
  orphans: EditorNode[]
  context: TreeContext
  selection: Selection
  invalidNodeIds: Set<string>
  appliesSummary: string
  isSubflow: boolean
  onSelect: (selection: Selection) => void
  onAddAfter: (nodeId: string | null) => void
  onOpenSubflow: (flowId: string) => void
}

// One hue per depth, so a sub-branch is recognisable at a glance and stays the
// same colour for as long as you are working inside it.
const hues = [
  { rail: "bg-primary/25", dot: "bg-primary", ring: "ring-primary/50", text: "text-primary", curve: "border-primary/35" },
  { rail: "bg-amber-500/30", dot: "bg-amber-500", ring: "ring-amber-500/60", text: "text-amber-600 dark:text-amber-400", curve: "border-amber-500/45" },
  { rail: "bg-sky-500/30", dot: "bg-sky-500", ring: "ring-sky-500/60", text: "text-sky-600 dark:text-sky-400", curve: "border-sky-500/45" },
  { rail: "bg-fuchsia-500/30", dot: "bg-fuchsia-500", ring: "ring-fuchsia-500/60", text: "text-fuchsia-600 dark:text-fuchsia-400", curve: "border-fuchsia-500/45" },
]
const hue = (depth: number) => hues[depth % hues.length]

const press = "transition-[transform,box-shadow,background-color,opacity] duration-100 ease-out active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100"

function containsNode(step: TreeStep, nodeId: string): boolean {
  return step.node.id === nodeId || step.branches.some((branch) => branch.target.kind === "steps" && branch.target.steps.some((child) => containsNode(child, nodeId)))
}

function stepMeta(node: EditorNode): string {
  if (node.options.length === 0) return "Paso invisible · decide el camino solo"
  const required = node.minSelections > 0
  if (node.selectMode === "single") return required ? "Elige una · obligatoria" : "Elige una · opcional"
  const range = node.maxSelections === null ? `${node.minSelections}+` : node.minSelections === node.maxSelections ? `${node.minSelections}` : `${node.minSelections}–${node.maxSelections}`
  return `Elige varias (${range})`
}

export function BranchTree({ trunk, orphans, context, selection, invalidNodeIds, appliesSummary, isSubflow, onSelect, onAddAfter, onOpenSubflow }: Props) {
  const selectedId = selection?.kind === "step" ? selection.nodeId : null

  const renderSteps = (steps: TreeStep[], depth: number, allowAdd: boolean) => (
    <ol className="relative">
      <span aria-hidden className={cn("absolute bottom-3 left-[11px] top-3 w-0.5 rounded-full", hue(depth).rail)} />
      {steps.map((step) => {
        const selected = step.node.id === selectedId
        const onPath = selectedId === null || containsNode(step, selectedId)
        return (
          <li key={step.node.id} className="flow-row-in relative pb-1 pl-8">
            <span
              aria-hidden
              className={cn(
                "absolute left-[5px] top-[18px] size-3.5 rounded-full ring-4 ring-background transition-transform duration-200 motion-reduce:transition-none",
                hue(depth).dot,
                selected && "scale-125",
              )}
            />
            <button
              type="button"
              onClick={() => onSelect({ kind: "step", nodeId: step.node.id })}
              aria-current={selected ? "step" : undefined}
              className={cn(
                "w-full rounded-2xl border bg-card px-3.5 py-3 text-left shadow-xs",
                press,
                selected ? cn("ring-2 shadow-md", hue(depth).ring) : "hover:bg-muted/40",
                !onPath && "opacity-55",
                invalidNodeIds.has(step.node.id) && "border-destructive/60",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("truncate text-[15px] font-semibold tracking-[-0.01em]", step.node.options.length === 0 && "italic text-muted-foreground")}>
                  {step.node.title || "Paso sin título"}
                </span>
                {invalidNodeIds.has(step.node.id) && <Warning className="size-4 shrink-0 text-destructive" weight="fill" />}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{stepMeta(step.node)}</span>
              {step.node.options.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1">
                  {step.node.options.slice(0, 5).map((option) => (
                    <span key={option.id} className="max-w-[11rem] truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {optionName(option, context.products, context.categoryName)}
                    </span>
                  ))}
                  {step.node.options.length > 5 && <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{step.node.options.length - 5}</span>}
                </span>
              )}
            </button>

            {step.branches.map((branch) => renderBranch(branch, depth + 1, !onPath))}

            {allowAdd && (
              <button
                type="button"
                onClick={() => onAddAfter(step.node.id)}
                className={cn("group/add my-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted-foreground/0 hover:text-muted-foreground focus-visible:text-muted-foreground", press)}
                aria-label={`Agregar paso después de ${step.node.title}`}
              >
                <span className="h-px flex-1 bg-border opacity-0 group-hover/add:opacity-100" />
                <Plus className="size-3.5" weight="bold" /> paso aquí
                <span className="h-px flex-1 bg-border opacity-0 group-hover/add:opacity-100" />
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )

  // A plain function, not a component: a component declared here would get a new
  // identity every render and replay its entrance animation on every keystroke.
  function renderBranch(branch: TreeBranch, depth: number, dim: boolean) {
    const color = hue(depth)
    const Icon = branch.tone === "subflow" ? TreeStructure : branch.tone === "rule" ? ArrowElbowDownRight : GitBranch
    return (
      <div key={branch.key} className={cn("flow-row-in relative ml-6 mt-2", dim && "opacity-55")}>
        <span aria-hidden className={cn("absolute -left-[13px] -top-2 h-6 w-4 rounded-bl-xl border-b-2 border-l-2", color.curve)} />
        <div className={cn("mb-1.5 ml-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium", color.text)}>
          <Icon className="size-3.5 shrink-0" weight="bold" />
          <span className="truncate">{branch.label}</span>
        </div>
        {branch.target.kind === "steps" && (
          <>
            {renderSteps(branch.target.steps, depth, false)}
            <p className="ml-8 flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
              <ArrowBendDownRight className="size-3.5" />
              {branch.target.rejoinTitle ? `regresa a «${branch.target.rejoinTitle}»` : "termina este flujo"}
            </p>
          </>
        )}
        {branch.target.kind === "jump" && (
          <p className="ml-3 flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
            <ArrowBendDownRight className="size-3.5" /> salta a «{branch.target.title}»
          </p>
        )}
        {branch.target.kind === "end" && (
          <p className="ml-3 flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
            <FlagCheckered className="size-3.5" /> termina este flujo
          </p>
        )}
        {branch.target.kind === "subflow" &&
          (branch.target.flowId ? (
            <button
              type="button"
              onClick={() => onOpenSubflow((branch.target as { flowId: string }).flowId)}
              className={cn("ml-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-2 rounded-xl border border-dashed bg-card px-3 py-2 text-left text-sm hover:bg-muted/40", press)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{branch.target.names.join(", ")}</span>
                <span className="block text-xs text-muted-foreground">Subflujo propio de este flujo</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">Abrir</span>
            </button>
          ) : (
            <p className="ml-2 rounded-xl border border-dashed px-3 py-2 text-sm">
              <span className="font-medium">{branch.target.names.join(" + ")}</span>
              <span className="block text-xs text-muted-foreground">Flujo que ya trae ese platillo</span>
            </p>
          ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {!isSubflow && (
        <button
          type="button"
          onClick={() => onSelect({ kind: "applies" })}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left shadow-xs",
            press,
            selection?.kind === "applies" ? "ring-2 ring-primary/50 shadow-md" : "hover:bg-muted/40",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Target className="size-4" weight="bold" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold tracking-[-0.01em]">¿En qué platillos sale?</span>
            <span className="block truncate text-xs text-muted-foreground">{appliesSummary}</span>
          </span>
        </button>
      )}

      {trunk.length === 0 ? (
        <button type="button" onClick={() => onAddAfter(null)} className={cn("w-full rounded-2xl border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40", press)}>
          <Plus className="mx-auto mb-1 size-5" weight="bold" />
          Agregar el primer paso
        </button>
      ) : (
        renderSteps(trunk, 0, true)
      )}

      {trunk.length > 0 && (
        <p className="flex items-center gap-2 pl-1.5 text-xs text-muted-foreground">
          <FlagCheckered className="size-4" /> Fin{isSubflow ? " · regresa al flujo principal" : " · sigue el siguiente flujo del platillo, si tiene"}
        </p>
      )}

      {orphans.length > 0 && (
        <section className="rounded-2xl border border-dashed border-amber-500/50 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Warning className="size-4" weight="fill" /> Pasos sin conectar
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">Nadie llega a estos pasos. Conéctalos desde «Qué sigue» de otro paso o bórralos.</p>
          <div className="space-y-1.5">
            {orphans.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelect({ kind: "step", nodeId: node.id })}
                className={cn("w-full rounded-xl border bg-card px-3 py-2 text-left text-sm", press, node.id === selectedId && "ring-2 ring-amber-500/60")}
              >
                {node.title || "Paso sin título"}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
