import type { SupplierCalculationLine } from "@/lib/types";

// Datos ya resueltos (proveedor/categoría/logo) listos para pintar el
// invoice — la misma forma que ya devuelve /api/suppliers/print-data.
export interface SupplierInvoiceData {
  scope: "supplier" | "category" | "all";
  supplierName: string | null;
  supplierAddress?: string | null;
  supplierContactName?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  categoryName: string | null;
  dateFrom: string;
  dateTo: string;
  lines: SupplierCalculationLine[];
  grandTotal: number;
  // Logo en base64 (sin prefijo data:), servido desde R2 — nunca hardcodeado.
  logoBase64?: string | null;
}

function money(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function pricingLabel(line: SupplierCalculationLine) {
  if (line.pricingType === "percentage" && line.businessCutPercent !== null) {
    return `Bruma ${line.businessCutPercent}% / Prov. ${(100 - line.businessCutPercent).toFixed(0)}%`;
  }
  return money(line.costPrice);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// Documento HTML/CSS completo del invoice — mismo diseño aprobado en el
// mockup (Fraunces/Inter, paleta teal+gold, tabla agrupada por categoría con
// subtotales, status pill, total destacado). Este módulo es puro (sin DOM ni
// APIs de browser) para poder correr tanto server-side (Puppeteer, la ruta
// canónica) como, si algún día hace falta, en el cliente.
export function buildInvoiceDocumentHtml(data: SupplierInvoiceData): string {
  const groups = new Map<string, { label: string; lines: SupplierCalculationLine[]; total: number }>();
  for (const line of data.lines) {
    const key = data.scope === "all" ? line.supplierId : line.categoryId ?? "__none__";
    const label = data.scope === "all" ? line.supplierName : line.categoryName ?? "Sin categoría";
    if (!groups.has(key)) groups.set(key, { label, lines: [], total: 0 });
    const g = groups.get(key)!;
    g.lines.push(line);
    g.total += line.lineTotal;
  }

  const totalUnits = data.lines.reduce((sum, l) => sum + l.quantitySold, 0);
  const categoryCount = new Set(data.lines.map((l) => l.categoryId ?? "__none__")).size;

  const scopeLabel =
    data.scope === "all"
      ? "Todos los proveedores"
      : data.scope === "category"
      ? data.categoryName ?? ""
      : data.supplierName ?? "";

  const logoImg = data.logoBase64
    ? `<img src="data:image/png;base64,${data.logoBase64}" alt="Bruma">`
    : "";

  const partyDetailLines = [
    data.supplierAddress,
    [data.supplierContactName, data.supplierPhone].filter(Boolean).join(" · ") || null,
    data.supplierEmail,
  ].filter(Boolean) as string[];

  const tableRows = Array.from(groups.values())
    .map(
      (group) => `
      <tr class="cat-row"><td colspan="4">${escapeHtml(group.label)}</td></tr>
      ${group.lines
        .map(
          (line) => `
        <tr>
          <td><span class="item-name">${escapeHtml(line.productName)}</span>${
            line.variantName ? ` <span class="item-variant">— ${escapeHtml(line.variantName)}</span>` : ""
          }</td>
          <td class="num">${line.quantitySold}</td>
          <td class="num">${escapeHtml(pricingLabel(line))}</td>
          <td class="num">${money(line.lineTotal)}</td>
        </tr>`
        )
        .join("")}
      <tr class="subtotal-row">
        <td colspan="3">Subtotal ${escapeHtml(group.label)}</td>
        <td class="num">${money(group.total)}</td>
      </tr>`
    )
    .join("");

  const emptyRow =
    data.lines.length === 0
      ? `<tr class="empty-row"><td colspan="4">No hay ventas de productos en el rango seleccionado.</td></tr>`
      : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  *{ box-sizing:border-box; }
  html, body{ margin:0; padding:0; }
  body{
    --ink:#152f2b;
    --paper-raised:#fdfdfb;
    --accent:#0f3d38;
    --gold:#9c7a3a;
    --gold-soft:#f2e9d8;
    --line:#d8dbd3;
    --muted:#5d6a65;
    background:var(--paper-raised);
    color:var(--ink);
    font-family:"Inter",system-ui,sans-serif;
    padding:48px;
  }
  .head{
    display:flex; justify-content:space-between; align-items:flex-start; gap:24px;
    border-bottom:2px solid var(--ink); padding-bottom:24px;
  }
  .brand{ display:flex; flex-direction:column; gap:10px; }
  .brand img{ height:44px; width:auto; display:block; }
  .brand .addr{ font-size:12.5px; color:var(--muted); line-height:1.6; margin-top:6px; }
  .doc-meta{ text-align:right; display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
  .doc-meta .eyebrow{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); font-weight:700; }
  .status{
    display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600;
    letter-spacing:.08em; text-transform:uppercase; color:var(--gold); background:var(--gold-soft);
    border:1px solid #e2d0a4; padding:4px 10px; border-radius:999px;
  }
  .status::before{ content:""; width:6px; height:6px; border-radius:50%; background:var(--gold); }
  .parties{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:32px; }
  .field-label{ font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; margin-bottom:8px; }
  .party-name{ font-family:"Fraunces",serif; font-size:18px; font-weight:500; margin-bottom:4px; }
  .party-detail{ font-size:13px; color:var(--muted); line-height:1.7; }
  .summary-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px 20px; font-size:13px; margin:0; }
  .summary-grid dt{ color:var(--muted); margin:0; }
  .summary-grid dd{ margin:0; text-align:right; font-weight:600; }
  table{ width:100%; border-collapse:collapse; font-size:13.5px; margin-top:32px; }
  thead th{
    text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);
    font-weight:600; padding:0 0 10px; border-bottom:1.5px solid var(--ink);
  }
  thead th.num, td.num{ text-align:right; }
  tbody td{ padding:10px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  .item-name{ font-weight:600; }
  .item-variant{ color:var(--muted); font-weight:400; }
  .cat-row td{
    padding-top:20px; padding-bottom:6px; border-bottom:none; font-size:11px; letter-spacing:.1em;
    text-transform:uppercase; color:var(--accent); font-weight:700;
  }
  tr.cat-row:first-child td{ padding-top:4px; }
  .subtotal-row td{
    padding-top:6px; padding-bottom:18px; border-bottom:1px dashed var(--line); color:var(--muted); font-size:12.5px;
  }
  .subtotal-row td.num{ font-weight:600; color:var(--ink); }
  .empty-row td{ padding:24px 0; text-align:center; color:var(--muted); font-size:13px; }
  .totals{ display:flex; justify-content:flex-end; margin-top:8px; }
  .grand{
    display:flex; justify-content:space-between; align-items:baseline; gap:32px;
    border-top:2px solid var(--ink); padding-top:12px; width:320px;
  }
  .grand .label{ font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; }
  .grand .amount{ font-family:"Fraunces",serif; font-size:28px; font-weight:600; color:var(--gold); }
  .foot{ padding-top:20px; margin-top:20px; border-top:1px solid var(--line); font-size:11.5px; color:var(--muted); }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${logoImg}
      <div class="addr">
        Av Panamericana, Casa B14, Col. Pedregal de Carrasco<br>
        04700, Coyoacán, CDMX<br>
        cocinabrumamx@gmail.com
      </div>
    </div>
    <div class="doc-meta">
      <span class="eyebrow">Nota de proveedor</span>
      <span class="status">Pendiente de pago</span>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="field-label">${data.scope === "all" ? "Alcance" : "Proveedor"}</div>
      <div class="party-name">${escapeHtml(scopeLabel)}</div>
      ${partyDetailLines.length > 0 ? `<div class="party-detail">${partyDetailLines.map(escapeHtml).join("<br>")}</div>` : ""}
    </div>
    <div>
      <div class="field-label">Resumen del periodo</div>
      <dl class="summary-grid">
        <dt>Periodo</dt><dd>${formatDate(data.dateFrom)} – ${formatDate(data.dateTo)}</dd>
        <dt>Emitida</dt><dd>${new Date().toLocaleDateString("es-MX")}</dd>
        <dt>Categorías</dt><dd>${categoryCount}</dd>
        <dt>Unidades vendidas</dt><dd>${totalUnits}</dd>
      </dl>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th class="num">Cant.</th>
        <th class="num">Reparto</th>
        <th class="num">Importe</th>
      </tr>
    </thead>
    <tbody>${tableRows}${emptyRow}</tbody>
  </table>

  <div class="totals">
    <div class="grand">
      <span class="label">Total a pagar</span>
      <span class="amount">${money(data.grandTotal)}</span>
    </div>
  </div>

  <div class="foot">
    Generado automáticamente por Bruma Manager · Panel de Proveedores. Documento interno, no es un CFDI.
  </div>
</body>
</html>`;
}

export function supplierInvoiceFilename(data: SupplierInvoiceData) {
  const who =
    data.scope === "all" ? "todos-los-proveedores" : (data.supplierName ?? "proveedor").toLowerCase().replace(/\s+/g, "-");
  return `nota-proveedor-${who}-${data.dateFrom}_${data.dateTo}.pdf`;
}
