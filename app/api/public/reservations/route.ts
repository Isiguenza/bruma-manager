import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations } from "@/lib/db/schema";

const CORS = {
  "Access-Control-Allow-Origin": "https://cocinabruma.com.mx",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customerName,
      customerLastName,
      customerPhone,
      customerEmail,
      guestCount,
      reservationDate,
      reservationTime,
      occasion,
      notes,
    } = body;

    if (!customerName || !customerPhone || !guestCount || !reservationDate || !reservationTime) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400, headers: CORS }
      );
    }

    // Validate time range 12:00–18:00
    const [hour] = (reservationTime as string).split(":").map(Number);
    if (hour < 12 || hour >= 18) {
      return NextResponse.json(
        { error: "El horario debe ser entre 12:00 y 18:00" },
        { status: 400, headers: CORS }
      );
    }

    const fullName = customerLastName
      ? `${customerName} ${customerLastName}`.trim()
      : customerName;

    const [reservation] = await db
      .insert(reservations)
      .values({
        tableId: null,
        customerName: fullName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        guestCount: Number(guestCount),
        reservationDate,
        reservationTime,
        duration: 120,
        occasion: occasion || null,
        notes: notes || null,
        status: "pending",
      })
      .returning();

    // Send Mailgun confirmation email if email provided
    if (customerEmail && process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      await sendConfirmationEmail({
        to: customerEmail,
        name: fullName,
        date: reservationDate,
        time: reservationTime,
        guestCount: Number(guestCount),
        occasion: occasion || null,
      }).catch((err) => console.error("Mailgun error:", err));
    }

    return NextResponse.json({ success: true, id: reservation.id }, { status: 201, headers: CORS });
  } catch (error) {
    console.error("Error creating public reservation:", error);
    return NextResponse.json(
      { error: "Error al crear la reservación" },
      { status: 500, headers: CORS }
    );
  }
}

async function sendConfirmationEmail({
  to,
  name,
  date,
  time,
  guestCount,
  occasion,
}: {
  to: string;
  name: string;
  date: string;
  time: string;
  guestCount: number;
  occasion: string | null;
}) {
  const [year, month, day] = date.split("-");
  const monthNames = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre",
  ];
  const formattedDate = `${parseInt(day)} de ${monthNames[parseInt(month) - 1]} de ${year}`;
  const [h, m] = time.split(":");
  const formattedTime = `${h}:${m}`;

  const occasionLine = occasion && occasion !== "Sin ocasión especial"
    ? `<tr><td style="padding:8px 0;color:#7fd6d0;font-size:13px;">Ocasión</td><td style="padding:8px 0;color:#f5f2e9;font-size:13px;">${occasion}</td></tr>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#001514;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#001514;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#04201f;border-radius:16px;overflow:hidden;border:1px solid rgba(127,214,208,0.12);">
        <tr>
          <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(127,214,208,0.08);">
            <p style="margin:0 0 8px;color:#7fd6d0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Marisquería · Coyoacán</p>
            <h1 style="margin:0;color:#f5f2e9;font-size:28px;font-weight:300;letter-spacing:1px;">BRUMA</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 4px;color:#f5f2e9;font-size:16px;">Hola, <strong>${name.split(" ")[0]}</strong></p>
            <p style="margin:0;color:#7fd6d0;font-size:14px;line-height:1.6;">Tu reservación está confirmada. Te esperamos con gusto.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(127,214,208,0.1);">
              <tr><td style="padding:8px 0;color:#7fd6d0;font-size:13px;">Fecha</td><td style="padding:8px 0;color:#f5f2e9;font-size:13px;">${formattedDate}</td></tr>
              <tr><td style="padding:8px 0;color:#7fd6d0;font-size:13px;">Hora</td><td style="padding:8px 0;color:#f5f2e9;font-size:13px;">${formattedTime} hrs</td></tr>
              <tr><td style="padding:8px 0;color:#7fd6d0;font-size:13px;">Personas</td><td style="padding:8px 0;color:#f5f2e9;font-size:13px;">${guestCount} ${guestCount === 1 ? "persona" : "personas"}</td></tr>
              ${occasionLine}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;">
            <div style="background:rgba(127,214,208,0.06);border-radius:10px;padding:16px;border:1px solid rgba(127,214,208,0.1);">
              <p style="margin:0 0 4px;color:#7fd6d0;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Dónde encontrarnos</p>
              <p style="margin:0;color:#f5f2e9;font-size:13px;line-height:1.6;">Av. Panamericana, Casa B14<br>Col. Pedregal de Carrasco, 04700<br>Coyoacán, CDMX</p>
              <p style="margin:8px 0 0;color:#7fd6d0;font-size:13px;">56 3555 5587</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;text-align:center;border-top:1px solid rgba(127,214,208,0.08);">
            <p style="margin:0;color:rgba(245,242,233,0.35);font-size:12px;">© 2026 BRUMA · cocinabruma.com.mx</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const form = new FormData();
  form.append("from", process.env.MAILGUN_FROM ?? `BRUMA <noreply@${process.env.MAILGUN_DOMAIN}>`);
  form.append("to", to);
  form.append("subject", "Tu reservación en BRUMA está confirmada");
  form.append("html", html);

  const res = await fetch(
    `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64"),
      },
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailgun ${res.status}: ${text}`);
  }
}
