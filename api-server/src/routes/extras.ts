import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/extras
router.get("/extras", async (req, res) => {
  try {
    const extras = await db.query.extras.findMany({
      where: eq(schema.extras.active, true),
      orderBy: (extras, { asc }) => [asc(extras.name)],
    });
    res.json(extras);
  } catch (error) {
    console.error("Error fetching extras:", error);
    res.status(500).json({ error: "Error al obtener extras" });
  }
});

// GET /api/dry-toppings
router.get("/dry-toppings", async (req, res) => {
  try {
    const toppings = await db.query.dryToppings.findMany({
      where: eq(schema.dryToppings.active, true),
      orderBy: (toppings, { asc }) => [asc(toppings.name)],
    });
    res.json(toppings);
  } catch (error) {
    console.error("Error fetching dry toppings:", error);
    res.status(500).json({ error: "Error al obtener toppings secos" });
  }
});

export default router;
