"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { EmployeeNumpadModal } from "@/components/employee-numpad-modal";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  registerId: string;
}

export function DepositModal({
  open,
  onClose,
  onSuccess,
  registerId,
}: DepositModalProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(num);

  function handleDeposit() {
    const amountNum = parseFloat(amount);

    if (!amountNum || amountNum <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }

    // Trazabilidad: exige identificar al empleado antes de registrar el
    // ingreso (antes esto mandaba un employeeId de prueba hardcodeado).
    setPinModalOpen(true);
  }

  async function submitDeposit(employeeId: string) {
    const amountNum = parseFloat(amount);
    setLoading(true);

    try {
      const res = await fetch(`/api/cash-register/${registerId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          userId: employeeId,
          description: description.trim() || "Ingreso a caja",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast.success(`Ingreso registrado: ${formatCurrency(amountNum)}`);
      onSuccess();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error registrando ingreso");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setAmount("");
    setDescription("");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingreso a Caja</DialogTitle>
            <DialogDescription>
              Registra un depósito de efectivo a la caja
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Monto a Ingresar *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-2 text-xl font-bold"
                autoFocus
              />
              {amount && parseFloat(amount) > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(parseFloat(amount))}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Motivo del Ingreso</Label>
              <Textarea
                id="description"
                placeholder="Ej: Fondo adicional, devolución..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleDeposit} disabled={loading}>
              {loading ? "Procesando..." : "Registrar Ingreso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmployeeNumpadModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={(employeeId) => {
          setPinModalOpen(false);
          submitDeposit(employeeId);
        }}
        title="Identificación de Empleado"
        subtitle="Para registrar el ingreso"
      />
    </>
  );
}
