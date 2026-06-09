import { Router } from "express";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /api/inventory
router.get("/inventory", async (req, res) => {
  try {
    const inventory = await db.query.inventory.findMany({
      orderBy: desc(schema.inventory.updatedAt),
    });

    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Error al obtener inventario" });
  }
});

// GET /api/inventory/:id
router.get("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const item = await db.query.inventory.findFirst({
      where: eq(schema.inventory.id, id),
    });

    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    res.status(500).json({ error: "Error al obtener item" });
  }
});

// POST /api/inventory
router.post("/inventory", async (req, res) => {
  try {
    const { name, unit, currentStock, minStock, maxStock, costPerUnit } =
      req.body;

    if (!name || !unit) {
      return res.status(400).json({ error: "name y unit son requeridos" });
    }

    const [newItem] = await db
      .insert(schema.inventory)
      .values({
        name,
        unit,
        currentStock: currentStock || 0,
        minStock: minStock || null,
        maxStock: maxStock || null,
        costPerUnit: costPerUnit || null,
      })
      .returning();

    res.json(newItem);
  } catch (error) {
    console.error("Error creating inventory item:", error);
    res.status(500).json({ error: "Error al crear item" });
  }
});

// PATCH /api/inventory/:id
router.patch("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedItem] = await db
      .update(schema.inventory)
      .set(updates)
      .where(eq(schema.inventory.id, id))
      .returning();

    if (!updatedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating inventory item:", error);
    res.status(500).json({ error: "Error al actualizar item" });
  }
});

// POST /api/inventory/:id/adjust
router.post("/inventory/:id/adjust", async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, reason } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ error: "quantity es requerido" });
    }

    const item = await db.query.inventory.findFirst({
      where: eq(schema.inventory.id, id),
    });

    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const newStock = item.currentStock + parseFloat(quantity);

    if (newStock < 0) {
      return res.status(400).json({ error: "Stock no puede ser negativo" });
    }

    const [updatedItem] = await db
      .update(schema.inventory)
      .set({ currentStock: newStock })
      .where(eq(schema.inventory.id, id))
      .returning();

    res.json(updatedItem);
  } catch (error) {
    console.error("Error adjusting inventory:", error);
    res.status(500).json({ error: "Error al ajustar inventario" });
  }
});

// DELETE /api/inventory/:id
router.delete("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedItem] = await db
      .delete(schema.inventory)
      .where(eq(schema.inventory.id, id))
      .returning();

    if (!deletedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    res.status(500).json({ error: "Error al eliminar item" });
  }
});

export default router;
