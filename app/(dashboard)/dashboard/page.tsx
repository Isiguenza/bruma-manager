"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Armchair,
  CheckCircle,
  Globe,
  Package,
  Receipt,
  Smiley,
  LockSimple,
  LockSimpleOpen,
} from "@phosphor-icons/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  formatDayLong,
  formatHour,
  formatTime,
  formatWeekdayLong,
  formatWeekdayShort,
  formatDayShort,
  fromDateKey,
  dateKeyCDMX,
} from "@/lib/time";

type Stats = {
  today: {
    sales: number;
    tips: number;
    orders: number;
    lastWeekSoFar: number;
    lastWeekOrdersSoFar: number;
    lastWeekFull: number;
  };
  salesByHour: { hour: number; today: number; lastWeek: number }[];
  salesByDay: { date: string; sales: number; orders: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  attention: { onlinePending: number; openTables: number; lowStock: number };
  register: { id: string; openedAt: string; initialCash: number; openedBy: string | null } | null;
  surveys: {
    count: number;
    avg: number | null;
    nps: number | null;
    low: { id: string; orderNumber: number | null; rating: number; improvement: string | null; createdAt: string }[];
  };
  expenses: { total: number; count: number };
};

const money = (n: number, decimals = 0) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);

const REFRESH_MS = 60_000;

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStats(await res.json());
      setError(false);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Se actualiza solo cada minuto mientras la pestaña está visible.
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const now = new Date();
  const weekday = formatWeekdayLong(now);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow={<span className="capitalize">{formatDayLong(now)}</span>}
        title="Hoy en Bruma"
        description={updatedAt ? `Se actualiza solo · última vez ${formatTime(updatedAt)}` : "Cargando…"}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
            <ArrowClockwise className={cn("size-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      {error && !stats && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-6">
            <p className="text-sm text-muted-foreground">No se pudieron cargar los números de hoy.</p>
            <Button size="sm" onClick={load}>Reintentar</Button>
          </CardContent>
        </Card>
      )}

      {!stats ? (
        <LoadingState />
      ) : (
        <>
          <KpiRow stats={stats} weekday={weekday} />

          <div className="grid gap-6 lg:grid-cols-3">
            <SalesByHourCard stats={stats} weekday={weekday} />
            <AttentionCard stats={stats} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <SalesByDayCard stats={stats} />
            <TopProductsCard stats={stats} />
          </div>
        </>
      )}
    </div>
  );
}

// MARK: - KPIs

