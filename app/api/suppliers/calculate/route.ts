import { NextRequest, NextResponse } from "next/server";
import { calculateSupplierTotals } from "@/lib/suppliers/calculate";

// POST /api/suppliers/calculate - { supplierId?, dateFrom, dateTo }
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

    const result = await calculateSupplierTotals({ supplierId, dateFrom, dateTo });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating supplier totals:", error);
    return NextResponse.json(
      { error: "Error al calcular" },
      { status: 500 }
    );
  }
}
