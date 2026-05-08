import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryOrders } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/delivery/orders - Listar pedidos de delivery
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const status = searchParams.get("status");

    let conditions = [];

    if (platform) {
      conditions.push(eq(deliveryOrders.platform, platform as any));
    }

    if (status) {
      conditions.push(eq(deliveryOrders.status, status as any));
    }

    const orders = await db.query.deliveryOrders.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(deliveryOrders.createdAt)],
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error("Error fetching delivery orders:", error);
    return NextResponse.json(
      { error: "Error fetching delivery orders" },
      { status: 500 }
    );
  }
}
