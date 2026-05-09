import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db
      .update(inventoryProducts)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(inventoryProducts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating inventory product:", error);
    return NextResponse.json({ error: "Error updating inventory product" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.delete(inventoryProducts).where(eq(inventoryProducts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory product:", error);
    return NextResponse.json({ error: "Error deleting inventory product" }, { status: 500 });
  }
}
