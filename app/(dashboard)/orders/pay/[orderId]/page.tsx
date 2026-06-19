"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/utils";
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
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Money,
  CreditCard,
  CurrencyDollar,
  Barcode,
  Camera,
  Plus,
  Minus,
  Check,
  Spinner,
  ArrowLeft,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Order, LoyaltyCard } from "@/lib/types";
import { SlideButton } from "@/components/ui/slide-button";
import { EmployeePinModal } from "@/components/employee-pin-modal";
import { SplitPaymentModal } from "@/components/split-payment-modal";

export default function PayOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "terminal_mercadopago" | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [waitingForTerminal, setWaitingForTerminal] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<"cash" | "terminal_mercadopago" | null>(null);

  // Loyalty
  const [loyaltyCard, setLoyaltyCard] = useState<LoyaltyCard | null>(null);
  const [loyaltyBarcode, setLoyaltyBarcode] = useState("");
  const [loyaltyStamps, setLoyaltyStamps] = useState(1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loyaltySearching, setLoyaltySearching] = useState(false);

  // Split payment
  const [splitPaymentOpen, setSplitPaymentOpen] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  async function fetchOrder() {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error();
      setOrder(await res.json());
    } catch {
      toast.error("Orden no encontrada");
      router.push("/orders/new");
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number | string) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(typeof amount === "string" ? parseFloat(amount) : amount);

  async function searchLoyaltyCard() {
    if (!loyaltyBarcode.trim()) return;
    setLoyaltySearching(true);
    try {
      const res = await fetch(`/api/loyalty/search?barcode=${encodeURIComponent(loyaltyBarcode)}`);
      if (res.ok) {
        const card = await res.json();
        setLoyaltyCard(card);
        toast.success(`Tarjeta de ${card.customerName} encontrada`);
      } else {
        toast.error("Tarjeta no encontrada");
        setLoyaltyCard(null);
      }
    } catch {
      toast.error("Error buscando tarjeta");
    } finally {
      setLoyaltySearching(false);
    }
  }

  function initiateCashPayment() {
    if (!employeeId) {
      setPendingPaymentMethod("cash");
      setPinModalOpen(true);
      return;
    }
    handlePayCash();
  }

  async function handlePayCash() {
    if (!order || !employeeId) return;
    setProcessing(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "cash",
          loyaltyCardId: loyaltyCard?.id || null,
          loyaltyStamps,
          userId: employeeId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pago registrado correctamente");
      setPaymentComplete(true);
    } catch {
      toast.error("Error procesando pago");
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirmOrder() {
    if (!order || confirmingOrder) return;
    setConfirmingOrder(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "preparing" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Orden confirmada y enviada a preparación");
      router.push("/orders/dispatch");
    } catch {
      toast.error("Error confirmando orden");
      setConfirmingOrder(false);
    }
  }

  function initiateTerminalPayment() {
    if (!employeeId) {
      setPendingPaymentMethod("terminal_mercadopago");
      setPinModalOpen(true);
      return;
    }
    handlePayTerminal();
  }

  function handlePinSuccess(empId: string, empName: string) {
    setEmployeeId(empId);
    setEmployeeName(empName);
    setPinModalOpen(false);
    
    // Execute pending payment after PIN verification
    if (pendingPaymentMethod === "cash") {
      setTimeout(() => handlePayCash(), 100);
    } else if (pendingPaymentMethod === "terminal_mercadopago") {
      setTimeout(() => handlePayTerminal(), 100);
    }
    setPendingPaymentMethod(null);
  }

  async function handlePayTerminal() {
    if (!order || !employeeId) return;
    setProcessing(true);
    setWaitingForTerminal(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "terminal_mercadopago",
          loyaltyCardId: loyaltyCard?.id || null,
          loyaltyStamps,
          userId: employeeId,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || "Error enviando pago a terminal");
        if (errorData.hint) {
          toast.error(errorData.hint, { duration: 5000 });
        }
        setProcessing(false);
        setWaitingForTerminal(false);
        return;
      }

      // Poll for payment status by checking order status
      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`/api/orders/${orderId}`);
        if (statusRes.ok) {
          const updatedOrder = await statusRes.json();
          if (updatedOrder.paymentStatus === "paid") {
            clearInterval(pollInterval);
            setWaitingForTerminal(false);
            toast.success("Pago confirmado por terminal");
            setPaymentComplete(true);
          } else if (updatedOrder.paymentStatus === "failed") {
            clearInterval(pollInterval);
            setWaitingForTerminal(false);
            setProcessing(false);
            toast.error("Pago rechazado en terminal");
          }
        }
      }, 2000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (waitingForTerminal) {
          setWaitingForTerminal(false);
          setProcessing(false);
          toast.error("Tiempo de espera agotado");
        }
      }, 120000);
    } catch (error) {
      toast.error("Error enviando pago a terminal");
      setProcessing(false);
      setWaitingForTerminal(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8 animate-spin" />
      </div>
    );
  }

  if (!order) return null;

  const total = parseFloat(order.total);
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum - total;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cobrar Orden #{order.orderNumber}
          </h1>
          {order.customerName && (
            <p className="text-sm text-muted-foreground">
              Cliente: {order.customerName}
            </p>
          )}
        </div>
      </div>

      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de la Orden</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {order.items?.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {item.quantity}x
                  </Badge>
                  <span>{item.productName}</span>
                  {item.notes && (
                    <span className="text-xs text-muted-foreground">
                      ({item.notes})
                    </span>
                  )}
                </div>
                <span className="font-medium">
                  {formatCurrency(item.subtotal)}
                </span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex items-center justify-between text-xl font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loyalty Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tarjeta de Cliente Frecuente</CardTitle>
          <CardDescription>
            Escanea o ingresa el código de barras de la tarjeta
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loyaltyCard ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <div>
                  <p className="font-medium">{loyaltyCard.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {loyaltyCard.stamps} sellos · {loyaltyCard.rewardsAvailable}{" "}
                    premios disponibles
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLoyaltyCard(null);
                    setLoyaltyBarcode("");
                  }}
                >
                  Cambiar
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Sellos a agregar:</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoyaltyStamps(Math.max(0, loyaltyStamps - 1))}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-8 text-center font-bold">
                    {loyaltyStamps}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoyaltyStamps(loyaltyStamps + 1)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Código de barras"
                value={loyaltyBarcode}
                onChange={(e) => setLoyaltyBarcode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchLoyaltyCard()}
              />
              <Button
                variant="outline"
                onClick={searchLoyaltyCard}
                disabled={loyaltySearching}
              >
                <Barcode className="size-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setScannerOpen(true)}
              >
                <Camera className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Method */}
      {!waitingForTerminal ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              paymentMethod === "cash" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setPaymentMethod("cash")}
          >
            <CardContent className="flex flex-col items-center justify-center p-6">
              <Money className="mb-2 size-12 text-green-600" />
              <p className="text-lg font-semibold">Efectivo</p>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover:shadow-md ${
              paymentMethod === "terminal_mercadopago"
                ? "ring-2 ring-primary"
                : ""
            }`}
            onClick={() => setPaymentMethod("terminal_mercadopago")}
          >
            <CardContent className="flex flex-col items-center justify-center p-6">
              <CreditCard className="mb-2 size-12 text-blue-600" />
              <p className="text-lg font-semibold">Terminal Mercado Pago</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Spinner className="mb-4 size-12 animate-spin text-primary" />
            <p className="text-lg font-semibold">Esperando pago en terminal...</p>
            <p className="text-sm text-muted-foreground">
              Presenta la tarjeta o dispositivo en la terminal Mercado Pago
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setWaitingForTerminal(false);
                setProcessing(false);
              }}
            >
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cash Payment Details */}
      {paymentMethod === "cash" && !waitingForTerminal && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <label className="text-sm font-medium">Efectivo recibido</label>
              <Input
                type="number"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="mt-1 text-2xl font-bold"
                autoFocus
              />
            </div>
            {cashReceivedNum > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span className="font-medium">Cambio</span>
                <span
                  className={`text-xl font-bold ${
                    change >= 0 ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {formatCurrency(Math.max(0, change))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Complete - Slide to Confirm */}
      {paymentComplete && (
        <Card className="border-green-500 bg-green-50/50">
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <Check className="mx-auto size-16 text-green-600 mb-3" weight="bold" />
              <h3 className="text-2xl font-bold text-green-700">¡Pago Exitoso!</h3>
              <p className="text-muted-foreground mt-2">
                Desliza para confirmar y enviar a preparación
              </p>
            </div>
            <SlideButton
              onSlideComplete={handleConfirmOrder}
              text="Desliza para confirmar orden"
              disabled={confirmingOrder}
            />
          </CardContent>
        </Card>
      )}

      {/* Pay Button */}
      {paymentMethod && !waitingForTerminal && !paymentComplete && (
        <Button
          size="lg"
          className="w-full text-lg"
          disabled={
            processing ||
            (paymentMethod === "cash" && cashReceivedNum < total)
          }
          onClick={
            paymentMethod === "cash" ? initiateCashPayment : initiateTerminalPayment
          }
        >
          {processing ? (
            <>
              <Spinner className="mr-2 size-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Check className="mr-2 size-5" />
              Cobrar {formatCurrency(total)}
            </>
          )}
        </Button>
      )}

      {/* Barcode Scanner Dialog */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escanear Código de Barras</DialogTitle>
            <DialogDescription>
              Apunta la cámara al código de barras de la tarjeta de cliente
            </DialogDescription>
          </DialogHeader>
          <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
            <div id="barcode-scanner" className="size-full" />
            <p className="text-sm text-muted-foreground">
              Cámara se activará aquí
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScannerOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee PIN Modal */}
      <EmployeePinModal
        open={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingPaymentMethod(null);
        }}
        onSuccess={handlePinSuccess}
        title="Verificación de Empleado"
        subtitle="Para procesar el pago"
      />

      {/* Split Payment Modal */}
      <SplitPaymentModal
        open={splitPaymentOpen}
        onClose={() => setSplitPaymentOpen(false)}
        onSuccess={() => {
          setSplitPaymentOpen(false);
          router.push("/orders");
        }}
        orderId={orderId}
        total={total}
      />
    </div>
  );
}
