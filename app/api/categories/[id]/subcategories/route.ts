import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subcategories } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.categoryId, id))
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, sortOrder } = body;

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const [subcategory] = await db
      .insert(subcategories)
      .values({
        categoryId: id,
        name,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    return NextResponse.json(subcategory, { status: 201 });
  } catch (error) {
    console.error("Error creating subcategory:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
