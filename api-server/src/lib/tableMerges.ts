import { db, schema } from "../db";
import { eq, or } from "drizzle-orm";
import { emitTableUnmerged, emitTableLayoutUpdated } from "../sockets/events";

type MergeRow = typeof schema.tableMerges.$inferSelect;

/// A merge "group" is every table_merges row that shares a primaryTableId.
/// Merging N tables = one primary + (N-1) rows all pointing at that primary.

/// Given any table in a group (primary or a merged member), returns all rows
/// of that group.
async function groupRowsForTable(tableId: string): Promise<MergeRow[]> {
  const involving = await db
    .select()
    .from(schema.tableMerges)
    .where(
      or(
        eq(schema.tableMerges.primaryTableId, tableId),
        eq(schema.tableMerges.mergedTableId, tableId)
      )
    );
  if (involving.length === 0) return [];
  // If tableId is a merged member, its row points at the group's primary;
  // if it's the primary, involving already holds all of its rows.
  const groupPrimary = involving[0].primaryTableId;
  return db
    .select()
    .from(schema.tableMerges)
    .where(eq(schema.tableMerges.primaryTableId, groupPrimary));
}

/// Deletes the given merge rows, restoring each merged table to the grid
/// position it had before the merge, and emits the appropriate events.
async function dissolveRows(rows: MergeRow[]) {
  const restored: any[] = [];
  for (const row of rows) {
    if (row.origPositionX !== null && row.origPositionY !== null) {
      const [t] = await db
        .update(schema.tables)
        .set({ positionX: row.origPositionX, positionY: row.origPositionY, updatedAt: new Date() })
        .where(eq(schema.tables.id, row.mergedTableId))
        .returning();
      if (t) restored.push(t);
    }
    await db.delete(schema.tableMerges).where(eq(schema.tableMerges.id, row.id));
    emitTableUnmerged({
      id: row.id,
      primaryTableId: row.primaryTableId,
      mergedTableId: row.mergedTableId,
    });
  }
  if (restored.length > 0) emitTableLayoutUpdated(restored);
}

export async function unmergeByTableId(tableId: string): Promise<void> {
  const rows = await groupRowsForTable(tableId);
  await dissolveRows(rows);
}

export async function unmergeByOrderId(orderId: string): Promise<void> {
  const linked = await db
    .select()
    .from(schema.tableMerges)
    .where(eq(schema.tableMerges.orderId, orderId))
    .limit(1);
  if (linked[0]) await unmergeByTableId(linked[0].primaryTableId);
}

export async function unmergeByReservationId(reservationId: string): Promise<void> {
  const linked = await db
    .select()
    .from(schema.tableMerges)
    .where(eq(schema.tableMerges.reservationId, reservationId))
    .limit(1);
  if (linked[0]) await unmergeByTableId(linked[0].primaryTableId);
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
