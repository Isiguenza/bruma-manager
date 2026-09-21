import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders, supplierItems } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { SupplierCalculationLine } from "@/lib/types";

export type { SupplierCalculationLine };

// POST /api/suppliers/calculate - { supplierId?, dateFrom, dateTo }
// Sin supplierId, calcula para TODOS los proveedores (usado por la vista
// consolidada). Cuenta unidades vendidas por producto/variante en el rango
// (órdenes pagadas, no-práctica, items no anulados) y multiplica por el
// costo capturado en supplier_items.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, dateFrom, dateTo } = body;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "dateFrom y dateTo son requeridos" },
        { status: 400 }
      );
    }

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
      const costPrice = Number(item.costPrice);

      lines.push({
        supplierItemId: item.id,
        supplierId: item.supplierId,
        supplierName: item.supplier?.name ?? "",
        productId: item.productId,
        productName: item.product.name,
        variantName: item.variantName,
        categoryId: item.product.categoryId,
        categoryName: item.product.category?.name ?? null,
        costPrice,
        quantitySold,
        lineTotal: quantitySold * costPrice,
      });
    }

    const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    const bySupplierMap = new Map<string, { supplierId: string; supplierName: string; lines: SupplierCalculationLine[]; total: number }>();
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

    return NextResponse.json({
      dateFrom,
      dateTo,
      lines,
      bySupplier: Array.from(bySupplierMap.values()),
      grandTotal,
    });
  } catch (error) {
    console.error("Error calculating supplier totals:", error);
    return NextResponse.json(
      { error: "Error al calcular" },
      { status: 500 }
    );
  }
}
