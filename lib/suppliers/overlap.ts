import { db } from "@/lib/db";
import { supplierItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Busca si un producto/variante ya está cubierto por otra fila activa de
 * supplier_items (de cualquier proveedor). Un `variantName: null` significa
 * "todas las variantes del producto bajo un solo costo", así que también
 * choca contra una fila con una variante específica ya asignada, y
 * viceversa — evita que dos proveedores se traslapen parcialmente en el
 * mismo producto.
 */
export async function findSupplierItemConflict(
  productId: string,
  variantName: string | null
) {
  const rows = await db.query.supplierItems.findMany({
    where: and(eq(supplierItems.productId, productId), eq(supplierItems.active, true)),
    with: { supplier: true },
  });

  if (rows.length === 0) return null;

  if (variantName === null) {
    // Reclamar el producto completo choca con cualquier fila ya existente
    // (sea variante específica o el producto completo de otro proveedor).
    return rows[0];
  }

  return (
    rows.find((r) => r.variantName === null || r.variantName === variantName) ?? null
  );
}
