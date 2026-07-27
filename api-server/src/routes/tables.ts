import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
import { emitTableUpdated, emitTableLayoutUpdated, emitTableMerged, emitTableUnmerged } from "../sockets/events";
import { findActiveMergeForTable, unmergeByTableId } from "../lib/tableMerges";

const router = Router();

// A merge "group" is identified by its primaryTableId; N tables merged = one
// primary plus (N-1) rows all pointing at it.
type MergeInfo = { groupId: string; isPrimary: boolean };

async function buildMergeMap() {
  const merges = await db.select().from(schema.tableMerges);
  const map = new Map<string, MergeInfo>();
  for (const m of merges) {
    map.set(m.primaryTableId, { groupId: m.primaryTableId, isPrimary: true });
    map.set(m.mergedTableId, { groupId: m.primaryTableId, isPrimary: false });
  }
  return map;
}

function withMergeInfo(table: any, mergeMap: Map<string, MergeInfo>) {
  const info = mergeMap.get(table.id);
  return {
    ...table,
    mergeGroupId: info?.groupId ?? null,
    isMergePrimary: info ? info.isPrimary : null,
  };
}

// GET /api/tables
router.get("/tables", async (req, res) => {
  try {
    const { status } = req.query;

    // Fetch tables and all pending orders in two sequential queries (no Promise.all)
    const tables = status
      ? await db.query.tables.findMany({ where: eq(schema.tables.status, status as any) })
      : await db.query.tables.findMany();

    // Fetch all pending orders in one query
    const pendingOrders = await db.query.orders.findMany({
      where: eq(schema.orders.paymentStatus, "pending"),
    });
    console.log(`📋 Pending orders found: ${pendingOrders.length}`);

    // Build a map: tableId -> most recent pending order
    const orderByTable = new Map<string, typeof pendingOrders[number]>();
    for (const order of pendingOrders) {
      if (!order.tableId) continue;
      const existing = orderByTable.get(order.tableId);
      if (!existing || new Date(order.createdAt) > new Date(existing.createdAt)) {
        orderByTable.set(order.tableId, order);
      }
    }

    const mergeMap = await buildMergeMap();

    // Merge
    const enriched = tables.map((table) => {
      const order = orderByTable.get(table.id);
      return withMergeInfo(
        {
          ...table,
          activeOrder: order
            ? {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                total: order.total,
                itemCount: 0,
                items: [],
                createdAt: order.createdAt,
                priority: order.priority,
                onHold: order.onHold,
              }
            : null,
        },
        mergeMap
      );
    });

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching tables:", error);
    res.status(500).json({ error: "Error al obtener mesas" });
  }
});

// GET /api/tables/:id
router.get("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const table = await db.query.tables.findFirst({
      where: eq(schema.tables.id, id),
    });

    if (!table) {
      return res.status(404).json({ error: "Mesa no encontrada" });
    }

    // Enrich with activeOrder
    console.log(`📋 Fetching activeOrder for table ${table.id}`);
    let activeOrder = null;
    try {
      const activeOrders = await db.query.orders.findMany({
        where: and(
          eq(schema.orders.tableId, table.id),
          eq(schema.orders.paymentStatus, "pending")
        ),
        limit: 1,
      });
      console.log(`📋 Found ${activeOrders.length} active orders`);
      if (activeOrders[0]) {
        console.log(`📋 Order: id=${activeOrders[0].id}, status=${activeOrders[0].status}`);
        activeOrder = activeOrders[0];
      }
    } catch (err) {
      console.error(`📋 Error fetching activeOrder:`, err);
    }

    const mergeMap = await buildMergeMap();
    const enrichedTable = withMergeInfo(
      {
        ...table,
        activeOrder: activeOrder
          ? {
              id: activeOrder.id,
              orderNumber: activeOrder.orderNumber,
              status: activeOrder.status,
              total: activeOrder.total,
              itemCount: activeOrder.items?.length || 0,
              items: activeOrder.items,
              createdAt: activeOrder.createdAt,
              priority: activeOrder.priority,
              onHold: activeOrder.onHold,
            }
          : null,
      },
      mergeMap
    );

    res.json(enrichedTable);
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).json({ error: "Error al obtener mesa" });
  }
});

// POST /api/tables
router.post("/tables", async (req, res) => {
  try {
    const { number, name, capacity, guestCount, shape, widthCells, heightCells } = req.body;

    if (!number) {
      return res.status(400).json({ error: "number es requerido" });
    }

    const [newTable] = await db
      .insert(schema.tables)
      .values({
        number,
        name: name || null,
        capacity: capacity || 4,
        guestCount: guestCount || 1,
        shape: shape || "square",
        widthCells: widthCells || 1,
        heightCells: heightCells || 1,
        status: "available",
      })
      .returning();

    emitTableUpdated(newTable);
    res.json(newTable);
  } catch (error) {
    console.error("Error creating table:", error);
    res.status(500).json({ error: "Error al crear mesa" });
  }
});

