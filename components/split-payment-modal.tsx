"use client";

import { useState, useEffect } from "react";
import { getApiUrl } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Money, CreditCard, ArrowsLeftRight, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Payment {
  id: string;
  amount: string;
  paymentMethod: "cash" | "terminal_mercadopago" | "card" | "transfer";
  status: "pending" | "completed" | "failed";
}

interface SplitPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orderId: string;
  total: number;
}

export function SplitPaymentModal({
  open,
  onClose,
  onSuccess,
  orderId,
  total,
}: SplitPaymentModalProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "terminal_mercadopago" | "card" | "transfer">("cash");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPayments();
    }
  }, [open]);

  async function fetchPayments() {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/payments`);
      if (res.ok) {
        setPayments(await res.json());
      }
    } catch {
      toast.error("Error cargando pagos");
    } finally {
      setLoading(false);
    }
  }

  async function addPayment() {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Monto inválido");
      return;
    }

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const remaining = total - totalPaid;

    if (amountNum > remaining) {
      toast.error(`El monto excede lo pendiente (${formatCurrency(remaining)})`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/add-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          paymentMethod: method,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success("Pago agregado");
      setAmount("");
      fetchPayments();
    } catch {
      toast.error("Error agregando pago");
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePayment(paymentId: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}/payments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });

      if (!res.ok) throw new Error();

      toast.success("Pago eliminado");
      fetchPayments();
    } catch {
      toast.error("Error eliminando pago");
    }
  }

  async function finalizeSplitPayment() {
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    if (totalPaid < total) {
      toast.error("Aún falta pagar");
      return;
    }

    setSubmitting(true);
    try {
      // Mark all payments as completed
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "cash", // Mixed payment
          splitPayment: true,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success("Pago completado");
      onSuccess();
      onClose();
    } catch {
      toast.error("Error finalizando pago");
    } finally {
      setSubmitting(false);
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const remaining = total - totalPaid;
  const isComplete = remaining <= 0;

  const methodLabels = {
    cash: "Efectivo",
    terminal_mercadopago: "Terminal",
    card: "Tarjeta",
    transfer: "Transferencia",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dividir Cuenta</DialogTitle>
          <DialogDescription>
            Total: {formatCurrency(total)} · Pagado: {formatCurrency(totalPaid)} · Resta: {formatCurrency(remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add Payment */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm">Agregar Pago</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isComplete}
                />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isComplete}
                >
                  <option value="cash">Efectivo</option>
                  <option value="terminal_mercadopago">Terminal</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
            </div>
            <Button
              onClick={addPayment}
              disabled={submitting || isComplete}
              className="w-full"
              size="sm"
            >
              Agregar Pago
            </Button>
          </div>

          {/* Payments List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Pagos Agregados</h3>
            <ScrollArea className="h-48 rounded-md border">
              {loading ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  Cargando...
                </div>
              ) : payments.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  No hay pagos agregados
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg border p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {payment.paymentMethod === "cash" ? (
                          <Money className="size-4 text-green-600" />
                        ) : (
                          <CreditCard className="size-4 text-blue-600" />
                        )}
                        <div>
                          <p className="font-medium">{formatCurrency(parseFloat(payment.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {methodLabels[payment.paymentMethod]}
                          </p>
                        </div>
                      </div>
                      {payment.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePayment(payment.id)}
                        >
                          <Trash className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total de la orden</span>
              <span className="font-medium">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total pagado</span>
              <span className="font-medium text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Resta</span>
              <span className={remaining > 0 ? "text-red-600" : "text-green-600"}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={finalizeSplitPayment}
            disabled={!isComplete || submitting}
          >
            {submitting ? "Finalizando..." : "Finalizar Pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
