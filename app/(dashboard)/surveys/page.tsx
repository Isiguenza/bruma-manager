"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as dfns from "date-fns";
import { tz } from "@date-fns/tz";
import { es } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowSquareOut,
  ChatCircleText,
  CheckCircle,
  ForkKnife,
  HandHeart,
  Lightning,
  MagnifyingGlass,
  MinusCircle,
  Sparkle,
  Star,
  Tag,
  TrendDown,
  TrendUp,
  X,
  XCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { BRUMA_TZ } from "@/lib/time";

// Todo en hora de CDMX, sin importar la zona del navegador (mismo patrón que /expenses).
const IN = { in: tz(BRUMA_TZ) };
const subDays = (d: Date, n: number) => dfns.subDays(d, n, IN);
const subMonths = (d: Date, n: number) => dfns.subMonths(d, n, IN);
const startOfDay = (d: Date) => dfns.startOfDay(d, IN);
const endOfDay = (d: Date) => dfns.endOfDay(d, IN);
const startOfHour = (d: Date) => dfns.startOfHour(d, IN);
const startOfMonth = (d: Date) => dfns.startOfMonth(d, IN);
const differenceInCalendarDays = (a: Date, b: Date) => dfns.differenceInCalendarDays(a, b, IN);
const eachDayOfInterval = (i: dfns.Interval) => dfns.eachDayOfInterval(i, IN);
const eachHourOfInterval = (i: dfns.Interval) => dfns.eachHourOfInterval(i, IN);
const isSameDay = (a: Date, b: Date) => dfns.isSameDay(a, b, IN);
const format = (d: Date, f: string, o?: { locale?: dfns.Locale }) => dfns.format(d, f, { ...o, ...IN });
const formatDistanceToNow = dfns.formatDistanceToNow;

// Respuestas de la encuesta pública (cocinabruma.com.mx/encuesta, QR del
// ticket de cuenta). Se guardan desde el api-server; aquí solo se leen.

type BestAspect = "comida" | "servicio" | "ambiente" | "rapidez" | "precio";

interface SurveyResponse {
  id: string;
  orderId: string | null;
  orderNumber: number | null;
  overallRating: number;
  bestAspects: BestAspect[];
  improvement: string | null;
  staffRating: number | null;
  orderAsExpected: "si" | "parcialmente" | "no" | null;
  nps: number | null;
  wouldReturn: "si" | "no" | "tal_vez" | null;
  dish: string | null;
  createdAt: string;
  waiterId: string | null;
  waiterName: string | null;
  tableNumber: string | null;
}

interface Previous {
  count: number;
  overallAvg: number | null;
  nps: number | null;
}

type RangeKey = "today" | "7d" | "30d" | "month" | "lastMonth";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
  { key: "lastMonth", label: "Mes pasado" },
];

// Mismo criterio que /expenses: los rangos en curso terminan AHORA, así el
// periodo anterior (que calcula la API) dura lo mismo.
function rangeBounds(key: RangeKey, now = new Date()) {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: now, end: endOfDay(now) };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: now, end: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: now, end: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: now, end: endOfDay(now) };
    case "lastMonth": {
      const from = startOfMonth(subMonths(now, 1));
      const to = startOfMonth(now);
      return { from, to, end: endOfDay(subDays(to, 1)) };
    }
  }
}

function periodLabel(from: Date, end: Date) {
  if (isSameDay(from, end)) return format(from, "d 'de' MMMM", { locale: es });
  return `${format(from, "d MMM", { locale: es })} – ${format(end, "d MMM", { locale: es })}`;
}

const FACES = ["😞", "😕", "😐", "🙂", "😍"];
const FACE_LABELS = ["Mala", "Regular", "Bien", "Muy bien", "Excelente"];

const ASPECTS: { key: BestAspect; label: string; icon: Icon }[] = [
  { key: "comida", label: "Comida", icon: ForkKnife },
  { key: "servicio", label: "Servicio", icon: HandHeart },
  { key: "ambiente", label: "Ambiente", icon: Sparkle },
  { key: "rapidez", label: "Rapidez", icon: Lightning },
  { key: "precio", label: "Precio", icon: Tag },
];

