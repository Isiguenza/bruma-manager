import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/discounts - List all discounts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get("active") === "true";

    const allDiscounts = await db
      .select()
      .from(discounts)
      .where(activeOnly ? eq(discounts.active, true) : undefined);

    return NextResponse.json(allDiscounts);
  } catch (error) {
    console.error("Error fetching discounts:", error);
    return NextResponse.json(
      { error: "Error al obtener descuentos" },
      { status: 500 }
    );
  }
}

// POST /api/discounts - Create a new discount
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      description,
      type,
      value,
      requiresAuthorization,
      active,
    } = body;

    // Validation
    if (!name || !type) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    // For non-flexible discounts, validate value
    if (type !== "flexible") {
      if (value === undefined || value === null || value < 0) {
        return NextResponse.json(
          { error: "El valor debe ser mayor o igual a 0" },
          { status: 400 }
        );
      }

      if (type === "percentage" && value > 100) {
        return NextResponse.json(
          { error: "El porcentaje debe estar entre 0 y 100" },
          { status: 400 }
        );
      }
    }

    // For flexible discounts, set value to 0 as placeholder
    const finalValue = type === "flexible" ? 0 : value;

    if (type === "fixed_amount" && finalValue < 0) {
      return NextResponse.json(
        { error: "El monto debe ser mayor a 0" },
        { status: 400 }
      );
    }

    const [newDiscount] = await db
      .insert(discounts)
      .values({
        name,
        description: description || null,
        type,
        value: finalValue.toString(),
        requiresAuthorization: requiresAuthorization || false,
        active: active !== undefined ? active : true,
      })
      .returning();

    return NextResponse.json(newDiscount, { status: 201 });
  } catch (error) {
    console.error("Error creating discount:", error);
    return NextResponse.json(
      { error: "Error al crear descuento" },
      { status: 500 }
    );
  }
}
