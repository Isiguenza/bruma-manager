import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    console.log("[PATCH /api/order-items/:id] id=", id, "body=", JSON.stringify(body));
    const { productId, productName, unitPrice, quantity, notes } = body;

    // Must provide either (productId + productName + unitPrice) or (quantity + unitPrice)
    const isProductChange = productId && productName && unitPrice !== undefined;
    const isQuantityChange = quantity !== undefined && unitPrice !== undefined;
    console.log("[PATCH /api/order-items/:id] isProductChange=", isProductChange, "isQuantityChange=", isQuantityChange);

    if (!isProductChange && !isQuantityChange) {
      console.log("[PATCH /api/order-items/:id] 400 - missing required fields");
      return NextResponse.json(
        { error: "Proporciona (productId, productName, unitPrice) o (quantity, unitPrice)" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ quantity: orderItems.quantity, orderId: orderItems.orderId })
      .from(orderItems)
      .where(eq(orderItems.id, id))
      .limit(1);

    if (!existing.length) {
      console.log("[PATCH /api/order-items/:id] 404 - item not found for id=", id);
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    const { orderId } = existing[0];
    const finalQty = isQuantityChange ? quantity : existing[0].quantity;
    const finalPrice = parseFloat(unitPrice);
    console.log("[PATCH /api/order-items/:id] finalQty=", finalQty, "finalPrice=", finalPrice);

    if (Number.isNaN(finalPrice)) {
      console.log("[PATCH /api/order-items/:id] 400 - unitPrice parse resulted in NaN");
      return NextResponse.json(
        { error: "unitPrice inválido" },
        { status: 400 }
      );
    }

    const subtotal = (finalPrice * finalQty).toFixed(2);
    console.log("[PATCH /api/order-items/:id] subtotal=", subtotal);

    const updateFields: Record<string, unknown> = {
      unitPrice: finalPrice.toString(),
      quantity: finalQty,
      subtotal,
    };

    if (isProductChange) {
      updateFields.productId = productId;
      updateFields.productName = productName;
    }

    if (notes !== undefined) {
      updateFields.notes = notes;
    }

    console.log("[PATCH /api/order-items/:id] updateFields=", JSON.stringify(updateFields));

    const [updated] = await db
      .update(orderItems)
      .set(updateFields)
      .where(eq(orderItems.id, id))
      .returning();

    console.log("[PATCH /api/order-items/:id] updated item=", updated);

    // Recalculate order total
    const allItems = await db
      .select({ subtotal: orderItems.subtotal, voided: orderItems.voided })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const newTotal = allItems
      .filter((i) => !i.voided)
      .reduce((sum, i) => sum + parseFloat(i.subtotal ?? "0"), 0)
      .toFixed(2);

    console.log("[PATCH /api/order-items/:id] newTotal=", newTotal);

    await db
      .update(orders)
      .set({ total: newTotal })
      .where(eq(orders.id, orderId));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/order-items/:id] 500 error:", error);
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 });
  }
}
