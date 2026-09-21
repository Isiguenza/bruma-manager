import { db } from "@/lib/db";
import { orderItems, orders, supplierItems } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { SupplierCalculationLine } from "@/lib/types";

export interface SupplierBucket {
  supplierId: string;
  supplierName: string;
  lines: SupplierCalculationLine[];
  total: number;
}

export interface SupplierCalculationResult {
  dateFrom: string;
  dateTo: string;
  lines: SupplierCalculationLine[];
  bySupplier: SupplierBucket[];
  grandTotal: number;
}

// Cuenta unidades vendidas por producto/variante en el rango (órdenes
// pagadas, no-práctica, items no anulados) y multiplica por el costo
// capturado en supplier_items. Sin supplierId, calcula para TODOS los
// proveedores (usado por la vista consolidada). Vive como función pura (no
// una ruta) para que tanto /api/suppliers/calculate como
// /api/suppliers/print-data la llamen directo en el mismo proceso — un
// self-fetch por HTTP desde una route handler a otra es frágil según el
// hosting (falló en producción con ERR_SSL_WRONG_VERSION_NUMBER).
export async function calculateSupplierTotals(params: {
  supplierId?: string;
  dateFrom: string;
  dateTo: string;
}): Promise<SupplierCalculationResult> {
  const { supplierId, dateFrom, dateTo } = params;

  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T23:59:59.999`);

  const items = await db.query.supplierItems.findMany({
    where: supplierId
      ? and(eq(supplierItems.supplierId, supplierId), eq(supplierItems.active, true))
      : eq(supplierItems.active, true),
    with: {
      supplier: true,
      product: { with: { category: true } },
    },
  });

  const lines: SupplierCalculationLine[] = [];

  for (const item of items) {
    if (!item.product) continue;

    const nameFilter = item.variantName
      ? eq(orderItems.productName, `${item.product.name} - ${item.variantName}`)
      : undefined;

    const [row] = await db
      .select({
        qty: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        revenue: sql<string>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.productId, item.productId),
          eq(orderItems.voided, false),
          eq(orders.paymentStatus, "paid"),
          eq(orders.isPractice, false),
          gte(orders.createdAt, from),
          lte(orders.createdAt, to),
          nameFilter
        )
      );

    const quantitySold = Number(row?.qty ?? 0);
    const revenue = Number(row?.revenue ?? 0);
    const costPrice = Number(item.costPrice);
    const businessCutPercent = item.businessCutPercent !== null ? Number(item.businessCutPercent) : null;
    const pricingType = (item.pricingType ?? "fixed_cost") as "fixed_cost" | "percentage";

    // "percentage": el proveedor no vende el insumo a costo fijo, se queda
    // con lo que sobra de nuestro % (ej. Bruma se queda 10% -> proveedor 90%
    // de lo vendido). "fixed_cost": le pagamos costPrice por unidad vendida.
    const lineTotal =
      pricingType === "percentage" && businessCutPercent !== null
        ? revenue * ((100 - businessCutPercent) / 100)
        : quantitySold * costPrice;

    lines.push({
      supplierItemId: item.id,
      supplierId: item.supplierId,
      supplierName: item.supplier?.name ?? "",
      productId: item.productId,
      productName: item.product.name,
      variantName: item.variantName,
      categoryId: item.product.categoryId,
      categoryName: item.product.category?.name ?? null,
      pricingType,
      costPrice,
      businessCutPercent,
      quantitySold,
      revenue,
      lineTotal,
    });
  }

  const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  const bySupplierMap = new Map<string, SupplierBucket>();
  for (const line of lines) {
    if (!bySupplierMap.has(line.supplierId)) {
      bySupplierMap.set(line.supplierId, {
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        lines: [],
        total: 0,
      });
    }
    const bucket = bySupplierMap.get(line.supplierId)!;
    bucket.lines.push(line);
    bucket.total += line.lineTotal;
  }

  return {
    dateFrom,
    dateTo,
    lines,
    bySupplier: Array.from(bySupplierMap.values()),
    grandTotal,
  };
}
