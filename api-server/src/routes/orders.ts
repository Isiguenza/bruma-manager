import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, or, desc, inArray, sql } from "drizzle-orm";
import {
  emitOrderNew,
  emitOrderUpdated,
  emitOrderPaid,
  emitOrderItemsReady,
  emitTableUpdated,
} from "../sockets/events";

const router = Router();

// GET /api/orders
router.get("/orders", async (req, res) => {
  try {
    const { paymentStatus, status, tableId, cashRegisterId } = req.query;

    let whereConditions: any[] = [];

    if (paymentStatus) {
      whereConditions.push(eq(schema.orders.paymentStatus, paymentStatus as any));
    }

    if (status) {
      const statuses = (status as string).split(",");
      whereConditions.push(inArray(schema.orders.status, statuses as any));
    }

    if (tableId) {
      whereConditions.push(eq(schema.orders.tableId, tableId as string));
    }

    if (cashRegisterId) {
      whereConditions.push(eq(schema.orders.cashRegisterId, cashRegisterId as string));
    }

    const orders = await db.query.orders.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      with: {
        items: true,
      },
      orderBy: desc(schema.orders.createdAt),
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Error al obtener órdenes" });
  }
});

// GET /api/orders/:id
router.get("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Error al obtener orden" });
  }
});

// POST /api/orders
router.post("/orders", async (req, res) => {
  try {
    const {
      tableId,
      tableNumber,
      orderType,
      customerName,
      deliveryAddress,
      deliveryPhone,
      platformOrderId,
      platformName,
      cashRegisterId,
      employeeId,
      status,
      items,
    } = req.body;

    if (!orderType) {
      return res.status(400).json({ error: "orderType es requerido" });
    }

    // Create order
    const [newOrder] = await db
      .insert(schema.orders)
      .values({
        tableId: tableId || null,
        tableNumber: tableNumber || null,
        orderType,
        customerName: customerName || null,
        deliveryAddress: deliveryAddress || null,
        deliveryPhone: deliveryPhone || null,
        platformOrderId: platformOrderId || null,
        platformName: platformName || null,
        cashRegisterId: cashRegisterId || null,
        employeeId: employeeId || null,
        status: status || "pending",
        paymentStatus: "pending",
        subtotal: "0",
        tax: "0",
        total: "0",
        tip: "0",
      })
      .returning();

    // Create order items if provided
    if (items && items.length > 0) {
      const orderItems = items.map((item: any) => ({
        orderId: newOrder.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal || (item.quantity * item.unitPrice).toString(),
        notes: item.notes || null,
        frostingId: item.frostingId || null,
        frostingName: item.frostingName || null,
      }));

      await db.insert(schema.orderItems).values(orderItems);
    }

    // Fetch complete order with items
    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, newOrder.id),
      with: {
        items: true,
      },
    });

    // Update table status if dine-in
    if (tableId) {
      await db
        .update(schema.tables)
        .set({ status: "occupied" })
        .where(eq(schema.tables.id, tableId));

      const updatedTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, tableId),
      });
      if (updatedTable) {
        emitTableUpdated(updatedTable);
      }
    }

    emitOrderNew(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Error al crear orden" });
  }
});

// POST /api/orders/:id/items
router.post("/orders/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const orderItems = items.map((item: any) => ({
      orderId: id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal || (item.quantity * item.unitPrice).toString(),
      notes: item.notes || null,
      frostingId: item.frostingId || null,
      frostingName: item.frostingName || null,
      status: "pending",
    }));

    await db.insert(schema.orderItems).values(orderItems);

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    console.error("Error adding items to order:", error);
    res.status(500).json({ error: "Error al agregar items" });
  }
});

// PATCH /api/orders/:id
router.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedOrder] = await db
      .update(schema.orders)
      .set(updates)
      .where(eq(schema.orders.id, id))
      .returning();

    if (!updatedOrder) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: "Error al actualizar orden" });
  }
});

// PATCH /api/orders/:id/status
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "status es requerido" });
    }

    const [updatedOrder] = await db
      .update(schema.orders)
      .set({ status })
      .where(eq(schema.orders.id, id))
      .returning();

    if (!updatedOrder) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Error al actualizar estado" });
  }
});

