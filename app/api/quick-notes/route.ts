import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quickNotes } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

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
    const { label, productIds } = body;

    if (!label) {
      return NextResponse.json({ error: "Label required" }, { status: 400 });
    }

    const [quickNote] = await db
      .insert(quickNotes)
      .values({
        label,
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
