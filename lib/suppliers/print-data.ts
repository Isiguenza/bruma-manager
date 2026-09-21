import { db } from "@/lib/db";
import { suppliers, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { calculateSupplierTotals } from "@/lib/suppliers/calculate";
import type { SupplierInvoiceData } from "@/lib/suppliers/invoice-html";
import type { SupplierBucket } from "@/lib/suppliers/calculate";

const BRUMA_LOGO_URL = "https://cdn.cocinabruma.com.mx/assets/bruma-logo.png";

// Server-side (sin problema de CORS ni de canvas "tainted" como en el
// browser) para no depender de un base64 pegado a mano en un archivo de
// código — eso fue justo lo que se corrompió una vez al editarlo.
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

export interface BuildPrintDataParams {
  scope: "supplier" | "category" | "all";
  supplierId?: string;
  categoryId?: string;
  dateFrom: string;
  dateTo: string;
}

export class PrintDataError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Única fuente de verdad para armar el payload de impresión — la usan tanto
// el ticket térmico (app/api/suppliers/print-data) como el PDF (Puppeteer,
// app/api/suppliers/pdf), para que nunca diverjan en las cifras.
export async function buildSupplierPrintData(
  params: BuildPrintDataParams
): Promise<SupplierInvoiceData & { bySupplier?: SupplierBucket[] }> {
  const { scope, supplierId, categoryId, dateFrom, dateTo } = params;

  if (!scope || !dateFrom || !dateTo) {
    throw new PrintDataError("scope, dateFrom y dateTo son requeridos");
  }
  if (scope !== "all" && !supplierId) {
    throw new PrintDataError("supplierId es requerido para scope 'supplier' o 'category'");
  }
  if (scope === "category" && !categoryId) {
    throw new PrintDataError("categoryId es requerido para scope 'category'");
  }

  const calc = await calculateSupplierTotals({
    supplierId: scope === "all" ? undefined : supplierId,
    dateFrom,
    dateTo,
  });
  let lines = calc.lines;

  let supplierName: string | null = null;
  let supplierAddress: string | null = null;
  let supplierContactName: string | null = null;
  let supplierPhone: string | null = null;
  let supplierEmail: string | null = null;
  let categoryName: string | null = null;

  if (scope === "supplier" || scope === "category") {
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId!) });
    supplierName = supplier?.name ?? null;
    supplierAddress = supplier?.address ?? null;
    supplierContactName = supplier?.contactName ?? null;
    supplierPhone = supplier?.phone ?? null;
    supplierEmail = supplier?.email ?? null;
  }

  if (scope === "category") {
    const category = await db.query.categories.findFirst({ where: eq(categories.id, categoryId!) });
    categoryName = category?.name ?? null;
    lines = lines.filter((l) => l.categoryId === categoryId);
  }

  const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const logoBase64 = await fetchLogoBase64();

  return {
    scope,
    supplierName,
    supplierAddress,
    supplierContactName,
    supplierPhone,
    supplierEmail,
    categoryName,
    dateFrom,
    dateTo,
    lines,
    bySupplier: scope === "all" ? calc.bySupplier : undefined,
    grandTotal,
    logoBase64,
  };
}
