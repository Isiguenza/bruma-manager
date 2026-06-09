import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/categories/:id/flow
router.get("/categories/:id/flow", async (req, res) => {
  try {
    const { id } = req.params;

    const categoryFlow = await db.query.categoryFlows.findFirst({
      where: eq(schema.categoryFlows.categoryId, id),
      with: {
        steps: {
          with: {
            options: true,
          },
          orderBy: (steps, { asc }) => [asc(steps.order)],
        },
      },
    });

    if (!categoryFlow) {
      return res.json({
        categoryId: id,
        useDefaultFlow: true,
        steps: [],
      });
    }

    res.json({
      categoryId: id,
      useDefaultFlow: categoryFlow.useDefaultFlow,
      steps: categoryFlow.steps,
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

    // First check if product has a custom flow
    const productFlow = await db.query.productFlows.findFirst({
      where: eq(schema.productFlows.productId, id),
      with: {
        steps: {
          with: {
            options: true,
          },
          orderBy: (steps, { asc }) => [asc(steps.order)],
        },
      },
    });

    if (productFlow) {
      return res.json({
        productId: id,
        useDefaultFlow: false,
        steps: productFlow.steps,
        source: "product",
      });
    }

    // If no product flow, get category flow
    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, id),
    });

    if (!product || !product.categoryId) {
      return res.json({
        productId: id,
        useDefaultFlow: true,
        steps: [],
        source: "default",
      });
    }

    const categoryFlow = await db.query.categoryFlows.findFirst({
      where: eq(schema.categoryFlows.categoryId, product.categoryId),
      with: {
        steps: {
          with: {
            options: true,
          },
          orderBy: (steps, { asc }) => [asc(steps.order)],
        },
      },
    });

    if (!categoryFlow) {
      return res.json({
        productId: id,
        useDefaultFlow: true,
        steps: [],
        source: "default",
      });
    }

    res.json({
      productId: id,
      useDefaultFlow: categoryFlow.useDefaultFlow,
      steps: categoryFlow.steps,
      source: "category",
    });
  } catch (error) {
    console.error("Error fetching product flow:", error);
    res.status(500).json({ error: "Error al obtener flujo de producto" });
  }
});

export default router;
