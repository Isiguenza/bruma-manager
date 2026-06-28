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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    /* ── Dark mode overrides ── */
    @media (prefers-color-scheme: dark) {
      .em-body   { background-color: #0d1412 !important; }
      .em-card   { background-color: #141f1c !important; border-color: #1e2e2a !important; }
      .em-accent { background-color: #2d7a74 !important; }
      .em-title  { color: #e8e8e4 !important; }
      .em-sub    { color: #7a8a88 !important; }
      .em-label  { color: #5a6a68 !important; border-color: #1e2e2a !important; }
      .em-value  { color: #7ecfcb !important; border-color: #1e2e2a !important; }
      .em-strip  { background-color: #0f1917 !important; border-color: #1e2e2a !important; }
      .em-addr   { color: #5a6a68 !important; }
      .em-tel    { color: #7ecfcb !important; }
      .em-footer { color: #3a4a48 !important; }
      .em-wordmark { color: #7ecfcb !important; }
      .em-tagline  { color: #3a4a48 !important; }
      .em-hero   { border-radius: 10px !important; }
    }
  </style>
</head>
<body class="em-body" style="margin:0;padding:0;background:#f6f5f1;-webkit-font-smoothing:antialiased;">
<table class="em-body" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;">
  <tr><td align="center" style="padding:48px 16px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

    <!-- Wordmark -->
    <tr><td align="center" style="padding-bottom:28px;">
      <div class="em-wordmark" style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;letter-spacing:8px;color:#004b49;text-transform:uppercase;">BRUMA</div>
      <div class="em-tagline" style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#bbb;margin-top:5px;">Marisquería &nbsp;·&nbsp; Coyoacán</div>
    </td></tr>

    <!-- Hero photo (set MAILGUN_HERO_URL in .env to enable) -->
    ${heroUrl ? `
    <tr><td style="padding-bottom:24px;">
      <img class="em-hero" src="${heroUrl}" width="480" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:12px;">
    </td></tr>` : ""}

    <!-- Card -->
    <tr><td class="em-card" style="background:#ffffff;border-radius:16px;border:1px solid #e8e8e4;overflow:hidden;">

      <!-- Accent bar -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td class="em-accent" style="background:#004b49;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px 32px;">
          <p class="em-title" style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:#1a1a18;letter-spacing:-0.2px;">
            Reservación confirmada
          </p>
          <p class="em-sub" style="margin:0 0 30px;font-size:14px;color:#999;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;line-height:1.5;">
            Hola ${firstName}, te esperamos en BRUMA.
          </p>

          <!-- Details rows -->
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rows.map(([k, v]) => `
            <tr>
              <td class="em-label" style="padding:11px 0;border-top:1px solid #f0efeb;font-size:11px;color:#bbb;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;">${k}</td>
              <td class="em-value" align="right" style="padding:11px 0;border-top:1px solid #f0efeb;font-size:15px;color:#004b49;font-weight:600;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">${v}</td>
            </tr>`).join("")}
          </table>
        </td></tr>

        <!-- Address strip -->
        <tr><td class="em-strip" style="background:#f6f5f1;border-top:1px solid #eeede9;padding:18px 40px;">
          <p class="em-addr" style="margin:0;font-size:12px;color:#b0b0aa;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;line-height:1.8;">
            Av. Panamericana, Casa B14 · Pedregal de Carrasco, Coyoacán<br>
            <a class="em-tel" href="tel:5635555587" style="color:#004b49;text-decoration:none;">56 3555 5587</a>
          </p>
        </td></tr>
      </table>

    </td></tr>

    <!-- Footer -->
    <tr><td align="center" style="padding-top:24px;">
      <p class="em-footer" style="margin:0;font-size:10px;color:#ccc;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;">
        Bruma &nbsp;·&nbsp; Coyoacán, CDMX
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

// POST /api/reservations/:id/confirm  →  mark as "arrived"
router.post("/reservations/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(schema.reservations)
      .set({ status: "arrived" })
      .where(eq(schema.reservations.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Reservación no encontrada" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error confirming reservation:", error);
    res.status(500).json({ error: "Error al confirmar reservación" });
  }
});

// DELETE /api/reservations/:id  →  mark as "cancelled"
router.delete("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(schema.reservations)
      .set({ status: "cancelled" })
      .where(eq(schema.reservations.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Reservación no encontrada" });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error("Error deleting reservation:", error);
    res.status(500).json({ error: "Error al cancelar reservación" });
  }
});

export default router;
