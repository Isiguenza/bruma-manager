import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productFlows, products, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/debug/product-flows - Debug endpoint to see all product flows
export async function GET() {
  try {
    const flows = await db.query.productFlows.findMany({
      with: {
        product: {
          with: {
            category: true,
          },
        },
      },
    });

    const debugData = flows.map((flow: any) => {
      const steps = JSON.parse(flow.steps || "[]");
      return {
        productId: flow.productId,
        productName: flow.product?.name || "Unknown",
        categoryName: flow.product?.category?.name || "Unknown",
        useDefaultFlow: flow.useDefaultFlow,
        stepsCount: steps.length,
        steps: steps.map((step: any) => ({
          stepName: step.stepName,
          stepType: step.stepType,
          optionsCount: step.options?.length || 0,
          firstOption: step.options?.[0],
        })),
      };
    });

    return NextResponse.json(debugData, { status: 200 });
  } catch (error) {
    console.error("Error fetching debug data:", error);
    return NextResponse.json(
      { error: "Error fetching debug data" },
      { status: 500 }
    );
  }
}
