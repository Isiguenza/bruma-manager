import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/discounts?active=true
router.get("/discounts", async (req, res) => {
  try {
    const { active } = req.query;

    let discounts;
    if (active === "true") {
      discounts = await db.query.discounts.findMany({
        where: eq(schema.discounts.active, true),
        orderBy: (discounts, { asc }) => [asc(discounts.name)],
      });
    } else {
      discounts = await db.query.discounts.findMany({
        orderBy: (discounts, { asc }) => [asc(discounts.name)],
      });
    }

    res.json(discounts);
  } catch (error) {
    console.error("Error fetching discounts:", error);
    res.status(500).json({ error: "Error al obtener descuentos" });
  }
});

export default router;
