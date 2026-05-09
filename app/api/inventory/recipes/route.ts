import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recipes, recipeIngredients, ingredients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allRecipes = await db.select().from(recipes).orderBy(recipes.name);
    
    // Get ingredients for each recipe
    const recipesWithIngredients = await Promise.all(
      allRecipes.map(async (recipe) => {
        const recipeIngs = await db
          .select({
            id: recipeIngredients.id,
            ingredientId: recipeIngredients.ingredientId,
            quantity: recipeIngredients.quantity,
            ingredientName: ingredients.name,
            ingredientUnit: ingredients.unit,
          })
          .from(recipeIngredients)
          .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
          .where(eq(recipeIngredients.recipeId, recipe.id));

        return {
          ...recipe,
          ingredients: recipeIngs,
        };
      })
    );

    return NextResponse.json(recipesWithIngredients);
  } catch (error) {
    console.error("Error fetching recipes:", error);
    return NextResponse.json({ error: "Error fetching recipes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, unit, currentStock, minStock, ingredients: recipeIngs } = body;

    if (!name || !unit) {
      return NextResponse.json({ error: "Name and unit are required" }, { status: 400 });
    }

    // Create recipe
    const [recipe] = await db
      .insert(recipes)
      .values({
        name,
        description,
        unit,
        currentStock: currentStock || "0",
        minStock: minStock || "0",
      })
      .returning();

    // Add ingredients if provided
    if (recipeIngs && recipeIngs.length > 0) {
      await db.insert(recipeIngredients).values(
        recipeIngs.map((ing: any) => ({
          recipeId: recipe.id,
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
        }))
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error creating recipe:", error);
    return NextResponse.json({ error: "Error creating recipe" }, { status: 500 });
  }
}
