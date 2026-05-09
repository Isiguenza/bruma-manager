import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recipes, recipeIngredients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { ingredients: recipeIngs, ...recipeData } = body;

    // Update recipe
    const [updated] = await db
      .update(recipes)
      .set({
        ...recipeData,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // Update ingredients if provided
    if (recipeIngs) {
      // Delete existing ingredients
      await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));

      // Add new ingredients
      if (recipeIngs.length > 0) {
        await db.insert(recipeIngredients).values(
          recipeIngs.map((ing: any) => ({
            recipeId: id,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
          }))
        );
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating recipe:", error);
    return NextResponse.json({ error: "Error updating recipe" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.delete(recipes).where(eq(recipes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json({ error: "Error deleting recipe" }, { status: 500 });
  }
}
