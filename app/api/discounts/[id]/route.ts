import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discounts, orders } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/discounts/[id] - Get a single discount
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [discount] = await db
      .select()
      .from(discounts)
      .where(eq(discounts.id, id));

    if (!discount) {
      return NextResponse.json(
        { error: "Descuento no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(discount);
  } catch (error) {
    console.error("Error fetching discount:", error);
    return NextResponse.json(
      { error: "Error al obtener descuento" },
      { status: 500 }
    );
  }
}

// PATCH /api/discounts/[id] - Update a discount
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Only update fields that are provided
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.type !== undefined) {
      updateData.type = body.type;
      // If changing to flexible, set value to 0
      if (body.type === "flexible") {
        updateData.value = "0";
      }
    }
    if (body.value !== undefined && body.type !== "flexible") {
      updateData.value = body.value.toString();
    }
    if (body.requiresAuthorization !== undefined) 
      updateData.requiresAuthorization = body.requiresAuthorization;
    if (body.active !== undefined) updateData.active = body.active;

    const [updatedDiscount] = await db
      .update(discounts)
      .set(updateData)
      .where(eq(discounts.id, id))
      .returning();

    if (!updatedDiscount) {
      return NextResponse.json(
        { error: "Descuento no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedDiscount);
  } catch (error) {
    console.error("Error updating discount:", error);
    return NextResponse.json(
      { error: "Error al actualizar descuento" },
      { status: 500 }
    );
  }
}

// DELETE /api/discounts/[id] - Delete a discount
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // `orders.discount_id` apunta aquí sin ON DELETE: un descuento ya usado no
    // se puede borrar (antes reventaba con un 500 genérico). Se desactiva.
    const [{ used }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.discountId, id));
    if (used > 0) {
      return NextResponse.json(
        { error: `Ya se usó en ${used} ${used === 1 ? "orden" : "órdenes"}: desactívalo en vez de eliminarlo`, used },
        { status: 409 }
      );
    }

    const [deletedDiscount] = await db
      .delete(discounts)
      .where(eq(discounts.id, id))
      .returning();

    if (!deletedDiscount) {
      return NextResponse.json(
        { error: "Descuento no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting discount:", error);
    return NextResponse.json(
      { error: "Error al eliminar descuento" },
      { status: 500 }
    );
  }
}
