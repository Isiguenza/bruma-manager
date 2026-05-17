"use client";

import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  MagnifyingGlass, 
  Eye, 
  Receipt, 
  ShoppingBag, 
  Printer,
  CurrencyDollar,
  Clock,
  CalendarBlank,
  Plus,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import type { Order } from "@/lib/types";
import { ManualOrderDialog } from "@/components/manual-order-dialog";

const methodLabels: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  terminal_mercadopago: "Terminal",
  split: "Dividido",
  platform_delivery: "Plataforma",
};

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>("");
  const [showManualOrderDialog, setShowManualOrderDialog] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString();
      
      const res = await fetch(`/api/orders?paymentStatus=paid&startDate=${startDate}&limit=5000`);
      if (res.ok) {
        const data: Order[] = await res.json();
        setOrders(data.filter(o => o.cashRegisterId));
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePaymentMethod(orderId: string, orderNumber: string) {
    if (!newPaymentMethod) return;
    
    setEditingPayment(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: newPaymentMethod }),
      });

      if (res.ok) {
        toast.success(`Método de pago actualizado para orden #${orderNumber}`);
        setNewPaymentMethod("");
        fetchOrders();
        if (selectedOrder) {
          setSelectedOrder({ ...selectedOrder, paymentMethod: newPaymentMethod as any });
        }
      } else {
        throw new Error("Error updating payment method");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al actualizar método de pago");
    } finally {
      setEditingPayment(false);
    }
  }

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(num);
  };

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const s = search.toLowerCase();
    return orders.filter((o) => {
      const orderNum = o.orderNumber?.toString() || "";
      const customerName = o.customerName?.toLowerCase() || "";
      const tableNum = (o as any).table?.number?.toString() || "";
      return (
        orderNum.includes(s) ||
        customerName.includes(s) ||
        tableNum.includes(s)
      );
    });
  }, [orders, search]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    filteredOrders.forEach((order) => {
      const date = new Date(order.createdAt);
      const key = format(date, "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });

    return Object.entries(groups)
      .map(([dateKey, orders]) => {
        // Parse date correctly to avoid timezone issues
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        
        let label = format(date, "EEEE d 'de' MMMM", { locale: es });
        if (isToday(date)) label = "Hoy";
        else if (isYesterday(date)) label = "Ayer";

        const dayTotal = orders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

        return { dateKey, label, orders, dayTotal };
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredOrders]);

  const totalSales = useMemo(() => {
    return orders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Historial de Órdenes</h1>
            <p className="text-muted-foreground mt-1">
              Últimas 30 días de ventas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowManualOrderDialog(true)}
              variant="default"
              size="sm"
            >
              <Plus className="size-4 mr-1" />
              Añadir Orden Manual
            </Button>
            <Badge variant="outline" className="text-sm px-4 py-2">
              {orders.length} órdenes
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <CurrencyDollar className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Ventas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <Receipt className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Órdenes
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <CalendarBlank className="size-5 text-purple-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Promedio por Día
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(groupedByDay.length > 0 ? totalSales / groupedByDay.length : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por #, cliente o mesa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center space-y-2">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Cargando órdenes...</p>
          </div>
        </div>
      ) : groupedByDay.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Receipt className="size-16 mb-4 opacity-20" weight="duotone" />
            <p className="text-lg font-medium">No hay ventas registradas</p>
            <p className="text-sm">Las órdenes aparecerán aquí</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedByDay.map((group) => (
            <div key={group.dateKey} className="space-y-4">
              {/* Day Header */}
              <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 py-3 -mx-1 px-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{group.label}</h2>
                  <Badge variant="secondary" className="font-semibold">
                    {formatCurrency(group.dayTotal)}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {group.orders.length} orden{group.orders.length !== 1 ? "es" : ""}
                </span>
              </div>

              {/* Orders Grid */}
              <div className="grid gap-3">
                {group.orders.map((order) => {
                  const total = parseFloat(order.total || "0");
                  const tip = parseFloat((order as any).tip || "0");
                  const tableNum = (order as any).table?.number;

                  return (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="group w-full text-left rounded-xl border border-border/50 bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Order Number Badge */}
                          <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 text-primary font-bold">
                            #{order.orderNumber}
                          </div>
                          
                          {/* Order Info */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-base">
                                {tableNum ? `Mesa ${tableNum}` : "Para llevar"}
                              </span>
                              {order.customerName && (
                                <span className="text-sm text-muted-foreground">
                                  • {order.customerName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Clock className="size-3.5" weight="duotone" />
                                {format(new Date(order.createdAt), "HH:mm")}
                              </span>
                              {order.paymentMethod && (
                                <Badge variant="outline" className="text-xs h-5">
                                  {methodLabels[order.paymentMethod] || order.paymentMethod}
                                </Badge>
                              )}
                              {tip > 0 && (
                                <span className="text-blue-600 font-medium">
                                  +{formatCurrency(tip)} propina
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Total and Arrow */}
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-xl font-bold">
                              {formatCurrency(total)}
                            </div>
                          </div>
                          <Eye className="size-5 text-muted-foreground group-hover:text-primary transition-colors" weight="duotone" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Orden #{selectedOrder?.orderNumber}
              {(() => {
                const tableNum = (selectedOrder as any)?.table?.number;
                return tableNum ? (
                  <Badge variant="secondary">Mesa {tableNum}</Badge>
                ) : (
                  <Badge variant="outline">
                    <ShoppingBag className="size-3 mr-1" />
                    Para llevar
                  </Badge>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  <span>
                    {format(new Date(selectedOrder.createdAt), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
                  </span>
                </div>
                
                {/* Payment Method Editor */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Método de pago:</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={newPaymentMethod || selectedOrder.paymentMethod || ""}
                      onChange={(e) => setNewPaymentMethod(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border rounded-lg bg-background"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="terminal_mercadopago">Terminal</option>
                      <option value="split">Dividido</option>
                      <option value="platform_delivery">Plataforma</option>
                    </select>
                    {newPaymentMethod && newPaymentMethod !== selectedOrder.paymentMethod && (
                      <Button
                        size="sm"
                        onClick={() => handleUpdatePaymentMethod(selectedOrder.id, String(selectedOrder.orderNumber))}
                        disabled={editingPayment}
                      >
                        {editingPayment ? "Guardando..." : "Guardar"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {selectedOrder.customerName && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm">
                    <strong>Cliente:</strong> {selectedOrder.customerName}
                  </p>
                </div>
              )}

              {/* Items */}
              <div className="space-y-2">
                <h3 className="font-semibold">Productos</h3>
                {(!selectedOrder.items || selectedOrder.items.length === 0) && (
                  <p className="text-sm text-muted-foreground italic">Sin detalle de productos</p>
                )}
                {selectedOrder.items?.map((item) => {
                  const isVoided = (item as any).voided;
                  return (
                    <div
                      key={item.id}
                      className={`flex justify-between text-sm p-2 rounded-lg ${isVoided ? 'line-through opacity-50 bg-red-500/5' : 'bg-muted/30'}`}
                    >
                      <div className="flex-1">
                        <span className="font-medium">{item.quantity}x {item.productName}</span>
                        {isVoided && (item as any).voidReason && (
                          <p className="text-xs text-red-500 no-underline mt-0.5">
                            Eliminado: {(item as any).voidReason}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatCurrency((selectedOrder as any).subtotal || selectedOrder.total)}</span>
                </div>
                {parseFloat((selectedOrder as any).tip || "0") > 0 && (
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>Propina:</span>
                    <span className="font-medium">+{formatCurrency((selectedOrder as any).tip)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span>{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ManualOrderDialog
        open={showManualOrderDialog}
        onClose={() => setShowManualOrderDialog(false)}
        onSuccess={fetchOrders}
      />
    </div>
  );
}
