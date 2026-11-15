import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quickNotes } from "@/lib/db/schema";
import { asc, sql } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.query.quickNotes.findMany({
      orderBy: [asc(quickNotes.sortOrder), asc(quickNotes.label)],
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching quick notes:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, productIds, active } = body;

    if (!label) {
      return NextResponse.json({ error: "Label required" }, { status: 400 });
    }

    // Al final de la lista: la pantalla la agrega abajo y el POS ordena por sortOrder.
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${quickNotes.sortOrder}), -1)::int + 1` })
      .from(quickNotes);

    const [quickNote] = await db
      .insert(quickNotes)
      .values({
        label,
        sortOrder: next,
        active: active !== false,
        productIds: Array.isArray(productIds) && productIds.length > 0
          ? JSON.stringify(productIds)
          : null,
      })
      .returning();

    return NextResponse.json(quickNote, { status: 201 });
  } catch (error) {
    console.error("Error creating quick note:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
