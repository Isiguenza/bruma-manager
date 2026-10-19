"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfDay,
  format,
  formatDistanceToNow,
  isSameDay,
  startOfDay,
  startOfHour,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowSquareOut,
  ChatCircleText,
  CheckCircle,
  ForkKnife,
  HandHeart,
  Lightning,
  MinusCircle,
  Sparkle,
  Star,
  Tag,
  TrendDown,
  TrendUp,
  XCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

const FEED_PAGE = 6;

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

export default function SurveysPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [previous, setPrevious] = useState<Previous | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("comments");
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE);
  const [selected, setSelected] = useState<SurveyResponse | null>(null);

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

  const feed = useMemo(() => {
    if (feedFilter === "low") return responses.filter((r) => r.overallRating <= 2 || (r.staffRating ?? 5) <= 2 || r.orderAsExpected === "no");
    if (feedFilter === "comments") return responses.filter((r) => r.improvement || r.dish);
    return responses;
  }, [responses, feedFilter]);

  const showTrend = differenceInCalendarDays(bounds.end, bounds.from) >= 1 || range === "today";

  return (
    <div
      className={cn(
        "mx-auto max-w-6xl space-y-6",
        // NPS: paleta divergente validada (dataviz) — naranja / gris / azul.
        "[--nps-detractor:#e0712f] [--nps-passive:#9aa0a6] [--nps-promoter:#1d6fe8]",
        "dark:[--nps-detractor:#d97030] dark:[--nps-passive:#8b9096] dark:[--nps-promoter:#4a8df5]"
      )}
    >
      {/* Encabezado */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">QR del ticket de cuenta</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Encuestas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {periodLabel(bounds.from, bounds.end)}
            {!loading && ` · ${stats.count} respuesta${stats.count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
        </div>
      </div>

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
                  <div className="flex items-end justify-between gap-6">
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
                    <Distribution counts={stats.distribution} />
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
            <Card>
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
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                          minTickGap={24}
                        />
                        <YAxis
                          domain={[1, 5]}
                          ticks={[1, 2, 3, 4, 5]}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                        />
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

            <Card>
              <CardContent>
                <p className="mb-4 text-sm font-medium">Lo mejor de su visita</p>
                {loading ? (
                  <div className="space-y-3">
                    {ASPECTS.map((a) => (
                      <Skeleton key={a.key} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {stats.aspects.map(({ key, label, icon: AspectIcon, count }) => {
                      const share = pct(count, stats.count) ?? 0;
                      return (
                        <div key={key} className="group" title={`${count} de ${stats.count} respuestas`}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <AspectIcon className="size-4 text-muted-foreground" />
                              {label}
                            </span>
                            <span className="tabular-nums text-muted-foreground group-hover:text-foreground">
                              {share}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lo que nos dicen */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ChatCircleText className="size-5" />
                Lo que nos dicen
              </h2>
              <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                {(
                  [
                    ["comments", "Con comentario"],
                    ["low", "Para atender"],
                    ["all", "Todas"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setFeedFilter(key);
                      setFeedLimit(FEED_PAGE);
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      feedFilter === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                {feedFilter === "low" ? "Nada que atender en este periodo 🎉" : "Sin comentarios en este periodo"}
              </p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {feed.slice(0, feedLimit).map((r) => (
                    <FeedCard key={r.id} response={r} onOpen={() => setSelected(r)} />
                  ))}
                </div>
                {feed.length > feedLimit && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setFeedLimit((n) => n + FEED_PAGE * 2)}
                      className="rounded-full border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Ver más ({feed.length - feedLimit})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <ResponseDialog response={selected} onClose={() => setSelected(null)} />
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

/** Histograma mini: cuántos eligieron cada carita. */
function Distribution({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="flex h-24 items-end gap-1.5" aria-label="Distribución de calificaciones">
      {counts.map((count, i) => (
        <div key={i} className="group flex w-8 flex-col items-center gap-1" title={`${FACE_LABELS[i]}: ${count}`}>
          <span className="text-[11px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {count}
          </span>
          <div className="flex h-14 w-full items-end">
            <div
              className={cn("w-full rounded-t", i >= 3 ? "bg-primary" : "bg-primary/35")}
              style={{ height: `${Math.max((count / max) * 100, count ? 8 : 3)}%` }}
            />
          </div>
          <span className="text-base leading-none">{FACES[i]}</span>
        </div>
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

function FeedCard({ response: r, onOpen }: { response: SurveyResponse; onOpen: () => void }) {
  const low = r.overallRating <= 2 || r.orderAsExpected === "no";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        low && "border-[color:var(--nps-detractor)]/40"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{FACES[r.overallRating - 1]}</span>
          <div>
            <p className="text-sm font-medium">{FACE_LABELS[r.overallRating - 1]}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(r.createdAt), { locale: es, addSuffix: true })}
              {r.orderNumber && ` · Orden #${r.orderNumber}`}
            </p>
          </div>
        </div>
        {r.nps !== null && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium tabular-nums text-white"
            style={{
              background: r.nps >= 9 ? "var(--nps-promoter)" : r.nps <= 6 ? "var(--nps-detractor)" : "var(--nps-passive)",
            }}
            title="¿Nos recomendaría? (0–10)"
          >
            {r.nps}/10
          </span>
        )}
      </div>
      {r.improvement && <p className="line-clamp-3 text-sm">“{r.improvement}”</p>}
      {(r.dish || (r.bestAspects?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.dish && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              <ForkKnife className="mr-1 inline size-3" />
              {r.dish}
            </span>
          )}
          {r.bestAspects?.map((a) => (
            <span key={a} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              ♥ {ASPECTS.find((x) => x.key === a)?.label ?? a}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function ResponseDialog({ response: r, onClose }: { response: SurveyResponse | null; onClose: () => void }) {
  return (
    <Dialog open={!!r} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {r && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-2xl">{FACES[r.overallRating - 1]}</span>
                {FACE_LABELS[r.overallRating - 1]}
              </DialogTitle>
              <DialogDescription>
                {format(new Date(r.createdAt), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
                {r.orderNumber && ` · Orden #${r.orderNumber}`}
              </DialogDescription>
            </DialogHeader>
            <div className="divide-y rounded-lg border text-sm">
              <Row label="Experiencia general">
                <Stars value={r.overallRating} size="size-4" />
              </Row>
              <Row label="Atención del personal">
                {r.staffRating ? <Stars value={r.staffRating} size="size-4" /> : "—"}
              </Row>
              <Row label="Lo mejor">
                {r.bestAspects?.length
                  ? r.bestAspects.map((a) => ASPECTS.find((x) => x.key === a)?.label ?? a).join(", ")
                  : "—"}
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
            {r.improvement && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Qué podríamos mejorar</p>
                <p className="text-sm">{r.improvement}</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
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
