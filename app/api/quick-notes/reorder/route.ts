import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quickNotes } from "@/lib/db/schema";
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

    for (const { id, sortOrder } of orders) {
      await db
        .update(quickNotes)
        .set({ sortOrder })
        .where(eq(quickNotes.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering quick notes:", error);
    return NextResponse.json(
      { error: "Error reordering quick notes" },
      { status: 500 }
    );
  }
}
