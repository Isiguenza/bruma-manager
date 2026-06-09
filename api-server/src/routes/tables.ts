import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, or, isNull } from "drizzle-orm";
import { emitTableUpdated } from "../sockets/events";

const router = Router();

// GET /api/tables
router.get("/tables", async (req, res) => {
  try {
    const { status } = req.query;

    let tables;
    if (status) {
      tables = await db.query.tables.findMany({
        where: eq(schema.tables.status, status as any),
      });
    } else {
      tables = await db.query.tables.findMany();
    }

    res.json(tables);
  } catch (error) {
    console.error("Error fetching tables:", error);
    res.status(500).json({ error: "Error al obtener mesas" });
  }
});

// GET /api/tables/:id
router.get("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const table = await db.query.tables.findFirst({
      where: eq(schema.tables.id, id),
    });

    if (!table) {
      return res.status(404).json({ error: "Mesa no encontrada" });
    }

    res.json(table);
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).json({ error: "Error al obtener mesa" });
  }
});

// POST /api/tables
router.post("/tables", async (req, res) => {
  try {
    const { number, capacity, section } = req.body;

    if (!number) {
      return res.status(400).json({ error: "number es requerido" });
    }

    const [newTable] = await db
      .insert(schema.tables)
      .values({
        number,
        capacity: capacity || 4,
        section: section || null,
        status: "available",
      })
      .returning();

    emitTableUpdated(newTable);
    res.json(newTable);
  } catch (error) {
    console.error("Error creating table:", error);
    res.status(500).json({ error: "Error al crear mesa" });
  }
});

// PATCH /api/tables/:id
router.patch("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { number, capacity, section, status } = req.body;

    const updates: any = {};
    if (number !== undefined) updates.number = number;
    if (capacity !== undefined) updates.capacity = capacity;
    if (section !== undefined) updates.section = section;
    if (status !== undefined) updates.status = status;

    const [updatedTable] = await db
      .update(schema.tables)
      .set(updates)
      .where(eq(schema.tables.id, id))
      .returning();

    if (!updatedTable) {
      return res.status(404).json({ error: "Mesa no encontrada" });
    }

    emitTableUpdated(updatedTable);
    res.json(updatedTable);
  } catch (error) {
    console.error("Error updating table:", error);
    res.status(500).json({ error: "Error al actualizar mesa" });
  }
});

// DELETE /api/tables/:id
router.delete("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(schema.tables).where(eq(schema.tables.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting table:", error);
    res.status(500).json({ error: "Error al eliminar mesa" });
  }
});

export default router;
