import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, asc, gte, isNull, lt } from "drizzle-orm";
import { EXPENSE_CATEGORY_LABELS, isExpenseCategory } from "@/lib/expenses/categories";

// GET /api/expenses/export?from=ISO&to=ISO&tz=America/Mexico_City
// Excel de los gastos del rango [from, to) — el mismo rango que está viendo
// la vista /expenses. El botón del dashboard solo navega aquí; el navegador
// descarga solo por el Content-Disposition (mismo patrón que el PDF de
// proveedores).
//
// `tz` es la zona horaria del navegador: el server (Docker) corre en UTC y sin
// ella un gasto de las 9 pm saldría con la fecha del día siguiente.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const from = new Date(params.get("from") ?? "");
    const to = new Date(params.get("to") ?? "");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }
    const tz = validTimeZone(params.get("tz")) ?? "America/Mexico_City";

    const rows = await db.query.expenses.findMany({
      where: and(isNull(expenses.deletedAt), gte(expenses.expenseDate, from), lt(expenses.expenseDate, to)),
      orderBy: [asc(expenses.expenseDate)],
    });

    const label = (c: string) => (isExpenseCategory(c) ? EXPENSE_CATEGORY_LABELS[c] : c);
    // El último instante incluido es to - 1ms (el rango es semiabierto).
    const fromDay = localDay(from, tz);
    const toDay = localDay(new Date(to.getTime() - 1), tz);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Bruma Manager";
    wb.created = new Date();

    // ---- Hoja 1: detalle
    const ws = wb.addWorksheet("Gastos", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Fecha", key: "date", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { header: "Concepto", key: "concept", width: 42 },
      { header: "Categoría", key: "category", width: 16 },
      { header: "Monto", key: "amount", width: 14, style: { numFmt: '"$"#,##0.00' } },
      { header: "Moneda", key: "currency", width: 9 },
      { header: "Origen", key: "source", width: 11 },
      { header: "Registró", key: "sender", width: 22 },
      { header: "Notas", key: "notes", width: 36 },
    ];
    for (const e of rows) {
      ws.addRow({
        date: wallClock(e.expenseDate, tz),
        concept: e.concept,
        category: label(e.category),
        amount: Number(e.amount),
        currency: e.currency,
        source: e.source === "whatsapp" ? "WhatsApp" : "Manual",
        sender: e.senderName ?? "",
        notes: e.notes ?? "",
      });
    }
    styleHeader(ws.getRow(1));
    if (rows.length) {
      ws.autoFilter = { from: "A1", to: `H${rows.length + 1}` };
      const totalRow = ws.addRow({
        concept: "TOTAL MXN",
        amount: { formula: `SUMIF(E2:E${rows.length + 1},"MXN",D2:D${rows.length + 1})` },
      });
      totalRow.font = { bold: true };
      totalRow.getCell("amount").border = { top: { style: "thin" } };
    }

    // ---- Hoja 2: resumen por categoría (solo MXN, igual que la vista)
    const mxn = rows.filter((e) => e.currency === "MXN");
    const total = mxn.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = new Map<string, { count: number; total: number }>();
    for (const e of mxn) {
      const cur = byCategory.get(e.category) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(e.amount);
      byCategory.set(e.category, cur);
    }

    const summary = wb.addWorksheet("Resumen");
    summary.columns = [{ width: 22 }, { width: 12 }, { width: 16 }, { width: 10 }];
    summary.addRow(["Compras y gastos — Cocina Bruma"]).font = { bold: true, size: 14 };
    summary.addRow([`Periodo: ${formatDay(fromDay)} al ${formatDay(toDay)}`]);
    summary.addRow([`Registros: ${rows.length}`]);
    const totalLine = summary.addRow(["Total MXN", null, total]);
    totalLine.font = { bold: true };
    totalLine.getCell(3).numFmt = '"$"#,##0.00';
    const others = summarizeOtherCurrencies(rows);
    if (others) summary.addRow([`Otras monedas (no incluidas): ${others}`]);
    summary.addRow([]);

    const head = summary.addRow(["Categoría", "Registros", "Total", "%"]);
    styleHeader(head);
    for (const [category, v] of [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total)) {
      const r = summary.addRow([label(category), v.count, v.total, total ? v.total / total : 0]);
      r.getCell(3).numFmt = '"$"#,##0.00';
      r.getCell(4).numFmt = "0.0%";
    }

    // ---- Hoja 3: por día
    const byDay = new Map<string, { count: number; total: number }>();
    for (const e of mxn) {
      const key = localDay(e.expenseDate, tz);
      const cur = byDay.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(e.amount);
      byDay.set(key, cur);
    }
    const daily = wb.addWorksheet("Por día", { views: [{ state: "frozen", ySplit: 1 }] });
    daily.columns = [
      { header: "Día", key: "day", width: 14, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Registros", key: "count", width: 12 },
      { header: "Total MXN", key: "total", width: 16, style: { numFmt: '"$"#,##0.00' } },
    ];
    styleHeader(daily.getRow(1));
    for (const [day, v] of byDay) {
      const [y, m, d] = day.split("-").map(Number);
      daily.addRow({ day: new Date(Date.UTC(y, m - 1, d)), count: v.count, total: v.total });
    }

    // Que el libro abra en el resumen.
    wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 1, visibility: "visible" }];

    const buffer = await wb.xlsx.writeBuffer();
    const filename = fromDay === toDay ? `gastos-bruma_${fromDay}.xlsx` : `gastos-bruma_${fromDay}_a_${toDay}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting expenses:", error);
    return NextResponse.json({ error: "Error al generar el Excel" }, { status: 500 });
  }
}

function validTimeZone(tz: string | null) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

// Excel no tiene zonas horarias: exceljs escribe el Date tal cual en UTC, así
// que se arma un Date cuyo "UTC" es la hora de pared local.
function wallClock(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min));
}

function localDay(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function summarizeOtherCurrencies(rows: { currency: string; amount: string }[]) {
  const totals = new Map<string, number>();
  for (const r of rows) if (r.currency !== "MXN") totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.amount));
  return [...totals].map(([c, v]) => `${v.toFixed(2)} ${c}`).join(", ");
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A4D" } };
  });
}