// PATCH /api/tables/layout — bulk save of floor-plan positions/sizes/shape/rotation
// Must be declared before PATCH /tables/:id so Express doesn't treat "layout" as an :id.
router.patch("/tables/layout", async (req, res) => {
  try {
    const { tables: updates } = req.body as {
      tables: {
        id: string;
        positionX: number;
        positionY: number;
        widthCells: number;
        heightCells: number;
        rotation: number;
        shape: string;
      }[];
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "tables array requerido" });
    }

    const updatedTables = [];
    for (const t of updates) {
      const [updated] = await db
        .update(schema.tables)
        .set({
          positionX: t.positionX,
          positionY: t.positionY,
          widthCells: t.widthCells,
          heightCells: t.heightCells,
          rotation: t.rotation,
          shape: t.shape as any,
          updatedAt: new Date(),
        })
        .where(eq(schema.tables.id, t.id))
        .returning();
      if (updated) updatedTables.push(updated);
    }

    emitTableLayoutUpdated(updatedTables);
    res.json({ tables: updatedTables });
  } catch (error) {
    console.error("Error updating table layout:", error);
    res.status(500).json({ error: "Error al actualizar el mapa de mesas" });
  }
});

// POST /api/tables/merge — temporarily join 2+ tables (e.g. for a large party).
// Body: { primaryTableId, members: [{ id, origPositionX, origPositionY,
//         newPositionX, newPositionY }], orderId?, reservationId? }
router.post("/tables/merge", async (req, res) => {
  try {
    const { primaryTableId, members, orderId, reservationId } = req.body as {
      primaryTableId: string;
      members: { id: string; origPositionX?: number; origPositionY?: number; newPositionX?: number; newPositionY?: number }[];
      orderId?: string;
      reservationId?: string;
    };

    if (!primaryTableId || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: "primaryTableId y members son requeridos" });
    }
    if (members.some((m) => m.id === primaryTableId)) {
      return res.status(400).json({ error: "No se puede unir una mesa consigo misma" });
    }

    // Reject if the primary or any member is already part of a merge.
    const allIds = [primaryTableId, ...members.map((m) => m.id)];
    for (const tid of allIds) {
      if (await findActiveMergeForTable(tid)) {
        return res.status(409).json({ error: "Una de las mesas ya está unida a otra" });
      }
    }

    const movedTables: any[] = [];
    for (const m of members) {
      await db.insert(schema.tableMerges).values({
        primaryTableId,
        mergedTableId: m.id,
        orderId: orderId || null,
        reservationId: reservationId || null,
        origPositionX: m.origPositionX ?? null,
        origPositionY: m.origPositionY ?? null,
      });
      // Slide the member next to the primary (if the client provided a target).
      if (m.newPositionX !== undefined && m.newPositionY !== undefined) {
        const [t] = await db
          .update(schema.tables)
          .set({ positionX: m.newPositionX, positionY: m.newPositionY, updatedAt: new Date() })
          .where(eq(schema.tables.id, m.id))
          .returning();
        if (t) movedTables.push(t);
      }
    }

    const payload = { primaryTableId, mergedTableIds: members.map((m) => m.id) };
    emitTableMerged(payload);
    if (movedTables.length > 0) emitTableLayoutUpdated(movedTables);
    res.status(201).json(payload);
  } catch (error) {
    console.error("Error merging tables:", error);
    res.status(500).json({ error: "Error al unir mesas" });
  }
});

// DELETE /api/tables/:id/merge — dissolve the whole merge group that table :id
// belongs to (restoring every member to its original grid position).
router.delete("/tables/:id/merge", async (req, res) => {
  try {
    const { id } = req.params;
    const activeMerge = await findActiveMergeForTable(id);
    if (!activeMerge) {
      return res.status(404).json({ error: "No hay una unión activa para esta mesa" });
    }
    await unmergeByTableId(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error unmerging tables:", error);
    res.status(500).json({ error: "Error al separar mesas" });
  }
});

// PATCH /api/tables/:id
router.patch("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      number,
      name,
      capacity,
      guestCount,
      status,
      positionX,
      positionY,
      widthCells,
      heightCells,
      shape,
      rotation,
    } = req.body;

    const updates: any = {};
    if (number !== undefined) updates.number = number;
    if (name !== undefined) updates.name = name;
    if (capacity !== undefined) updates.capacity = capacity;
    if (guestCount !== undefined) updates.guestCount = guestCount;
    if (status !== undefined) updates.status = status;
    if (positionX !== undefined) updates.positionX = positionX;
    if (positionY !== undefined) updates.positionY = positionY;
    if (widthCells !== undefined) updates.widthCells = widthCells;
    if (heightCells !== undefined) updates.heightCells = heightCells;
    if (shape !== undefined) updates.shape = shape;
    if (rotation !== undefined) updates.rotation = rotation;

    // Si no hay nada que actualizar, retornar la mesa actual
    if (Object.keys(updates).length === 0) {
      const [currentTable] = await db
        .select()
        .from(schema.tables)
        .where(eq(schema.tables.id, id))
        .limit(1);

      if (!currentTable) {
        return res.status(404).json({ error: "Mesa no encontrada" });
      }
      return res.json(currentTable);
    }

    const [updatedTable] = await db
      .update(schema.tables)
      .set(updates)
      .where(eq(schema.tables.id, id))
      .returning();

    if (!updatedTable) {
      return res.status(404).json({ error: "Mesa no encontrada" });
    }

    emitTableUpdated(updatedTable);
    res.json(updatedTable);
  } catch (error) {
    console.error("Error updating table:", error);
    res.status(500).json({ error: "Error al actualizar mesa" });
  }
});

// DELETE /api/tables/:id
router.delete("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(schema.tables).where(eq(schema.tables.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting table:", error);
    res.status(500).json({ error: "Error al eliminar mesa" });
  }
});

export default router;
