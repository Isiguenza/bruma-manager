import { Router } from "express";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { requireClerkAuth } from "../lib/clerkAuth";

const router = Router();

// GET /api/public/addresses — direcciones guardadas del usuario logueado.
router.get("/public/addresses", requireClerkAuth, async (req, res) => {
  try {
    const list = await db.query.customerAddresses.findMany({
      where: eq(schema.customerAddresses.clerkUserId, req.clerkUserId!),
      orderBy: [desc(schema.customerAddresses.isDefault), desc(schema.customerAddresses.createdAt)],
    });
    res.json(list);
  } catch (error) {
    console.error("[addresses] GET error:", error);
    res.status(500).json({ error: "Error al obtener direcciones" });
  }
});

// POST /api/public/addresses — crea una dirección nueva.
router.post("/public/addresses", requireClerkAuth, async (req, res) => {
  try {
    const { label, addressText, street, apartment, postalCode, lat, lng, isDefault } = req.body;
    if (!addressText || typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "Faltan datos de la dirección" });
    }

    if (isDefault) {
      await db
        .update(schema.customerAddresses)
        .set({ isDefault: false })
        .where(eq(schema.customerAddresses.clerkUserId, req.clerkUserId!));
    }

    const [created] = await db
      .insert(schema.customerAddresses)
      .values({
        clerkUserId: req.clerkUserId!,
        label: label || "other",
        addressText,
        street: street || null,
        apartment: apartment || null,
        postalCode: postalCode || null,
        lat: lat.toString(),
        lng: lng.toString(),
        isDefault: !!isDefault,
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    console.error("[addresses] POST error:", error);
    res.status(500).json({ error: "Error al guardar la dirección" });
  }
});

// PUT /api/public/addresses/:id — edita una dirección (solo si es del usuario).
router.put("/public/addresses/:id", requireClerkAuth, async (req, res) => {
  try {
    const existing = await db.query.customerAddresses.findFirst({
      where: eq(schema.customerAddresses.id, req.params.id),
    });
    if (!existing || existing.clerkUserId !== req.clerkUserId) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    const { label, addressText, street, apartment, postalCode, lat, lng, isDefault } = req.body;

    if (isDefault) {
      await db
        .update(schema.customerAddresses)
        .set({ isDefault: false })
        .where(eq(schema.customerAddresses.clerkUserId, req.clerkUserId!));
    }

    const [updated] = await db
      .update(schema.customerAddresses)
      .set({
        label: label ?? existing.label,
        addressText: addressText ?? existing.addressText,
        street: street ?? existing.street,
        apartment: apartment ?? existing.apartment,
        postalCode: postalCode ?? existing.postalCode,
        lat: lat != null ? lat.toString() : existing.lat,
        lng: lng != null ? lng.toString() : existing.lng,
        isDefault: isDefault ?? existing.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(schema.customerAddresses.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[addresses] PUT error:", error);
    res.status(500).json({ error: "Error al editar la dirección" });
  }
});

// DELETE /api/public/addresses/:id
router.delete("/public/addresses/:id", requireClerkAuth, async (req, res) => {
  try {
    const existing = await db.query.customerAddresses.findFirst({
      where: eq(schema.customerAddresses.id, req.params.id),
    });
    if (!existing || existing.clerkUserId !== req.clerkUserId) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }
    await db.delete(schema.customerAddresses).where(eq(schema.customerAddresses.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error("[addresses] DELETE error:", error);
    res.status(500).json({ error: "Error al borrar la dirección" });
  }
});

// POST /api/public/addresses/:id/default — marca como default (desmarca las demás).
router.post("/public/addresses/:id/default", requireClerkAuth, async (req, res) => {
  try {
    const existing = await db.query.customerAddresses.findFirst({
      where: eq(schema.customerAddresses.id, req.params.id),
    });
    if (!existing || existing.clerkUserId !== req.clerkUserId) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }
    await db
      .update(schema.customerAddresses)
      .set({ isDefault: false })
      .where(eq(schema.customerAddresses.clerkUserId, req.clerkUserId!));
    const [updated] = await db
      .update(schema.customerAddresses)
      .set({ isDefault: true })
      .where(eq(schema.customerAddresses.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("[addresses] default error:", error);
    res.status(500).json({ error: "Error al marcar la dirección" });
  }
});

export default router;
