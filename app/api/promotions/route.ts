import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

    const {
      name,
      description,
      type,
      buyQuantity,
      getQuantity,
      discountPercentage,
      discountAmount,
      applyTo,
      productIds,
      categoryId,
      active,
      startDate,
      endDate,
      daysOfWeek,
      startTime,
      endTime,
      priority,
      comboRules,
    } = body;

    // Validation
    if (!name || !type || !applyTo) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    // Type-specific validation
    if (type === "buy_x_get_y" && (!buyQuantity || !getQuantity)) {
      return NextResponse.json(
        { error: "buyQuantity y getQuantity son requeridos para tipo buy_x_get_y" },
        { status: 400 }
      );
    }

    if (type === "percentage_discount" && !discountPercentage) {
      return NextResponse.json(
        { error: "discountPercentage es requerido para tipo percentage_discount" },
        { status: 400 }
      );
    }

    if (type === "fixed_discount" && !discountAmount) {
      return NextResponse.json(
        { error: "discountAmount es requerido para tipo fixed_discount" },
        { status: 400 }
      );
    }

    if (type === "combo") {
      if (!comboRules || !Array.isArray(comboRules) || comboRules.length < 2) {
        return NextResponse.json(
          { error: "comboRules debe tener al menos 2 reglas para tipo combo" },
          { status: 400 }
        );
      }
      if (!discountPercentage && !discountAmount) {
        return NextResponse.json(
          { error: "discountPercentage o discountAmount es requerido para tipo combo" },
          { status: 400 }
        );
      }
    }

    // Apply-to validation
    if (applyTo === "specific_products" && !productIds) {
      return NextResponse.json(
        { error: "productIds es requerido cuando applyTo es specific_products" },
        { status: 400 }
      );
    }

    if (applyTo === "category" && !categoryId) {
      return NextResponse.json(
        { error: "categoryId es requerido cuando applyTo es category" },
        { status: 400 }
      );
    }

    const [newPromotion] = await db
      .insert(promotions)
      .values({
        name,
        description: description || null,
        type,
        buyQuantity: buyQuantity || null,
        getQuantity: getQuantity || null,
        discountPercentage: discountPercentage ? discountPercentage.toString() : null,
        discountAmount: discountAmount ? discountAmount.toString() : null,
        applyTo,
        productIds: productIds ? JSON.stringify(productIds) : null,
        categoryId: categoryId || null,
        active: active !== undefined ? active : true,
        startDate: startDate || null,
        endDate: endDate || null,
        daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        comboRules: comboRules ? JSON.stringify(comboRules) : null,
        priority: priority || 0,
      })
      .returning();

    return NextResponse.json(newPromotion, { status: 201 });
  } catch (error) {
    console.error("Error creating promotion:", error);
    return NextResponse.json(
      { error: "Error al crear promoción" },
      { status: 500 }
    );
  }
}
