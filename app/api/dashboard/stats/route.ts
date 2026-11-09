import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  ingredients,
  cashRegisters,
  userProfiles,
  surveyResponses,
  expenses,
} from "@/lib/db/schema";
import { eq, ne, sql, and, isNull, desc } from "drizzle-orm";
import { CUSTOM_MODIFIER_PRODUCT_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Los timestamps se guardan como `timestamp` SIN zona en UTC: todo se agrupa en
// hora de CDMX dentro de Postgres, sin depender de la zona del proceso.
const TZ = "America/Mexico_City";
const localTs = (col: unknown) => sql`(${col} AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})`;
const localDate = (col: unknown) => sql`(${localTs(col)})::date`;
const todayLocal = sql`(now() AT TIME ZONE ${TZ})::date`;
// Día de VENTA de una orden = el día en que se abrió la caja donde se cobró (así
// lo cuenta el Corte); sin caja, el día en que se creó. Con createdAt a secas, un
// consumo de empleado de octubre cobrado hoy entraba al corte de hoy pero no al
// Inicio, y los dos números no cuadraban.
const orderDay = sql`COALESCE((SELECT ${localDate(sql`cr.opened_at`)} FROM cash_registers cr WHERE cr.id = ${orders.cashRegisterId}), ${localDate(orders.createdAt)})`;
const nowLocalTime = sql`(now() AT TIME ZONE ${TZ})::time`;

// Misma definición de "venta" que el Corte (api-server cash-register):
// subtotal sin propina; si no hay subtotal, total − propina.
const saleAmount = sql`COALESCE(NULLIF(CAST(${orders.subtotal} AS NUMERIC), 0), CAST(${orders.total} AS NUMERIC) - CAST(${orders.tip} AS NUMERIC))`;
const paidReal = and(eq(orders.paymentStatus, "paid"), eq(orders.isPractice, false));

export async function GET() {
  try {
    const [
      [today],
      [lastWeekSoFar],
      [lastWeekFull],
      byHour,
      byDay,
      topProducts,
      [pending],
      register,
      [surveyStats],
      lowSurveys,
      [expenseStats],
      [lowStock],
    ] = await Promise.all([
      db
        .select({
          sales: sql<string>`COALESCE(SUM(${saleAmount}), 0)`,
          tips: sql<string>`COALESCE(SUM(CAST(${orders.tip} AS NUMERIC)), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(and(paidReal, sql`${orderDay} = ${todayLocal}`)),

      // Mismo día de la semana pasada, hasta la misma hora: comparación justa.
      db
        .select({ sales: sql<string>`COALESCE(SUM(${saleAmount}), 0)`, count: sql<number>`COUNT(*)::int` })
        .from(orders)
        .where(
          and(
            paidReal,
            sql`${orderDay} = ${todayLocal} - 7`,
            sql`(${localTs(orders.createdAt)})::time <= ${nowLocalTime}`
          )
        ),

      db
        .select({ sales: sql<string>`COALESCE(SUM(${saleAmount}), 0)` })
        .from(orders)
        .where(and(paidReal, sql`${orderDay} = ${todayLocal} - 7`)),

      db
        .select({
          day: sql<string>`CASE WHEN ${orderDay} = ${todayLocal} THEN 'today' ELSE 'lastWeek' END`,
          hour: sql<number>`EXTRACT(HOUR FROM ${localTs(orders.createdAt)})::int`,
          sales: sql<string>`SUM(${saleAmount})`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(and(paidReal, sql`${orderDay} IN (${todayLocal}, ${todayLocal} - 7)`))
        .groupBy(sql`1, 2`),

      db
        .select({
          date: sql<string>`${orderDay}::text`,
          sales: sql<string>`SUM(${saleAmount})`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(and(paidReal, sql`${orderDay} >= ${todayLocal} - 13`))
        .groupBy(sql`1`),

      // Platillos vendidos sueltos: sin incluidos de paquete, cortesías ni anulados.
      db
        .select({
          name: orderItems.productName,
          quantity: sql<number>`SUM(${orderItems.quantity})::int`,
          revenue: sql<string>`SUM(CAST(${orderItems.subtotal} AS NUMERIC))`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(
            paidReal,
            sql`${orderDay} = ${todayLocal}`,
            ne(orderItems.productId, CUSTOM_MODIFIER_PRODUCT_ID),
            isNull(orderItems.parentItemId),
            eq(orderItems.voided, false),
            eq(orderItems.isGuest, false)
          )
        )
        .groupBy(orderItems.productName)
        .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
        .limit(6),

      db
        .select({
          onlinePending: sql<number>`COUNT(*) FILTER (WHERE ${orders.source} = 'web' AND ${orders.status} = 'pending' AND ${orders.paymentStatus} IN ('authorized', 'paid'))::int`,
          // Cuentas abiertas en mesa de las últimas 18 h (las más viejas son basura de pruebas).
          openTables: sql<number>`COUNT(DISTINCT ${orders.tableId}) FILTER (WHERE ${orders.tableId} IS NOT NULL AND ${orders.paymentStatus} = 'pending' AND ${orders.status} <> 'cancelled' AND ${orders.createdAt} > (now() AT TIME ZONE 'UTC') - interval '18 hours')::int`,
        })
        .from(orders)
        .where(eq(orders.isPractice, false)),

      db
        .select({
          id: cashRegisters.id,
          openedAt: cashRegisters.openedAt,
          initialCash: cashRegisters.initialCash,
          openedBy: userProfiles.name,
        })
        .from(cashRegisters)
        .leftJoin(userProfiles, eq(cashRegisters.openedBy, userProfiles.id))
        .where(eq(cashRegisters.status, "open"))
        .orderBy(desc(cashRegisters.openedAt))
        .limit(1),

      db
        .select({
          count: sql<number>`COUNT(*)::int`,
          avg: sql<string | null>`AVG(${surveyResponses.overallRating})`,
          promoters: sql<number>`COUNT(*) FILTER (WHERE ${surveyResponses.nps} >= 9)::int`,
          detractors: sql<number>`COUNT(*) FILTER (WHERE ${surveyResponses.nps} <= 6)::int`,
          npsCount: sql<number>`COUNT(${surveyResponses.nps})::int`,
        })
        .from(surveyResponses)
        .where(sql`${localDate(surveyResponses.createdAt)} > ${todayLocal} - 7`),

      db
        .select({
          id: surveyResponses.id,
          orderNumber: surveyResponses.orderNumber,
          rating: surveyResponses.overallRating,
          improvement: surveyResponses.improvement,
          createdAt: surveyResponses.createdAt,
        })
        .from(surveyResponses)
        .where(and(sql`${localDate(surveyResponses.createdAt)} > ${todayLocal} - 7`, sql`${surveyResponses.overallRating} <= 3`))
        .orderBy(desc(surveyResponses.createdAt))
        .limit(3),

      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${expenses.amount} AS NUMERIC)), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(expenses)
        .where(and(isNull(expenses.deletedAt), sql`${localDate(expenses.expenseDate)} = ${todayLocal}`)),

      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(ingredients)
        .where(
          sql`CAST(${ingredients.currentStock} AS NUMERIC) <= CAST(${ingredients.minStock} AS NUMERIC) AND ${ingredients.active} = true`
        ),
    ]);

    // Horas: rango continuo entre la primera y la última hora con ventas (hoy o la semana pasada).
    const hours = byHour.map((h) => h.hour);
    const salesByHour =
      hours.length === 0
        ? []
        : Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => {
            const hour = Math.min(...hours) + i;
            const t = byHour.find((h) => h.hour === hour && h.day === "today");
            const w = byHour.find((h) => h.hour === hour && h.day === "lastWeek");
            return { hour, today: Number(t?.sales ?? 0), lastWeek: Number(w?.sales ?? 0) };
          });

    // Últimos 14 días con huecos rellenos (fechas en CDMX, sin depender de la zona del server).
    const byDate = new Map(byDay.map((d) => [d.date, d]));
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const salesByDay = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(`${todayStr}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (13 - i));
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      return { date: key, sales: Number(row?.sales ?? 0), orders: Number(row?.count ?? 0) };
    });

    return NextResponse.json({
      today: {
        sales: Number(today?.sales ?? 0),
        tips: Number(today?.tips ?? 0),
        orders: today?.count ?? 0,
        lastWeekSoFar: Number(lastWeekSoFar?.sales ?? 0),
        lastWeekOrdersSoFar: lastWeekSoFar?.count ?? 0,
        lastWeekFull: Number(lastWeekFull?.sales ?? 0),
      },
      salesByHour,
      salesByDay,
      topProducts: topProducts.map((p) => ({ name: p.name, quantity: p.quantity, revenue: Number(p.revenue) })),
      attention: {
        onlinePending: pending?.onlinePending ?? 0,
        openTables: pending?.openTables ?? 0,
        lowStock: lowStock?.count ?? 0,
      },
      register: register[0]
        ? {
            id: register[0].id,
            openedAt: register[0].openedAt,
            initialCash: Number(register[0].initialCash),
            openedBy: register[0].openedBy,
          }
        : null,
      surveys: {
        count: surveyStats?.count ?? 0,
        avg: surveyStats?.avg ? Number(surveyStats.avg) : null,
        nps:
          surveyStats && surveyStats.npsCount > 0
            ? Math.round(((surveyStats.promoters - surveyStats.detractors) / surveyStats.npsCount) * 100)
            : null,
        low: lowSurveys,
      },
      expenses: { total: Number(expenseStats?.total ?? 0), count: expenseStats?.count ?? 0 },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
