import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, gte, lte } from "drizzle-orm";
import { emitReservationNew } from "../sockets/events";

const MONTHS_ES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

function formatDateES(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

async function sendConfirmationEmail(params: {
  customerName: string;
  customerEmail: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  occasion?: string | null;
}) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) return;

  const { customerName, customerEmail, reservationDate, reservationTime, guestCount, occasion } = params;
  const dateDisplay = formatDateES(reservationDate);
  const firstName = customerName.split(" ")[0];

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:#004b49;padding:36px 40px;text-align:center;">
          <div style="font-size:28px;font-weight:700;letter-spacing:4px;color:#ffffff;">BRUMA</div>
          <div style="font-size:12px;letter-spacing:2px;color:rgba(255,255,255,0.6);margin-top:4px;">MARISQUERÍA · COYOACÁN</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#004b49;">¡Reservación confirmada!</p>
          <p style="margin:0 0 28px;font-size:15px;color:#666;">Hola ${firstName}, te esperamos en BRUMA.</p>
          <!-- Summary card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border:1px solid #e0edec;border-radius:12px;overflow:hidden;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              ${[
                ["Fecha", dateDisplay],
                ["Hora", `${reservationTime} hrs`],
                ["Personas", `${guestCount} ${guestCount === 1 ? "persona" : "personas"}`],
                ...(occasion ? [["Ocasión", occasion]] : []),
              ].map(([k, v]) => `
              <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #eef3f2;margin-bottom:12px;padding-bottom:12px;">
                <tr>
                  <td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">${k}</td>
                  <td align="right" style="font-size:14px;font-weight:600;color:#004b49;">${v}</td>
                </tr>
              </table>`).join("")}
            </td></tr>
          </table>
          <!-- Address -->
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#333;">Cómo llegar</p>
          <p style="margin:0 0 28px;font-size:13px;color:#666;line-height:1.6;">Av. Panamericana, Casa B14, Col. Pedregal de Carrasco, 04700, Coyoacán, CDMX</p>
          <p style="margin:0;font-size:13px;color:#999;">¿Necesitas hacer cambios? Escríbenos al <a href="tel:5635555587" style="color:#004b49;text-decoration:none;">56 3555 5587</a></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8faf9;padding:20px 40px;text-align:center;border-top:1px solid #eef3f2;">
          <p style="margin:0;font-size:11px;color:#bbb;letter-spacing:1px;">BRUMA · COYOACÁN, CDMX</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const form = new FormData();
  form.append("from", from);
  form.append("to", customerEmail);
  form.append("subject", `Reservación confirmada en BRUMA — ${dateDisplay}`);
  form.append("html", html);

  try {
    const resp = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
      },
      body: form as any,
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error("❌ Mailgun error:", resp.status, err);
    } else {
      console.log(`📧 Confirmation email sent to ${customerEmail}`);
    }
  } catch (err) {
    console.error("❌ Mailgun fetch error:", err);
  }
}

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

    // Send confirmation email (non-blocking)
    if (customerEmail) {
      sendConfirmationEmail({
        customerName: fullName,
        customerEmail,
        reservationDate,
        reservationTime,
        guestCount: Number(actualGuestCount),
        occasion: occasion ?? null,
      }).catch(() => {});
    }

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
