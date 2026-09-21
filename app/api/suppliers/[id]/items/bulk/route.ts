import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, supplierItems } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { findSupplierItemConflict } from "@/lib/suppliers/overlap";

interface ProductVariant {
  name: string;
  price: string;
}

function parseVariants(raw: string | null): ProductVariant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// POST /api/suppliers/[id]/items/bulk - Asignar/resincronizar una categoría
// completa: crea una fila por producto (o por variante, si el producto tiene
// variantes) que aún no esté cubierta por ningún proveedor. Los que ya están
// asignados (a este proveedor o a otro) se saltan y se reportan en `skipped`
// — esto sirve tanto para la asignación inicial como para "Resincronizar
// categoría" cuando se agregan productos nuevos después.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: supplierId } = await params;
    const body = await request.json();
    const { categoryId } = body;

    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId es requerido" },
        { status: 400 }
      );
    }

    const categoryProducts = await db.query.products.findMany({
      where: and(
        eq(products.categoryId, categoryId),
        eq(products.active, true),
        isNull(products.deletedAt)
      ),
    });

    const created: (typeof supplierItems.$inferSelect)[] = [];
    const skipped: { productId: string; productName: string; variantName: string | null; reason: string }[] = [];

    for (const product of categoryProducts) {
      const variants = product.hasVariants ? parseVariants(product.variants) : [];
      const targets: (string | null)[] = variants.length > 0 ? variants.map((v) => v.name) : [null];

      for (const variantName of targets) {
        const conflict = await findSupplierItemConflict(product.id, variantName);
        if (conflict) {
          skipped.push({
            productId: product.id,
            productName: product.name,
            variantName,
            reason:
              conflict.supplierId === supplierId
                ? "Ya asignado a este proveedor"
                : `Ya asignado a ${conflict.supplier?.name ?? "otro proveedor"}`,
          });
          continue;
        }

        const [item] = await db
          .insert(supplierItems)
          .values({
            supplierId,
            productId: product.id,
            variantName,
            costPrice: "0",
            sourceCategoryId: categoryId,
          })
          .returning();
        created.push(item);
      }
    }

    return NextResponse.json({ created, skipped });
  } catch (error) {
    console.error("Error bulk-assigning category:", error);
    return NextResponse.json(
      { error: "Error al asignar la categoría" },
      { status: 500 }
    );
  }
}
