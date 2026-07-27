import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/map-fixtures
router.get("/map-fixtures", async (req, res) => {
  try {
    const fixtures = await db.query.mapFixtures.findMany();
    res.json(fixtures);
  } catch (error) {
    console.error("Error fetching map fixtures:", error);
    res.status(500).json({ error: "Error al obtener elementos del mapa" });
  }
});

// POST /api/map-fixtures
router.post("/map-fixtures", async (req, res) => {
  try {
    const { type, label, positionX, positionY, widthCells, heightCells, rotation } = req.body;

    if (positionX === undefined || positionY === undefined) {
      return res.status(400).json({ error: "positionX y positionY son requeridos" });
    }

    const [fixture] = await db
      .insert(schema.mapFixtures)
      .values({
        type: type || "wall",
        label: label || null,
        positionX,
        positionY,
        widthCells: widthCells || 1,
        heightCells: heightCells || 1,
        rotation: rotation || 0,
      })
      .returning();

    res.status(201).json(fixture);
  } catch (error) {
    console.error("Error creating map fixture:", error);
    res.status(500).json({ error: "Error al crear elemento del mapa" });
  }
});

// PATCH /api/map-fixtures/:id
router.patch("/map-fixtures/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, label, positionX, positionY, widthCells, heightCells, rotation } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (type !== undefined) updates.type = type;
    if (label !== undefined) updates.label = label;
    if (positionX !== undefined) updates.positionX = positionX;
    if (positionY !== undefined) updates.positionY = positionY;
    if (widthCells !== undefined) updates.widthCells = widthCells;
    if (heightCells !== undefined) updates.heightCells = heightCells;
    if (rotation !== undefined) updates.rotation = rotation;

    const [updated] = await db
      .update(schema.mapFixtures)
      .set(updates)
      .where(eq(schema.mapFixtures.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Elemento no encontrado" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating map fixture:", error);
    res.status(500).json({ error: "Error al actualizar elemento del mapa" });
  }
});

// DELETE /api/map-fixtures/:id
router.delete("/map-fixtures/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(schema.mapFixtures).where(eq(schema.mapFixtures.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting map fixture:", error);
    res.status(500).json({ error: "Error al eliminar elemento del mapa" });
  }
});

export default router;
