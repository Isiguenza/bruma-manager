import { NextRequest, NextResponse } from "next/server";
import { resolveProductFlow } from "@/lib/flows/resolveProductFlow";
import { resolveFlowGraph } from "@/lib/flows/resolve";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Flujo de modificadores de un producto para ordenar en línea (público, CORS).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (request.nextUrl.searchParams.get("format") === "graph") {
      const graph = await resolveFlowGraph(id);
      if (!graph) return NextResponse.json({ error: "Producto no encontrado o sin flujo v2" }, { status: 404, headers: CORS });
      return NextResponse.json(graph, { headers: CORS });
    }
    const flow = await resolveProductFlow(id);
    if (!flow) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404, headers: CORS });
    }
    return NextResponse.json(flow, { headers: CORS });
  } catch (error) {
    console.error("Error fetching public flow:", error);
    return NextResponse.json({ error: "Error" }, { status: 500, headers: CORS });
  }
}