// DELETE /api/orders/:id
router.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Primero eliminar los items de la orden (foreign key constraint)
    await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, id));

    // Luego eliminar la orden
    const [deletedOrder] = await db
      .delete(schema.orders)
      .where(eq(schema.orders.id, id))
      .returning();

    if (!deletedOrder) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    emitOrderUpdated({ id, deleted: true });
    res.json({ success: true, message: "Orden eliminada" });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: "Error al eliminar orden" });
  }
});

// POST /api/orders/:id/send-to-kitchen
router.post("/orders/:id/send-to-kitchen", async (req, res) => {
  try {
    const { id } = req.params;

    // Update order status to preparing
    const [updatedOrder] = await db
      .update(schema.orders)
      .set({ status: "preparing" })
      .where(eq(schema.orders.id, id))
      .returning();

    if (!updatedOrder) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Get complete order with items
    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(completeOrder);
    res.json({ success: true, order: completeOrder });
  } catch (error) {
    console.error("Error sending to kitchen:", error);
    res.status(500).json({ error: "Error al enviar a cocina" });
  }
});

// POST /api/orders/:id/pay
router.post("/orders/:id/pay", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      paymentMethod,
      amountPaid,
      tip,
      tipPaymentMethod,
      loyaltyCardId,
      employeeId,
    } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({ error: "paymentMethod es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const updates: any = {
      paymentMethod,
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      amountPaid: amountPaid || order.total,
      tip: tip || "0",
      tipPaymentMethod: tipPaymentMethod || paymentMethod,
    };

    if (loyaltyCardId) {
      updates.loyaltyCardId = loyaltyCardId;
    }

    if (employeeId) {
      updates.employeeId = employeeId;
    }

    const [updatedOrder] = await db
      .update(schema.orders)
      .set(updates)
      .where(eq(schema.orders.id, id))
      .returning();

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    // Free table if dine-in
    if (order.tableId) {
      await db
        .update(schema.tables)
        .set({ status: "available" })
        .where(eq(schema.tables.id, order.tableId));

      const updatedTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, order.tableId),
      });
      if (updatedTable) {
        emitTableUpdated(updatedTable);
      }
    }

    emitOrderPaid(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("Error paying order:", error);
    res.status(500).json({ error: "Error al pagar orden" });
  }
});

