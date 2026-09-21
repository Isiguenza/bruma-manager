import { NextRequest, NextResponse } from "next/server";
import { buildSupplierPrintData, PrintDataError } from "@/lib/suppliers/print-data";
import { buildInvoiceDocumentHtml, supplierInvoiceFilename } from "@/lib/suppliers/invoice-html";
import { getBrowser } from "@/lib/suppliers/pdf-browser";

// Puppeteer necesita Node real (Chromium headless) — nunca Edge runtime.
export const runtime = "nodejs";

// GET /api/suppliers/pdf?scope=supplier|category|all&supplierId=&categoryId=&dateFrom=&dateTo=
// Genera el PDF renderizando el MISMO HTML/CSS del invoice (lib/suppliers/invoice-html.ts)
// con Chromium headless (Puppeteer) — no se redibuja con primitivas de una
// librería de PDF, así que el resultado es pixel-a-pixel el diseño real.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scope = params.get("scope") as "supplier" | "category" | "all" | null;
  const supplierId = params.get("supplierId") ?? undefined;
  const categoryId = params.get("categoryId") ?? undefined;
  const dateFrom = params.get("dateFrom") ?? undefined;
  const dateTo = params.get("dateTo") ?? undefined;

  if (!scope || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "scope, dateFrom y dateTo son requeridos" },
      { status: 400 }
    );
  }

  try {
    const data = await buildSupplierPrintData({ scope, supplierId, categoryId, dateFrom, dateTo });
    const html = buildInvoiceDocumentHtml(data);

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      // El logo va embebido como data URI (ya cubierto por "load"), pero las
      // Google Fonts (@font-face) no bloquean el evento load — hay que
      // esperar explícitamente a que terminen de aplicarse antes de
      // rasterizar, o el PDF sale con la fuente de respaldo.
      await page.evaluate(() => document.fonts.ready);
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${supplierInvoiceFilename(data)}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await page.close();
    }
  } catch (error) {
    if (error instanceof PrintDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error generando PDF de proveedor:", error);
    return NextResponse.json({ error: "Error al generar el PDF" }, { status: 500 });
  }
}
