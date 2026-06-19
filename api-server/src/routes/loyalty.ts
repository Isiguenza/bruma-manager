import { Router } from "express";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { sendAppleWalletPush } from "../lib/apple-push";
import { createOrUpdateGoogleWalletObject } from "../lib/google-wallet";

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
    const { customerName, customerPhone, customerEmail, stampsPerReward } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        error: "customerName y customerPhone son requeridos",
      });
    }

    const [newCard] = await db
      .insert(schema.loyaltyCards)
      .values({
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
        stampsPerReward: stampsPerReward || 8,
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

// POST /api/loyalty-cards/:id/stamps
// Adds multiple stamps (used by dashboard)
router.post("/loyalty-cards/:id/stamps", async (req, res) => {
  try {
    const { id } = req.params;
    const { stamps } = req.body;

    if (!stamps || stamps < 1) {
      return res.status(400).json({ error: "stamps debe ser mayor a 0" });
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    const newStamps = card.stamps + stamps;
    const newTotalStamps = card.totalStamps + stamps;
    const newRewards = Math.floor(newStamps / card.stampsPerReward);
    const remainingStamps = newStamps % card.stampsPerReward;
    const newRewardsAvailable = card.rewardsAvailable + newRewards;

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({
        stamps: newRewards > 0 ? remainingStamps : newStamps,
        totalStamps: newTotalStamps,
        rewardsAvailable: newRewardsAvailable,
        updatedAt: new Date(),
      })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    await db.insert(schema.loyaltyTransactions).values({
      cardId: id,
      stampsAdded: stamps,
    });

    // Wallet push (non-blocking)
    sendAppleWalletPush(id).catch(console.error);
    if (updatedCard) {
      createOrUpdateGoogleWalletObject(updatedCard).catch(console.error);
    }

    res.json(updatedCard);
  } catch (error) {
    console.error("Error adding stamps:", error);
    res.status(500).json({ error: "Error al agregar sellos" });
  }
});

// POST /api/loyalty-cards/:id/redeem
// Redeems a reward (used by dashboard)
router.post("/loyalty-cards/:id/redeem", async (req, res) => {
  try {
    const { id } = req.params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, id),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    if (card.rewardsAvailable < 1) {
      return res.status(400).json({ error: "No hay recompensas disponibles" });
    }

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({
        rewardsAvailable: card.rewardsAvailable - 1,
        rewardsRedeemed: card.rewardsRedeemed + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    await db.insert(schema.loyaltyTransactions).values({
      cardId: id,
      stampsAdded: 0,
      rewardRedeemed: true,
    });

    // Wallet push (non-blocking)
    sendAppleWalletPush(id).catch(console.error);
    if (updatedCard) {
      createOrUpdateGoogleWalletObject(updatedCard).catch(console.error);
    }

    res.json(updatedCard);
  } catch (error) {
    console.error("Error redeeming reward:", error);
    res.status(500).json({ error: "Error al canjear recompensa" });
  }
});

export default router;
