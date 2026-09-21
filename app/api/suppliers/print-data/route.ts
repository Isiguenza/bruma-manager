import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { calculateSupplierTotals } from "@/lib/suppliers/calculate";
import type { SupplierCalculationLine } from "@/lib/types";

const BRUMA_LOGO_URL = "https://cdn.cocinabruma.com.mx/assets/bruma-logo.png";

// Server-side (no hay problema de CORS ni de canvas "tainted" como en el
// browser) para no depender de un base64 gigante pegado en el bundle del
// cliente — eso fue justo lo que se corrompió una vez al editarlo a mano.
async function fetchLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch(BRUMA_LOGO_URL);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch (err) {
    console.error("No se pudo obtener el logo de R2:", err);
    return null;
  }
}

// POST /api/suppliers/print-data
// { scope: "supplier" | "category" | "all", supplierId?, categoryId?, dateFrom, dateTo }
// Payload único que consumen tanto el botón de ticket térmico como el PDF.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, supplierId, categoryId, dateFrom, dateTo } = body;

    if (!scope || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "scope, dateFrom y dateTo son requeridos" },
        { status: 400 }
      );
    }
    if (scope !== "all" && !supplierId) {
      return NextResponse.json(
        { error: "supplierId es requerido para scope 'supplier' o 'category'" },
        { status: 400 }
      );
    }

    const calc = await calculateSupplierTotals({
      supplierId: scope === "all" ? undefined : supplierId,
      dateFrom,
      dateTo,
    });
    let lines: SupplierCalculationLine[] = calc.lines;

    let supplierName: string | null = null;
    let categoryName: string | null = null;

    if (scope === "supplier" || scope === "category") {
      const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) });
      supplierName = supplier?.name ?? null;
    }

    if (scope === "category") {
      if (!categoryId) {
        return NextResponse.json(
          { error: "categoryId es requerido para scope 'category'" },
          { status: 400 }
        );
      }
      const category = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
      categoryName = category?.name ?? null;
      lines = lines.filter((l) => l.categoryId === categoryId);
    }

    const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const logoBase64 = await fetchLogoBase64();

    return NextResponse.json({
      scope,
      supplierName,
      categoryName,
      dateFrom,
      dateTo,
      lines,
      bySupplier: scope === "all" ? calc.bySupplier : undefined,
      grandTotal,
      logoBase64,
    });
  } catch (error) {
    console.error("Error building print data:", error);
    return NextResponse.json(
      { error: "Error al preparar los datos de impresión" },
      { status: 500 }
    );
  }
}
