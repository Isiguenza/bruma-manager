"use client";

import { useState } from "react";
import { Armchair, Bag, Clock, MapPin, PencilSimple, Phone, Printer, Trash, User } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateTime, formatTime } from "@/lib/time";
import { METHOD_COLORS, money, printServerUrl } from "../../../cash-register/_components/shared";
import type { HistoryItem } from "./order-items";

export type HistoryOrder = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  tipPaymentMethod: string | null;
  subtotal: string | null;
  tip: string | null;
  total: string | null;
  discountAmount: string | null;
  discountName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryType: string | null;
  deliveryAddress: string | null;
  guestCount: number | null;
  source: string | null;
  notes: string | null;
  tableId: string | null;
  table?: { number?: string | null; name?: string | null } | null;
  employeeName?: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt?: string;
  cashRegisterId: string | null;
  payments?: { id: string; amount: string; paymentMethod: string; status: string }[];
  items?: HistoryItem[];
};

export const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  terminal_mercadopago: "Terminal",
  transfer: "Transferencia",
  split: "Dividido",
  online: "En línea",
  platform_delivery: "Plataforma",
};

export const methodColor = (m?: string | null) =>
  m === "cash"
    ? METHOD_COLORS.cash
    : m === "card" || m === "terminal_mercadopago"
      ? METHOD_COLORS.card
      : m === "transfer"
        ? METHOD_COLORS.transfer
        : m === "online"
          ? METHOD_COLORS.online
          : METHOD_COLORS.platform;

const SOURCE_LABEL: Record<string, string> = {
  pos: "POS",
  web: "Pedido en línea",
  uber_eats: "Uber Eats",
  rappi: "Rappi",
  didi: "DiDi Food",
  employee: "Consumo de empleado",
};

/** Mismas reglas que la Caja: pagos divididos, web y plataforma no se editan aquí. */
export const isEditable = (o: HistoryOrder) =>
  o.paymentStatus === "paid" &&
  o.source !== "web" &&
  o.paymentMethod !== "online" &&
  o.paymentMethod !== "platform_delivery" &&
  !(o.payments && o.payments.length > 0);

