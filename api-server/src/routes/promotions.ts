import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, lte, gte, or, isNull } from "drizzle-orm";

const router = Router();

// GET /api/promotions
router.get("/promotions", async (req, res) => {
  try {
    const { active } = req.query;

    let whereConditions: any[] = [];

    if (active === "true") {
      whereConditions.push(eq(schema.promotions.active, true));
    }

    const promotions = await db.query.promotions.findMany({
      where: whereConditions.length > 0 ? whereConditions[0] : undefined,
    });

    res.json(promotions);
  } catch (error) {
    console.error("Error fetching promotions:", error);
    res.status(500).json({ error: "Error al obtener promociones" });
  }
});

// GET /api/promotions/active
router.get("/promotions/active", async (req, res) => {
  try {
    const now = new Date().toISOString();

    const activePromotions = await db.query.promotions.findMany({
      where: and(
        eq(schema.promotions.active, true),
        or(
          isNull(schema.promotions.startDate),
          lte(schema.promotions.startDate, now)
        ),
        or(
          isNull(schema.promotions.endDate),
          gte(schema.promotions.endDate, now)
        )
      ),
    });

    res.json(activePromotions);
  } catch (error) {
    console.error("Error fetching active promotions:", error);
    res.status(500).json({ error: "Error al obtener promociones activas" });
  }
});

// GET /api/promotions/:id
router.get("/promotions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const promotion = await db.query.promotions.findFirst({
      where: eq(schema.promotions.id, id),
    });

    if (!promotion) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    res.json(promotion);
  } catch (error) {
    console.error("Error fetching promotion:", error);
    res.status(500).json({ error: "Error al obtener promoción" });
  }
});

// POST /api/promotions
router.post("/promotions", async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      applicableProducts,
      minPurchaseAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      active,
    } = req.body;

    if (!name || !discountType || !discountValue) {
      return res.status(400).json({
        error: "name, discountType y discountValue son requeridos",
      });
    }

    const [newPromotion] = await db
      .insert(schema.promotions)
      .values({
        name,
        description: description || null,
        discountType,
        discountValue,
        applicableProducts: applicableProducts || null,
        minPurchaseAmount: minPurchaseAmount || null,
        maxDiscountAmount: maxDiscountAmount || null,
        startDate: startDate || null,
        endDate: endDate || null,
        active: active !== undefined ? active : true,
      })
      .returning();

    res.json(newPromotion);
  } catch (error) {
    console.error("Error creating promotion:", error);
    res.status(500).json({ error: "Error al crear promoción" });
  }
});

// PATCH /api/promotions/:id
router.patch("/promotions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedPromotion] = await db
      .update(schema.promotions)
      .set(updates)
      .where(eq(schema.promotions.id, id))
      .returning();

    if (!updatedPromotion) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    res.json(updatedPromotion);
  } catch (error) {
    console.error("Error updating promotion:", error);
    res.status(500).json({ error: "Error al actualizar promoción" });
  }
});

// DELETE /api/promotions/:id
router.delete("/promotions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedPromotion] = await db
      .delete(schema.promotions)
      .where(eq(schema.promotions.id, id))
      .returning();

    if (!deletedPromotion) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    res.status(500).json({ error: "Error al eliminar promoción" });
  }
});

export default router;
