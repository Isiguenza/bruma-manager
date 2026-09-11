import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const registerId = searchParams.get("registerId");
    const startDate = searchParams.get("startDate");

    if (!registerId) {
      return NextResponse.json(
        { error: "registerId is required" },
        { status: 400 }
      );
    }

    console.log(`[History] Fetching orders for register ${registerId}, startDate: ${startDate}`);

    // Conditions: paid orders for this register
    const conditions: any[] = [
      eq(orders.cashRegisterId, registerId),
      eq(orders.paymentStatus, "paid"),
      eq(orders.isPractice, false),
    ];

    // All paid orders for this register — no date filtering needed.
    // The cashRegisterId already scopes orders to the register session.
    // Only add date filter if explicitly requested AND no registerId-based scoping is desired.
    // Since registerId already scopes it, we just fetch all paid orders for this register.

    const completedOrders = await db.query.orders.findMany({
      where: and(...conditions),
      with: {
        items: true,
      },
      orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    });

    console.log(`[History] Found ${completedOrders.length} paid orders for register ${registerId}`);
    const firstOrder = completedOrders[0];
    console.log(`[History] First order discount:`, firstOrder?.discountAmount, firstOrder?.discountName);

    // Aplicar descuento del 27% a órdenes de platform_delivery
    const ordersWithDiscount = completedOrders.map(order => {
      if (order.paymentMethod === 'platform_delivery') {
        const originalTotal = parseFloat(order.total);
        const commission = originalTotal * 0.27;
        const totalAfterCommission = originalTotal * 0.73;
        
        return {
          ...order,
          total: totalAfterCommission.toFixed(2),
          platformCommission: commission.toFixed(2),
          originalTotal: originalTotal.toFixed(2),
        };
      }
      return order;
    });

    return NextResponse.json(ordersWithDiscount);
  } catch (error) {
    console.error("Error fetching order history:", error);
    return NextResponse.json(
      { error: "Error fetching order history" },
      { status: 500 }
    );
  }
}
