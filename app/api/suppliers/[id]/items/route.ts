import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supplierItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { findSupplierItemConflict } from "@/lib/suppliers/overlap";

// GET /api/suppliers/[id]/items - List a supplier's assigned items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const items = await db.query.supplierItems.findMany({
      where: eq(supplierItems.supplierId, id),
      with: { product: { with: { category: true } }, sourceCategory: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching supplier items:", error);
    return NextResponse.json(
      { error: "Error al obtener productos del proveedor" },
      { status: 500 }
    );
  }
}

// POST /api/suppliers/[id]/items - Assign one product/variant to this supplier
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: supplierId } = await params;
    const body = await request.json();
    const { productId, variantName, costPrice } = body;

    if (!productId || costPrice === undefined || costPrice === null) {
      return NextResponse.json(
        { error: "productId y costPrice son requeridos" },
        { status: 400 }
      );
    }

    const normalizedVariant: string | null = variantName || null;

    const conflict = await findSupplierItemConflict(productId, normalizedVariant);
    if (conflict) {
      const sameSupplier = conflict.supplierId === supplierId;
      return NextResponse.json(
        {
          error: sameSupplier
            ? "Ese producto/variante ya está asignado a este proveedor"
            : `Ese producto/variante ya está asignado a ${conflict.supplier?.name ?? "otro proveedor"}`,
        },
        { status: 409 }
      );
    }

    const [item] = await db
      .insert(supplierItems)
      .values({
        supplierId,
        productId,
        variantName: normalizedVariant,
        costPrice: costPrice.toString(),
      })
      .returning();

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier item:", error);
    return NextResponse.json(
      { error: "Error al asignar producto" },
      { status: 500 }
    );
  }
}
