"use client";

import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateKeyCDMX, formatDayShort, fromDateKey } from "@/lib/time";

export type PeriodKey = "week" | "lastWeek" | "month" | "lastMonth" | "custom";
export type Period = { key: PeriodKey; dateFrom: string; dateTo: string };

const PRESETS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "week", label: "Esta semana" },
  { key: "lastWeek", label: "Semana pasada" },
  { key: "month", label: "Este mes" },
  { key: "lastMonth", label: "Mes pasado" },
];

/** Suma días a un "YYYY-MM-DD" sin depender de la zona del navegador. */
function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Rangos en días calendario de CDMX (la semana empieza en lunes). El servidor
 * convierte cada día a [00:00, 23:59:59.999] de CDMX (`cdmxDayStart/End`).
 */
export function periodRange(key: Exclude<PeriodKey, "custom">, today = dateKeyCDMX()): Period {
  const d = new Date(`${today}T12:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  const monday = addDaysKey(today, -mondayOffset);
  const [y, m] = today.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  switch (key) {
    case "week":
      return { key, dateFrom: monday, dateTo: today };
    case "lastWeek":
      return { key, dateFrom: addDaysKey(monday, -7), dateTo: addDaysKey(monday, -1) };
    case "month":
      return { key, dateFrom: firstOfMonth, dateTo: today };
    case "lastMonth": {
      const lastDay = addDaysKey(firstOfMonth, -1);
      return { key, dateFrom: `${lastDay.slice(0, 7)}-01`, dateTo: lastDay };
    }
  }
}

export function periodLabel(p: Period) {
  return p.dateFrom === p.dateTo
    ? formatDayShort(fromDateKey(p.dateFrom))
    : `${formatDayShort(fromDateKey(p.dateFrom))} – ${formatDayShort(fromDateKey(p.dateTo))}`;
}

/** Lee `?from=YYYY-MM-DD&to=YYYY-MM-DD` (link desde la lista al detalle). */
export function periodFromUrl(): Period | null {
  if (typeof window === "undefined") return null;
  const qs = new URLSearchParams(window.location.search);
  const from = qs.get("from");
  const to = qs.get("to");
  const valid = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return valid(from) && valid(to) ? { key: "custom", dateFrom: from!, dateTo: to! } : null;
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: value.dateFrom, to: value.dateTo });

  return (
    <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(periodRange(p.key))}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value.key === p.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft({ from: value.dateFrom, to: value.dateTo });
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              value.key === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarBlank className="size-4" />
            {value.key === "custom" ? periodLabel(value) : "Personalizado"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="period-from" className="text-xs">Desde</Label>
              <Input id="period-from" type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to" className="text-xs">Hasta</Label>
              <Input id="period-to" type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!draft.from || !draft.to || draft.from > draft.to}
            onClick={() => {
              onChange({ key: "custom", dateFrom: draft.from, dateTo: draft.to });
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
