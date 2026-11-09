"use client";

import { useEffect, useState } from "react";
import { ArrowCircleDown, ArrowCircleUp } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeNumpadModal } from "@/components/employee-numpad-modal";
import { cn } from "@/lib/utils";
import { money } from "./shared";

export type MovementKind = "deposit" | "withdrawal";

// Mismos motivos rápidos que CashMovementSheet del iPad.
const CONFIG = {
  deposit: {
    title: "Depósito a caja",
    subtitle: "Entra efectivo al cajón",
    icon: ArrowCircleDown,
    color: "#16a34a",
    reasons: ["Cambio", "Fondo extra", "Reposición"],
    fallback: "Ingreso a caja",
    button: "Registrar depósito",
    endpoint: "deposit",
  },
  withdrawal: {
    title: "Sangría de caja",
    subtitle: "Sale efectivo del cajón",
    icon: ArrowCircleUp,
    color: "#ea580c",
    reasons: ["Proveedor", "Insumos", "Gas", "Propinas", "Caja fuerte"],
    fallback: "Retiro de caja",
    button: "Registrar sangría",
    endpoint: "withdraw",
  },
} as const;

/** Depósito / sangría. Mismo endpoint y body que los modales anteriores; quien lo hace se identifica con PIN. */
export function CashMovementDialog({
  kind,
  open,
  onOpenChange,
  registerId,
  onDone,
}: {
  kind: MovementKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registerId: string;
  onDone: () => void;
}) {
  const cfg = CONFIG[kind];
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setReason(null);
      setDetail("");
    }
  }, [open]);

  const value = parseFloat(amount.replace(/,/g, ""));
  const valid = Number.isFinite(value) && value > 0;

  async function submit(employeeId: string) {
    setPinOpen(false);
    setSubmitting(true);
    try {
      const description = [reason, detail.trim() || null].filter(Boolean).join(" · ") || cfg.fallback;
      const res = await fetch(`/api/cash-register/${registerId}/${cfg.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, userId: employeeId, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo registrar");
      }
      toast.success(`${kind === "deposit" ? "Depósito" : "Sangría"} registrado: ${money(value)}`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar");
    } finally {
      setSubmitting(false);
    }
  }

  const Icon = cfg.icon;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${cfg.color}26`, color: cfg.color }}>
              <Icon className="size-6" weight="fill" />
            </span>
            <div>
              <DialogTitle>{cfg.title}</DialogTitle>
              <DialogDescription>{cfg.subtitle}</DialogDescription>
            </div>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) setPinOpen(true);
            }}
          >
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0.00"
              className="h-16 rounded-full px-6 text-3xl font-bold tabular-nums"
              autoFocus
            />

            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground">Motivo</p>
              <div className="flex flex-wrap gap-2">
                {cfg.reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(reason === r ? null : r)}
                    className={cn(
                      "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
                      reason === r ? "border-primary bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Detalle (opcional)" className="h-11 rounded-full px-5" />
            </div>

            <Button type="submit" className="h-12 w-full rounded-full text-base" disabled={!valid || submitting}>
              {submitting ? "Registrando…" : valid ? `${cfg.button} · ${money(value)}` : cfg.button}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <EmployeeNumpadModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSuccess={(id) => submit(id)}
        title={kind === "deposit" ? "¿Quién deposita?" : "¿Quién hace la sangría?"}
        subtitle="Ingresa tu PIN"
      />
    </>
  );
}
