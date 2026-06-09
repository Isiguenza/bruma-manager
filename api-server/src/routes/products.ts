import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// GET /api/products
router.get("/products", async (req, res) => {
  try {
    const { active, categoryId } = req.query;

    let whereConditions: any[] = [];

    if (active === "true") {
      whereConditions.push(eq(schema.products.active, true));
    }

    if (categoryId) {
      whereConditions.push(eq(schema.products.categoryId, categoryId as string));
    }

    const products = await db.query.products.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      orderBy: desc(schema.products.createdAt),
    });

    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// GET /api/products/:id
router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, id),
    });

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

// GET /api/categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await db.query.categories.findMany({
      orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });

    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Error al obtener categorías" });
  }
});

// GET /api/frostings
router.get("/frostings", async (req, res) => {
  try {
    const frostings = await db.query.frostings.findMany({
      where: eq(schema.frostings.active, true),
    });

    res.json(frostings);
  } catch (error) {
    console.error("Error fetching frostings:", error);
    res.status(500).json({ error: "Error al obtener frostings" });
  }
});

export default router;
