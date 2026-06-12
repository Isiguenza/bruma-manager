import { Router } from "express";
import { db, schema } from "../db";
import { eq, asc } from "drizzle-orm";

const router = Router();

// GET /api/categories/:id/flow
router.get("/categories/:id/flow", async (req, res) => {
  try {
    const { id } = req.params;

    // Use modifierSteps/modifierOptions which have proper Drizzle relations
    const steps = await db.query.modifierSteps.findMany({
      where: eq(schema.modifierSteps.categoryId, id),
      orderBy: [asc(schema.modifierSteps.sortOrder)],
      with: {
        options: {
          orderBy: [asc(schema.modifierOptions.sortOrder)],
        },
      },
    });

    if (!steps || steps.length === 0) {
      return res.json({
        categoryId: id,
        useDefaultFlow: true,
        steps: [],
      });
    }

    res.json({
      categoryId: id,
      useDefaultFlow: false,
      steps: steps.map((s: any) => ({
        id: s.id,
        stepName: s.stepName,
        stepType: s.stepType,
        sortOrder: s.sortOrder,
        isRequired: s.isRequired,
        allowMultiple: s.allowMultiple,
        options: (s.options || []).map((o: any) => ({
          id: o.id,
          stepId: o.stepId,
          name: o.name,
          description: o.description,
          price: o.price,
          sortOrder: o.sortOrder,
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching category flow:", error);
    res.status(500).json({ error: "Error al obtener flujo de categoría" });
  }
});

// GET /api/products/:id/flow
router.get("/products/:id/flow", async (req, res) => {
  try {
    const { id } = req.params;

    // First check if product has a custom flow (plain SQL - no relations)
    const [productFlow] = await db
      .select()
      .from(schema.productFlows)
      .where(eq(schema.productFlows.productId, id))
      .limit(1);

    // If product has custom flow and not using default, return it
    if (productFlow && !productFlow.useDefaultFlow) {
      const steps = JSON.parse(productFlow.steps || "[]");
      return res.json({
        productId: id,
        useDefaultFlow: false,
        steps,
        nodes: productFlow.nodes ? JSON.parse(productFlow.nodes) : null,
        source: "product",
      });
    }

    // If no product flow, get category flow via modifierSteps
    const [product] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, id))
      .limit(1);

    if (!product || !product.categoryId) {
      return res.json({
        productId: id,
        useDefaultFlow: true,
        steps: [],
        source: "default",
      });
    }

    const steps = await db.query.modifierSteps.findMany({
      where: eq(schema.modifierSteps.categoryId, product.categoryId),
      orderBy: [asc(schema.modifierSteps.sortOrder)],
      with: {
        options: {
          orderBy: [asc(schema.modifierOptions.sortOrder)],
        },
      },
    });

    if (!steps || steps.length === 0) {
      return res.json({
        productId: id,
        useDefaultFlow: true,
        steps: [],
        source: "default",
      });
    }

    return res.json({
      productId: id,
      useDefaultFlow: false,
      steps: steps.map((s: any) => ({
        id: s.id,
        stepName: s.stepName,
        stepType: s.stepType,
        sortOrder: s.sortOrder,
        isRequired: s.isRequired,
        allowMultiple: s.allowMultiple,
        options: (s.options || []).map((o: any) => ({
          id: o.id,
          stepId: o.stepId,
          name: o.name,
          description: o.description,
          price: o.price,
          sortOrder: o.sortOrder,
        })),
      })),
      source: "category",
    });
  } catch (error) {
    console.error("Error fetching product flow:", error);
    res.status(500).json({ error: "Error al obtener flujo de producto" });
  }
});

export default router;
