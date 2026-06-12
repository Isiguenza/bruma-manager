import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    console.log("[PATCH /api/orders/:id/items/:itemId/void] orderId=", id, "itemId=", itemId, "body=", JSON.stringify(body));
    const { voidReason, voidedBy } = body;

    // Mark item as voided
    const [updatedItem] = await db
      .update(orderItems)
      .set({
        voided: true,
        voidReason: voidReason || "Sin razón especificada",
        voidedBy: voidedBy || null,
      })
      .where(eq(orderItems.id, itemId))
      .returning();

    console.log("[PATCH /api/orders/:id/items/:itemId/void] updatedItem=", updatedItem);

    if (!updatedItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Recalculate order total excluding voided items
    const allItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });

    const newTotal = allItems
      .filter((item) => !item.voided)
      .reduce((sum, item) => sum + parseFloat(item.subtotal) * 1, 0);

    console.log("[PATCH /api/orders/:id/items/:itemId/void] newTotal=", newTotal);

    await db
      .update(orders)
      .set({
        total: newTotal.toString(),
        subtotal: newTotal.toString(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    return NextResponse.json({ success: true, newTotal });
  } catch (error) {
    console.error("[PATCH /api/orders/:id/items/:itemId/void] 500 error:", error);
    return NextResponse.json({ error: "Error voiding item", detail: String(error) }, { status: 500 });
  }
}
