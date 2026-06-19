import { Router } from "express";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { generateApplePass } from "../lib/apple-pass";

const router = Router();

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

export default router;
