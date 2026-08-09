import { db } from "@/lib/db";
import { productFlows, products, modifierSteps, modifierOptions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// Resuelve el flujo efectivo de un producto: flujo propio (JSON) si existe y no usa el
// default; si no, hereda el flujo de la categoría (modifierSteps). Expande los pasos
// tipo "category" a los productos activos de esa categoría. Misma lógica que
// app/api/products/[id]/flow (extraída para reusar en el endpoint público).
export async function resolveProductFlow(productId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return null;

  const [productFlow] = await db
    .select()
    .from(productFlows)
    .where(eq(productFlows.productId, productId))
    .limit(1);

  // Flujo propio (JSON)
  if (productFlow && !productFlow.useDefaultFlow) {
    const rawSteps = JSON.parse(productFlow.steps || "[]");
    const steps = await Promise.all(
      rawSteps.map(async (step: any, index: number) => {
        let options = step.options || [];
        let stepCategoryId = product.categoryId || null;

        if (step.stepType === "category") {
          const categoryId = (options.length > 0 ? options[0].id : step.categoryId) || null;
          if (categoryId) {
            stepCategoryId = categoryId;
            const categoryProducts = await db.query.products.findMany({
              where: eq(products.categoryId, categoryId),
              orderBy: [asc(products.name)],
            });
            options = categoryProducts
              .filter((p) => p.active)
              .map((prod, idx) => ({
                id: prod.id,
                stepId: step.id,
                name: prod.name,
                description: null,
                price: "0",
                sortOrder: idx,
                active: true,
              }));
          }
        } else {
          options = options.map((opt: any) => ({
            id: opt.id,
            stepId: opt.stepId,
            name: opt.name,
            description: opt.description,
            price: opt.price,
            sortOrder: opt.sortOrder,
            active: opt.active,
          }));
        }

        return {
          id: step.id,
          categoryId: stepCategoryId,
          stepType: step.stepType,
          stepName: step.stepName,
          sortOrder: step.sortOrder ?? index,
          isRequired: step.isRequired ?? true,
          allowMultiple: step.allowMultiple ?? step.stepType === "extra",
          includeNoneOption: step.includeNoneOption ?? true,
          active: step.active ?? true,
          options,
        };
      })
    );
    return { productId, useDefaultFlow: false, steps, source: "product" };
  }

  // Hereda flujo de categoría
  if (product.categoryId) {
    const steps = await db.query.modifierSteps.findMany({
      where: eq(modifierSteps.categoryId, product.categoryId),
      orderBy: [asc(modifierSteps.sortOrder)],
      with: { options: { orderBy: [asc(modifierOptions.sortOrder)] } },
    });
    if (steps.length > 0) {
      return {
        productId,
        useDefaultFlow: false,
        source: "category",
        steps: steps.map((s: any, index: number) => ({
          id: s.id,
          categoryId: product.categoryId,
          stepName: s.stepName,
          stepType: s.stepType,
          sortOrder: s.sortOrder ?? index + 1,
          isRequired: s.isRequired ?? false,
          allowMultiple: s.allowMultiple ?? s.stepType === "extra",
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
      };
    }
  }

  return { productId, useDefaultFlow: true, steps: [], source: "default" };
}
