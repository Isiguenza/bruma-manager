import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quickNotes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label, productIds, sortOrder, active } = body;

    const updateData: Record<string, unknown> = {};
    if (label !== undefined) updateData.label = label;
    if (productIds !== undefined) {
      updateData.productIds =
        Array.isArray(productIds) && productIds.length > 0
          ? JSON.stringify(productIds)
          : null;
    }
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (active !== undefined) updateData.active = active;

    const [updated] = await db
      .update(quickNotes)
      .set(updateData)
      .where(eq(quickNotes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Quick note not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating quick note:", error);
    return NextResponse.json({ error: "Error updating quick note" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(quickNotes)
      .where(eq(quickNotes.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Quick note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting quick note:", error);
    return NextResponse.json({ error: "Error deleting quick note" }, { status: 500 });
  }
}
