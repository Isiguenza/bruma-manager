import jsPDF from "jspdf";
import type { SupplierCalculationLine } from "@/lib/types";

const A4_WIDTH = 595.28;
const MARGIN = 42;
const CONTENT_RIGHT = A4_WIDTH - MARGIN;
const COL = { name: MARGIN, qty: 340, cost: 415, total: 495 };

const INK: [number, number, number] = [21, 47, 43];
const MUTED: [number, number, number] = [93, 106, 101];
const GOLD: [number, number, number] = [156, 122, 58];
const LINE: [number, number, number] = [216, 219, 211];

export interface SupplierInvoiceData {
  scope: "supplier" | "category" | "all";
  supplierName: string | null;
  categoryName: string | null;
  dateFrom: string;
  dateTo: string;
  lines: SupplierCalculationLine[];
  grandTotal: number;
  // Logo en base64 (sin prefijo data:), servido por /api/suppliers/print-data
  // desde R2 — el PDF nunca trae el logo hardcodeado en el bundle.
  logoBase64?: string | null;
}

function money(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pricingLabel(line: SupplierCalculationLine) {
  if (line.pricingType === "percentage" && line.businessCutPercent !== null) {
    return `Bruma ${line.businessCutPercent}% / Prov. ${(100 - line.businessCutPercent).toFixed(0)}%`;
  }
  return `${money(line.costPrice)} c/u`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function generateSupplierInvoicePDF(data: SupplierInvoiceData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 56;

  // --- Header: logo + dirección ---
  const logoW = 108;
  const logoH = logoW * (178 / 960);
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, "PNG", MARGIN, y, logoW, logoH);
    } catch (err) {
      // Nunca dejar que un logo corrupto/faltante tumbe la generación del PDF
      // entero — ya pasó una vez (base64 hardcodeado y dañado al editarlo,
      // por eso ahora se sirve desde R2 vía print-data). Sin logo es
      // recuperable, sin PDF no.
      console.error("No se pudo dibujar el logo en el PDF:", err);
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const addrY = y + logoH + 14;
  doc.text("Av Panamericana, Casa B14, Col. Pedregal de Carrasco", MARGIN, addrY);
  doc.text("04700, Coyoacán, CDMX", MARGIN, addrY + 12);
  doc.text("cocinabrumamx@gmail.com", MARGIN, addrY + 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("NOTA DE PROVEEDOR", CONTENT_RIGHT, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const scopeLabel =
    data.scope === "all"
      ? "Consolidado: todos los proveedores"
      : data.scope === "category"
      ? `${data.supplierName ?? ""} · ${data.categoryName ?? ""}`
      : data.supplierName ?? "";
  doc.text(scopeLabel, CONTENT_RIGHT, y + 20, { align: "right" });
  doc.text(`Periodo: ${formatDate(data.dateFrom)} – ${formatDate(data.dateTo)}`, CONTENT_RIGHT, y + 32, { align: "right" });
  doc.text(`Emitida: ${new Date().toLocaleDateString("es-MX")}`, CONTENT_RIGHT, y + 44, { align: "right" });

  y = addrY + 40;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, y, CONTENT_RIGHT, y);
  y += 26;

  // --- Tabla, agrupada por proveedor (scope=all) o por categoría ---
  const groups = new Map<string, { label: string; lines: SupplierCalculationLine[]; total: number }>();
  for (const line of data.lines) {
    const key = data.scope === "all" ? line.supplierId : line.categoryId ?? "__none__";
    const label = data.scope === "all" ? line.supplierName : line.categoryName ?? "Sin categoría";
    if (!groups.has(key)) groups.set(key, { label, lines: [], total: 0 });
    const g = groups.get(key)!;
    g.lines.push(line);
    g.total += line.lineTotal;
  }

  function ensureSpace(rowHeight: number) {
    if (y + rowHeight > 780) {
      doc.addPage();
      y = 56;
    }
  }

  function drawTableHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("PRODUCTO", COL.name, y);
    doc.text("CANT.", COL.qty, y, { align: "right" });
    doc.text("REPARTO", COL.cost, y, { align: "right" });
    doc.text("IMPORTE", COL.total, y, { align: "right" });
    y += 6;
    doc.setDrawColor(...INK);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, CONTENT_RIGHT, y);
    y += 16;
  }

  drawTableHeader();

  if (data.lines.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No hay ventas de productos de este proveedor en el rango seleccionado.", MARGIN, y);
    y += 20;
  }

  for (const group of groups.values()) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GOLD);
    doc.text(group.label.toUpperCase(), COL.name, y);
    y += 16;

    for (const line of group.lines) {
      ensureSpace(16);
      const label = line.variantName ? `${line.productName} — ${line.variantName}` : line.productName;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(label, COL.name, y, { maxWidth: COL.qty - COL.name - 12 });
      doc.text(String(line.quantitySold), COL.qty, y, { align: "right" });
      doc.setFontSize(8);
      doc.text(pricingLabel(line), COL.cost, y, { align: "right" });
      doc.setFontSize(9.5);
      doc.text(money(line.lineTotal), COL.total, y, { align: "right" });
      y += 16;
    }

    ensureSpace(18);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.75);
    doc.line(COL.qty - 60, y, CONTENT_RIGHT, y);
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Subtotal ${group.label}`, COL.cost - 90, y, { align: "left" });
    doc.setTextColor(...INK);
    doc.text(money(group.total), COL.total, y, { align: "right" });
    y += 22;
  }

  // --- Total ---
  ensureSpace(50);
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.4);
  doc.line(COL.cost - 90, y, CONTENT_RIGHT, y);
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("TOTAL A PAGAR", COL.cost - 90, y);
  doc.setFontSize(18);
  doc.setTextColor(...GOLD);
  doc.text(money(data.grandTotal), CONTENT_RIGHT, y, { align: "right" });

  // --- Footer ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "Generado automáticamente por Bruma Manager · Panel de Proveedores. Documento interno, no es un CFDI.",
    MARGIN,
    815
  );

  return doc;
}

export function supplierInvoiceFilename(data: SupplierInvoiceData) {
  const who =
    data.scope === "all" ? "todos-los-proveedores" : (data.supplierName ?? "proveedor").toLowerCase().replace(/\s+/g, "-");
  return `nota-proveedor-${who}-${data.dateFrom}_${data.dateTo}.pdf`;
}
