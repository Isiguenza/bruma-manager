"use client"

import { Check } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export interface Chip {
  id: string
  label: string
  detail?: string
  on: boolean
}

export interface ChipTile {
  id: string
  title: string
  detail?: string
  /** A tile without chips is a single square; with chips it is on while any chip is on. */
  on: boolean
  chips: Chip[]
}

interface Props {
  tiles: ChipTile[]
  onToggleTile: (tileId: string) => void
  onToggleChip: (tileId: string, chipId: string) => void
  onSetAll?: (on: boolean) => void
  /** What "on" means here, e.g. "aparecen" or "llevan paquete". */
  noun: string
  empty?: string
}

// Feedback lands on press, not on release, and nothing here outlives 120ms.
const press = "transition-[transform,background-color,border-color,color,opacity] duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/**
 * The "cuadritos": everything a choice expands into (products of a category,
 * variants of a product) laid out as squares that start on. Tapping one takes it
 * out. One component so the same gesture means the same thing everywhere.
 */
export function ChipGrid({ tiles, onToggleTile, onToggleChip, onSetAll, noun, empty }: Props) {
  if (tiles.length === 0) return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{empty ?? "No hay nada que elegir aquí."}</p>
  const total = tiles.reduce((sum, tile) => sum + Math.max(tile.chips.length, 1), 0)
  const active = tiles.reduce((sum, tile) => sum + (tile.chips.length ? tile.chips.filter((chip) => chip.on).length : tile.on ? 1 : 0), 0)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <strong className="font-semibold tabular-nums text-foreground">{active}</strong> de <span className="tabular-nums">{total}</span> {noun}
        </span>
        {onSetAll && (
          <span className="flex gap-1">
            <button type="button" className={cn("rounded-md px-2 py-1 hover:bg-muted", press)} onClick={() => onSetAll(true)}>
              Todos
            </button>
            <button type="button" className={cn("rounded-md px-2 py-1 hover:bg-muted", press)} onClick={() => onSetAll(false)}>
              Ninguno
            </button>
          </span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className={cn(
              "rounded-xl border p-2 transition-colors duration-150",
              tile.on ? "border-primary/40 bg-primary/[0.06]" : "border-dashed border-border bg-transparent",
            )}
          >
            <button
              type="button"
              aria-pressed={tile.on}
              onClick={() => onToggleTile(tile.id)}
              className={cn("flex w-full items-start gap-2 rounded-lg p-1 text-left", press)}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-100",
                  tile.on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {tile.on && <Check className="size-3" weight="bold" />}
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate text-sm font-medium leading-tight", !tile.on && "text-muted-foreground line-through decoration-muted-foreground/40")}>{tile.title}</span>
                {tile.detail && <span className="block truncate text-[11px] text-muted-foreground">{tile.detail}</span>}
              </span>
            </button>
            {tile.chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 pl-1">
                {tile.chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={chip.on}
                    onClick={() => onToggleChip(tile.id, chip.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs leading-none",
                      press,
                      chip.on ? "border-primary/50 bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/40 text-muted-foreground line-through decoration-muted-foreground/40",
                    )}
                  >
                    {chip.label}
                    {chip.detail && <span className="ml-1 opacity-70">{chip.detail}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
