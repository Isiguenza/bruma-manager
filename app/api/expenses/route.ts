import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, desc, gte, isNull, lt, sql } from "drizzle-orm";
import { guessExpenseCategory, isExpenseCategory } from "@/lib/expenses/categories";

// GET /api/expenses?from=ISO&to=ISO — gastos del rango [from, to) más el total
// (MXN) del periodo inmediato anterior de la misma duración, para el
// comparativo de la vista. Las agregaciones por día/categoría se hacen en el
// cliente: el volumen de un restaurante cabe de sobra en una respuesta.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const to = params.get("to") ? new Date(params.get("to")!) : new Date();
    const from = params.get("from")
      ? new Date(params.get("from")!)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }

    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    const [rows, [prev]] = await Promise.all([
      db.query.expenses.findMany({
        where: and(isNull(expenses.deletedAt), gte(expenses.expenseDate, from), lt(expenses.expenseDate, to)),
        orderBy: [desc(expenses.expenseDate)],
      }),
      db
        .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
        .from(expenses)
        .where(
          and(
            isNull(expenses.deletedAt),
            sql`${expenses.currency} = 'MXN'`,
            gte(expenses.expenseDate, prevFrom),
            lt(expenses.expenseDate, from)
          )
        ),
    ]);

    return NextResponse.json({ expenses: rows, previousTotal: Number(prev?.total ?? 0) });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return NextResponse.json({ error: "Error al obtener gastos" }, { status: 500 });
  }
}

// POST /api/expenses — captura manual desde el dashboard.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const concept = typeof body.concept === "string" ? body.concept.trim() : "";
    const amount = Number(body.amount);

    if (!concept) return NextResponse.json({ error: "El concepto es requerido" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
    }

    const expenseDate = body.expenseDate ? new Date(body.expenseDate) : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const [expense] = await db
      .insert(expenses)
      .values({
        concept,
        amount: amount.toFixed(2),
        currency: typeof body.currency === "string" && /^[A-Za-z]{3}$/.test(body.currency) ? body.currency.toUpperCase() : "MXN",
        category: isExpenseCategory(body.category) ? body.category : guessExpenseCategory(concept),
        source: "manual",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        expenseDate,
      })
      .returning();

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("Error creating expense:", error);
    return NextResponse.json({ error: "Error al registrar el gasto" }, { status: 500 });
  }
}
