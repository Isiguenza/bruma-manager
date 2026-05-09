import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, ingredients } from "@/lib/db/schema";
import { eq, sql, gte, and, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();

    // Today start
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Week start (7 days ago)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Today's sales
    const todayOrders = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, todayStart),
          eq(orders.paymentStatus, "paid")
        )
      );

    // Week sales
    const weekOrders = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, weekStart),
          eq(orders.paymentStatus, "paid")
        )
      );

    // Month sales
    const monthOrders = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, monthStart),
          eq(orders.paymentStatus, "paid")
        )
      );

    // Pending orders
    const pendingResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        sql`${orders.status} IN ('pending', 'preparing', 'ready')`
      );

    // Low stock ingredients
    const lowStock = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ingredients)
      .where(
        sql`CAST(${ingredients.currentStock} AS NUMERIC) <= CAST(${ingredients.minStock} AS NUMERIC) AND ${ingredients.active} = true`
      );

    // Top products today
    const topProducts = await db
      .select({
        name: orderItems.productName,
        quantity: sql<number>`SUM(${orderItems.quantity})`,
        revenue: sql<number>`SUM(CAST(${orderItems.subtotal} AS NUMERIC))`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          gte(orders.createdAt, todayStart),
          eq(orders.paymentStatus, "paid")
        )
      )
      .groupBy(orderItems.productName)
      .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
      .limit(5);

    // Sales by day (last 21 days - 3 weeks)
    const salesByDay = [];
    for (let i = 20; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const daySales = await db
        .select({
          sales: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
          orders: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, dayStart),
            lte(orders.createdAt, dayEnd),
            eq(orders.paymentStatus, "paid")
          )
        );

      const dayOfWeek = dayStart.getDay(); // 0 = domingo, 5 = viernes, 6 = sábado
      
      // Solo incluir viernes (5), sábado (6) y domingo (0)
      if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
        salesByDay.push({
          date: dayStart.toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
          }),
          sales: Number(daySales[0]?.sales ?? 0),
          orders: Number(daySales[0]?.orders ?? 0),
        });
      }
    }

    return NextResponse.json({
      todaySales: Number(todayOrders[0]?.total ?? 0),
      todayOrders: Number(todayOrders[0]?.count ?? 0),
      weekSales: Number(weekOrders[0]?.total ?? 0),
      monthSales: Number(monthOrders[0]?.total ?? 0),
      pendingOrders: Number(pendingResult[0]?.count ?? 0),
      lowStockItems: Number(lowStock[0]?.count ?? 0),
      topProducts: topProducts.map((p) => ({
        name: p.name,
        quantity: Number(p.quantity),
        revenue: Number(p.revenue),
      })),
      salesByDay,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
