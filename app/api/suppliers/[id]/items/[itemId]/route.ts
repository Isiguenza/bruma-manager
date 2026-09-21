import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supplierItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// PATCH /api/suppliers/[id]/items/[itemId] - Update cost price / active flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: supplierId, itemId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice.toString();
    if (body.active !== undefined) updateData.active = body.active;

    const [updated] = await db
      .update(supplierItems)
      .set(updateData)
      .where(and(eq(supplierItems.id, itemId), eq(supplierItems.supplierId, supplierId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Producto de proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating supplier item:", error);
    return NextResponse.json(
      { error: "Error al actualizar producto del proveedor" },
      { status: 500 }
    );
  }
}

// DELETE /api/suppliers/[id]/items/[itemId] - Remove an assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: supplierId, itemId } = await params;

    const [deleted] = await db
      .delete(supplierItems)
      .where(and(eq(supplierItems.id, itemId), eq(supplierItems.supplierId, supplierId)))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Producto de proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier item:", error);
    return NextResponse.json(
      { error: "Error al quitar producto del proveedor" },
      { status: 500 }
    );
  }
}
