import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notifyPromotionsUpdated } from "@/lib/notify-promotions-updated";
import { cleanupForType, promotionColumns, validatePromotion } from "@/lib/promotions/input";

// GET /api/promotions/[id] - Get a single promotion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [promotion] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, id));

    if (!promotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(promotion);
  } catch (error) {
    console.error("Error fetching promotion:", error);
    return NextResponse.json(
      { error: "Error al obtener promoción" },
      { status: 500 }
    );
  }
}

// PATCH /api/promotions/[id] - Update a promotion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [current] = await db.select().from(promotions).where(eq(promotions.id, id));
    if (!current) {
      return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
    }

    // Se valida la promoción ya mezclada: un cambio parcial (solo "activa",
    // desde la lista) no debe chocar con validaciones de campos que no tocó.
    const changes = promotionColumns(body);
    const onlyToggle = Object.keys(changes).every((k) => k === "active");
    const merged = onlyToggle ? { ...current, ...changes } : cleanupForType({ ...current, ...changes });
    if (!onlyToggle) {
      const error = validatePromotion(merged);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const updateData: Partial<typeof current> = { ...(merged as typeof current) };
    delete updateData.id;
    delete updateData.createdAt;

    const [updatedPromotion] = await db
      .update(promotions)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(promotions.id, id))
      .returning();

    if (!updatedPromotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    await notifyPromotionsUpdated();
    return NextResponse.json(updatedPromotion);
  } catch (error) {
    console.error("Error updating promotion:", error);
    return NextResponse.json(
      { error: "Error al actualizar promoción", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/promotions/[id] - Delete a promotion
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deletedPromotion] = await db
      .delete(promotions)
      .where(eq(promotions.id, id))
      .returning();

    if (!deletedPromotion) {
      return NextResponse.json(
        { error: "Promoción no encontrada" },
        { status: 404 }
      );
    }

    await notifyPromotionsUpdated();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    return NextResponse.json(
      { error: "Error al eliminar promoción" },
      { status: 500 }
    );
  }
}
