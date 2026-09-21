import { NextRequest, NextResponse } from "next/server";
import { buildSupplierPrintData, PrintDataError } from "@/lib/suppliers/print-data";

// POST /api/suppliers/print-data
// { scope: "supplier" | "category" | "all", supplierId?, categoryId?, dateFrom, dateTo }
// Payload único que consumen tanto el botón de ticket térmico como el PDF
// (este último vía app/api/suppliers/pdf, que llama a la misma función).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await buildSupplierPrintData(body);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PrintDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error building print data:", error);
    return NextResponse.json(
      { error: "Error al preparar los datos de impresión" },
      { status: 500 }
    );
  }
}
