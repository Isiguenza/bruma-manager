import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { productId, productName, unitPrice, quantity } = body;

    // Must provide either (productId + productName + unitPrice) or (quantity + unitPrice)
    const isProductChange = productId && productName && unitPrice !== undefined;
    const isQuantityChange = quantity !== undefined && unitPrice !== undefined;

    if (!isProductChange && !isQuantityChange) {
      return NextResponse.json(
        { error: "Proporciona (productId, productName, unitPrice) o (quantity, unitPrice)" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ quantity: orderItems.quantity, orderId: orderItems.orderId })
      .from(orderItems)
      .where(eq(orderItems.id, params.id))
      .limit(1);

    if (!existing.length) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    const { orderId } = existing[0];
    const finalQty = isQuantityChange ? quantity : existing[0].quantity;
    const finalPrice = parseFloat(unitPrice);
    const subtotal = (finalPrice * finalQty).toFixed(2);

    const updateFields: Record<string, unknown> = {
      unitPrice: finalPrice.toString(),
      quantity: finalQty,
      subtotal,
    };

    if (isProductChange) {
      updateFields.productId = productId;
      updateFields.productName = productName;
    }

    const [updated] = await db
      .update(orderItems)
      .set(updateFields)
      .where(eq(orderItems.id, params.id))
      .returning();

    // Recalculate order total
    const allItems = await db
      .select({ subtotal: orderItems.subtotal, voided: orderItems.voided })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const newTotal = allItems
      .filter((i) => !i.voided)
      .reduce((sum, i) => sum + parseFloat(i.subtotal ?? "0"), 0)
      .toFixed(2);

    await db
      .update(orders)
      .set({ total: newTotal })
      .where(eq(orders.id, orderId));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH order-item error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
