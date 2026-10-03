"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CookingPot,
  CheckCircle,
  Clock,
  ArrowRight,
  User,
  ForkKnife,
  BeerStein,
  Timer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Order } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function DispatchPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [consolidating, setConsolidating] = useState(false);

  async function handleConsolidateDuplicates() {
    if (!confirm("¿Consolidar órdenes duplicadas? Esto juntará todas las órdenes activas del mismo cliente/mesa en una sola orden.")) {
      return;
    }

    setConsolidating(true);
    try {
      const res = await fetch("/api/orders/consolidate-duplicates", {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Órdenes consolidadas: ${data.stats.groupsConsolidated} grupos, ${data.stats.itemsMoved} items movidos, ${data.stats.ordersDeleted} órdenes eliminadas`
        );
        fetchOrders();
      } else {
        throw new Error("Error consolidando órdenes");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al consolidar órdenes duplicadas");
    } finally {
      setConsolidating(false);
    }
  }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?status=preparing,ready");
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  async function updateOrderStatus(
    orderId: string,
    status: "ready" | "delivered"
  ) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        status === "ready" ? "Orden lista para entregar" : "Orden entregada"
      );
      fetchOrders();
    } catch {
      toast.error("Error actualizando orden");
    }
  }

  const preparingOrders = orders.filter((o) => o.status === "preparing");
  const readyOrders = orders.filter((o) => o.status === "ready");

  const statusColors = {
    preparing: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    ready: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  function modifierLines(customModifiers: string | null | undefined) {
    if (!customModifiers) return [] as string[];
    try {
      const modifiers = JSON.parse(customModifiers) as Record<string, { stepName?: string; options?: Array<{ name?: string; price?: string | number }> }>;
      return Object.values(modifiers).flatMap((step) => (step.options ?? [])
        .filter((option) => option.name)
        .map((option) => {
          const price = Number(option.price ?? 0);
          const suffix = Number.isFinite(price) && price !== 0 ? ` +$${Number.isInteger(price) ? price : price.toFixed(2)}` : "";
          return `${step.stepName ? `${step.stepName}: ` : ""}${option.name}${suffix}`;
        }));
    } catch {
      return [];
    }
  }

  function OrderCard({ order }: { order: Order }) {
    const timeAgo = formatDistanceToNow(new Date(order.createdAt), {
      addSuffix: true,
      locale: es,
    });

    return (
      <Card className="transition-all hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">
              #{order.orderNumber}
            </CardTitle>
            <Badge
              variant="outline"
              className={
                statusColors[order.status as keyof typeof statusColors] ?? ""
              }
            >
              {order.status === "preparing" ? "Preparando" : "Lista"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{timeAgo}</span>
            {order.customerName && (
              <>
                <span>·</span>
                <span>{order.customerName}</span>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(() => {
              const activeItems = order.items?.filter((item: any) => !item.voided) || [];
              const beverages = activeItems.filter((item: any) => item.product?.category?.isBeverage);
              const food = activeItems.filter((item: any) => !item.product?.category?.isBeverage);
              
              // Group food by course
              const courseMap = new Map<number, typeof food>();
              for (const item of food) {
                const course = (item as any).course || 1;
                if (!courseMap.has(course)) courseMap.set(course, []);
                courseMap.get(course)!.push(item);
              }
              const courseKeys = Array.from(courseMap.keys()).sort((a, b) => a - b);
              const hasMultipleCourses = courseKeys.length > 1;
              
              // Helper: render items grouped by seat
              const renderSeatItems = (items: typeof activeItems) => {
                const seatMap = new Map<string, typeof items>();
                for (const item of items) {
                  const seat = (item as any).seat || "C";
                  if (!seatMap.has(seat)) seatMap.set(seat, []);
                  seatMap.get(seat)!.push(item);
                }
                const seatKeys = Array.from(seatMap.keys()).sort((a, b) => {
                  if (a === "C") return 1;
                  if (b === "C") return -1;
                  return a.localeCompare(b, undefined, { numeric: true });
                });
                const showSeats = seatKeys.length > 1 || (seatKeys.length === 1 && seatKeys[0] !== "C");
                return seatKeys.map(sk => (
                  <div key={sk}>
                    {showSeats && (
                      <div className={`flex items-center gap-1 text-xs font-bold mt-1 ${sk === "C" ? "text-amber-500" : "text-blue-500"}`}>
                        {sk === "C" 
                          ? <><ForkKnife className="size-3.5" weight="fill" /> Centro</>
                          : <><User className="size-3.5" weight="fill" /> {sk}</>
                        }
                      </div>
                    )}
                    {seatMap.get(sk)!.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 text-sm">
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {item.quantity}x
                        </Badge>
                        <div>
                          <span className="font-medium">{item.productName}</span>
                          {modifierLines(item.customModifiers).map((line, index) => (
                            <p key={index} className="text-xs text-amber-600">→ {line}</p>
                          ))}
                          {item.notes && (
                            <p className="text-xs text-muted-foreground">→ {item.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              };
              
              return (
                <>
                  {beverages.length > 0 && (
                    <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2">
                      <div className="flex items-center gap-1 text-xs font-bold text-cyan-600 mb-1">
                        <BeerStein className="size-3.5" weight="fill" /> Bebidas
                      </div>
                      {beverages.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 text-sm">
                          <Badge variant="secondary" className="shrink-0 text-xs">{item.quantity}x</Badge>
                          <div>
                            <span className="font-medium">{item.productName}</span>
                            {modifierLines(item.customModifiers).map((line, index) => (
                              <p key={index} className="text-xs text-amber-600">→ {line}</p>
                            ))}
                            {item.notes && <p className="text-xs text-muted-foreground">→ {item.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {courseKeys.map(courseNum => (
                    <div key={`c-${courseNum}`}>
                      {hasMultipleCourses && (
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 mt-1">
                          <Timer className="size-3.5" weight="fill" /> Tiempo {courseNum}
                        </div>
                      )}
                      {renderSeatItems(courseMap.get(courseNum)!)}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
          {order.notes && (
            <div className="mt-3 rounded-md bg-muted p-2 text-xs">
              <strong>Nota:</strong> {order.notes}
            </div>
          )}
        </CardContent>
        <CardFooter>
          {order.status === "preparing" ? (
            <Button
              className="w-full"
              onClick={() => updateOrderStatus(order.id, "ready")}
            >
              <CheckCircle className="mr-2 size-4" />
              Marcar Lista
            </Button>
          ) : (
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => updateOrderStatus(order.id, "delivered")}
            >
              <ArrowRight className="mr-2 size-4" />
              Entregar
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Despacho</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Despacho</h1>
        <div className="flex items-center gap-3">
          {/* DISABLED: Botón peligroso que borra órdenes
          <Button
            onClick={handleConsolidateDuplicates}
            disabled={consolidating}
            variant="outline"
            size="sm"
          >
            {consolidating ? "Consolidando..." : "🔗 Consolidar Duplicados"}
          </Button>
          */}
          <Badge variant="outline" className="gap-1">
            <CookingPot className="size-3" />
            {preparingOrders.length} preparando
          </Badge>
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="size-3" />
            {readyOrders.length} listas
          </Badge>
        </div>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center text-muted-foreground">
            <CookingPot className="mb-4 size-12" />
            <p className="text-lg font-medium">No hay órdenes pendientes</p>
            <p className="text-sm">Las nuevas órdenes aparecerán aquí</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Preparing Column */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CookingPot className="size-5 text-yellow-600" />
              Preparando ({preparingOrders.length})
            </h2>
            <div className="space-y-3">
              {preparingOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
              {preparingOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay órdenes preparándose
                </p>
              )}
            </div>
          </div>

          {/* Ready Column */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle className="size-5 text-green-600" />
              Listas para Entregar ({readyOrders.length})
            </h2>
            <div className="space-y-3">
              {readyOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
              {readyOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay órdenes listas
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
