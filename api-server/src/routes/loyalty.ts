import { Router } from "express";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /api/loyalty-cards
router.get("/loyalty-cards", async (req, res) => {
  try {
    const { phone } = req.query;

    let whereConditions: any[] = [];

    if (phone) {
      whereConditions.push(eq(schema.loyaltyCards.phone, phone as string));
    }

    const cards = await db.query.loyaltyCards.findMany({
      where: whereConditions.length > 0 ? whereConditions[0] : undefined,
      orderBy: desc(schema.loyaltyCards.createdAt),
    });

    res.json(cards);
  } catch (error) {
    console.error("Error fetching loyalty cards:", error);
    res.status(500).json({ error: "Error al obtener tarjetas" });
  }
});

// GET /api/loyalty-cards/:id
router.get("/loyalty-cards/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    res.json(card);
  } catch (error) {
    console.error("Error fetching loyalty card:", error);
    res.status(500).json({ error: "Error al obtener tarjeta" });
  }
});

// POST /api/loyalty-cards
router.post("/loyalty-cards", async (req, res) => {
  try {
    const { customerName, phone, email } = req.body;

    if (!customerName || !phone) {
      return res.status(400).json({
        error: "customerName y phone son requeridos",
      });
    }

    const [newCard] = await db
      .insert(schema.loyaltyCards)
      .values({
        customerName,
        phone,
        email: email || null,
        points: 0,
        totalSpent: "0",
      })
      .returning();

    res.json(newCard);
  } catch (error) {
    console.error("Error creating loyalty card:", error);
    res.status(500).json({ error: "Error al crear tarjeta" });
  }
});

// PATCH /api/loyalty-cards/:id
router.patch("/loyalty-cards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set(updates)
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    if (!updatedCard) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    res.json(updatedCard);
  } catch (error) {
    console.error("Error updating loyalty card:", error);
    res.status(500).json({ error: "Error al actualizar tarjeta" });
  }
});

// POST /api/loyalty-cards/:id/add-points
router.post("/loyalty-cards/:id/add-points", async (req, res) => {
  try {
    const { id } = req.params;
    const { points, amount } = req.body;

    if (!points || !amount) {
      return res.status(400).json({
        error: "points y amount son requeridos",
      });
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    const newPoints = card.points + parseInt(points);
    const newTotalSpent = (
      parseFloat(card.totalSpent) + parseFloat(amount)
    ).toString();

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({
        points: newPoints,
        totalSpent: newTotalSpent,
      })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    res.json(updatedCard);
  } catch (error) {
    console.error("Error adding points:", error);
    res.status(500).json({ error: "Error al agregar puntos" });
  }
});

// POST /api/loyalty-cards/:id/redeem-points
router.post("/loyalty-cards/:id/redeem-points", async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;

    if (!points) {
      return res.status(400).json({ error: "points es requerido" });
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    if (card.points < parseInt(points)) {
      return res.status(400).json({ error: "Puntos insuficientes" });
    }

    const newPoints = card.points - parseInt(points);

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({ points: newPoints })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    res.json(updatedCard);
  } catch (error) {
    console.error("Error redeeming points:", error);
    res.status(500).json({ error: "Error al canjear puntos" });
  }
});

// GET /api/loyalty/search?barcode=...
router.get("/loyalty/search", async (req, res) => {
  try {
    const { barcode } = req.query;

    if (!barcode) {
      return res.status(400).json({ error: "barcode es requerido" });
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.barcodeValue, barcode as string),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    res.json(card);
  } catch (error) {
    console.error("Error searching loyalty card:", error);
    res.status(500).json({ error: "Error al buscar tarjeta" });
  }
});

// GET /api/loyalty-cards/barcode/:barcode
router.get("/loyalty-cards/barcode/:barcode", async (req, res) => {
  try {
    const { barcode } = req.params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.barcodeValue, barcode),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    res.json(card);
  } catch (error) {
    console.error("Error fetching loyalty card by barcode:", error);
    res.status(500).json({ error: "Error al obtener tarjeta" });
  }
});

// POST /api/loyalty-cards/:id/stamp
router.post("/loyalty-cards/:id/stamp", async (req, res) => {
  try {
    const { id } = req.params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    const newStamps = card.stamps + 1;
    const newTotalStamps = card.totalStamps + 1;
    let newRewardsAvailable = card.rewardsAvailable;

    // Check if customer earned a reward
    if (newStamps >= card.stampsPerReward) {
      newRewardsAvailable += 1;
      const remainingStamps = newStamps - card.stampsPerReward;

      const [updatedCard] = await db
        .update(schema.loyaltyCards)
        .set({
          stamps: remainingStamps,
          totalStamps: newTotalStamps,
          rewardsAvailable: newRewardsAvailable,
        })
        .where(eq(schema.loyaltyCards.id, id))
        .returning();

      return res.json(updatedCard);
    }

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({
        stamps: newStamps,
        totalStamps: newTotalStamps,
      })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    res.json(updatedCard);
  } catch (error) {
    console.error("Error adding stamp:", error);
    res.status(500).json({ error: "Error al agregar sello" });
  }
});

export default router;
