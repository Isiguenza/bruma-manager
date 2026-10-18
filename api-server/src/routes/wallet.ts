import { Router } from "express";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { generateApplePass } from "../lib/apple-pass";
import { generateGoogleWalletSaveUrl, createOrUpdateGoogleWalletObject } from "../lib/google-wallet";
import { getPassAssetResolver } from "../lib/pass-assets";

const router = Router();

// GET /api/wallet/assets/:file
// Card art for the dashboard's pass preview, resolved through the active
// season exactly like the real pass, so the preview shows what Wallet shows.
const PREVIEW_ASSETS = new Set(["logo@2x.png", "sello@2x.png", "sello_vacio@2x.png"]);
router.get("/wallet/assets/:file", async (req, res) => {
  if (!PREVIEW_ASSETS.has(req.params.file)) return res.status(404).send();
  const asset = await getPassAssetResolver();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(asset(req.params.file));
});

// GET /api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId
// Apple Wallet calls this to check for updates
router.get("/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId", async (req, res) => {
  const { deviceLibraryId, passTypeId } = req.params;
  const passesUpdatedSince = req.query.passesUpdatedSince as string | undefined;

  console.log("[API Wallet] GET list passes:", {
    deviceLibraryId,
    passTypeId,
    passesUpdatedSince,
    userAgent: req.headers["user-agent"],
  });

  try {
    const registrations = await db.query.walletDeviceRegistrations.findMany({
      where: and(
        eq(schema.walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
        eq(schema.walletDeviceRegistrations.passTypeId, passTypeId)
      ),
    });

    if (registrations.length === 0) {
      console.log("[API Wallet] No registrations for device:", deviceLibraryId);
      return res.status(204).send();
    }

    const serialNumbers: string[] = [];
    let lastUpdated = new Date(0);

    for (const reg of registrations) {
      const card = await db.query.loyaltyCards.findFirst({
        where: eq(schema.loyaltyCards.id, reg.serialNumber),
      });

      if (!card) continue;

      if (passesUpdatedSince) {
        const since = new Date(passesUpdatedSince);
        if (card.updatedAt <= since) continue;
      }

      serialNumbers.push(reg.serialNumber);
      if (card.updatedAt > lastUpdated) {
        lastUpdated = card.updatedAt;
      }
    }

    if (serialNumbers.length === 0) {
      return res.status(204).send();
    }

    console.log("[API Wallet] Returning serials:", serialNumbers);
    return res.json({
      serialNumbers,
      lastUpdated: lastUpdated.toISOString(),
    });
  } catch (error) {
    console.error("[API Wallet] Error listing passes:", error);
    return res.status(500).send();
  }
});

// POST /api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber
// Apple Wallet calls this when adding a pass
router.post("/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber", async (req, res) => {
  const { deviceLibraryId, passTypeId, serialNumber } = req.params;
  const authHeader = req.headers.authorization;

  console.log("[API Wallet] POST register device:", {
    deviceLibraryId,
    passTypeId,
    serialNumber,
    authHeader: authHeader ? authHeader.substring(0, 30) + "..." : "missing",
    userAgent: req.headers["user-agent"],
  });

  if (!authHeader?.startsWith("ApplePass ")) {
    console.error("[API Wallet] Missing or invalid auth header");
    return res.status(401).send();
  }

  try {
    const { pushToken } = req.body || {};

    const existing = await db.query.walletDeviceRegistrations.findFirst({
      where: and(
        eq(schema.walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
        eq(schema.walletDeviceRegistrations.serialNumber, serialNumber)
      ),
    });

    if (existing) {
      console.log("[API Wallet] Device already registered");
      return res.status(200).send();
    }

    await db.insert(schema.walletDeviceRegistrations).values({
      deviceLibraryId,
      passTypeId,
      serialNumber,
      pushToken: pushToken || null,
    });

    console.log("[API Wallet] Device registered:", deviceLibraryId);
    return res.status(201).send();
  } catch (error) {
    console.error("[API Wallet] Error registering device:", error);
    return res.status(500).send();
  }
});

// DELETE /api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber
// Apple Wallet calls this when removing a pass
router.delete("/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber", async (req, res) => {
  const { deviceLibraryId, serialNumber } = req.params;
  const authHeader = req.headers.authorization;

  console.log("[API Wallet] DELETE unregister device:", { deviceLibraryId, serialNumber });

  if (!authHeader?.startsWith("ApplePass ")) {
    return res.status(401).send();
  }

  try {
    await db.delete(schema.walletDeviceRegistrations).where(
      and(
        eq(schema.walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
        eq(schema.walletDeviceRegistrations.serialNumber, serialNumber)
      )
    );
    return res.status(200).send();
  } catch (error) {
    console.error("[API Wallet] Error unregistering device:", error);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/pass/:passTypeId/:serialNumber
// Apple Wallet calls this to download an updated pass
router.get("/wallet/v1/pass/:passTypeId/:serialNumber", async (req, res) => {
  const { serialNumber } = req.params;

  console.log("[API Wallet] GET updated pass (singular):", { serialNumber });

  try {
    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, serialNumber),
    });
    if (!card) {
      return res.status(404).send();
    }
    const buffer = await generateApplePass(card);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.send(buffer);
  } catch (error) {
    console.error("[API Wallet] Error generating pass:", error);
    res.status(500).send();
  }
});

// GET /api/wallet/v1/passes/:passTypeId/:serialNumber
// Apple also uses /passes/ (plural) — same functionality
router.get("/wallet/v1/passes/:passTypeId/:serialNumber", async (req, res) => {
  const { serialNumber } = req.params;

  console.log("[API Wallet] GET updated pass:", { serialNumber });

  try {
    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, serialNumber),
    });
    if (!card) {
      console.error("[API Wallet] Card not found:", serialNumber);
      return res.status(404).send();
    }
    const buffer = await generateApplePass(card);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.send(buffer);
  } catch (error) {
    console.error("[API Wallet] Error generating pass:", error);
    res.status(500).send();
  }
});

// GET /api/wallet/pass/:cardId
// "Add to Apple Wallet" download (registration page, card page, dashboard QR).
router.get("/wallet/pass/:cardId", async (req, res) => {
  try {
    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, req.params.cardId),
    });
    if (!card) return res.status(404).json({ error: "Tarjeta no encontrada" });
    const buffer = await generateApplePass(card);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename="bruma-${card.id}.pkpass"`);
    res.send(buffer);
  } catch (error) {
    console.error("[API Wallet] Error generating pass download:", error);
    res.status(500).json({ error: "Error generando tarjeta" });
  }
});

// GET /api/wallet/google-pass/:cardId
// Generate Google Wallet "Save to Wallet" link
router.get("/wallet/google-pass/:cardId", async (req, res) => {
  try {
    const { cardId } = req.params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(schema.loyaltyCards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    // Ensure the object exists in Google Wallet API
    await createOrUpdateGoogleWalletObject(card);

    const saveUrl = generateGoogleWalletSaveUrl(cardId);

    res.redirect(saveUrl);
  } catch (error) {
    console.error("[API Wallet] Error generating Google Wallet pass:", error);
    res.status(500).json({ error: "Error generando tarjeta Google Wallet" });
  }
});

export default router;
