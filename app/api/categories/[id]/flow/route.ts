import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modifierSteps, modifierOptions, products } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { resolveFlowGraph } from "@/lib/flows/resolve";

function flatten(graph: any) {
  const steps: any[] = []; const seen = new Set<string>(); let current: string | null = graph.entryNodeId;
  while (current && !seen.has(current)) { seen.add(current); const node = graph.nodes.find((n: any) => n.id === current); if (!node) break;
    if (node.options.length) steps.push({ id: node.id, categoryId: graph.productId, stepName: node.title, stepType: "custom", sortOrder: steps.length, isRequired: node.minSelections > 0, allowMultiple: node.selectMode === "multi", includeNoneOption: node.includeNoneOption, active: true, options: node.options.map((o: any, i: number) => ({ id: o.id, stepId: node.id, name: o.label, description: null, price: String(o.effectivePrice), sortOrder: i, active: true })) });
    current = graph.edges.filter((e: any) => e.fromNodeId === node.id).sort((a: any, b: any) => a.sortOrder - b.sortOrder)[0]?.toNodeId ?? null;
  } return steps;
}

// GET flow configuration for a category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [representative] = await db.select().from(products).where(eq(products.categoryId, id)).limit(1);
    if (representative) {
      const graph = await resolveFlowGraph(representative.id);
      if (graph) return NextResponse.json({ categoryId: id, useDefaultFlow: false, steps: flatten(graph) });
    }

    // Fetch all steps for this category with their options
    const steps = await db.query.modifierSteps.findMany({
      where: eq(modifierSteps.categoryId, id),
      orderBy: [asc(modifierSteps.sortOrder)],
      with: {
        options: {
          orderBy: [asc(modifierOptions.sortOrder)],
        },
      },
    });

    // If no custom steps defined, return default flow
    if (steps.length === 0) {
      return NextResponse.json({
        categoryId: id,
        useDefaultFlow: true,
        steps: [
          {
            stepType: "frosting",
            stepName: "Escarchado",
            sortOrder: 1,
            isRequired: false,
            allowMultiple: false,
            options: [],
          },
          {
            stepType: "topping",
            stepName: "Topping Seco",
            sortOrder: 2,
            isRequired: false,
            allowMultiple: false,
            options: [],
          },
          {
            stepType: "extra",
            stepName: "Extras",
            sortOrder: 3,
            isRequired: false,
            allowMultiple: true,
            includeNoneOption: true,
            options: [],
          },
        ],
      });
    }

    return NextResponse.json({
      categoryId: id,
      useDefaultFlow: false,
      steps: steps.map((s: any, index: number) => ({
        id: s.id,
        categoryId: s.categoryId ?? id,
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
    console.error("Error fetching category flow:", error);
    return NextResponse.json(
      { error: "Error fetching category flow" },
      { status: 500 }
    );
  }
}

// POST/PUT flow configuration for a category
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { useDefaultFlow, steps } = body;

    // If switching to default flow, delete all custom steps
    if (useDefaultFlow) {
      await db.delete(modifierSteps).where(eq(modifierSteps.categoryId, id));
      return NextResponse.json({ 
        message: "Switched to default flow",
        categoryId: id,
        useDefaultFlow: true,
      });
    }

    // Delete existing steps and recreate (simpler than updating)
    await db.delete(modifierSteps).where(eq(modifierSteps.categoryId, id));

    // Create new steps and options
    for (const step of steps) {
      const [newStep] = await db
        .insert(modifierSteps)
        .values({
          categoryId: id,
          stepType: step.stepType,
          stepName: step.stepName,
          sortOrder: step.sortOrder,
          isRequired: step.isRequired,
          allowMultiple: step.allowMultiple,
          includeNoneOption: step.includeNoneOption !== undefined ? step.includeNoneOption : true,
          active: step.active !== undefined ? step.active : true,
        })
        .returning();

      // If step has custom options, create them
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

    // Fetch and return the updated flow
    const updatedSteps = await db.query.modifierSteps.findMany({
      where: eq(modifierSteps.categoryId, id),
      orderBy: [asc(modifierSteps.sortOrder)],
      with: {
        options: {
          orderBy: [asc(modifierOptions.sortOrder)],
        },
      },
    });

    return NextResponse.json({
      categoryId: id,
      useDefaultFlow: false,
      steps: updatedSteps,
    });
  } catch (error) {
    console.error("Error saving category flow:", error);
    return NextResponse.json(
      { error: "Error saving category flow" },
      { status: 500 }
    );
  }
}