function KpiRow({ stats, weekday }: { stats: Stats; weekday: string }) {
  const { today, register } = stats;
  const avgTicket = today.orders > 0 ? today.sales / today.orders : 0;
  const delta = today.lastWeekSoFar > 0 ? (today.sales - today.lastWeekSoFar) / today.lastWeekSoFar : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Ventas de hoy" value={money(today.sales)}>
        {delta === null ? (
          <span>Sin ventas el {weekday} pasado a esta hora</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {delta >= 0 ? <ArrowUpRight className="size-3.5" weight="bold" /> : <ArrowDownRight className="size-3.5" weight="bold" />}
              {Math.abs(Math.round(delta * 100))}%
            </span>
            vs el {weekday} pasado a esta hora ({money(today.lastWeekSoFar)})
          </span>
        )}
      </Kpi>

      <Kpi label="Órdenes" value={String(today.orders)}>
        Ticket promedio {money(avgTicket)}
      </Kpi>

      <Kpi label="Propinas" value={money(today.tips)}>
        {today.sales > 0 ? `${((today.tips / today.sales) * 100).toFixed(1)}% de las ventas` : "Aún sin propinas"}
      </Kpi>

      <Link href="/cash-register" className="group">
        <Card className="h-full gap-2 py-5 transition-colors group-hover:bg-muted/40">
          <CardContent className="space-y-2 px-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Caja</p>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            {register ? (
              <>
                <div className="flex items-center gap-2">
                  <LockSimpleOpen className="size-6 text-emerald-600 dark:text-emerald-400" weight="fill" />
                  <span className="text-3xl font-semibold tracking-tight">Abierta</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Desde {formatTime(register.openedAt)}
                  {register.openedBy ? ` · ${register.openedBy.split(" ")[0]}` : ""} · fondo {money(register.initialCash)}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <LockSimple className="size-6 text-muted-foreground" weight="fill" />
                  <span className="text-3xl font-semibold tracking-tight">Cerrada</span>
                </div>
                <p className="text-sm text-muted-foreground">No se puede comandar hasta abrirla</p>
              </>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2 py-5">
      <CardContent className="space-y-2 px-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

// MARK: - Ventas por hora

function SalesByHourCard({ stats, weekday }: { stats: Stats; weekday: string }) {
  const data = stats.salesByHour.map((h) => ({ ...h, label: formatHour(h.hour) }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Ventas por hora</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Legend className="bg-primary" label="Hoy" />
          <Legend className="bg-muted-foreground/30" label={`${weekday} pasado`} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <Empty text="Todavía no hay ventas hoy ni el mismo día de la semana pasada." />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} margin={{ left: -8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={56}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={<ChartTooltip formatter={(v) => money(v)} names={{ today: "Hoy", lastWeek: `${weekday} pasado` }} />}
                />
                <Bar dataKey="lastWeek" fill="var(--muted-foreground)" fillOpacity={0.25} radius={[4, 4, 0, 0]} />
                <Bar dataKey="today" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// MARK: - Requiere atención

function AttentionCard({ stats }: { stats: Stats }) {
  const { attention, surveys, expenses } = stats;
  const items = [
    attention.onlinePending > 0 && {
      key: "online",
      icon: Globe,
      tone: "urgent" as const,
      title: `${attention.onlinePending} pedido${attention.onlinePending === 1 ? "" : "s"} en línea por aceptar`,
      detail: "Acéptalos o recházalos en el POS",
      href: "/orders/history",
    },
    attention.openTables > 0 && {
      key: "tables",
      icon: Armchair,
      tone: "info" as const,
      title: `${attention.openTables} mesa${attention.openTables === 1 ? "" : "s"} con cuenta abierta`,
      detail: "Órdenes sin cobrar de hoy",
      href: "/tables",
    },
    surveys.low.length > 0 && {
      key: "surveys",
      icon: Smiley,
      tone: "warn" as const,
      title: `${surveys.low.length} encuesta${surveys.low.length === 1 ? "" : "s"} con 3★ o menos`,
      detail: surveys.low[0]?.improvement
        ? `“${surveys.low[0].improvement.slice(0, 70)}${surveys.low[0].improvement.length > 70 ? "…" : ""}”`
        : "Últimos 7 días",
      href: "/surveys",
    },
    expenses.count > 0 && {
      key: "expenses",
      icon: Receipt,
      tone: "info" as const,
      title: `${money(expenses.total)} en gastos hoy`,
      detail: `${expenses.count} registro${expenses.count === 1 ? "" : "s"}`,
      href: "/expenses",
    },
    attention.lowStock > 0 && {
      key: "stock",
      icon: Package,
      tone: "warn" as const,
      title: `${attention.lowStock} ingrediente${attention.lowStock === 1 ? "" : "s"} bajo mínimo`,
      detail: "Revisa existencias",
      href: "/inventory/stock",
    },
  ].filter(Boolean) as {
    key: string;
    icon: typeof Globe;
    tone: "urgent" | "warn" | "info";
    title: string;
    detail: string;
    href: string;
  }[];

  const toneClass = {
    urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    info: "bg-muted text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pendientes</CardTitle>
        <CardDescription>
          {surveys.count > 0
            ? `Clientes 7 días: ${surveys.avg?.toFixed(1)}★${surveys.nps !== null ? ` · NPS ${surveys.nps}` : ""} · ${surveys.count} encuesta${surveys.count === 1 ? "" : "s"}`
            : "Lo que pide tu atención ahora"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle className="size-8 text-emerald-600 dark:text-emerald-400" weight="fill" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-xs text-muted-foreground">Sin pedidos por aceptar ni alertas.</p>
          </div>
        ) : (
          <ul className="-mx-2 space-y-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass[item.tone])}>
                    <item.icon className="size-4" weight="fill" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <ArrowRight className="mt-2 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// MARK: - Últimos 14 días

function SalesByDayCard({ stats }: { stats: Stats }) {
  const todayKey = dateKeyCDMX();
  const data = stats.salesByDay.map((d) => {
    const day = fromDateKey(d.date);
    return { ...d, label: formatWeekdayShort(day).replace(".", ""), full: formatDayShort(day), isToday: d.date === todayKey };
  });
  const total = data.reduce((s, d) => s + d.sales, 0);
  const daysWithSales = data.filter((d) => d.sales > 0 && !d.isToday);
  const best = daysWithSales.reduce<(typeof data)[number] | null>((b, d) => (!b || d.sales > b.sales ? d : b), null);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Últimos 14 días</CardTitle>
        <CardDescription>
          {money(total)} en ventas
          {best ? ` · mejor día ${best.full} (${money(best.sales)})` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" interval={0} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={56}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={
                  <ChartTooltip
                    formatter={(v) => money(v)}
                    names={{ sales: "Ventas" }}
                    labelFor={(payload) => {
                      const p = payload as (typeof data)[number] | undefined;
                      return p ? `${p.full}${p.isToday ? " (hoy)" : ""} · ${p.orders} órdenes` : "";
                    }}
                  />
                }
              />
              <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.date} fill={d.isToday ? "var(--primary)" : "var(--muted-foreground)"} fillOpacity={d.isToday ? 1 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// MARK: - Lo más vendido

function TopProductsCard({ stats }: { stats: Stats }) {
  const top = stats.topProducts;
  const max = Math.max(...top.map((p) => p.quantity), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo más vendido hoy</CardTitle>
        <CardDescription>Platillos sueltos, sin incluidos de paquete</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <Empty text="Aún no hay platillos vendidos hoy." />
        ) : (
          <ol className="space-y-3">
            {top.map((p, i) => (
              <li key={p.name} className="space-y-1.5">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className={cn("w-4 text-xs font-semibold tabular-nums", i === 0 ? "text-primary" : "text-muted-foreground")}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">{money(p.revenue)}</span>
                  <span className="w-8 text-right font-semibold tabular-nums">{p.quantity}</span>
                </div>
                <div className="ml-7 h-1 rounded-full bg-muted">
                  <div
                    className={cn("h-1 rounded-full", i === 0 ? "bg-primary" : "bg-primary/40")}
                    style={{ width: `${Math.max((p.quantity / max) * 100, 4)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// MARK: - Piezas comunes

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 capitalize">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>;
}

type TooltipPayload = { dataKey?: string | number; value?: number; color?: string; payload?: unknown };

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  names,
  labelFor,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatter: (v: number) => string;
  names: Record<string, string>;
  labelFor?: (payload: unknown) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium capitalize">{labelFor ? labelFor(payload[0]?.payload) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="capitalize text-muted-foreground">{names[String(p.dataKey)] ?? p.dataKey}</span>
          <span className="font-semibold tabular-nums">{formatter(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="gap-3 py-5">
            <CardContent className="space-y-3 px-5">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-[340px] animate-pulse rounded-xl bg-muted lg:col-span-2" />
        <div className="h-[340px] animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
