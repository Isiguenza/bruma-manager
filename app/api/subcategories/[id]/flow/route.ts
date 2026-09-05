import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modifierSteps, modifierOptions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// Flujo de modificadores a nivel subcategoría. Tiene precedencia sobre el flujo
// de la categoría padre y hereda de ella cuando no está definido — la resolución
// vive en /api/products/[id]/flow y en api-server/src/routes/flows.ts.

// GET flow configuration for a subcategory
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const steps = await db.query.modifierSteps.findMany({
      where: eq(modifierSteps.subcategoryId, id),
      orderBy: [asc(modifierSteps.sortOrder)],
      with: {
        options: {
          orderBy: [asc(modifierOptions.sortOrder)],
        },
      },
    });

    if (steps.length === 0) {
      return NextResponse.json({
        subcategoryId: id,
        useDefaultFlow: true,
        steps: [],
      });
    }

    return NextResponse.json({
      subcategoryId: id,
      useDefaultFlow: false,
      steps: steps.map((s: any, index: number) => ({
        id: s.id,
        subcategoryId: s.subcategoryId ?? id,
        stepName: s.stepName,
        stepType: s.stepType,
        sortOrder: s.sortOrder ?? index + 1,
        isRequired: s.isRequired ?? false,
        allowMultiple: s.allowMultiple ?? (s.stepType === "extra"),
        includeNoneOption: s.includeNoneOption ?? true,
        active: s.active ?? true,
        options: (s.options || []).map((o: any) => ({
          id: o.id,
          stepId: o.stepId ?? s.id,
          name: o.name,
          description: o.description ?? null,
          price: o.price ?? "0",
          sortOrder: o.sortOrder ?? 0,
          active: o.active ?? true,
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching subcategory flow:", error);
    return NextResponse.json(
      { error: "Error fetching subcategory flow" },
      { status: 500 }
    );
  }
}

// POST flow configuration for a subcategory
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { useDefaultFlow, steps } = body;

    await db.delete(modifierSteps).where(eq(modifierSteps.subcategoryId, id));

    if (useDefaultFlow || !steps || steps.length === 0) {
      return NextResponse.json({
        message: "Switched to inherited flow",
        subcategoryId: id,
        useDefaultFlow: true,
      });
    }

    for (const step of steps) {
      const [newStep] = await db
        .insert(modifierSteps)
        .values({
          subcategoryId: id,
          stepType: step.stepType,
          stepName: step.stepName,
          sortOrder: step.sortOrder,
          isRequired: step.isRequired,
          allowMultiple: step.allowMultiple,
          includeNoneOption:
            step.includeNoneOption !== undefined ? step.includeNoneOption : true,
          active: step.active !== undefined ? step.active : true,
        })
        .returning();

      if (step.options && step.options.length > 0) {
        for (const option of step.options) {
          await db.insert(modifierOptions).values({
            stepId: newStep.id,
            name: option.name,
            description: option.description || null,
            price: option.price || "0",
            sortOrder: option.sortOrder,
            active: option.active !== undefined ? option.active : true,
          });
        }
      }
    }

    return NextResponse.json({
      subcategoryId: id,
      useDefaultFlow: false,
    });
  } catch (error) {
    console.error("Error saving subcategory flow:", error);
    return NextResponse.json(
      { error: "Error saving subcategory flow" },
      { status: 500 }
    );
  }
}
