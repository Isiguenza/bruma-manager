"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CurrencyDollar,
  ShoppingCart,
  Package,
  WarningCircle,
  TrendUp,
  ClipboardText,
} from "@phosphor-icons/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  weekSales: number;
  monthSales: number;
  pendingOrders: number;
  lowStockItems: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  salesByDay: { date: string; sales: number; orders: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const todaySales = stats?.todaySales ?? 0;
  const todayOrders = stats?.todayOrders ?? 0;
  const weekSales = stats?.weekSales ?? 0;
  const lowStockItems = stats?.lowStockItems ?? 0;
  const pendingOrders = stats?.pendingOrders ?? 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Section */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5">
          <div className="size-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">
            Sistema en vivo
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Sistema de punto de venta
        </h1>
        <p className="text-lg text-muted-foreground">
          Gestiona tu negocio en un solo lugar
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <CurrencyDollar className="size-5 text-blue-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ventas Hoy
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold tracking-tight">
              {formatCurrency(todaySales)}
            </div>
            <p className="text-sm text-muted-foreground">
              {todayOrders} órdenes completadas
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-3">
                <TrendUp className="size-5 text-green-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ventas Semana
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold tracking-tight">
              {formatCurrency(weekSales)}
            </div>
            <p className="text-sm text-muted-foreground">Últimos 7 días</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3">
                <ClipboardText className="size-5 text-orange-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Órdenes del Día
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold tracking-tight">{pendingOrders}</div>
            <p className="text-sm text-muted-foreground">
              Por preparar o entregar
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-500/10 p-3">
                <WarningCircle className="size-5 text-red-600" weight="duotone" />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Stock Bajo
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold tracking-tight">{lowStockItems}</div>
            <p className="text-sm text-muted-foreground">
              Ingredientes bajo mínimo
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Volumen de ventas</CardTitle>
            <CardDescription>Últimas 3 semanas - Vie, Sáb y Dom</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.salesByDay ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs" 
                    axisLine={false}
                    tickLine={false}
                    height={40}
                  />
                  <YAxis 
                    className="text-xs" 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `${label}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ fill: "hsl(var(--primary))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                    activeDot={{ r: 7, strokeWidth: 0 }}
                    name="Ventas"
                    connectNulls={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Top Productos Vendidos</CardTitle>
            <CardDescription>Productos más vendidos hoy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(stats?.topProducts ?? []).length === 0 && (
                <div className="flex h-[280px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    No hay datos disponibles
                  </p>
                </div>
              )}
              {(stats?.topProducts ?? []).slice(0, 5).map((product, i) => (
                <div
                  key={product.name}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                      {product.quantity}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        unidades vendidas
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatCurrency(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
