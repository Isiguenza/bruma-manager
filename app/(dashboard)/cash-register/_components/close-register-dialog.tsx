"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretDown, LockSimple, Minus, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeNumpadModal } from "@/components/employee-numpad-modal";
import { cn } from "@/lib/utils";
import { CashCheck } from "./corte-view";
import { type CorteData, Eyebrow, InnerCard, cashExpected, money } from "./shared";

type Denomination = { id: string; value: number; coin: boolean };

// Mismas denominaciones que CloseCashRegisterView del iPad.
const DENOMINATIONS: Denomination[] = [
  { id: "b1000", value: 1000, coin: false },
  { id: "b500", value: 500, coin: false },
  { id: "b200", value: 200, coin: false },
  { id: "b100", value: 100, coin: false },
  { id: "b50", value: 50, coin: false },
  { id: "b20", value: 20, coin: false },
  { id: "c20", value: 20, coin: true },
  { id: "c10", value: 10, coin: true },
  { id: "c5", value: 5, coin: true },
  { id: "c2", value: 2, coin: true },
  { id: "c1", value: 1, coin: true },
  { id: "c050", value: 0.5, coin: true },
];
const label = (d: Denomination) => (d.value < 1 ? "50¢" : `$${d.value}`);

// Igual que el servidor (CASH_TOLERANCE, default 10): arriba de esto se pide motivo.
const TOLERANCE = 10;

/**
 * Cierre de caja — réplica de `CloseCashRegisterView` del iPad: conteo por
 * denominación (o total), cuadre en vivo contra el esperado del Corte. Mismo
 * endpoint y body que el modal anterior; quien cierra se identifica con PIN.
 */
