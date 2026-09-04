import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subcategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, sortOrder, active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (active !== undefined) updateData.active = active;

    const [updated] = await db
      .update(subcategories)
      .set(updateData)
      .where(eq(subcategories.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating subcategory:", error);
    return NextResponse.json({ error: "Error updating subcategory" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(subcategories)
      .where(eq(subcategories.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    return NextResponse.json({ error: "Error deleting subcategory" }, { status: 500 });
  }
}
