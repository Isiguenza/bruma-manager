import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories, modifierSteps, subcategories } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.query.categories.findMany({
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
      with: {
        subcategories: {
          orderBy: [asc(subcategories.sortOrder), asc(subcategories.name)],
        },
      },
    });

    // Marca qué categorías y subcategorías tienen flujo propio (pasos definidos).
    const stepRows = await db
      .select({
        categoryId: modifierSteps.categoryId,
        subcategoryId: modifierSteps.subcategoryId,
      })
      .from(modifierSteps);
    const catsWithFlow = new Set(
      stepRows.map((r) => r.categoryId).filter(Boolean)
    );
    const subcatsWithFlow = new Set(
      stepRows.map((r) => r.subcategoryId).filter(Boolean)
    );

    const withFlag = result.map((c: any) => ({
      ...c,
      hasCustomFlow: catsWithFlow.has(c.id),
      subcategories: (c.subcategories || []).map((s: any) => ({
        ...s,
        hasCustomFlow: subcatsWithFlow.has(s.id),
      })),
    }));

    return NextResponse.json(withFlag);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, color, isBeverage } = body;

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const [category] = await db
      .insert(categories)
      .values({
        name,
        description: description || null,
        color: color || null,
        isBeverage: isBeverage || false,
      })
      .returning();

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
