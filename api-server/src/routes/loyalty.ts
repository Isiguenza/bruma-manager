import { Router } from "express";
import { randomUUID } from "crypto";
import { db, schema } from "../db";
import { eq, desc, inArray, isNull, sql } from "drizzle-orm";
import { sendAppleWalletPush, sendAppleWalletPushToAll } from "../lib/apple-push";
import { createOrUpdateGoogleWalletObject, refreshAllGoogleWalletObjects, sendGoogleWalletMessage } from "../lib/google-wallet";
import { getActiveWalletSeason, listWalletSeasons, setActiveWalletSeason } from "../lib/pass-assets";

const router = Router();

// GET /api/loyalty-cards
// Each card also carries `appleDevices` (iPhones with the pass installed, from
// wallet_device_registrations) and `lastActivityAt` (last stamp/redeem).
router.get("/loyalty-cards", async (req, res) => {
  try {
    const { phone } = req.query;

    const [cards, registrations, activity] = await Promise.all([
      db.query.loyaltyCards.findMany({
        where: phone ? eq(schema.loyaltyCards.customerPhone, phone as string) : undefined,
        orderBy: desc(schema.loyaltyCards.createdAt),
      }),
      db
        .select({ serialNumber: schema.walletDeviceRegistrations.serialNumber, devices: sql<number>`count(*)::int` })
        .from(schema.walletDeviceRegistrations)
        .groupBy(schema.walletDeviceRegistrations.serialNumber),
      db
        .select({ cardId: schema.loyaltyTransactions.cardId, last: sql<string>`max(${schema.loyaltyTransactions.createdAt})` })
        .from(schema.loyaltyTransactions)
        .groupBy(schema.loyaltyTransactions.cardId),
    ]);

    const devicesByCard = new Map(registrations.map((r) => [r.serialNumber, r.devices]));
    const lastByCard = new Map(activity.map((a) => [a.cardId, a.last]));

    res.json(
      cards.map(({ pinHash: _pin, ...card }) => ({
        ...card,
        appleDevices: devicesByCard.get(card.id) ?? 0,
        lastActivityAt: lastByCard.get(card.id) ?? null,
      }))
    );
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
// Card created by staff from the dashboard. Same barcode format as the public
// registration (app/api/loyalty/route.ts). Email is optional here (the column
// is NOT NULL, so it's stored as "").
router.post("/loyalty-cards", async (req, res) => {
  try {
    const { customerName, customerLastName, customerPhone, customerEmail, birthDate, stampsPerReward } = req.body;

    if (!customerName?.trim() || !customerLastName?.trim() || !customerPhone?.trim()) {
      return res.status(400).json({ error: "Nombre, apellido y teléfono son requeridos" });
    }

    const barcodeValue = `BRUMA-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    const [newCard] = await db
      .insert(schema.loyaltyCards)
      .values({
        customerName: customerName.trim(),
        customerLastName: customerLastName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail?.trim() || "",
        birthDate: birthDate || null,
        barcodeValue,
        stampsPerReward: stampsPerReward || 8,
      })
      .returning();

    const { pinHash: _pin, ...card } = newCard;
    res.json(card);
  } catch (error) {
    console.error("Error creating loyalty card:", error);
    res.status(500).json({ error: "Error al crear tarjeta" });
  }
});

// PATCH /api/loyalty-cards/:id
// Only customer data is editable here; stamps/rewards go through their own
// endpoints so they leave a loyalty_transactions row.
const EDITABLE_CARD_FIELDS = ["customerName", "customerLastName", "customerPhone", "customerEmail", "birthDate"] as const;
router.patch("/loyalty-cards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates: Record<string, any> = {};
    for (const field of EDITABLE_CARD_FIELDS) {
      if (field in (req.body || {})) {
        const value = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
        updates[field] = value;
      }
    }
    if (updates.customerName === "" || updates.customerLastName === "") {
      return res.status(400).json({ error: "Nombre y apellido no pueden ir vacíos" });
    }
    if ("customerEmail" in updates) updates.customerEmail = updates.customerEmail || "";
    if ("customerPhone" in updates) updates.customerPhone = updates.customerPhone || null;
    if ("birthDate" in updates) updates.birthDate = updates.birthDate || null;

    const [updatedCard] = await db
      .update(schema.loyaltyCards)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    if (!updatedCard) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    sendAppleWalletPush(id).catch(console.error);
    createOrUpdateGoogleWalletObject(updatedCard, { createIfMissing: false }).catch(console.error);

    const { pinHash: _pin, ...card } = updatedCard;
    res.json(card);
  } catch (error) {
    console.error("Error updating loyalty card:", error);
    res.status(500).json({ error: "Error al actualizar tarjeta" });
  }
});

// GET /api/loyalty-cards/:id/transactions
// Stamp/redeem history for the dashboard detail view.
router.get("/loyalty-cards/:id/transactions", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: schema.loyaltyTransactions.id,
        stampsAdded: schema.loyaltyTransactions.stampsAdded,
        rewardRedeemed: schema.loyaltyTransactions.rewardRedeemed,
        createdAt: schema.loyaltyTransactions.createdAt,
        orderId: schema.loyaltyTransactions.orderId,
        orderNumber: schema.orders.orderNumber,
        orderTotal: schema.orders.total,
      })
      .from(schema.loyaltyTransactions)
      .leftJoin(schema.orders, eq(schema.orders.id, schema.loyaltyTransactions.orderId))
      .where(eq(schema.loyaltyTransactions.cardId, req.params.id))
      .orderBy(desc(schema.loyaltyTransactions.createdAt))
      .limit(100);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching loyalty transactions:", error);
    res.status(500).json({ error: "Error al obtener historial" });
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

// GET /api/loyalty/search?barcode=...&email=...&phone=...
router.get("/loyalty/search", async (req, res) => {
  try {
    const { barcode, email, phone } = req.query;

    if (!barcode && !email && !phone) {
      return res.status(400).json({ error: "barcode, email o phone es requerido" });
    }

    let card;
    if (barcode) {
      card = await db.query.loyaltyCards.findFirst({
        where: eq(schema.loyaltyCards.barcodeValue, barcode as string),
      });
    } else if (email) {
      const emailNorm = (email as string).toLowerCase().trim();
      card = await db.query.loyaltyCards.findFirst({
        where: sql`lower(${schema.loyaltyCards.customerEmail}) = ${emailNorm}`,
      });
    } else {
      // Strip non-digits for flexible phone matching
      const phoneDigits = (phone as string).replace(/\D/g, "");
      card = await db.query.loyaltyCards.findFirst({
        where: sql`regexp_replace(${schema.loyaltyCards.customerPhone}, '[^0-9]', '', 'g') LIKE ${"%" + phoneDigits + "%"}`,
      });
    }

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

// POST /api/loyalty-cards/promotions
// Send a promotion message to Apple Wallet passes
router.post("/loyalty-cards/promotions", async (req, res) => {
  try {
    const { message, targetType, targetCardIds } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "El mensaje es requerido" });
    }

    const target = targetType || "all";
    let cards: any[] = [];

    if (target === "specific" && Array.isArray(targetCardIds) && targetCardIds.length > 0) {
      cards = await db.query.loyaltyCards.findMany({
        where: inArray(schema.loyaltyCards.id, targetCardIds),
      });
    } else {
      cards = await db.query.loyaltyCards.findMany({
        where: eq(schema.loyaltyCards.active, true),
      });
    }

    if (cards.length === 0) {
      return res.status(400).json({ error: "No hay tarjetas para enviar la promoción" });
    }

    // latestMessage drives both wallets: on Apple it's a back field with
    // changeMessage "%@" (the lock-screen notification when the pass reloads);
    // on Google it's the "Último mensaje" text module + addMessage below.
    const cardIds = cards.map((c) => c.id);
    const updatedCards = await db
      .update(schema.loyaltyCards)
      .set({ latestMessage: message, updatedAt: new Date() })
      .where(inArray(schema.loyaltyCards.id, cardIds))
      .returning();

    let apple: { devices: number; sent: number; failed: number } | null = null;
    try {
      apple = await sendAppleWalletPushToAll(cardIds);
    } catch (error) {
      console.error("[Promotion] Apple push error:", error);
    }

    // Android in the background: one PUT + addMessage per card, 4 at a time.
    (async () => {
      const queue = [...updatedCards];
      const counts = { sent: 0, not_installed: 0, error: 0 };
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let card = queue.shift(); card; card = queue.shift()) {
            counts[await sendGoogleWalletMessage(card, message)]++;
          }
        })
      );
      console.log("[Promotion] Google Wallet:", counts);
    })().catch((error) => console.error("[Promotion] Google Wallet error:", error));

    // Save promotion record
    await db.insert(schema.walletPromotions).values({
      message,
      targetType: target,
      targetCardIds: target === "specific" ? JSON.stringify(targetCardIds) : null,
      sentCount: cards.length,
    });

    res.json({
      success: true,
      sentTo: cards.length,
      apple,
      message,
    });
  } catch (error) {
    console.error("Error sending promotion:", error);
    res.status(500).json({ error: "Error al enviar promoción" });
  }
});

// GET /api/wallet-seasons
// Season folders available in public/pass-assets/seasons/ and the active one
// (null = original design). Not under /loyalty-cards/ so it can't be caught
// by GET /loyalty-cards/:id.
router.get("/wallet-seasons", async (_req, res) => {
  res.json({ seasons: listWalletSeasons(), active: await getActiveWalletSeason() });
});

// POST /api/loyalty-cards/refresh-all  { cardIds?: string[], season?: string | null }
// Re-sends every card (or only `cardIds`, to test a design on one card) after
// a design change. `season` (if present) first switches the active design for
// ALL cards — a card that isn't refreshed now still picks it up the next time
// Wallet re-downloads it (e.g. on its next stamp). Apple only re-downloads a
// pass whose updatedAt is newer than its last sync AND after a push, so both
// are needed. Google's re-render runs in the background: it uploads one image
// per card.
router.post("/loyalty-cards/refresh-all", async (req, res) => {
  try {
    const rawIds = req.body?.cardIds;
    const cardIds = Array.isArray(rawIds) ? rawIds.filter((id: unknown) => typeof id === "string") : undefined;
    if (cardIds && cardIds.length === 0) {
      return res.status(400).json({ error: "Selecciona al menos una tarjeta" });
    }

    if (req.body && "season" in req.body) {
      const season = req.body.season || null;
      if (season !== null && !listWalletSeasons().includes(season)) {
        return res.status(400).json({ error: `No existe la temporada "${season}"` });
      }
      await setActiveWalletSeason(season);
    }

    const cards = await db
      .update(schema.loyaltyCards)
      .set({ updatedAt: new Date() })
      .where(cardIds ? inArray(schema.loyaltyCards.id, cardIds) : undefined)
      .returning();

    let apple: { devices: number; sent: number; failed: number } | null = null;
    try {
      apple = await sendAppleWalletPushToAll(cardIds);
    } catch (error) {
      console.error("[Refresh all] Apple push error:", error);
    }

    refreshAllGoogleWalletObjects(cards).catch((error) =>
      console.error("[Refresh all] Google Wallet error:", error)
    );

    res.json({ success: true, cards: cards.length, apple, season: await getActiveWalletSeason() });
  } catch (error) {
    console.error("Error refreshing wallet cards:", error);
    res.status(500).json({ error: "Error al actualizar tarjetas" });
  }
});

// GET /api/loyalty-cards/promotions
// Get promotion history
router.get("/loyalty-cards/promotions", async (req, res) => {
  try {
    const promotions = await db.query.walletPromotions.findMany({
      orderBy: desc(schema.walletPromotions.createdAt),
      limit: 50,
    });
    res.json(promotions);
  } catch (error) {
    console.error("Error fetching promotions:", error);
    res.status(500).json({ error: "Error al obtener promociones" });
  }
});

// DELETE /api/loyalty-cards/:id
router.delete("/loyalty-cards/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Unlink orders first to avoid FK constraint violation
    await db.update(schema.orders)
      .set({ loyaltyCardId: null })
      .where(eq(schema.orders.loyaltyCardId, id));

    // Delete related records
    await db.delete(schema.walletDeviceRegistrations)
      .where(eq(schema.walletDeviceRegistrations.serialNumber, id));

    await db.delete(schema.loyaltyTransactions)
      .where(eq(schema.loyaltyTransactions.cardId, id));

    // Delete the card
    const result = await db.delete(schema.loyaltyCards)
      .where(eq(schema.loyaltyCards.id, id))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting loyalty card:", error);
    res.status(500).json({ error: "Error al eliminar tarjeta" });
  }
});

export default router;