// POST /api/orders/:id/pay-split
router.post("/orders/:id/pay-split", async (req, res) => {
  try {
    const { id } = req.params;
    const { payments, loyaltyCardId, employeeId } = req.body;

    if (!payments || payments.length === 0) {
      return res.status(400).json({ error: "payments es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Calculate totals
    const totalPaid = payments.reduce(
      (sum: number, p: any) => sum + parseFloat(p.amount) + parseFloat(p.tip || "0"),
      0
    );
    const orderTotal = parseFloat(order.total);

    if (Math.abs(totalPaid - orderTotal) > 0.01) {
      return res.status(400).json({
        error: `Total pagado ($${totalPaid}) no coincide con total de orden ($${orderTotal})`,
      });
    }

    // Create payment records
    const paymentRecords = payments.map((p: any, index: number) => ({
      orderId: id,
      sequenceNumber: index + 1,
      paymentMethod: p.paymentMethod,
      amount: p.amount,
      tip: p.tip || "0",
      tipPaymentMethod: p.tipPaymentMethod || p.paymentMethod,
    }));

    await db.insert(schema.orderPayments).values(paymentRecords);

    // Update order
    const totalTip = payments.reduce(
      (sum: number, p: any) => sum + parseFloat(p.tip || "0"),
      0
    );

    const updates: any = {
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      amountPaid: totalPaid.toString(),
      tip: totalTip.toString(),
    };

    if (loyaltyCardId) {
      updates.loyaltyCardId = loyaltyCardId;
    }

    if (employeeId) {
      updates.employeeId = employeeId;
    }

    await db.update(schema.orders).set(updates).where(eq(schema.orders.id, id));

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    // Free table if dine-in
    if (order.tableId) {
      await db
        .update(schema.tables)
        .set({ status: "available" })
        .where(eq(schema.tables.id, order.tableId));

      const updatedTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, order.tableId),
      });
      if (updatedTable) {
        emitTableUpdated(updatedTable);
      }
    }

    emitOrderPaid(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("Error processing split payment:", error);
    res.status(500).json({ error: "Error al procesar pago dividido" });
  }
});

// POST /api/orders/:id/transfer
router.post("/orders/:id/transfer", async (req, res) => {
  try {
    const { id } = req.params;
    const { newTableId, newTableNumber } = req.body;

    if (!newTableId) {
      return res.status(400).json({ error: "newTableId es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const oldTableId = order.tableId;

    // Update order
    await db
      .update(schema.orders)
      .set({
        tableId: newTableId,
        tableNumber: newTableNumber || null,
      })
      .where(eq(schema.orders.id, id));

    // Free old table
    if (oldTableId) {
      await db
        .update(schema.tables)
        .set({ status: "available" })
        .where(eq(schema.tables.id, oldTableId));

      const oldTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, oldTableId),
      });
      if (oldTable) {
        emitTableUpdated(oldTable);
      }
    }

    // Occupy new table
    await db
      .update(schema.tables)
      .set({ status: "occupied" })
      .where(eq(schema.tables.id, newTableId));

    const newTable = await db.query.tables.findFirst({
      where: eq(schema.tables.id, newTableId),
    });
    if (newTable) {
      emitTableUpdated(newTable);
    }

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    console.error("Error transferring order:", error);
    res.status(500).json({ error: "Error al transferir orden" });
  }
});

// PATCH /api/order-items/:id/void
router.patch("/order-items/:id/void", async (req, res) => {
  try {
    const { id } = req.params;
    const { voidReason } = req.body;

    const [voidedItem] = await db
      .update(schema.orderItems)
      .set({
        voided: true,
        voidReason: voidReason || "Cancelado",
      })
      .where(eq(schema.orderItems.id, id))
      .returning();

    if (!voidedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, voidedItem.orderId),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(order);
    res.json(voidedItem);
  } catch (error) {
    console.error("Error voiding item:", error);
    res.status(500).json({ error: "Error al anular item" });
  }
});

// PATCH /api/order-items/:id/deliver
router.patch("/order-items/:id/deliver", async (req, res) => {
  try {
    const { id } = req.params;

    const [deliveredItem] = await db
      .update(schema.orderItems)
      .set({
        status: "delivered",
        deliveredAt: new Date().toISOString(),
      })
      .where(eq(schema.orderItems.id, id))
      .returning();

    if (!deliveredItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, deliveredItem.orderId),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(order);
    res.json(deliveredItem);
  } catch (error) {
    console.error("Error delivering item:", error);
    res.status(500).json({ error: "Error al entregar item" });
  }
});

// POST /api/order-items/batch-ready
router.post("/order-items/batch-ready", async (req, res) => {
  try {
    const { itemIds } = req.body;

    if (!itemIds || itemIds.length === 0) {
      return res.status(400).json({ error: "itemIds es requerido" });
    }

    await db
      .update(schema.orderItems)
      .set({
        deliveredToTable: true,
      })
      .where(inArray(schema.orderItems.id, itemIds));

    const readyItems = await db.query.orderItems.findMany({
      where: inArray(schema.orderItems.id, itemIds),
    });

    emitOrderItemsReady(readyItems);
    res.json({ success: true, count: readyItems.length });
  } catch (error) {
    console.error("Error marking items ready:", error);
    res.status(500).json({ error: "Error al marcar items listos" });
  }
});

// GET /api/orders/history?registerId=...
router.get("/orders/history", async (req, res) => {
  try {
    const { registerId } = req.query;

    if (!registerId) {
      return res.status(400).json({ error: "registerId es requerido" });
    }

    const orders = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.cashRegisterId, registerId as string),
        eq(schema.orders.paymentStatus, "paid")
      ),
      with: {
        items: true,
        table: true,
      },
      orderBy: desc(schema.orders.createdAt),
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders history:", error);
    res.status(500).json({ error: "Error al obtener historial de órdenes" });
  }
});

export default router;