export function OrderSidePanel({ order, onChanged, onDeleted }: { order: HistoryOrder; onChanged: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState(order.paymentMethod || "cash");
  const [tip, setTip] = useState(String(parseFloat(order.tip || "0")));
  const [tipMethod, setTipMethod] = useState(order.tipPaymentMethod || order.paymentMethod || "cash");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const tipNum = parseFloat(order.tip || "0");
  const isPaid = order.paymentStatus === "paid";
  const tableLabel = order.table?.name || (order.table?.number ? `Mesa ${order.table.number}` : null);
  const activeItems = (order.items ?? []).filter((i) => !i.voided && !i.parentItemId);

  async function savePayment() {
    const t = parseFloat(tip || "0");
    if (isNaN(t) || t < 0) {
      toast.error("Propina inválida");
      return;
    }
    setSaving(true);
    try {
      // Mismo endpoint que la Caja: recalcula total, transacción y deja auditoría.
      const res = await fetch(`/api/orders/${order.id}/payment-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, tip: t.toFixed(2), tipPaymentMethod: t > 0 ? tipMethod : method }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al actualizar");
      }
      toast.success(`Orden #${order.orderNumber} actualizada`);
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al actualizar la orden");
    } finally {
      setSaving(false);
    }
  }

  async function reprint() {
    setPrinting(true);
    try {
      const discount = order.discountAmount && parseFloat(order.discountAmount) > 0
        ? { name: order.discountName || "Descuento", amount: Math.round(parseFloat(order.discountAmount)) }
        : undefined;
      const res = await fetch(`${printServerUrl()}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: order.customerName || "",
          orderNumber: String(order.orderNumber),
          items: {
            A1: (order.items ?? []).filter((i) => !i.voided).map((i) => ({ name: i.productName, qty: i.quantity, total: parseFloat(i.subtotal || "0") })),
          },
          subtotal: parseFloat(order.subtotal || "0"),
          tip: tipNum,
          total: parseFloat(order.total || "0"),
          tableNumber: order.table?.number || "",
          isDelivery: !order.tableId,
          paymentMethod: order.paymentMethod,
          discount,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ticket reimpreso");
    } catch {
      toast.error("No se pudo reimprimir el ticket");
    } finally {
      setPrinting(false);
    }
  }

  async function remove() {
    if (!deleteReason.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Orden #${order.orderNumber} eliminada`);
      onDeleted();
    } catch {
      toast.error("Error eliminando la orden");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pago */}
      <Section title="Pago">
        {!editing ? (
          <>
            {order.payments && order.payments.length > 0 ? (
              <div className="space-y-1.5">
                {order.payments.map((p) => (
                  <MethodRow key={p.id} method={p.paymentMethod} amount={parseFloat(p.amount)} />
                ))}
                <p className="text-xs text-muted-foreground">Pago dividido en {order.payments.length}</p>
              </div>
            ) : (
              <MethodRow method={order.paymentMethod} amount={parseFloat(order.total || "0") - tipNum} />
            )}
            {tipNum > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Propina ({METHOD_LABEL[order.tipPaymentMethod || order.paymentMethod || ""] ?? "—"})</span>
                <span className="tabular-nums">{money(tipNum)}</span>
              </div>
            )}
            {isEditable(order) ? (
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setEditing(true)}>
                <PencilSimple className="size-4" />
                Editar método y propina
              </Button>
            ) : isPaid ? (
              <p className="text-xs text-muted-foreground">Los pagos divididos, en línea o de plataforma no se editan aquí.</p>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Método de pago</Label>
              <MethodSelect value={method} onChange={setMethod} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-tip" className="text-xs">Propina</Label>
              <Input id="panel-tip" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} />
            </div>
            {parseFloat(tip || "0") > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Método de la propina</Label>
                <MethodSelect value={tipMethod} onChange={setTipMethod} />
              </div>
            )}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <div className="flex justify-between font-semibold">
                <span>Total nuevo</span>
                <span className="tabular-nums">{money(parseFloat(order.subtotal || "0") + (parseFloat(tip || "0") || 0))}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" className="flex-1" onClick={savePayment} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* Mesa / cliente */}
      <Section title={order.tableId ? "Mesa" : "Cliente"}>
        <InfoRow icon={order.tableId ? Armchair : Bag}>
          {tableLabel ?? (order.deliveryType === "delivery" ? "Envío a domicilio" : "Para llevar")}
          {order.guestCount ? <span className="text-muted-foreground"> · {order.guestCount} {order.guestCount === 1 ? "persona" : "personas"}</span> : null}
        </InfoRow>
        {order.customerName && <InfoRow icon={User}>{order.customerName}</InfoRow>}
        {order.customerPhone && (
          <InfoRow icon={Phone}>
            <a href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`} className="hover:underline">
              {order.customerPhone}
            </a>
          </InfoRow>
        )}
        {order.deliveryAddress && <InfoRow icon={MapPin}>{order.deliveryAddress}</InfoRow>}
        {order.notes && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{order.notes}</p>}
      </Section>

      {/* Tiempos */}
      <Section title="Detalles">
        <InfoRow icon={Clock}>
          {formatDateTime(order.createdAt)}
          {order.updatedAt && order.updatedAt !== order.createdAt && (
            <span className="text-muted-foreground"> · últ. cambio {formatTime(order.updatedAt)}</span>
          )}
        </InfoRow>
        {order.employeeName && <InfoRow icon={User}>Atendió {order.employeeName}</InfoRow>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Tag>{SOURCE_LABEL[order.source ?? "pos"] ?? order.source}</Tag>
          <Tag>{activeItems.reduce((s, i) => s + i.quantity, 0)} platillos</Tag>
          {!order.cashRegisterId && <Tag>Sin caja</Tag>}
        </div>
      </Section>

      {/* Acciones */}
      <div className="space-y-2">
        <Button variant="outline" className="w-full gap-2" onClick={reprint} disabled={printing}>
          <Printer className="size-4" weight="fill" />
          {printing ? "Imprimiendo…" : "Reimprimir ticket"}
        </Button>
        {isPaid &&
          (!confirmDelete ? (
            <Button variant="ghost" className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash className="size-4" />
              Eliminar orden
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">¿Eliminar la orden #{order.orderNumber}?</p>
              <p className="text-xs text-muted-foreground">No se puede deshacer y sale del corte. Escribe el motivo.</p>
              <Textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} rows={2} placeholder="Ej: cobrada dos veces" autoFocus />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  Cancelar
                </Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={remove} disabled={deleting || !deleteReason.trim()}>
                  {deleting ? "Eliminando…" : "Eliminar"}
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-xl border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function MethodRow({ method, amount }: { method: string | null; amount: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: methodColor(method) }} />
      <span className="font-medium">{METHOD_LABEL[method ?? ""] ?? method ?? "—"}</span>
      <span className="ml-auto font-semibold tabular-nums">{money(amount)}</span>
    </div>
  );
}

function InfoRow({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground")}>{children}</span>;
}

function MethodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cash">Efectivo</SelectItem>
        <SelectItem value="terminal_mercadopago">Terminal</SelectItem>
        <SelectItem value="card">Tarjeta</SelectItem>
        <SelectItem value="transfer">Transferencia</SelectItem>
      </SelectContent>
    </Select>
  );
}
