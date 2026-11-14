import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notifyPromotionsUpdated } from "@/lib/notify-promotions-updated";
import { cleanupForType, promotionColumns, validatePromotion } from "@/lib/promotions/input";

// GET /api/promotions - List all promotions
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get("active") === "true";

    let query = db.select().from(promotions);

    if (activeOnly) {
      query = query.where(eq(promotions.active, true)) as any;
    }

    const allPromotions = await query;

    return NextResponse.json(allPromotions);
  } catch (error) {
    console.error("Error fetching promotions:", error);
    return NextResponse.json(
      { error: "Error al obtener promociones" },
      { status: 500 }
    );
  }
}

// POST /api/promotions - Create a new promotion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const row = cleanupForType({ active: true, priority: 0, applyTo: "all_products", ...promotionColumns(body) });
    const error = validatePromotion(row);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const [newPromotion] = await db
      .insert(promotions)
      .values(row as typeof promotions.$inferInsert)
      .returning();

    await notifyPromotionsUpdated();
    return NextResponse.json(newPromotion, { status: 201 });
  } catch (error) {
    console.error("Error creating promotion:", error);
    return NextResponse.json(
      { error: "Error al crear promoción" },
      { status: 500 }
    );
  }
}
