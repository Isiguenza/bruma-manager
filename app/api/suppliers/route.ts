import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/suppliers - List all suppliers
export async function GET(request: NextRequest) {
  try {
    const activeOnly = request.nextUrl.searchParams.get("active") === "true";

    const result = await db.query.suppliers.findMany({
      where: activeOnly ? eq(suppliers.active, true) : undefined,
      orderBy: [desc(suppliers.createdAt)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Error al obtener proveedores" },
      { status: 500 }
    );
  }
}

// POST /api/suppliers - Create a new supplier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, contactName, phone, email, address, notes, active } = body;

    if (!name) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const [supplier] = await db
      .insert(suppliers)
      .values({
        name,
        contactName: contactName || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
        active: active !== undefined ? active : true,
      })
      .returning();

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier:", error);
    return NextResponse.json(
      { error: "Error al crear proveedor" },
      { status: 500 }
    );
  }
}
