import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/quick-notes
router.get("/quick-notes", async (req, res) => {
  try {
    const quickNotes = await db.query.quickNotes.findMany({
      where: eq(schema.quickNotes.active, true),
      orderBy: (quickNotes, { asc }) => [asc(quickNotes.sortOrder)],
    });

    res.json(quickNotes);
  } catch (error) {
    console.error("Error fetching quick notes:", error);
    res.status(500).json({ error: "Error al obtener notas rápidas" });
  }
});

export default router;