export function CloseRegisterDialog({
  open,
  onOpenChange,
  registerId,
  corte,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registerId: string;
  corte: CorteData | null;
  onClosed: () => void;
}) {
  const [mode, setMode] = useState<"denominations" | "total">("denominations");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [totalInput, setTotalInput] = useState("");
  const [vouchers, setVouchers] = useState("");
  const [receipts, setReceipts] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("denominations");
    setCounts({});
    setTotalInput("");
    setVouchers("");
    setReceipts("");
    setShowExtras(false);
    setNotes("");
    setReason("");
  }, [open]);

  const expected = corte ? cashExpected(corte) : 0;
  const counted = useMemo(
    () =>
      mode === "denominations"
        ? DENOMINATIONS.reduce((s, d) => s + d.value * (parseInt(counts[d.id] || "0", 10) || 0), 0)
        : parseFloat(totalInput.replace(/,/g, "")) || 0,
    [mode, counts, totalInput]
  );
  const hasCount = mode === "denominations" ? DENOMINATIONS.some((d) => parseInt(counts[d.id] || "0", 10) > 0) : totalInput.trim() !== "";
  const diff = counted - expected;
  const exceeds = hasCount && Math.abs(diff) > TOLERANCE;
  const canClose = hasCount && (!exceeds || reason.trim().length > 0) && !submitting;

  const setCount = (id: string, value: string) => setCounts((prev) => ({ ...prev, [id]: value.replace(/\D/g, "").slice(0, 4) }));
  const bump = (id: string, by: number) => setCount(id, String(Math.max((parseInt(counts[id] || "0", 10) || 0) + by, 0)));

  /** "Conteo: 12×$500, 3×$200" — se agrega a la nota de cierre, como en el iPad. */
  const countSummary =
    mode === "denominations"
      ? DENOMINATIONS.filter((d) => parseInt(counts[d.id] || "0", 10) > 0)
          .map((d) => `${parseInt(counts[d.id], 10)}×${label(d)}${d.coin && d.value >= 1 ? " mon." : ""}`)
          .join(", ")
      : "";

  async function close(employeeId: string) {
    setPinOpen(false);
    setSubmitting(true);
    try {
      const closureNotes = [notes.trim(), countSummary ? `Conteo: ${countSummary}` : ""].filter(Boolean).join("\n");
      const res = await fetch(`/api/cash-register/${registerId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalCash: counted,
          vouchersTotal: parseFloat(vouchers) || 0,
          receiptsTotal: parseFloat(receipts) || 0,
          closureNotes: closureNotes || null,
          closedBy: employeeId,
          supervisorId: null,
          supervisorReason: exceeds ? reason.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error cerrando caja");
      toast.success("Caja cerrada");
      onClosed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cerrando caja");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle className="text-2xl">Cerrar caja</DialogTitle>
            <DialogDescription>Cuenta el efectivo del cajón</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1fr_360px]">
            {/* Conteo */}
            <div className="min-h-0 space-y-5 overflow-y-auto p-6">
              <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                {(
                  [
                    ["denominations", "Por denominación"],
                    ["total", "Total"],
                  ] as const
                ).map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                      mode === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {mode === "denominations" ? (
                (["Billetes", "Monedas"] as const).map((group) => (
                  <div key={group} className="space-y-2.5">
                    <Eyebrow>{group}</Eyebrow>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {DENOMINATIONS.filter((d) => d.coin === (group === "Monedas")).map((d) => {
                        const n = parseInt(counts[d.id] || "0", 10) || 0;
                        return (
                          <div key={d.id} className={cn("flex h-14 items-center gap-2 rounded-xl border px-3", n > 0 ? "border-primary/40 bg-primary/5" : "bg-background")}>
                            <span className="w-16 text-lg font-bold tabular-nums">{label(d)}</span>
                            <button type="button" onClick={() => bump(d.id, -1)} className="flex size-8 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted" aria-label={`Menos ${label(d)}`}>
                              <Minus className="size-3.5" weight="bold" />
                            </button>
                            <Input
                              inputMode="numeric"
                              value={counts[d.id] ?? ""}
                              onChange={(e) => setCount(d.id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="h-9 w-16 text-center text-lg font-semibold tabular-nums"
                              aria-label={`Cantidad de ${label(d)}`}
                            />
                            <button type="button" onClick={() => bump(d.id, 1)} className="flex size-8 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted" aria-label={`Más ${label(d)}`}>
                              <Plus className="size-3.5" weight="bold" />
                            </button>
                            <span className="ml-auto text-sm text-muted-foreground tabular-nums">{n > 0 ? money(n * d.value) : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="max-w-sm space-y-2">
                  <Eyebrow>Total contado</Eyebrow>
                  <Input
                    inputMode="decimal"
                    value={totalInput}
                    onChange={(e) => setTotalInput(e.target.value)}
                    placeholder="0.00"
                    className="h-14 text-2xl font-bold tabular-nums"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">Si ya contaste el cajón completo, captura solo el total.</p>
                </div>
              )}

              {corte && (
                <div className="space-y-2.5">
                  <Eyebrow>De dónde sale el esperado</Eyebrow>
                  <InnerCard className="max-w-md px-4 py-1.5 text-sm">
                    {[
                      ["", "Fondo inicial", corte.register.initialCash],
                      ["+", "Ventas en efectivo", corte.sales.cash],
                      ["+", "Propinas en efectivo", corte.tips.cash],
                      ["+", "Depósitos", corte.movements.deposits.total],
                      ["−", "Sangrías", corte.movements.withdrawals.total],
                    ].map(([sign, text, value]) => (
                      <div key={text as string} className="flex gap-2 py-1.5">
                        <span className="w-3.5 text-muted-foreground">{sign}</span>
                        <span className="text-muted-foreground">{text}</span>
                        <span className="ml-auto tabular-nums">{money(value as number)}</span>
                      </div>
                    ))}
                    <div className="flex border-t py-2 font-semibold">
                      Esperado
                      <span className="ml-auto tabular-nums">{money(expected)}</span>
                    </div>
                  </InnerCard>
                </div>
              )}
            </div>

            {/* Cuadre */}
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t bg-muted/30 p-6 lg:border-t-0 lg:border-l">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Esperado</span>
                <span className="tabular-nums">{money(expected)}</span>
              </div>
              <div>
                <Eyebrow>Contado</Eyebrow>
                <p className="text-4xl font-extrabold tracking-tight tabular-nums">{money(counted)}</p>
              </div>
              {hasCount ? <CashCheck diff={diff} /> : <p className="py-2 text-sm text-muted-foreground">Empieza a contar para ver si cuadra</p>}

              {exceeds && (
                <div className="space-y-1.5">
                  <Label htmlFor="close-reason">Motivo de la diferencia *</Label>
                  <Textarea id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Queda en la auditoría del cierre" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="close-notes">Nota de cierre</Label>
                <Textarea id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
              </div>

              <button type="button" onClick={() => setShowExtras((v) => !v)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <CaretDown className={cn("size-3.5 transition-transform", showExtras && "rotate-180")} />
                Vales y recibos
              </button>
              {showExtras && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="close-vouchers">Vales</Label>
                    <Input id="close-vouchers" inputMode="decimal" value={vouchers} onChange={(e) => setVouchers(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="close-receipts">Recibos</Label>
                    <Input id="close-receipts" inputMode="decimal" value={receipts} onChange={(e) => setReceipts(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
              )}

              <div className="mt-auto space-y-2 pt-2">
                <Button variant="destructive" className="h-12 w-full rounded-full text-base" disabled={!canClose} onClick={() => setPinOpen(true)}>
                  <LockSimple className="mr-2 size-4" weight="fill" />
                  {submitting ? "Cerrando…" : "Cerrar caja"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {exceeds && !reason.trim() ? "Escribe el motivo de la diferencia para cerrar" : "Te pediremos tu PIN para registrar quién cerró"}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EmployeeNumpadModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSuccess={(id) => close(id)}
        title="¿Quién cierra la caja?"
        subtitle="Ingresa tu PIN"
      />
    </>
  );
}
