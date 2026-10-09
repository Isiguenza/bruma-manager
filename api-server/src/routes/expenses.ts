import { Router, Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { db, schema } from "../db";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { guessExpenseCategory, isExpenseCategory } from "../lib/expenseCategories";

const router = Router();

// Server-to-server: Hermes (el asistente que lee el grupo de WhatsApp) registra
// compras/gastos aquí. Auth por llave compartida EXPENSES_API_KEY, enviada como
// `Authorization: Bearer <llave>` (o `X-API-Key: <llave>`). Sin la env var el
// endpoint queda cerrado (503) — nunca abierto por omisión.
// Contexto seguro para logs: NUNCA incluye el token ni el header Authorization.
// cf-ray permite cruzar la línea con Security Events de Cloudflare. Ojo: lo que
// Cloudflare bloquea (p.ej. Error 1010) jamás llega aquí — si Hermes ve un 403
// de Cloudflare y aquí no hay línea, el bloqueo fue en el edge.
function logContext(req: Request) {
  const ip = req.get("cf-connecting-ip") || req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip;
  return `${req.method} ${req.path} ip=${ip} ray=${req.get("cf-ray") ?? "-"} ua="${(req.get("user-agent") ?? "").slice(0, 80)}"`;
}

function requireExpensesKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.EXPENSES_API_KEY;
  if (!expected) {
    console.error(`[expenses] 503 EXPENSES_API_KEY no configurada · ${logContext(req)}`);
    return res.status(503).json({ error: "EXPENSES_API_KEY no está configurada en el servidor" });
  }

  const header = req.get("authorization") || "";
  const provided = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (req.get("x-api-key") || "").trim();

  if (!provided) {
    console.warn(`[expenses] 401 token ausente · ${logContext(req)}`);
    return res.status(401).json({ error: "No autorizado: falta el token" });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.warn(`[expenses] 401 token inválido (longitud ${a.length}) · ${logContext(req)}`);
    return res.status(401).json({ error: "No autorizado: token inválido" });
  }
  next();
}

function parseAmount(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n >= 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

function serialize(expense: typeof schema.expenses.$inferSelect) {
  return {
    id: expense.id,
    concept: expense.concept,
    amount: Number(expense.amount),
    currency: expense.currency,
    category: expense.category,
    source: expense.source,
    source_message_id: expense.sourceMessageId,
    chat_id: expense.chatId,
    sender_name: expense.senderName,
    notes: expense.notes,
    expense_date: expense.expenseDate,
    created_at: expense.createdAt,
  };
}

// POST /api/expenses
// Body (snake_case, como lo manda Hermes):
//   concept (req), amount (req), currency (default MXN), source_message_id,
//   chat_id, y opcionales category, sender_name, notes, date (ISO).
router.post("/expenses", requireExpensesKey, async (req, res) => {
  try {
    const body = req.body ?? {};
    const concept = typeof body.concept === "string" ? body.concept.trim() : "";
    const amount = parseAmount(body.amount);
    const currency = typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "MXN";
    const sourceMessageId = body.source_message_id != null ? String(body.source_message_id).trim() || null : null;
    const chatId = body.chat_id != null ? String(body.chat_id).trim() || null : null;

    const errors: string[] = [];
    if (!concept) errors.push("concept es requerido");
    if (concept.length > 500) errors.push("concept no puede pasar de 500 caracteres");
    if (amount === null) errors.push("amount debe ser un número mayor a 0");
    if (!/^[A-Z]{3}$/.test(currency)) errors.push("currency debe ser un código ISO de 3 letras (p.ej. MXN)");
    if (body.category != null && !isExpenseCategory(body.category)) errors.push("category inválida");

    let expenseDate: Date | undefined;
    if (body.date != null) {
      const d = new Date(body.date);
      if (Number.isNaN(d.getTime())) errors.push("date debe ser una fecha ISO válida");
      else expenseDate = d;
    }
    if (errors.length) {
      console.warn(`[expenses] 400 payload inválido: ${errors.join("; ")} · ${logContext(req)}`);
      return res.status(400).json({ error: "Datos inválidos", details: errors });
    }

    // Idempotencia: el mismo mensaje de WhatsApp no se registra dos veces.
    if (sourceMessageId) {
      const existing = await db.query.expenses.findFirst({
        where: eq(schema.expenses.sourceMessageId, sourceMessageId),
      });
      if (existing) {
        console.log(`[expenses] 200 duplicado source_message_id=${sourceMessageId} · ${logContext(req)}`);
        return res.status(200).json({ ok: true, duplicate: true, expense: serialize(existing) });
      }
    }

    try {
      const [expense] = await db
        .insert(schema.expenses)
        .values({
          concept,
          amount: amount!.toFixed(2),
          currency,
          category: isExpenseCategory(body.category) ? body.category : guessExpenseCategory(concept),
          source: "whatsapp",
          sourceMessageId,
          chatId,
          senderName: typeof body.sender_name === "string" ? body.sender_name.trim() || null : null,
          notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
          ...(expenseDate ? { expenseDate } : {}),
        })
        .returning();

      console.log(`[expenses] 201 registrado id=${expense.id} $${amount} ${currency} (${expense.category}) · ${logContext(req)}`);
      return res.status(201).json({ ok: true, duplicate: false, expense: serialize(expense) });
    } catch (error: any) {
      // Carrera entre dos reintentos del mismo mensaje: el UNIQUE gana.
      if (sourceMessageId && (error?.code === "23505" || /duplicate key/i.test(String(error?.message)))) {
        const existing = await db.query.expenses.findFirst({
          where: eq(schema.expenses.sourceMessageId, sourceMessageId),
        });
        if (existing) return res.status(200).json({ ok: true, duplicate: true, expense: serialize(existing) });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Error al registrar el gasto" });
  }
});

// GET /api/expenses?from=ISO&to=ISO&limit=100 — para que Hermes pueda
// contestar "¿cuánto llevamos gastado esta semana?". Misma llave.
router.get("/expenses", requireExpensesKey, async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const conditions = [isNull(schema.expenses.deletedAt)];
    if (from && !Number.isNaN(from.getTime())) conditions.push(gte(schema.expenses.expenseDate, from));
    if (to && !Number.isNaN(to.getTime())) conditions.push(lte(schema.expenses.expenseDate, to));

    const rows = await db.query.expenses.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.expenses.expenseDate)],
      limit,
    });

    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.currency] = Math.round(((totals[r.currency] ?? 0) + Number(r.amount)) * 100) / 100;

    res.json({ count: rows.length, totals, expenses: rows.map(serialize) });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Error al obtener gastos" });
  }
});

export default router;
