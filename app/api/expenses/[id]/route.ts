import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isExpenseCategory } from "@/lib/expenses/categories";

// PATCH /api/expenses/[id] — corregir concepto, monto, categoría, fecha o notas
// (p.ej. cuando Hermes leyó mal un mensaje o el clasificador se equivocó).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() };

    if (body.concept !== undefined) {
      const concept = String(body.concept).trim();
      if (!concept) return NextResponse.json({ error: "El concepto es requerido" }, { status: 400 });
      updates.concept = concept;
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
      }
      updates.amount = amount.toFixed(2);
    }
    if (body.category !== undefined) {
      if (!isExpenseCategory(body.category)) {
        return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
      }
      updates.category = body.category;
    }
    if (body.expenseDate !== undefined) {
      const d = new Date(body.expenseDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
      updates.expenseDate = d;
    }
    if (body.notes !== undefined) updates.notes = String(body.notes ?? "").trim() || null;

    const [expense] = await db.update(expenses).set(updates).where(eq(expenses.id, id)).returning();
    if (!expense) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    return NextResponse.json(expense);
  } catch (error) {
    console.error("Error updating expense:", error);
    return NextResponse.json({ error: "Error al actualizar el gasto" }, { status: 500 });
  }
}

// DELETE /api/expenses/[id] — soft delete. Se conserva la fila (y su
// source_message_id) para que un reintento de Hermes del mismo mensaje no lo
// vuelva a crear.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [expense] = await db
      .update(expenses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    if (!expense) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting expense:", error);
    return NextResponse.json({ error: "Error al eliminar el gasto" }, { status: 500 });
  }
}
