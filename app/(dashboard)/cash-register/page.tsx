"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { LockSimpleOpen, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CashRegister } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { formatDateTime, formatTime } from "@/lib/time";
import { CajaView, type CajaOrder } from "./_components/caja-view";
import { CorteView } from "./_components/corte-view";
import { ResumenView } from "./_components/resumen-view";
import { CloseRegisterDialog } from "./_components/close-register-dialog";
import { CashMovementDialog, type MovementKind } from "./_components/cash-movement-dialog";
import { type CorteData, money, printServerUrl } from "./_components/shared";

type Section = "caja" | "corte" | "resumen";
const SECTIONS: [Section, string][] = [
  ["caja", "Caja"],
  ["corte", "Corte"],
  ["resumen", "Resumen"],
];

// Mismo ritmo que el respaldo de la Caja del iPad: los cobros de los iPads
// llegan sin recargar.
const REFRESH_MS = 30_000;

/**
 * Caja del dashboard — igual a la del iPad: selector Caja · Corte · Resumen,
 * y TODOS los números salen del Corte (`/api/cash-register/:id/corte`, espejo
 * del que usa el POS), no de cálculos propios de la página.
 */
export default function CashRegisterPage() {
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [section, setSection] = useState<Section>("caja");

  const [corte, setCorte] = useState<CorteData | null>(null);
  const [paidOrders, setPaidOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Abrir caja
  const [openDialogVisible, setOpenDialogVisible] = useState(false);
  const [initialCash, setInitialCash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Cierre y movimientos
  const [closeOpen, setCloseOpen] = useState(false);
  const [movement, setMovement] = useState<MovementKind | null>(null);

  // Auditoría: quién comandó/cobró qué, a qué orden, y cuándo.
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Eliminar orden
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);

  // Editar método de pago / propina
  const [editOrder, setEditOrder] = useState<any>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editTip, setEditTip] = useState("0");
  const [editTipMethod, setEditTipMethod] = useState("cash");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) setCurrentUser(await userRes.json());

      const registerRes = await fetch("/api/cash-register/current", { cache: "no-store" });
      if (registerRes.ok) setRegister(await registerRes.json());
      else if (registerRes.status === 404) setRegister(null);

      // Trazabilidad: nombres para mostrar "quién" (orders.userId solo trae el id).
      const employeesRes = await fetch("/api/employees");
      if (employeesRes.ok) {
        const employees = await employeesRes.json();
        setEmployeeNames(Object.fromEntries(employees.map((e: any) => [e.id, e.name])));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRegisterData = useCallback(async (registerId: string) => {
    setRefreshing(true);
    try {
      const [corteRes, ordersRes] = await Promise.all([
        fetch(`/api/cash-register/${registerId}/corte`, { cache: "no-store" }),
        fetch(`/api/orders/history?registerId=${registerId}`, { cache: "no-store" }),
      ]);
      if (corteRes.ok) setCorte(await corteRes.json());
      if (ordersRes.ok) setPaidOrders(await ordersRes.json());
    } catch (error) {
      console.error("Error loading register data:", error);
      toast.error("Error cargando la caja");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!register) return;
    loadRegisterData(register.id);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadRegisterData(register.id);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [register, loadRegisterData]);

  const reload = useCallback(() => {
    if (register) loadRegisterData(register.id);
  }, [register, loadRegisterData]);

  // MARK: - Abrir caja

  function initiateOpen() {
    const amount = parseFloat(initialCash);
    if (!initialCash || isNaN(amount) || amount <= 0) {
      toast.error("Ingresa un monto inicial válido");
      return;
    }
    if (!currentUser) {
      toast.error("No hay usuario autenticado");
      return;
    }
    // Usa el usuario autenticado del dashboard como quien abre.
    handleOpen(currentUser.id);
  }

  async function handleOpen(employeeId: string) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialCash: parseFloat(initialCash), employeeId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Caja abierta");
      setOpenDialogVisible(false);
      setInitialCash("");
      loadData();
    } catch {
      toast.error("Error abriendo caja");
    } finally {
      setSubmitting(false);
    }
  }

  // MARK: - Auditoría

  async function handleShowAudit() {
    setAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/audit-log?limit=200");
      if (res.ok) setAuditEntries(await res.json());
    } catch (error) {
      console.error("Error loading audit log:", error);
      toast.error("Error cargando auditoría");
    } finally {
      setLoadingAudit(false);
    }
  }

  // MARK: - Órdenes

  async function handleConfirmDelete() {
    if (!orderToDelete || !deleteReason.trim()) {
      toast.error("Debes ingresar un motivo");
      return;
    }
    setDeletingOrder(true);
    try {
      const res = await fetch(`/api/orders/${orderToDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason }),
      });
      if (!res.ok) throw new Error("Error eliminando orden");
      toast.success("Orden eliminada");
      setOrderToDelete(null);
      setDeleteReason("");
      reload();
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error("Error eliminando orden");
    } finally {
      setDeletingOrder(false);
    }
  }

  const isEditableOrder = (order: any) =>
    order.source !== "web" &&
    order.paymentMethod !== "online" &&
    order.paymentMethod !== "platform_delivery" &&
    !(order.payments && order.payments.length > 0);

  function handleEditOrderClick(order: any) {
    setEditOrder(order);
    setEditPaymentMethod(order.paymentMethod || "cash");
    setEditTip(String(parseFloat(order.tip || "0")));
    setEditTipMethod(order.tipPaymentMethod || order.paymentMethod || "cash");
  }

  async function handleSaveOrderEdit() {
    if (!editOrder) return;
    const tipNum = parseFloat(editTip || "0");
    if (isNaN(tipNum) || tipNum < 0) {
      toast.error("Propina inválida");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${editOrder.id}/payment-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: editPaymentMethod,
          tip: tipNum.toFixed(2),
          tipPaymentMethod: tipNum > 0 ? editTipMethod : editPaymentMethod,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error");
      }
      toast.success("Orden actualizada");
      setEditOrder(null);
      reload();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar la orden");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleReprintOrder(order: any) {
    setReprintingOrderId(order.id);
    try {
      const discountData =
        order.discountAmount && parseFloat(order.discountAmount) > 0
          ? { name: order.discountName || "Descuento", amount: Math.round(parseFloat(order.discountAmount)) }
          : undefined;
      const printData = {
        customerName: order.customerName || "",
        orderNumber: order.orderNumber?.toString() || "N/A",
        items: {
          A1: (order.items || []).map((item: any) => ({
            name: item.productName,
            qty: item.quantity,
            total: parseFloat(item.subtotal || "0"),
          })),
        },
        subtotal: parseFloat(order.subtotal || "0"),
        tip: parseFloat(order.tip || "0"),
        total: parseFloat(order.total || "0"),
        tableNumber: order.tableNumber || "",
        isDelivery: !order.tableId,
        paymentMethod: order.paymentMethod,
        discount: discountData,
      };
      const response = await fetch(`${printServerUrl()}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printData),
      });
      if (!response.ok) throw new Error("Error al reimprimir");
      toast.success("Ticket reimpreso");
    } catch (error) {
      console.error("Error reprinting:", error);
      toast.error("Error al reimprimir ticket");
    } finally {
      setReprintingOrderId(null);
    }
  }

  // MARK: - Render

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!register) {
    return (
      <div className="space-y-6">
        <PageHeader title="Caja" description="No hay una caja abierta" />
        <Card className="mx-auto flex max-w-md flex-col items-center gap-2 p-12 text-center">
          <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-muted">
            <LockSimpleOpen className="size-8 text-muted-foreground" weight="fill" />
          </span>
          <h2 className="text-xl font-semibold">No hay caja abierta</h2>
          <p className="text-sm text-muted-foreground">Ábrela para empezar a registrar ventas. Sin caja abierta los iPads no pueden mandar a cocina.</p>
          <Button className="mt-4 rounded-full" size="lg" onClick={() => setOpenDialogVisible(true)}>
            <LockSimpleOpen className="mr-2 size-4" weight="fill" />
            Abrir caja
          </Button>
        </Card>

        <Dialog open={openDialogVisible} onOpenChange={setOpenDialogVisible}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Abrir caja</DialogTitle>
              <DialogDescription>¿Con cuánto efectivo arranca el cajón?</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                initiateOpen();
              }}
              className="space-y-4"
            >
              <Input
                inputMode="decimal"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                placeholder="$0.00"
                className="h-16 rounded-full px-6 text-3xl font-bold tabular-nums"
                autoFocus
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenDialogVisible(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Abriendo…" : "Abrir caja"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const openedBy = register.openedBy ? employeeNames[register.openedBy] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Caja
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-semibold">
              <span className="size-2 rounded-full bg-emerald-500" />
              Abierta
            </span>
          </span>
        }
        description={`Desde ${formatTime(register.openedAt)}${openedBy ? ` · abrió ${openedBy}` : ""}`}
        actions={
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {SECTIONS.map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={cn(
                  "min-w-24 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  section === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {text}
              </button>
            ))}
          </div>
        }
      />

      {section === "caja" && (
        <CajaView
          corte={corte}
          orders={paidOrders as CajaOrder[]}
          employeeNames={employeeNames}
          isEditable={isEditableOrder}
          reprintingId={reprintingOrderId}
          onGoToCorte={() => setSection("corte")}
          onDeposit={() => setMovement("deposit")}
          onWithdraw={() => setMovement("withdrawal")}
          onAudit={handleShowAudit}
          onEditPayment={handleEditOrderClick}
          onReprint={handleReprintOrder}
          onDelete={(o) => {
            setOrderToDelete(o);
            setDeleteReason("");
          }}
        />
      )}

      {section === "corte" &&
        (corte ? (
          <CorteView
            data={corte}
            loading={refreshing}
            onReload={reload}
            employeeNames={employeeNames}
            printedBy={currentUser?.name}
            onCloseRegister={() => setCloseOpen(true)}
          />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="size-8 animate-spin text-muted-foreground" />
          </div>
        ))}

      {section === "resumen" && (
        <ResumenView orders={paidOrders} openedAt={new Date(register.openedAt).toISOString()} printedBy={currentUser?.name} loading={refreshing} onReload={reload} />
      )}

      <CloseRegisterDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        registerId={register.id}
        corte={corte}
        onClosed={() => {
          setCloseOpen(false);
          setSection("caja");
          setCorte(null);
          setPaidOrders([]);
          loadData();
        }}
      />

      {movement && (
        <CashMovementDialog
          kind={movement}
          open={movement !== null}
          onOpenChange={(open) => !open && setMovement(null)}
          registerId={register.id}
          onDone={() => {
            setMovement(null);
            reload();
          }}
        />
      )}

      {/* Auditoría */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Auditoría</DialogTitle>
            <DialogDescription>Quién comandó y quién cobró, con hora y detalle — últimas 200 acciones</DialogDescription>
          </DialogHeader>
          {loadingAudit ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-8 animate-spin" />
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No hay acciones registradas todavía</div>
          ) : (
            <div className="divide-y rounded-xl border">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.action === "order.paid" ? "default" : "outline"}>
                        {entry.action === "order.sent_to_kitchen" ? "Comandó" : entry.action === "order.paid" ? "Cobró" : entry.action}
                      </Badge>
                      <span className="font-medium">{entry.employeeName || "Empleado desconocido"}</span>
                      {entry.details?.orderNumber && <span className="text-sm text-muted-foreground">Orden #{entry.details.orderNumber}</span>}
                      {entry.details?.tableNumber && <span className="text-sm text-muted-foreground">· Mesa {entry.details.tableNumber}</span>}
                    </div>
                    {entry.details?.itemNames && <div className="mt-1 text-sm text-muted-foreground">{entry.details.itemNames.join(", ")}</div>}
                    {entry.details?.paymentMethod && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {entry.details.paymentMethod} · {money(entry.details.total || 0)}
                      </div>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar método de pago y propina */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pago — Orden #{editOrder?.orderNumber}</DialogTitle>
            <DialogDescription>Corrige el método de pago y la propina. El total, el corte y el efectivo esperado se recalculan solos.</DialogDescription>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{money(parseFloat(editOrder.subtotal || "0"))}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total nuevo</span>
                  <span>{money(parseFloat(editOrder.subtotal || "0") + (parseFloat(editTip || "0") || 0))}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="terminal_mercadopago">Terminal</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tip">Propina</Label>
                <Input id="edit-tip" type="number" min="0" step="0.01" value={editTip} onChange={(e) => setEditTip(e.target.value)} />
              </div>
              {parseFloat(editTip || "0") > 0 && (
                <div className="space-y-2">
                  <Label>Método de la propina</Label>
                  <Select value={editTipMethod} onValueChange={setEditTipMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="terminal_mercadopago">Terminal</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOrderEdit} disabled={savingEdit}>
              {savingEdit ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar orden */}
      <Dialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar orden #{orderToDelete?.orderNumber}</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer. Escribe el motivo.</DialogDescription>
          </DialogHeader>
          {orderToDelete && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">
                  {orderToDelete.tableId ? `Mesa ${orderToDelete.tableNumber || ""}` : "Para llevar"} · {formatTime(orderToDelete.createdAt)}
                </span>
                <span className="text-lg font-bold tabular-nums">{money(parseFloat(orderToDelete.total || "0"))}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deleteReason">Motivo *</Label>
                <Textarea
                  id="deleteReason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Ej: Error en el pedido, cliente canceló…"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderToDelete(null)} disabled={deletingOrder}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deletingOrder || !deleteReason.trim()}>
              {deletingOrder ? "Eliminando…" : "Eliminar orden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
