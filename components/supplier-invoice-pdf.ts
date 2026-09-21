import jsPDF from "jspdf";
import type { SupplierCalculationLine } from "@/lib/types";

// Wordmark BRUMA recortado (sin el margen transparente del PNG original) —
// mismo logo usado en el mockup del artifact aprobado con el usuario.
const BRUMA_LOGO_B64 =
  "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";

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
}

function money(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  doc.addImage(BRUMA_LOGO_B64, "PNG", MARGIN, y, logoW, logoH);

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
    doc.text("COSTO", COL.cost, y, { align: "right" });
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
      doc.text(money(line.costPrice), COL.cost, y, { align: "right" });
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