const ORDER_LABELS = { si: "Sí, como lo esperaba", parcialmente: "Más o menos", no: "No" } as const;
const RETURN_LABELS = { si: "Sí", tal_vez: "Tal vez", no: "No" } as const;

type FeedFilter = "comments" | "low" | "all";

const FEED_PAGE = 8;

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

interface Filters {
  rating: number | null;
  aspect: BestAspect | null;
  waiterId: string | null;
}

const NO_FILTERS: Filters = { rating: null, aspect: null, waiterId: null };

export default function SurveysPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [previous, setPrevious] = useState<Previous | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (key: RangeKey) => {
    setLoading(true);
    setError(false);
    try {
      const { from, to } = rangeBounds(key);
      const res = await fetch(`/api/surveys?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResponses(data.responses ?? []);
      setPrevious(data.previous ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
    setFilters(NO_FILTERS);
    setFeedLimit(FEED_PAGE);
  }, [range, load]);

  const bounds = rangeBounds(range);

  const stats = useMemo(() => {
    const overall = responses.map((r) => r.overallRating);
    const staff = responses.flatMap((r) => (r.staffRating ? [r.staffRating] : []));
    const npsValues = responses.flatMap((r) => (r.nps !== null ? [r.nps] : []));
    const promoters = npsValues.filter((n) => n >= 9).length;
    const detractors = npsValues.filter((n) => n <= 6).length;
    const passives = npsValues.length - promoters - detractors;
    const returnAnswers = responses.filter((r) => r.wouldReturn);
    const orderAnswers = responses.filter((r) => r.orderAsExpected);
    return {
      count: responses.length,
      overallAvg: avg(overall),
      distribution: [1, 2, 3, 4, 5].map((v) => overall.filter((o) => o === v).length),
      staffAvg: avg(staff),
      nps: npsValues.length ? Math.round(((promoters - detractors) / npsValues.length) * 100) : null,
      npsBreakdown: { promoters, passives, detractors, total: npsValues.length },
      returnYes: pct(returnAnswers.filter((r) => r.wouldReturn === "si").length, returnAnswers.length),
      orderOk: pct(orderAnswers.filter((r) => r.orderAsExpected === "si").length, orderAnswers.length),
      aspects: ASPECTS.map((a) => ({
        ...a,
        count: responses.filter((r) => r.bestAspects?.includes(a.key)).length,
      })).sort((a, b) => b.count - a.count),
    };
  }, [responses]);

  // Calificación por mesero (la orden del QR trae quién la atendió).
  const waiters = useMemo(() => {
    const map = new Map<string, { id: string; name: string; list: SurveyResponse[] }>();
    for (const r of responses) {
      if (!r.waiterId) continue;
      if (!map.has(r.waiterId)) map.set(r.waiterId, { id: r.waiterId, name: r.waiterName ?? "Sin nombre", list: [] });
      map.get(r.waiterId)!.list.push(r);
    }
    return [...map.values()]
      .map((w) => {
        const staff = w.list.flatMap((r) => (r.staffRating ? [r.staffRating] : []));
        const comments = w.list.filter((r) => r.improvement).length;
        return { id: w.id, name: w.name, count: w.list.length, overall: avg(w.list.map((r) => r.overallRating)), staff: avg(staff), comments };
      })
      .sort((a, b) => b.count - a.count || (b.staff ?? 0) - (a.staff ?? 0));
  }, [responses]);

  // Hoy: promedio por hora. Varios días: promedio móvil de los últimos 7 días
  // en cada día — el promedio de un solo día con 2–3 respuestas brinca tanto
  // que la línea no dice nada. Solo puntos con datos (sin huecos `null`).
  const trend = useMemo(() => {
    const byHour = range === "today";
    const end = range === "lastMonth" ? bounds.end : new Date();
    const buckets = byHour
      ? eachHourOfInterval({ start: bounds.from, end })
      : eachDayOfInterval({ start: bounds.from, end });
    return buckets.flatMap((bucket) => {
      const inBucket = responses.filter((r) => {
        const d = new Date(r.createdAt);
        return byHour ? startOfHour(d).getTime() === bucket.getTime() : isSameDay(d, bucket);
      });
      if (inBucket.length === 0) return [];
      const window = byHour
        ? inBucket
        : responses.filter((r) => {
            const d = startOfDay(new Date(r.createdAt));
            return d <= bucket && d > subDays(bucket, 7);
          });
      return [
        {
          label: format(bucket, byHour ? "HH:mm" : "d MMM", { locale: es }),
          longLabel: format(bucket, byHour ? "HH:mm 'h'" : "EEEE d 'de' MMMM", { locale: es }),
          average: Number((avg(window.map((r) => r.overallRating)) ?? 0).toFixed(2)),
          dayAverage: Number((avg(inBucket.map((r) => r.overallRating)) ?? 0).toFixed(2)),
          count: inBucket.length,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, range]);

  const q = search.trim().toLowerCase();
  const feed = useMemo(() => {
    return responses.filter((r) => {
      if (feedFilter === "low" && !(r.overallRating <= 2 || (r.staffRating ?? 5) <= 2 || r.orderAsExpected === "no")) return false;
      if (feedFilter === "comments" && !(r.improvement || r.dish)) return false;
      if (filters.rating !== null && r.overallRating !== filters.rating) return false;
      if (filters.aspect && !r.bestAspects?.includes(filters.aspect)) return false;
      if (filters.waiterId && r.waiterId !== filters.waiterId) return false;
      if (q && ![r.improvement, r.dish, r.waiterName, r.orderNumber && `#${r.orderNumber}`].some((t) => t && String(t).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [responses, feedFilter, filters, q]);

  const selected = feed.find((r) => r.id === selectedId) ?? feed[0] ?? null;
  const lowCount = responses.filter((r) => r.overallRating <= 2 || (r.staffRating ?? 5) <= 2 || r.orderAsExpected === "no").length;
  const activeChips = [
    filters.rating !== null && { key: "rating", label: `${FACES[filters.rating - 1]} ${FACE_LABELS[filters.rating - 1]}`, clear: () => setFilters((f) => ({ ...f, rating: null })) },
    filters.aspect && { key: "aspect", label: `♥ ${ASPECTS.find((a) => a.key === filters.aspect)?.label}`, clear: () => setFilters((f) => ({ ...f, aspect: null })) },
    filters.waiterId && { key: "waiter", label: waiters.find((w) => w.id === filters.waiterId)?.name ?? "Mesero", clear: () => setFilters((f) => ({ ...f, waiterId: null })) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  /** Un clic en una gráfica filtra los comentarios y baja a verlos. */
  function filterBy(patch: Partial<Filters>) {
    setFilters((f) => {
      const next = { ...f };
      for (const [k, v] of Object.entries(patch) as [keyof Filters, never][]) next[k] = f[k] === v ? null as never : v;
      return next;
    });
    setFeedFilter("all");
    setFeedLimit(FEED_PAGE);
    setSelectedId(null);
    document.getElementById("survey-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const showTrend = differenceInCalendarDays(bounds.end, bounds.from) >= 1 || range === "today";

  return (
    <div
      className={cn(
        "space-y-6",
        // NPS: paleta divergente validada (dataviz) — naranja / gris / azul.
        "[--nps-detractor:#e0712f] [--nps-passive:#9aa0a6] [--nps-promoter:#1d6fe8]",
        "dark:[--nps-detractor:#d97030] dark:[--nps-passive:#8b9096] dark:[--nps-promoter:#4a8df5]"
      )}
    >
      <PageHeader
        title="Encuestas"
        description={
          <>
            QR del ticket de cuenta · {periodLabel(bounds.from, bounds.end)}
            {!loading && ` · ${stats.count} respuesta${stats.count === 1 ? "" : "s"}`}
          </>
        }
        actions={
          <>
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-muted/40 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <a
              href="https://cocinabruma.com.mx/encuesta"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver encuesta <ArrowSquareOut className="size-4" />
            </a>
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No se pudieron cargar las encuestas.{" "}
            <button onClick={() => load(range)} className="font-medium text-foreground underline underline-offset-4">
              Reintentar
            </button>
          </CardContent>
        </Card>
      ) : !loading && stats.count === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Hero: calificación general + NPS */}
          <Card className="overflow-hidden py-0">
            <CardContent className="grid gap-0 p-0 md:grid-cols-2">
              <div className="flex flex-col gap-5 border-b p-6 md:border-r md:border-b-0">
                <p className="text-sm text-muted-foreground">Experiencia general</p>
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="flex flex-wrap items-end justify-between gap-6">
                    <div>
                      <p className="text-5xl font-semibold tracking-tight tabular-nums">
                        {stats.overallAvg?.toFixed(1) ?? "—"}
                        <span className="text-xl font-normal text-muted-foreground"> / 5</span>
                      </p>
                      <Stars value={stats.overallAvg ?? 0} className="mt-2" />
                      <Delta
                        current={stats.overallAvg}
                        previous={previous?.overallAvg ?? null}
                        format={(d) => `${Math.abs(d).toFixed(1)} pts`}
                      />
                    </div>
                    <Distribution counts={stats.distribution} selected={filters.rating} onSelect={(rating) => filterBy({ rating })} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-5 p-6">
                <p className="text-sm text-muted-foreground">
                  NPS <span className="text-xs">· ¿nos recomendarían?</span>
                </p>
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <NpsBlock nps={stats.nps} breakdown={stats.npsBreakdown} previous={previous?.nps ?? null} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Datos rápidos */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MiniStat
              loading={loading}
              label="Respuestas"
              value={String(stats.count)}
              hint={previous && previous.count > 0 ? `${previous.count} el periodo anterior` : undefined}
            />
            <MiniStat
              loading={loading}
              label="Atención del personal"
              value={stats.staffAvg !== null ? `${stats.staffAvg.toFixed(1)} / 5` : "—"}
              icon={<Star className="size-4 text-amber-500" weight="fill" />}
            />
            <MiniStat
              loading={loading}
              label="Volvería"
              value={stats.returnYes !== null ? `${stats.returnYes}%` : "—"}
              hint="dijo que sí"
              progress={stats.returnYes}
            />
            <MiniStat
              loading={loading}
              label="Pedido correcto"
              value={stats.orderOk !== null ? `${stats.orderOk}%` : "—"}
              hint="llegó como lo esperaban"
              progress={stats.orderOk}
            />
          </div>

          {/* Tendencia + lo mejor */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardContent>
                <p className="mb-4 text-sm font-medium">
                  {range === "today" ? "Calificación por hora" : "Calificación promedio"}
                  {range !== "today" && <span className="ml-1.5 text-xs font-normal text-muted-foreground">últimos 7 días, día a día</span>}
                </p>
                <div className="h-56">
                  {loading ? (
                    <Skeleton className="size-full" />
                  ) : !showTrend ? null : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="surveyFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={24} />
                        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                        <Tooltip
                          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as (typeof trend)[number];
                            return (
                              <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                                <p className="text-xs capitalize text-muted-foreground">{p.longLabel}</p>
                                <p className="font-semibold tabular-nums">{p.average.toFixed(1)} / 5</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  Ese día: {p.dayAverage.toFixed(1)} · {p.count} respuesta{p.count === 1 ? "" : "s"}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="average"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          fill="url(#surveyFill)"
                          dot={{ r: 3, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
                          activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardContent>
                <p className="mb-4 text-sm font-medium">Lo mejor de su visita</p>
                {loading ? (
                  <div className="space-y-3">
                    {ASPECTS.map((a) => (
                      <Skeleton key={a.key} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {stats.aspects.map(({ key, label, icon: AspectIcon, count }) => {
                      const share = pct(count, stats.count) ?? 0;
                      const on = filters.aspect === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => filterBy({ aspect: key })}
                          className={cn("group block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60", on && "bg-primary/10")}
                          title={`${count} de ${stats.count} respuestas · toca para ver sus comentarios`}
                        >
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <AspectIcon className={cn("size-4", on ? "text-primary" : "text-muted-foreground")} />
                              {label}
                            </span>
                            <span className="tabular-nums text-muted-foreground group-hover:text-foreground">{share}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${share}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Por mesero */}
          {!loading && waiters.length > 0 && (
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
                  <p className="text-sm font-medium">
                    Por mesero <span className="ml-1 text-xs font-normal text-muted-foreground">quién atendió la orden del QR · toca para ver sus encuestas</span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-3 border-y bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
                      <span>Mesero</span>
                      <span className="text-right">Encuestas</span>
                      <span className="text-right">Experiencia</span>
                      <span className="text-right">Atención</span>
                      <span className="text-right">Comentarios</span>
                    </div>
                    {waiters.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => filterBy({ waiterId: w.id })}
                        className={cn(
                          "grid w-full grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] items-center gap-3 border-b px-5 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40",
                          filters.waiterId === w.id && "bg-primary/10"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {w.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </span>
                          <span className="truncate font-medium">{w.name}</span>
                        </span>
                        <span className="text-right tabular-nums">{w.count}</span>
                        <span className="text-right tabular-nums">{w.overall?.toFixed(1) ?? "—"}</span>
                        <span className="flex items-center justify-end gap-1 tabular-nums">
                          {w.staff !== null && <Star className="size-3.5 text-amber-500" weight="fill" />}
                          {w.staff?.toFixed(1) ?? "—"}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">{w.comments}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lo que nos dicen: lista + detalle */}
          <div id="survey-feed" className="scroll-mt-20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ChatCircleText className="size-5" />
                Lo que nos dicen
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                  {(
                    [
                      ["all", "Todas", stats.count],
                      ["comments", "Con comentario", responses.filter((r) => r.improvement || r.dish).length],
                      ["low", "Para atender", lowCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setFeedFilter(key);
                        setFeedLimit(FEED_PAGE);
                        setSelectedId(null);
                      }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        feedFilter === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                      <span className={cn("ml-1.5 text-xs tabular-nums", key === "low" && count > 0 ? "text-[color:var(--nps-detractor)]" : "opacity-60")}>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar en comentarios…"
                    className="h-9 w-48 rounded-lg border bg-background pr-2 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filtrado por</span>
                {activeChips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-medium text-primary">
                    {c.label}
                    <button type="button" onClick={c.clear} className="flex size-4 items-center justify-center rounded-full hover:bg-primary/15" aria-label={`Quitar ${c.label}`}>
                      <X className="size-2.5" weight="bold" />
                    </button>
                  </span>
                ))}
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className="px-1 text-xs text-muted-foreground hover:text-foreground">
                  Quitar filtros
                </button>
              </div>
            )}

            {loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                {feedFilter === "low" && activeChips.length === 0 && !q ? "Nada que atender en este periodo 🎉" : "Ninguna encuesta con estos filtros"}
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="min-w-0 space-y-2">
                  {feed.slice(0, feedLimit).map((r) => (
                    <FeedRow key={r.id} response={r} selected={selected?.id === r.id} onOpen={() => setSelectedId(r.id)} />
                  ))}
                  {feed.length > feedLimit && (
                    <button
                      onClick={() => setFeedLimit((n) => n + FEED_PAGE * 2)}
                      className="w-full rounded-xl border py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Ver más ({feed.length - feedLimit})
                    </button>
                  )}
                </div>
                <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">{selected && <ResponseDetail response={selected} />}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────

function Stars({ value, className, size = "size-5" }: { value: number; className?: string; size?: string }) {
  return (
    <div className={cn("flex gap-0.5", className)} aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= Math.round(value) ? "text-amber-500" : "text-muted-foreground/30")}
          weight="fill"
        />
      ))}
    </div>
  );
}

function Delta({
  current,
  previous,
  format: formatDelta,
}: {
  current: number | null;
  previous: number | null;
  format: (d: number) => string;
}) {
  if (current === null || previous === null) return null;
  const d = current - previous;
  if (Math.abs(d) < 0.05) {
    return <p className="mt-3 text-xs text-muted-foreground">Igual que el periodo anterior</p>;
  }
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
      {d > 0 ? <TrendUp className="size-3.5" weight="bold" /> : <TrendDown className="size-3.5" weight="bold" />}
      {formatDelta(d)} {d > 0 ? "más" : "menos"} que el periodo anterior
    </p>
  );
}

/** Histograma mini: cuántos eligieron cada carita. Tocar una barra filtra los comentarios. */
function Distribution({ counts, selected, onSelect }: { counts: number[]; selected: number | null; onSelect: (rating: number) => void }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="flex h-24 items-end gap-1.5" aria-label="Distribución de calificaciones">
      {counts.map((count, i) => (
        <button
          key={i}
          type="button"
          onClick={() => count > 0 && onSelect(i + 1)}
          disabled={count === 0}
          className={cn(
            "group flex w-8 flex-col items-center gap-1 rounded-md transition-opacity disabled:cursor-default",
            selected !== null && selected !== i + 1 && "opacity-40"
          )}
          title={`${FACE_LABELS[i]}: ${count}${count ? " · toca para ver sus comentarios" : ""}`}
        >
          <span className={cn("text-[11px] tabular-nums text-muted-foreground transition-opacity", selected === i + 1 ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            {count}
          </span>
          <div className="flex h-14 w-full items-end">
            <div
              className={cn("w-full rounded-t transition-colors", i >= 3 ? "bg-primary" : "bg-primary/35", count > 0 && "group-hover:bg-primary/80")}
              style={{ height: `${Math.max((count / max) * 100, count ? 8 : 3)}%` }}
            />
          </div>
          <span className="text-base leading-none">{FACES[i]}</span>
        </button>
      ))}
    </div>
  );
}

function NpsBlock({
  nps,
  breakdown,
  previous,
}: {
  nps: number | null;
  breakdown: { promoters: number; passives: number; detractors: number; total: number };
  previous: number | null;
}) {
  if (nps === null) return <p className="text-sm text-muted-foreground">Sin respuestas de recomendación</p>;
  const segments = [
    { key: "detractors", label: "Detractores", hint: "0–6", count: breakdown.detractors, color: "var(--nps-detractor)" },
    { key: "passives", label: "Neutros", hint: "7–8", count: breakdown.passives, color: "var(--nps-passive)" },
    { key: "promoters", label: "Promotores", hint: "9–10", count: breakdown.promoters, color: "var(--nps-promoter)" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <p className="text-5xl font-semibold tracking-tight tabular-nums">
          {nps > 0 ? "+" : ""}
          {nps}
        </p>
        <p className="text-sm text-muted-foreground">{npsVerdict(nps)}</p>
      </div>
      {/* Una barra dividida; 2px de separación entre segmentos y % escrito abajo. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.key}
              className="h-full transition-[flex-grow] duration-700 ease-out"
              style={{ flexGrow: s.count, background: s.color }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex items-start gap-1.5">
            <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <div>
              <p className="font-medium tabular-nums text-foreground">{pct(s.count, breakdown.total) ?? 0}%</p>
              <p className="text-muted-foreground">
                {s.label} <span className="opacity-70">({s.hint})</span>
              </p>
            </div>
          </div>
        ))}
      </div>
      {previous !== null && previous !== nps && (
        <p className="text-xs text-muted-foreground">
          {nps > previous ? "Subió" : "Bajó"} desde {previous > 0 ? "+" : ""}
          {previous} el periodo anterior
        </p>
      )}
    </div>
  );
}

function npsVerdict(nps: number) {
  if (nps >= 70) return "Excelente";
  if (nps >= 50) return "Muy bueno";
  if (nps >= 0) return "Bueno";
  return "Hay que mejorar";
}

function MiniStat({
  label,
  value,
  hint,
  icon,
  progress,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  progress?: number | null;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
            {icon}
            {value}
          </p>
        )}
        {progress != null && !loading && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
          </div>
        )}
        {hint && !loading && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function FeedRow({ response: r, selected, onOpen }: { response: SurveyResponse; selected: boolean; onOpen: () => void }) {
  const low = r.overallRating <= 2 || r.orderAsExpected === "no";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40",
        low && "border-l-4 border-l-[color:var(--nps-detractor)]",
        selected && "ring-2 ring-primary/40"
      )}
    >
      <span className="text-2xl leading-none">{FACES[r.overallRating - 1]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {FACE_LABELS[r.overallRating - 1]}
            {r.waiterName && <span className="font-normal text-muted-foreground"> · {r.waiterName.split(" ")[0]}</span>}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { locale: es, addSuffix: true })}</span>
        </div>
        {r.improvement ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">“{r.improvement}”</p>
        ) : r.dish ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <ForkKnife className="mr-1 inline size-3" />
            {r.dish}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/70">Sin comentario</p>
        )}
      </div>
      {r.nps !== null && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums text-white"
          style={{ background: r.nps >= 9 ? "var(--nps-promoter)" : r.nps <= 6 ? "var(--nps-detractor)" : "var(--nps-passive)" }}
          title="¿Nos recomendaría? (0–10)"
        >
          {r.nps}
        </span>
      )}
    </button>
  );
}

function ResponseDetail({ response: r }: { response: SurveyResponse }) {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="text-4xl leading-none">{FACES[r.overallRating - 1]}</span>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{FACE_LABELS[r.overallRating - 1]}</p>
          <p className="text-sm capitalize text-muted-foreground">
            {format(new Date(r.createdAt), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
          </p>
          <p className="text-xs text-muted-foreground">
            {[r.orderNumber && `Orden #${r.orderNumber}`, r.tableNumber && `Mesa ${r.tableNumber}`, r.waiterName && `Atendió ${r.waiterName}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {r.improvement && (
        <blockquote className="rounded-xl bg-muted/50 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Qué podríamos mejorar</p>
          <p className="text-[15px] leading-relaxed">“{r.improvement}”</p>
        </blockquote>
      )}
      <div className="divide-y rounded-xl border text-sm">
        <Row label="Experiencia general">
          <Stars value={r.overallRating} size="size-4" />
        </Row>
        <Row label="Atención del personal">{r.staffRating ? <Stars value={r.staffRating} size="size-4" /> : "—"}</Row>
        <Row label="Lo mejor">
          {r.bestAspects?.length ? (
            <span className="flex flex-wrap justify-end gap-1">
              {r.bestAspects.map((a) => (
                <span key={a} className="rounded-full border px-2 py-0.5 text-xs">
                  {ASPECTS.find((x) => x.key === a)?.label ?? a}
                </span>
              ))}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Pedido como lo esperaba">
          {r.orderAsExpected ? (
            <span className="inline-flex items-center gap-1.5">
              {r.orderAsExpected === "si" ? (
                <CheckCircle className="size-4 text-primary" weight="fill" />
              ) : r.orderAsExpected === "parcialmente" ? (
                <MinusCircle className="size-4 text-muted-foreground" weight="fill" />
              ) : (
                <XCircle className="size-4" style={{ color: "var(--nps-detractor)" }} weight="fill" />
              )}
              {ORDER_LABELS[r.orderAsExpected]}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="¿Nos recomendaría?">{r.nps !== null ? `${r.nps} / 10` : "—"}</Row>
        <Row label="¿Volvería?">{r.wouldReturn ? RETURN_LABELS[r.wouldReturn] : "—"}</Row>
        <Row label="Pidió">{r.dish || "—"}</Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-5xl">💬</span>
        <p className="text-lg font-semibold">Todavía no hay respuestas en este periodo</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Las respuestas llegan cuando los clientes escanean el QR que sale al final del ticket de cuenta.
        </p>
      </CardContent>
    </Card>
  );
}
