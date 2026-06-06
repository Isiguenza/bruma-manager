import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders } = body as { orders: { id: string; sortOrder: number }[] };

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: "orders array required" },
        { status: 400 }
      );
    }

    await db.transaction(async (tx) => {
      for (const { id, sortOrder } of orders) {
        await tx
          .update(categories)
          .set({ sortOrder })
          .where(eq(categories.id, id));
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering categories:", error);
    return NextResponse.json(
      { error: "Error reordering categories" },
      { status: 500 }
    );
  }
}
