import { Router } from "express";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

// Encuesta de satisfacción pública (cocinabruma.com.mx/encuesta). Sin auth a
// propósito: la contesta cualquier cliente que escanee el QR del ticket.
const router = Router();

const BEST_ASPECTS = new Set(["comida", "servicio", "ambiente", "rapidez", "precio"]);
const ORDER_AS_EXPECTED = new Set(["si", "parcialmente", "no"]);
const WOULD_RETURN = new Set(["si", "no", "tal_vez"]);

// Freno simple contra spam: N envíos por IP por hora (en memoria, se pierde
// al reiniciar — igual que el rate-limit de la auto-respuesta de WhatsApp).
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const recentByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    recentByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentByIp.set(ip, recent);
  return false;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, maxLength);
  return text.length > 0 ? text : null;
}

// POST /api/surveys
router.post("/surveys", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Demasiadas respuestas, intenta más tarde" });
    }

    const body = req.body || {};
    const overallRating = intInRange(body.overallRating, 1, 5);
    if (overallRating === null) {
      return res.status(400).json({ error: "La calificación general es requerida" });
    }

    const bestAspects = Array.isArray(body.bestAspects)
      ? [...new Set(body.bestAspects.filter((a: unknown) => typeof a === "string" && BEST_ASPECTS.has(a)))] as string[]
      : [];
    const orderAsExpected = ORDER_AS_EXPECTED.has(body.orderAsExpected) ? body.orderAsExpected : null;
    const wouldReturn = WOULD_RETURN.has(body.wouldReturn) ? body.wouldReturn : null;

    // ?o= del QR: número de orden. Si no existe se guarda la respuesta igual.
    const orderNumber = intInRange(body.orderNumber, 1, 2_000_000_000);
    let orderId: string | null = null;
    if (orderNumber !== null) {
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.orderNumber, orderNumber),
        columns: { id: true },
      });
      orderId = order?.id ?? null;
    }

    const [saved] = await db
      .insert(schema.surveyResponses)
      .values({
        orderId,
        orderNumber,
        overallRating,
        bestAspects,
        improvement: cleanText(body.improvement, 2000),
        staffRating: intInRange(body.staffRating, 1, 5),
        orderAsExpected,
        nps: intInRange(body.nps, 0, 10),
        wouldReturn,
        dish: cleanText(body.dish, 300),
      })
      .returning({ id: schema.surveyResponses.id });

    res.status(201).json({ success: true, id: saved.id });
  } catch (error) {
    console.error("Error saving survey:", error);
    res.status(500).json({ error: "No se pudo guardar la encuesta" });
  }
});

export default router;
