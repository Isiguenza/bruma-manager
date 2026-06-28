import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";
import { emitReservationNew } from "../sockets/events";

const router = Router();

// GET /api/reservations?date=YYYY-MM-DD&status=pending
router.get("/reservations", async (req, res) => {
  try {
    const { date, status } = req.query;

    const conditions = [];
    if (date) {
      conditions.push(gte(schema.reservations.reservationDate, date as string));
      conditions.push(lte(schema.reservations.reservationDate, date as string));
    }
    if (status) {
      conditions.push(eq(schema.reservations.status, status as string));
    }

    const reservations = await db.query.reservations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: { table: true },
      orderBy: (r, { asc, desc }) =>
        date ? [asc(r.reservationDate)] : [desc(r.reservationDate)],
    });

    res.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ error: "Error al obtener reservaciones" });
  }
});

// POST /api/reservations
router.post("/reservations", async (req, res) => {
  try {
    const {
      tableId,
      customerName,
      customerLastName,
      customerPhone,
      customerEmail,
      guestCount,
      partySize,
      reservationDate,
      reservationTime,
      occasion,
      notes,
      duration,
    } = req.body;

    const actualGuestCount = guestCount ?? partySize;
    const fullName = customerLastName
      ? `${customerName} ${customerLastName}`.trim()
      : customerName;

    if (!fullName || !actualGuestCount || !reservationDate || !reservationTime) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const [newReservation] = await db
      .insert(schema.reservations)
      .values({
        tableId: tableId ?? null,
        customerName: fullName,
        customerPhone: customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        guestCount: Number(actualGuestCount),
        reservationDate,
        reservationTime,
        occasion: occasion ?? null,
        notes: notes ?? null,
        duration: duration ?? 120,
        status: "pending",
      })
      .returning();

    // Notify POS via WebSocket
    emitReservationNew(newReservation);

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
