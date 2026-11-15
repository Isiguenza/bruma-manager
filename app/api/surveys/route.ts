import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, surveyResponses, tables, userProfiles } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

// GET /api/surveys?from=ISO&to=ISO — respuestas de la encuesta pública del
// rango [from, to) y un resumen del periodo inmediato anterior de la misma
// duración (para los comparativos). Las respuestas se escriben desde el
// api-server (POST /api/surveys); aquí solo se leen. Las agregaciones se hacen
// en el cliente, igual que en /expenses.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const to = params.get("to") ? new Date(params.get("to")!) : new Date();
    const from = params.get("from")
      ? new Date(params.get("from")!)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }

    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    const [rows, [prev]] = await Promise.all([
      db.query.surveyResponses.findMany({
        where: and(gte(surveyResponses.createdAt, from), lt(surveyResponses.createdAt, to)),
        orderBy: [desc(surveyResponses.createdAt)],
        limit: 2000,
      }),
      db
        .select({
          count: sql<number>`count(*)::int`,
          overallAvg: sql<string | null>`avg(${surveyResponses.overallRating})`,
          npsCount: sql<number>`count(${surveyResponses.nps})::int`,
          promoters: sql<number>`count(*) filter (where ${surveyResponses.nps} >= 9)::int`,
          detractors: sql<number>`count(*) filter (where ${surveyResponses.nps} <= 6)::int`,
        })
        .from(surveyResponses)
        .where(and(gte(surveyResponses.createdAt, prevFrom), lt(surveyResponses.createdAt, from))),
    ]);

    // Mesero y mesa de la orden del QR: para ver la calificación por mesero.
    const orderIds = [...new Set(rows.flatMap((r) => (r.orderId ? [r.orderId] : [])))];
    const orderInfo = orderIds.length
      ? await db
          .select({ id: orders.id, waiterId: orders.userId, waiterName: userProfiles.name, tableNumber: tables.number })
          .from(orders)
          .leftJoin(userProfiles, eq(userProfiles.id, orders.userId))
          .leftJoin(tables, eq(tables.id, orders.tableId))
          .where(inArray(orders.id, orderIds))
      : [];
    const infoById = new Map(orderInfo.map((o) => [o.id, o]));

    return NextResponse.json({
      responses: rows.map((r) => {
        const info = r.orderId ? infoById.get(r.orderId) : undefined;
        return {
          ...r,
          waiterId: info?.waiterId ?? null,
          waiterName: info?.waiterName ?? null,
          tableNumber: info?.tableNumber ?? null,
        };
      }),
      previous: {
        count: prev?.count ?? 0,
        overallAvg: prev?.overallAvg != null ? Number(prev.overallAvg) : null,
        nps: prev && prev.npsCount > 0 ? Math.round(((prev.promoters - prev.detractors) / prev.npsCount) * 100) : null,
      },
    });
  } catch (error) {
    console.error("Error fetching surveys:", error);
    return NextResponse.json({ error: "Error al obtener encuestas" }, { status: 500 });
  }
}
