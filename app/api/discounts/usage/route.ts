import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

// GET /api/discounts/usage?days=30 — cuántas órdenes cobradas usaron cada
// descuento y cuánto se descontó. `orders.discount_id` solo se llena con
// descuentos reales (el POS manda ids sintéticos para el premio de lealtad y
// `pay` los descarta), así que esto cuenta exactamente los de esta pantalla.
export async function GET(request: NextRequest) {
  try {
    const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        discountId: orders.discountId,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${orders.discountAmount}), 0)`,
        lastUsed: sql<string | null>`max(${orders.createdAt})`,
      })
      .from(orders)
      .where(and(isNotNull(orders.discountId), eq(orders.paymentStatus, "paid"), gte(orders.createdAt, since)))
      .groupBy(orders.discountId);

    return NextResponse.json({
      days,
      // `timestamp` sin zona guardado en UTC: se manda como ISO con Z para que
      // el navegador no lo lea como hora local.
      usage: rows.map((r) => ({
        ...r,
        total: Number(r.total),
        lastUsed: r.lastUsed ? new Date(`${String(r.lastUsed).replace(" ", "T")}Z`).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching discount usage:", error);
    return NextResponse.json({ error: "Error al obtener el uso de descuentos" }, { status: 500 });
  }
}
