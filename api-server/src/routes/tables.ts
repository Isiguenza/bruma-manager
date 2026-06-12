import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, or, isNull, desc, sql } from "drizzle-orm";
import { emitTableUpdated } from "../sockets/events";

const router = Router();

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

    // Merge
    const enriched = tables.map((table) => {
      const order = orderByTable.get(table.id);
      return {
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
      };
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
    const enrichedTable = {
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
    };

    res.json(enrichedTable);
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).json({ error: "Error al obtener mesa" });
  }
});

// POST /api/tables
router.post("/tables", async (req, res) => {
  try {
    const { number, capacity, section } = req.body;

    if (!number) {
      return res.status(400).json({ error: "number es requerido" });
    }

    const [newTable] = await db
      .insert(schema.tables)
      .values({
        number,
        capacity: capacity || 4,
        section: section || null,
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

// PATCH /api/tables/:id
router.patch("/tables/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { number, capacity, section, status } = req.body;

    const updates: any = {};
    if (number !== undefined) updates.number = number;
    if (capacity !== undefined) updates.capacity = capacity;
    if (section !== undefined) updates.section = section;
    if (status !== undefined) updates.status = status;

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
