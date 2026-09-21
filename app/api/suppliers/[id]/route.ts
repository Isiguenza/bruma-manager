import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, supplierItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/suppliers/[id] - Supplier detail + its assigned items (product/category populated)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supplier = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, id),
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const items = await db.query.supplierItems.findMany({
      where: eq(supplierItems.supplierId, id),
      with: {
        product: { with: { category: true } },
        sourceCategory: true,
      },
    });

    return NextResponse.json({ ...supplier, items });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json(
      { error: "Error al obtener proveedor" },
      { status: 500 }
    );
  }
}

// PATCH /api/suppliers/[id] - Update supplier profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.contactName !== undefined) updateData.contactName = body.contactName || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.active !== undefined) updateData.active = body.active;

    const [updated] = await db
      .update(suppliers)
      .set(updateData)
      .where(eq(suppliers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating supplier:", error);
    return NextResponse.json(
      { error: "Error al actualizar proveedor" },
      { status: 500 }
    );
  }
}

// DELETE /api/suppliers/[id] - Soft delete (active = false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [updated] = await db
      .update(suppliers)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return NextResponse.json(
      { error: "Error al eliminar proveedor" },
      { status: 500 }
    );
  }
}
