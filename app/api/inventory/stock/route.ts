import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await db.select().from(inventoryProducts).orderBy(inventoryProducts.name);
    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching inventory products:", error);
    return NextResponse.json({ error: "Error fetching inventory products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, unit, currentStock, minStock, cost } = body;

    if (!name || !unit) {
      return NextResponse.json({ error: "Name and unit are required" }, { status: 400 });
    }

    const [product] = await db
      .insert(inventoryProducts)
      .values({
        name,
        description,
        unit,
        currentStock: currentStock || "0",
        minStock: minStock || "0",
        cost: cost || "0",
      })
      .returning();

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error creating inventory product:", error);
    return NextResponse.json({ error: "Error creating inventory product" }, { status: 500 });
  }
}
