import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

// GET /api/reservations?date=YYYY-MM-DD
router.get("/reservations", async (req, res) => {
  try {
    const { date } = req.query;

    let reservations;
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);

      reservations = await db.query.reservations.findMany({
        where: and(
          gte(schema.reservations.reservationDate, startOfDay),
          lte(schema.reservations.reservationDate, endOfDay)
        ),
        with: {
          table: true,
        },
        orderBy: (reservations, { asc }) => [asc(reservations.reservationDate)],
      });
    } else {
      reservations = await db.query.reservations.findMany({
        with: {
          table: true,
        },
        orderBy: (reservations, { desc }) => [desc(reservations.reservationDate)],
      });
    }

    res.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ error: "Error al obtener reservaciones" });
  }
});

// POST /api/reservations
router.post("/reservations", async (req, res) => {
  try {
    const { tableId, customerName, customerPhone, partySize, reservationDate, reservationTime, notes } = req.body;

    if (!tableId || !customerName || !partySize || !reservationDate || !reservationTime) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const [newReservation] = await db
      .insert(schema.reservations)
      .values({
        tableId,
        customerName,
        customerPhone,
        partySize,
        reservationDate: new Date(reservationDate),
        reservationTime,
        notes,
        status: "pending",
      })
      .returning();

    res.status(201).json(newReservation);
  } catch (error) {
    console.error("Error creating reservation:", error);
    res.status(500).json({ error: "Error al crear reservación" });
  }
});

// PATCH /api/reservations/:id
router.patch("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedReservation] = await db
      .update(schema.reservations)
      .set(updates)
      .where(eq(schema.reservations.id, id))
      .returning();

    if (!updatedReservation) {
      return res.status(404).json({ error: "Reservación no encontrada" });
    }

    res.json(updatedReservation);
  } catch (error) {
    console.error("Error updating reservation:", error);
    res.status(500).json({ error: "Error al actualizar reservación" });
  }
});

export default router;
