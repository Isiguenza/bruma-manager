/**
 * Todo el dashboard muestra fechas y horas en hora de CDMX, sin importar la
 * zona del navegador ni la del servidor (que corre en UTC). Usa estos helpers
 * en vez de `toLocaleString()` suelto.
 *
 * Ojo con los datos: la DB guarda `timestamp` SIN zona en UTC. Los agrupados
 * por día/hora se hacen en SQL con `AT TIME ZONE 'UTC' AT TIME ZONE
 * 'America/Mexico_City'` (ver `app/api/dashboard/stats`).
 */
import { TZDate } from "@date-fns/tz";

export const BRUMA_TZ = "America/Mexico_City";

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

function fmt(d: DateInput, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-MX", { timeZone: BRUMA_TZ, ...options }).format(toDate(d));
}

/** "3:20 p.m." */
export const formatTime = (d: DateInput) => fmt(d, { hour: "numeric", minute: "2-digit" });

/** "8 nov" */
export const formatDayShort = (d: DateInput) => fmt(d, { day: "numeric", month: "short" });

/** "domingo 8 de noviembre" */
export const formatDayLong = (d: DateInput) => fmt(d, { weekday: "long", day: "numeric", month: "long" });

/** "8 nov, 3:20 p.m." */
export const formatDateTime = (d: DateInput) =>
  fmt(d, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "domingo" */
export const formatWeekdayLong = (d: DateInput) => fmt(d, { weekday: "long" });

/** "dom" — para ejes de gráficas. */
export const formatWeekdayShort = (d: DateInput) => fmt(d, { weekday: "short" });

/** Hora 0–23 → "3 pm" (horas que ya vienen agrupadas en CDMX desde SQL). */
export const formatHour = (hour: number) => {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
};

/** Hora 0–23 en CDMX de una fecha (por default, ahora). */
export const hourCDMX = (d: DateInput = new Date()) => Number(fmt(d, { hour: "numeric", hourCycle: "h23" }));

/** Hora actual 0–23 en CDMX. */
export const currentHourCDMX = () => hourCDMX();

/** "YYYY-MM-DD" de una fecha en CDMX. */
export const dateKeyCDMX = (d: DateInput = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BRUMA_TZ }).format(toDate(d));

/** Fecha "YYYY-MM-DD" (día calendario, ya en CDMX) → Date al mediodía UTC, para formatearla sin brincar de día. */
export const fromDateKey = (key: string) => new Date(`${key}T18:00:00Z`);

/**
 * Día calendario "YYYY-MM-DD" → instante de inicio / último milisegundo de ese
 * día EN CDMX. Para filtros por fecha del lado del servidor (que corre en UTC):
 * `new Date("2026-11-07T23:59:59")` sin zona se lee en UTC y corta a las 5:59 pm.
 */
export function cdmxDayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, BRUMA_TZ).getTime());
}

export function cdmxDayEnd(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 23, 59, 59, 999, BRUMA_TZ).getTime());
}
