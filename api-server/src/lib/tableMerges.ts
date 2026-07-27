import { db, schema } from "../db";
import { eq, or } from "drizzle-orm";
import { emitTableUnmerged } from "../sockets/events";

async function unmergeRows(rows: (typeof schema.tableMerges.$inferSelect)[]) {
  for (const row of rows) {
    await db.delete(schema.tableMerges).where(eq(schema.tableMerges.id, row.id));
    emitTableUnmerged({
      id: row.id,
      primaryTableId: row.primaryTableId,
      mergedTableId: row.mergedTableId,
    });
  }
}

export async function unmergeByOrderId(orderId: string): Promise<void> {
  const rows = await db
    .select()
    .from(schema.tableMerges)
    .where(eq(schema.tableMerges.orderId, orderId));
  await unmergeRows(rows);
}

export async function unmergeByReservationId(reservationId: string): Promise<void> {
  const rows = await db
    .select()
    .from(schema.tableMerges)
    .where(eq(schema.tableMerges.reservationId, reservationId));
  await unmergeRows(rows);
}

export async function unmergeByTableId(tableId: string): Promise<void> {
  const rows = await db
    .select()
    .from(schema.tableMerges)
    .where(
      or(
        eq(schema.tableMerges.primaryTableId, tableId),
        eq(schema.tableMerges.mergedTableId, tableId)
      )
    );
  await unmergeRows(rows);
}

export async function findActiveMergeForTable(tableId: string) {
  const rows = await db
    .select()
    .from(schema.tableMerges)
    .where(
      or(
        eq(schema.tableMerges.primaryTableId, tableId),
        eq(schema.tableMerges.mergedTableId, tableId)
      )
    )
    .limit(1);
  return rows[0];
}
