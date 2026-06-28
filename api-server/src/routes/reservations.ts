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
  const heroUrl = process.env.MAILGUN_HERO_URL ?? "";

  const rows = [
    ["Fecha",    dateDisplay],
    ["Hora",     `${reservationTime} hrs`],
    ["Personas", `${guestCount} ${guestCount === 1 ? "persona" : "personas"}`],
    ...(occasion ? [["Ocasión", occasion]] : []),
  ];

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;">
  <tr><td align="center" style="padding:48px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

    <!-- Logo -->
    <tr><td align="center" style="padding-bottom:32px;">
      <img src="https://cocinabruma.com.mx/BRUMA.png" width="140" alt="BRUMA" style="display:block;width:140px;height:auto;">
    </td></tr>

    <!-- Hero photo (optional — set MAILGUN_HERO_URL in .env) -->
    ${heroUrl ? `
    <tr><td style="padding-bottom:32px;">
      <img src="${heroUrl}" width="480" alt="" style="display:block;width:100%;height:240px;object-fit:cover;border-radius:12px;">
    </td></tr>` : ""}

    <!-- Card -->
    <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #ebebeb;overflow:hidden;">

      <!-- Top accent -->
      <tr><td style="background:#004b49;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- Body -->
      <tr><td style="padding:36px 40px;">

        <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:24px;font-weight:400;color:#111;letter-spacing:-0.3px;">
          Reservación confirmada
        </p>
        <p style="margin:0 0 32px;font-size:15px;color:#888;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">
          Hola ${firstName}, te esperamos en BRUMA.
        </p>

        <!-- Details -->
        <table width="100%" cellpadding="0" cellspacing="0">
          ${rows.map(([k, v], i) => `
          <tr>
            <td style="padding:12px 0;border-top:1px solid #f0f0f0;font-size:12px;color:#aaa;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:0.8px;">${k}</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #f0f0f0;font-size:15px;color:#004b49;font-weight:600;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">${v}</td>
          </tr>`).join("")}
        </table>

      </td></tr>

      <!-- Address strip -->
      <tr><td style="background:#f9f9f7;border-top:1px solid #f0f0f0;padding:20px 40px;">
        <p style="margin:0;font-size:12px;color:#aaa;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;line-height:1.7;">
          Av. Panamericana, Casa B14 · Pedregal de Carrasco, Coyoacán<br>
          <a href="tel:5635555587" style="color:#004b49;text-decoration:none;font-weight:500;">56 3555 5587</a>
        </p>
      </td></tr>

    </td></tr>

    <!-- Footer -->
    <tr><td align="center" style="padding-top:28px;">
      <p style="margin:0;font-size:11px;color:#ccc;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;">
        Bruma &nbsp;·&nbsp; Coyoacán
      </p>
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
