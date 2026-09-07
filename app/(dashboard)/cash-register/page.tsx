"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import {
  CurrencyDollar,
  LockOpen,
  Lock,
  Spinner,
  Receipt,
  ArrowUp,
  ArrowDown,
  Printer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CashRegister } from "@/lib/types";
import { CashRegisterCloseModal } from "@/components/cash-register-close-modal";
import { WithdrawModal } from "@/components/withdraw-modal";
import { DepositModal } from "@/components/deposit-modal";
import { EmployeePinModal } from "@/components/employee-pin-modal";

export default function CashRegisterPage() {
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Open dialog
  const [openDialogVisible, setOpenDialogVisible] = useState(false);
  const [initialCash, setInitialCash] = useState("");
  const [openingEmployeeId, setOpeningEmployeeId] = useState<string | null>(null);
  const [pinModalForOpen, setPinModalForOpen] = useState(false);

  // Advanced modals
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeModalKey, setCloseModalKey] = useState(0);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  
  // Orders history modal
  const [ordersHistoryOpen, setOrdersHistoryOpen] = useState(false);
  const [paidOrders, setPaidOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [actualTotalSales, setActualTotalSales] = useState<number>(0);
  
  // Delete order modal
  const [deleteOrderModalOpen, setDeleteOrderModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);

  // Edit order payment details modal
  const [editOrderOpen, setEditOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editTip, setEditTip] = useState("0");
  const [editTipMethod, setEditTipMethod] = useState("cash");
  const [savingEdit, setSavingEdit] = useState(false);
  const [printingSummary, setPrintingSummary] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Cargar usuario primero
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const user = await userRes.json();
        setCurrentUser(user);
      }

      // Luego cargar registro
      const registerRes = await fetch("/api/cash-register/current");
      if (registerRes.ok) {
        const data = await registerRes.json();
        setRegister(data);
      } else if (registerRes.status === 404) {
        setRegister(null);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }

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
    
    // Usar usuario autenticado del dashboard
    setOpeningEmployeeId(currentUser.id);
    setOpenDialogVisible(false);
    handleOpenPinSuccess(currentUser.id, currentUser.name);
  }

  async function handleOpen() {
    if (!openingEmployeeId) {
      toast.error("Debes identificarte primero");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          initialCash: parseFloat(initialCash),
          employeeId: openingEmployeeId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Caja abierta");
      setOpenDialogVisible(false);
      setInitialCash("");
      setOpeningEmployeeId(null);
      loadData();
    } catch {
      toast.error("Error abriendo caja");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenPinSuccess(empId: string, empName: string) {
    setOpeningEmployeeId(empId);
    setPinModalForOpen(false);
    toast.success(`Identificado: ${empName}`);
    // Abrir caja después de autenticación
    setTimeout(() => handleOpen(), 100);
  }

  async function handleCloseSuccess() {
    toast.success("Caja cerrada exitosamente");
    setCloseModalOpen(false);
    await loadData();
  }

  function handleCloseModalOpen() {
    // Force fresh state by incrementing key (forces re-mount)
    setCloseModalKey(prev => prev + 1);
    setCloseModalOpen(true);
  }

  function handleWithdrawSuccess() {
    setWithdrawModalOpen(false);
    loadData();
  }

  function handleDepositSuccess() {
    setDepositModalOpen(false);
    loadData();
  }

  async function loadPaidOrders() {
    if (!register) return;
    setLoadingOrders(true);
    try {
      // Fetch all paid orders scoped to this register (no date filter needed — registerId is the scope)
      const res = await fetch(`/api/orders/history?registerId=${register.id}`);
      if (res.ok) {
        const allOrders = await res.json();
        setPaidOrders(allOrders);
        
        // Calcular el total real de las órdenes
        const total = allOrders.reduce((sum: number, order: any) => {
          return sum + parseFloat(order.total || "0");
        }, 0);
        setActualTotalSales(total);
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      toast.error("Error cargando órdenes");
    } finally {
      setLoadingOrders(false);
    }
  }

  function handleShowOrders() {
    setOrdersHistoryOpen(true);
    loadPaidOrders();
  }
  
  // Cargar órdenes al montar el componente para calcular el total real
  useEffect(() => {
    if (register) {
      loadPaidOrders();
    }
  }, [register]);

  function handleDeleteOrderClick(order: any) {
    setOrderToDelete(order);
    setDeleteReason("");
    setDeleteOrderModalOpen(true);
  }

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
      setDeleteOrderModalOpen(false);
      setOrderToDelete(null);
      setDeleteReason("");
      
      // Recargar órdenes y datos de caja
      loadPaidOrders();
      loadData();
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
    setEditOrderOpen(true);
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
      setEditOrderOpen(false);
      setEditOrder(null);
      await loadPaidOrders();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar la orden");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleReprintOrder(order: any) {
    setReprintingOrderId(order.id);
    try {
      // Preparar datos para reimprimir
      const itemsBySeat: Record<string, Array<{ name: string; qty: number; total: number }>> = {};
      
      // Agrupar items (simplificado, todos juntos)
      itemsBySeat["A1"] = (order.items || []).map((item: any) => ({
        name: item.productName,
        qty: item.quantity,
        total: parseFloat(item.subtotal || "0")
      }));

      // Calcular descuento si hay
      const discountData = order.discountAmount && parseFloat(order.discountAmount) > 0 ? {
        name: order.discountName || "Descuento",
        amount: Math.round(parseFloat(order.discountAmount))
      } : undefined;

      const printData = {
        customerName: order.customerName || "",
        orderNumber: order.orderNumber?.toString() || "N/A",
        items: itemsBySeat,
        subtotal: parseFloat(order.subtotal || "0"),
        tip: parseFloat(order.tip || "0"),
        total: parseFloat(order.total || "0"),
        tableNumber: order.tableNumber || "",
        isDelivery: !order.tableId,
        paymentMethod: order.paymentMethod,
        discount: discountData
      };

      const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.160:3001";
      const response = await fetch(`${printServerUrl}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printData)
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

  async function handlePrintSummary() {
    if (!register) return;
    setPrintingSummary(true);
    try {
      // Calcular totales por método de pago
      const cashTotal = paidOrders
        .filter(o => o.paymentMethod === 'cash')
        .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      const cardTotal = paidOrders
        .filter(o => o.paymentMethod === 'card' || o.paymentMethod === 'terminal_mercadopago')
        .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      const transferTotal = paidOrders
        .filter(o => o.paymentMethod === 'transfer')
        .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      const totalTips = paidOrders
        .reduce((sum, o) => sum + parseFloat(o.tip || '0'), 0);
      
      // Agrupar productos vendidos
      const productSales: Record<string, number> = {};
      for (const order of paidOrders) {
        for (const item of order.items || []) {
          const productName = item.productName;
          productSales[productName] = (productSales[productName] || 0) + item.quantity;
        }
      }
      
      // Convertir a array y ordenar por cantidad
      const productList = Object.entries(productSales)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      const summaryData = {
        date: new Date().toISOString(),
        registerName: `Caja ${register.id.slice(0, 8)}`,
        totalOrders: paidOrders.length,
        cashTotal,
        cardTotal,
        transferTotal,
        totalTips,
        grandTotal: actualTotalSales,
        products: productList
      };

      const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.160:3001";
      const response = await fetch(`${printServerUrl}/print-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summaryData)
      });

      if (!response.ok) throw new Error("Error al imprimir resumen");
      
      toast.success("Resumen de ventas impreso");
    } catch (error) {
      console.error("Error printing summary:", error);
      toast.error("Error al imprimir resumen");
    } finally {
      setPrintingSummary(false);
    }
  }

  const formatCurrency = (amount: string | number | null) => {
    if (amount === null) return "$0.00";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(typeof amount === "string" ? parseFloat(amount) : amount);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8 animate-spin" />
      </div>
    );
  }

  // No register open
  if (!register) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Caja Registradora</h1>
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-12">
            <LockOpen className="mb-4 size-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No hay caja abierta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Abre la caja para comenzar a registrar ventas
            </p>
            <Button
              className="mt-6"
              size="lg"
              onClick={() => setOpenDialogVisible(true)}
            >
              <LockOpen className="mr-2 size-4" />
              Abrir Caja
            </Button>
          </CardContent>
        </Card>

        {/* Open Dialog */}
        <Dialog open={openDialogVisible} onOpenChange={setOpenDialogVisible}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abrir Caja</DialogTitle>
              <DialogDescription>
                Ingresa el monto inicial de efectivo en caja
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Efectivo inicial</Label>
              <Input
                type="number"
                step="0.01"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                placeholder="0.00"
                className="text-xl"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialogVisible(false)}>
                Cancelar
              </Button>
              <Button onClick={initiateOpen} disabled={submitting}>
                {submitting ? "Abriendo..." : "Continuar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Register is open
  // Calculate actual sales from paid orders (same as summary)
  const actualCashSales = paidOrders
    .filter(o => o.paymentMethod === 'cash')
    .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  
  const actualTerminalSales = paidOrders
    .filter(o => o.paymentMethod === 'card' || o.paymentMethod === 'terminal_mercadopago')
    .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  
  const actualTransferSales = paidOrders
    .filter(o => o.paymentMethod === 'transfer')
    .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  
  // expectedCash = initialCash + cashSales - withdrawals + deposits
  const expectedCash =
    parseFloat(register.initialCash) + 
    actualCashSales - 
    parseFloat(register.withdrawals || "0") + 
    parseFloat(register.deposits || "0");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Caja Registradora</h1>
        <Badge variant="default" className="gap-1">
          <LockOpen className="size-3" />
          Abierta
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Efectivo Inicial</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(register.initialCash)}
            </p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={handleShowOrders}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ventas Totales (Hoy)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(actualTotalSales)}
            </p>
            <p className="text-xs text-muted-foreground">
              {paidOrders.length} órdenes completadas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Efectivo Esperado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(expectedCash)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Abierta desde</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">
              {format(new Date(register.openedAt), "HH:mm", { locale: es })}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(register.openedAt), "dd MMM yyyy", { locale: es })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setDepositModalOpen(true)}
        >
          <ArrowDown className="mr-1 size-4 text-green-600" />
          Depósito
        </Button>
        <Button
          variant="outline"
          onClick={() => setWithdrawModalOpen(true)}
        >
          <ArrowUp className="mr-1 size-4 text-red-600" />
          Sangría (Retiro)
        </Button>
        <Button
          variant="outline"
          onClick={handlePrintSummary}
          disabled={printingSummary || paidOrders.length === 0}
        >
          <Printer className="mr-1 size-4" />
          {printingSummary ? "Imprimiendo..." : "Imprimir Resumen"}
        </Button>
        <div className="flex-1" />
        <Button variant="destructive" onClick={handleCloseModalOpen}>
          <Lock className="mr-1 size-4" />
          Cerrar Caja / Corte
        </Button>
      </div>

      {/* Advanced Modals */}
      {register && (
        <>
          <CashRegisterCloseModal
            key={closeModalKey}
            open={closeModalOpen}
            onClose={() => setCloseModalOpen(false)}
            onSuccess={handleCloseSuccess}
            registerId={register.id}
            userRole={currentUser?.role || "cashier"}
            summary={{
              initialCash: parseFloat(register.initialCash),
              expectedCash,
              totalSales: actualTotalSales,
              cashSales: actualCashSales,
              terminalSales: actualTerminalSales,
              transferSales: actualTransferSales,
              withdrawals: parseFloat(register.withdrawals || "0"),
              deposits: parseFloat(register.deposits || "0"),
            }}
          />
          <WithdrawModal
            open={withdrawModalOpen}
            onClose={() => setWithdrawModalOpen(false)}
            onSuccess={handleWithdrawSuccess}
            registerId={register.id}
          />
          <DepositModal
            open={depositModalOpen}
            onClose={() => setDepositModalOpen(false)}
            onSuccess={handleDepositSuccess}
            registerId={register.id}
          />
        </>
      )}

      {/* TODO: Implementar PIN Modal mejorado
          - Usar PinPad directamente (sin email)
          - Pedir número de empleado con numpad
          - Luego pedir PIN con numpad
          - Similar al flujo de PinPad actual pero con número de empleado primero
      */}

      {/* Orders History Modal */}
      <Dialog open={ordersHistoryOpen} onOpenChange={setOrdersHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Órdenes Pagadas</DialogTitle>
            <DialogDescription>
              Órdenes registradas en esta caja
            </DialogDescription>
          </DialogHeader>
          
          {loadingOrders ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-8 animate-spin" />
            </div>
          ) : paidOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay órdenes registradas
            </div>
          ) : (
            <div className="space-y-2">
              {paidOrders.map((order) => (
                <Card key={order.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">#{order.orderNumber}</span>
                        <Badge variant="outline">
                          {order.paymentMethod === 'cash' ? 'Efectivo' : 
                           order.paymentMethod === 'card' ? 'Tarjeta' : 
                           order.paymentMethod === 'transfer' ? 'Transferencia' : 
                           order.paymentMethod === 'terminal_mercadopago' ? 'Terminal' : 
                           order.paymentMethod}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {order.tableId ? `Mesa ${order.tableNumber || ''}` : 'Para Llevar'}
                        {order.customerName && ` - ${order.customerName}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(order.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.discountAmount && parseFloat(order.discountAmount) > 0 && (() => {
                        const discountAmt = parseFloat(order.discountAmount);
                        const subtotalAmt = parseFloat(order.subtotal || "0");
                        const percentage = subtotalAmt > 0 ? Math.round((discountAmt / subtotalAmt) * 100) : 0;
                        return (
                          <Badge className="bg-yellow-500 text-black font-semibold">
                            -{percentage}%
                          </Badge>
                        );
                      })()}
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          {formatCurrency(order.total)}
                        </div>
                        {parseFloat(order.tip || '0') > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Propina: {formatCurrency(order.tip)}
                          </div>
                        )}
                      </div>
                      {isEditableOrder(order) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditOrderClick(order)}
                        >
                          Editar pago
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReprintOrder(order)}
                        disabled={reprintingOrderId === order.id}
                      >
                        <Printer className="size-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteOrderClick(order)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Order Payment Details Modal */}
      <Dialog open={editOrderOpen} onOpenChange={setEditOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar pago — Orden #{editOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Corrige el método de pago y la propina. El total, el corte y el
              efectivo esperado se recalculan solos.
            </DialogDescription>
          </DialogHeader>

          {editOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(editOrder.subtotal || "0")}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total nuevo</span>
                  <span>
                    {formatCurrency(
                      (
                        parseFloat(editOrder.subtotal || "0") +
                        (parseFloat(editTip || "0") || 0)
                      ).toFixed(2)
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select
                  value={editPaymentMethod}
                  onValueChange={setEditPaymentMethod}
                >
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
                <Input
                  id="edit-tip"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editTip}
                  onChange={(e) => setEditTip(e.target.value)}
                />
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
            <Button
              variant="outline"
              onClick={() => setEditOrderOpen(false)}
              disabled={savingEdit}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveOrderEdit} disabled={savingEdit}>
              {savingEdit ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Order Confirmation Modal */}
      <Dialog open={deleteOrderModalOpen} onOpenChange={setDeleteOrderModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Orden</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Debes proporcionar un motivo.
            </DialogDescription>
          </DialogHeader>
          
          {orderToDelete && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">#{orderToDelete.orderNumber}</div>
                    <div className="text-sm text-muted-foreground">
                      {orderToDelete.tableId ? `Mesa ${orderToDelete.tableNumber || ''}` : 'Para Llevar'}
                    </div>
                  </div>
                  <div className="font-bold text-lg">
                    {formatCurrency(orderToDelete.total)}
                  </div>
                </div>
              </Card>
              
              <div className="space-y-2">
                <Label htmlFor="deleteReason">Motivo de eliminación *</Label>
                <Textarea
                  id="deleteReason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Ej: Error en el pedido, cliente canceló, etc."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOrderModalOpen(false)}
              disabled={deletingOrder}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletingOrder || !deleteReason.trim()}
            >
              {deletingOrder ? "Eliminando..." : "Confirmar Eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
