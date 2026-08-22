import { Router } from "express";
import bcrypt from "bcrypt";
import { db, schema } from "../db";
import { eq, and, or, desc, inArray, sql, isNull } from "drizzle-orm";
import {
  emitOrderNew,
  emitOrderUpdated,
  emitOrderPaid,
  emitOrderItemsReady,
  emitTableUpdated,
  emitOrderRush,
  emitOrderHold,
} from "../sockets/events";
import { sendAppleWalletPush } from "../lib/apple-push";
import { createOrUpdateGoogleWalletObject } from "../lib/google-wallet";
import { unmergeByOrderId, unmergeByTableId, hasOtherUnpaidOrdersAtTable } from "../lib/tableMerges";
import { refundStripePayment, captureStripePayment, cancelStripePaymentIntent } from "./online-orders";
import { notifyOrderReady, notifyOrderOutForDelivery } from "../lib/whatsapp";
import { printKitchenComanda } from "../lib/kitchenPrint";

const router = Router();

// GET /api/orders
router.get("/orders", async (req, res) => {
  try {
    const { paymentStatus, status, tableId, cashRegisterId, noTable, userId, source, excludeSource } = req.query;

    let whereConditions: any[] = [];

    if (paymentStatus) {
      whereConditions.push(eq(schema.orders.paymentStatus, paymentStatus as any));
    } else {
      // Sin filtro explícito de pago: nunca devolver pedidos web cuyo pago
      // no se haya confirmado como exitoso (Stripe falló, se quedó a medias,
      // o nunca se completó) — si no, quedan visibles en el POS como si
      // fueran una orden real en curso aunque nadie haya cobrado nada.
      // "authorized" cuenta como confirmado: con captura manual, la tarjeta
      // ya quedó retenida con éxito (el cobro real llega después, al marcar
      // "ready") — un pedido aceptado y en cocina debe seguir visible aunque
      // todavía no se le haya hecho el cargo final.
      whereConditions.push(
        sql`(${schema.orders.source} != 'web' OR ${schema.orders.source} IS NULL OR ${schema.orders.paymentStatus} IN ('authorized', 'paid'))`
      );
    }

    if (status) {
      const statuses = (status as string).split(",");
      whereConditions.push(inArray(schema.orders.status, statuses as any));
    }

    if (tableId) {
      whereConditions.push(eq(schema.orders.tableId, tableId as string));
    }

    // Filter for takeout/delivery orders (no table)
    if (noTable === "true") {
      whereConditions.push(isNull(schema.orders.tableId));
    }

    if (cashRegisterId) {
      whereConditions.push(eq(schema.orders.cashRegisterId, cashRegisterId as string));
    }

    if (userId) {
      whereConditions.push(eq(schema.orders.userId, userId as string));
    }

    if (source) {
      whereConditions.push(eq(schema.orders.source, source as string));
    }

    if (excludeSource) {
      whereConditions.push(sql`${schema.orders.source} != ${excludeSource as string} OR ${schema.orders.source} IS NULL`);
    }

    const orders = await db.query.orders.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      with: {
        items: {
          with: {
            product: {
              columns: {
                id: true,
                name: true,
                description: true,
                price: true,
                categoryId: true,
                groupId: true,
                hasVariants: true,
                variants: true,
                active: true,
                createdAt: true,
                updatedAt: true,
              },
              with: {
                category: {
                  columns: {
                    id: true,
                    name: true,
                    isBeverage: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
        table: true,
      },
      orderBy: desc(schema.orders.createdAt),
    });

    // Marcar cada item como bebida si su categoría es bebida O su flujo por
    // producto tiene isBeverage=true (para el ruteo "solo bebidas" del Dispatch).
    const productIds = Array.from(
      new Set(orders.flatMap((o) => (o.items || []).map((i: any) => i.productId)))
    );
    let beverageFlowIds = new Set<string>();
    if (productIds.length > 0) {
      const flows = await db
        .select({ productId: schema.productFlows.productId })
        .from(schema.productFlows)
        .where(
          and(
            inArray(schema.productFlows.productId, productIds),
            eq(schema.productFlows.isBeverage, true)
          )
        );
      beverageFlowIds = new Set(flows.map((f) => f.productId));
    }

    const serialized = orders.map((o) => ({
      ...o,
      items: (o.items || []).map((it: any) => ({
        ...it,
        isBeverage:
          it.product?.category?.isBeverage === true ||
          beverageFlowIds.has(it.productId),
      })),
    }));

    res.json(serialized);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Error al obtener órdenes" });
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
        payments: true,
      },
      orderBy: desc(schema.orders.createdAt),
    });

    const firstOrder = orders[0];
    console.log(`[history] Found ${orders.length} orders. First order discount:`, firstOrder?.discountAmount, firstOrder?.discountName);
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders history:", error);
    res.status(500).json({ error: "Error al obtener historial de órdenes" });
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
  console.log("🛎️ [POST /api/orders] Request body:", JSON.stringify(req.body, null, 2));
  try {
    const {
      tableId,
      customerName,
      cashRegisterId,
      employeeId,
      status,
      items,
    } = req.body;

    console.log("🛎️ [POST /api/orders] status:", status, "tableId:", tableId, "items count:", items?.length);

    // Generate order number (max existing + 1)
    const maxOrderResult = await db
      .select({ max: sql<number>`COALESCE(MAX(${schema.orders.orderNumber}), 0)` })
      .from(schema.orders);
    const nextOrderNumber = (maxOrderResult[0]?.max ?? 0) + 1;
    console.log("🛎️ [POST /api/orders] next orderNumber:", nextOrderNumber);

    // Create order (only insert fields that exist in schema)
    const [newOrder] = await db
      .insert(schema.orders)
      .values({
        orderNumber: nextOrderNumber,
        tableId: tableId || null,
        customerName: customerName || null,
        cashRegisterId: cashRegisterId || null,
        userId: req.body.userId || employeeId || null,
        guestCount: req.body.guestCount || 1,
        status: status || "pending",
        paymentStatus: "pending",
        subtotal: "0",
        total: "0",
        tip: "0",
        source: req.body.source || "pos",
      })
      .returning();
    
    console.log("🛎️ [POST /api/orders] Created order:", newOrder.id, "tableId:", newOrder.tableId);

    // Create order items if provided
    let orderSubtotal = 0;
    if (items && items.length > 0) {
      const orderItems = items.map((item: any) => {
        const isGuestItem = item.isGuest === true;
        const itemSubtotal = isGuestItem ? 0 : (parseFloat(item.subtotal) || (item.quantity * item.unitPrice));
        orderSubtotal += itemSubtotal;
        return {
          orderId: newOrder.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: itemSubtotal.toString(),
          notes: item.notes || null,
          frostingId: item.frostingId || null,
          frostingName: item.frostingName || null,
          dryToppingId: item.dryToppingId || null,
          dryToppingName: item.dryToppingName || null,
          extraId: item.extraId || null,
          extraName: item.extraName || null,
          customModifiers: item.customModifiers || null,
          seat: item.seat || "C",
          course: item.course || 1,
          deliveredToTable: item.deliveredToTable || false,
          isGuest: isGuestItem,
          promotionId: item.promotionId || null,
          promotionName: item.promotionName || null,
          originalPrice: item.originalPrice != null ? item.originalPrice.toString() : null,
          promotionDiscount: item.promotionDiscount != null ? item.promotionDiscount.toString() : null,
        };
      });

      await db.insert(schema.orderItems).values(orderItems);

      // Update order subtotal and total
      await db
        .update(schema.orders)
        .set({
          subtotal: orderSubtotal.toString(),
          total: orderSubtotal.toString(),
        })
        .where(eq(schema.orders.id, newOrder.id));
    }

    // Fetch complete order with items
    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, newOrder.id),
      with: {
        items: true,
      },
    });

    // Update table status if dine-in
    let tableNumber: string | null = null;
    if (tableId) {
      await db
        .update(schema.tables)
        .set({ status: "occupied" })
        .where(eq(schema.tables.id, tableId));

      const updatedTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, tableId),
      });
      if (updatedTable) {
        tableNumber = updatedTable.number;
        emitTableUpdated(updatedTable);
      }
    }

    emitOrderNew(completeOrder);
    res.json(completeOrder);

    // Imprimir la comanda DESPUÉS de responder — el pedido ya quedó guardado
    // bien independientemente de que esto tenga éxito o no (con reintentos,
    // ver lib/kitchenPrint.ts). Solo para órdenes que van directo a cocina
    // (status "preparing" con items) — drafts/split-tickets no imprimen aquí.
    if (status === "preparing" && items && items.length > 0 && completeOrder) {
      printKitchenComanda({
        orderNumber: completeOrder.orderNumber,
        tableNumber,
        customerName: customerName || null,
        guestCount: req.body.guestCount || null,
        isDelivery: !tableId,
        items: items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          seat: item.seat,
          course: item.course,
          notes: item.notes,
          frostingName: item.frostingName,
          dryToppingName: item.dryToppingName,
          extraName: item.extraName,
          customModifiers: item.customModifiers,
        })),
      }).catch((e) => console.error("[kitchenPrint] error imprimiendo orden nueva:", e));
    }
  } catch (error) {
    console.error("🛎️ [POST /api/orders] ERROR:", error);
    console.error("🛎️ [POST /api/orders] ERROR stack:", (error as Error).stack);
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

    const orderItems = items.map((item: any) => {
      const isGuestItem = item.isGuest === true;
      const itemSubtotal = isGuestItem ? 0 : (parseFloat(item.subtotal) || (item.quantity * item.unitPrice));
      return {
        orderId: id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal.toString(),
        notes: item.notes || null,
        frostingId: item.frostingId || null,
        frostingName: item.frostingName || null,
        dryToppingId: item.dryToppingId || null,
        dryToppingName: item.dryToppingName || null,
        extraId: item.extraId || null,
        extraName: item.extraName || null,
        customModifiers: item.customModifiers || null,
        seat: item.seat || "C",
        course: item.course || 1,
        deliveredToTable: item.deliveredToTable || false,
        isGuest: isGuestItem,
        promotionId: item.promotionId || null,
        promotionName: item.promotionName || null,
        originalPrice: item.originalPrice != null ? item.originalPrice.toString() : null,
        promotionDiscount: item.promotionDiscount != null ? item.promotionDiscount.toString() : null,
      };
    });

    await db.insert(schema.orderItems).values(orderItems);

    // Recalcular el subtotal desde TODOS los items en la BD (excluye anulados e
    // invitados). Esto es seguro ante concurrencia: si dos iPads agregan a la
    // misma mesa a la vez, los inserts son aditivos y el total se recomputa
    // completo — no se pisa el total con un valor viejo leído en memoria.
    const allItems = await db
      .select({
        subtotal: schema.orderItems.subtotal,
        voided: schema.orderItems.voided,
        isGuest: schema.orderItems.isGuest,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, id));
    const newSubtotal = allItems
      .filter((i) => !i.voided && !i.isGuest)
      .reduce((sum, i) => sum + (parseFloat(i.subtotal ?? "0") || 0), 0);

    // If order was "ready" (all previous items delivered), reset to "preparing" so KDS sees new items
    const statusUpdate: any = {
      subtotal: newSubtotal.toString(),
      total: newSubtotal.toString(),
    };
    if (order.status === "ready") {
      statusUpdate.status = "preparing";
      console.log(`🔄 Order ${id} reset from "ready" to "preparing" due to new items`);
    }

    await db
      .update(schema.orders)
      .set(statusUpdate)
      .where(eq(schema.orders.id, id));

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    emitOrderUpdated(updatedOrder);
    res.json(updatedOrder);

    // Imprimir SOLO los items recién agregados (no toda la orden de nuevo) —
    // después de responder, con reintentos server-side (ver lib/kitchenPrint.ts).
    let tableNumber: string | null = null;
    if (order.tableId) {
      const table = await db.query.tables.findFirst({ where: eq(schema.tables.id, order.tableId) });
      tableNumber = table?.number ?? null;
    }
    printKitchenComanda({
      orderNumber: order.orderNumber,
      tableNumber,
      customerName: order.customerName,
      guestCount: order.guestCount,
      isDelivery: !order.tableId,
      items: items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        seat: item.seat,
        course: item.course,
        notes: item.notes,
        frostingName: item.frostingName,
        dryToppingName: item.dryToppingName,
        extraName: item.extraName,
        customModifiers: item.customModifiers,
      })),
    }).catch((e) => console.error("[kitchenPrint] error imprimiendo items agregados:", e));
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

    const existingOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!existingOrder) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Pedidos web con captura manual: el cobro real se hace justo aquí, al
    // marcar "ready" — para recoger es cuando ya está listo, para domicilio
    // es antes de marcarlo "delivered" (enviado), que llega en un paso
    // aparte más adelante. Si Stripe rechaza la captura (la tarjeta ya no
    // pasa, la autorización expiró, etc.) NO se marca "ready" — el staff
    // necesita saberlo y resolverlo (cobro alterno en persona) en vez de que
    // la cocina entregue algo que nunca se llegó a cobrar de verdad.
    if (
      status === "ready" &&
      existingOrder.source === "web" &&
      existingOrder.paymentStatus === "authorized" &&
      existingOrder.stripePaymentIntentId
    ) {
      try {
        await captureStripePayment(existingOrder.stripePaymentIntentId);
      } catch (captureError: any) {
        console.error("[orders/:id/status] error al capturar el cobro:", captureError);
        return res.status(402).json({
          error:
            "No se pudo cobrar el pedido — la tarjeta del cliente fue rechazada al intentar capturar el pago. El pedido NO se marcó como listo.",
          code: "CAPTURE_FAILED",
          detail: captureError?.message,
        });
      }
      // El webhook payment_intent.succeeded marca paymentStatus="paid" (y
      // engancha la caja abierta) al llegar — no se duplica aquí para evitar
      // carreras entre este request y el webhook.
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

    // Pedidos web: avisa por WhatsApp cuando el POS marca listo / en camino.
    if (completeOrder?.source === "web" && completeOrder.customerPhone) {
      if (status === "ready") notifyOrderReady(completeOrder).catch(() => {});
      if (status === "delivered") notifyOrderOutForDelivery(completeOrder).catch(() => {});
    }

    res.json(completeOrder);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Error al actualizar estado" });
  }
});

// DELETE /api/orders/:id
// Soft-cancel: NO se borra la orden — se marca status="cancelled" para conservar
// el registro (auditoría). Solo aplica a órdenes NO pagadas; las pagadas deben
// reembolsarse con POST /api/orders/:id/refund (así nunca se pierde un ingreso ni
// queda una orden pagada fuera de sincronía con el corte).
router.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        error: "La orden ya está pagada; usa reembolso para anularla",
        code: "ORDER_ALREADY_PAID",
      });
    }

    // Pedido con tarjeta retenida pero aún sin cobrar (captura manual): libera
    // el hold en vez de bloquear — nunca se cobró nada, así que no hace falta
    // ningún reembolso.
    if (order.paymentStatus === "authorized" && order.stripePaymentIntentId) {
      try {
        await cancelStripePaymentIntent(order.stripePaymentIntentId);
      } catch (e) {
        console.error("[orders/:id DELETE] error al liberar la retención en Stripe:", e);
        return res.status(502).json({ error: "No se pudo liberar la retención de la tarjeta en Stripe" });
      }
    }

    const [cancelledOrder] = await db
      .update(schema.orders)
      .set({
        status: "cancelled",
        ...(order.paymentStatus === "authorized" ? { paymentStatus: "canceled" as any } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id))
      .returning();

    await unmergeByOrderId(id);
    // Also dissolve any merge on the freed table itself, in case the merge was
    // created before this order existed (so it isn't linked by orderId).
    if (cancelledOrder.tableId) await unmergeByTableId(cancelledOrder.tableId);

    // Free the table if this dine-in order was occupying it — pero no si
    // quedan otros tickets (split-into-tickets) sin pagar en esa misma mesa.
    if (cancelledOrder.tableId) {
      const stillOccupied = await hasOtherUnpaidOrdersAtTable(cancelledOrder.tableId, id);
      if (!stillOccupied) {
        await db
          .update(schema.tables)
          .set({ status: "available" })
          .where(eq(schema.tables.id, cancelledOrder.tableId));
        const freedTable = await db.query.tables.findFirst({
          where: eq(schema.tables.id, cancelledOrder.tableId),
        });
        if (freedTable) emitTableUpdated(freedTable);
      }
    }

    emitOrderUpdated({ ...cancelledOrder, cancelled: true });
    res.json({ success: true, message: "Orden cancelada" });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: "Error al cancelar orden" });
  }
});

// POST /api/orders/:id/refund  { pin, reason }
// Anula una orden YA PAGADA. Requiere PIN de gerente (rol admin). Marca la orden
// como paymentStatus="refunded" + status="cancelled" (sale del corte y de las
// listas activas), y deja una transacción "refund" con el motivo/gerente para
// auditoría. La orden NO se borra.
router.post("/orders/:id/refund", async (req, res) => {
  try {
    const { id } = req.params;
    const { pin, reason } = req.body;

    if (!pin || String(pin).length !== 4) {
      return res.status(400).json({ error: "PIN de gerente requerido (4 dígitos)" });
    }

    // Verificar PIN contra un empleado admin activo.
    const admins = await db.query.userProfiles.findMany({
      where: and(
        eq(schema.userProfiles.active, true),
        eq(schema.userProfiles.role, "admin")
      ),
    });
    let manager = null;
    for (const a of admins) {
      if (a.pinHash && (await bcrypt.compare(String(pin), a.pinHash))) {
        manager = a;
        break;
      }
    }
    if (!manager) {
      return res.status(403).json({ error: "PIN de gerente inválido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });
    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }
    // Con captura manual, un pedido puede llegar aquí como "authorized"
    // (tarjeta retenida, nunca cobrada) — ahí no hace falta reembolso, solo
    // liberar el hold. Solo "paid" (ya capturado) necesita un reembolso real.
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "authorized") {
      return res.status(400).json({ error: "Solo se pueden reembolsar órdenes pagadas o con pago autorizado" });
    }

    const isAuthorizedOnly = order.paymentStatus === "authorized";

    // Pedido online (Stripe): devolver el dinero (si ya se cobró) o liberar la
    // retención (si solo estaba autorizado) antes de actualizar la orden.
    if (order.paymentMethod === "online" && order.stripePaymentIntentId) {
      try {
        if (isAuthorizedOnly) {
          await cancelStripePaymentIntent(order.stripePaymentIntentId);
        } else {
          await refundStripePayment(order.stripePaymentIntentId);
        }
      } catch (e) {
        console.error("[refund] Stripe falló:", e);
        return res.status(502).json({
          error: isAuthorizedOnly
            ? "No se pudo liberar la retención de la tarjeta en Stripe"
            : "No se pudo emitir el reembolso en Stripe",
        });
      }
    }

    const [refundedOrder] = await db
      .update(schema.orders)
      .set({
        paymentStatus: (isAuthorizedOnly ? "canceled" : "refunded") as any,
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id))
      .returning();

    // Transacción de reembolso (auditoría). El corte excluye la orden por su
    // paymentStatus, así que no se resta doble.
    if (order.cashRegisterId) {
      await db.insert(schema.cashRegisterTransactions).values({
        registerId: order.cashRegisterId,
        type: "refund",
        amount: order.total || "0",
        paymentMethod: order.paymentMethod ?? undefined,
        orderId: id,
        userId: manager.id,
        description: `Reembolso orden #${order.orderNumber}${reason ? `: ${reason}` : ""} (por ${manager.name})`,
      });
    }

    // Liberar mesa si aplica — pero no si quedan otros tickets sin pagar.
    if (refundedOrder.tableId) {
      const stillOccupied = await hasOtherUnpaidOrdersAtTable(refundedOrder.tableId, id);
      if (!stillOccupied) {
        await db
          .update(schema.tables)
          .set({ status: "available" })
          .where(eq(schema.tables.id, refundedOrder.tableId));
        const freedTable = await db.query.tables.findFirst({
          where: eq(schema.tables.id, refundedOrder.tableId),
        });
        if (freedTable) emitTableUpdated(freedTable);
        await unmergeByTableId(refundedOrder.tableId);
      }
    }
    await unmergeByOrderId(id);

    emitOrderUpdated({ ...refundedOrder, refunded: true });
    res.json({
      success: true,
      message: isAuthorizedOnly
        ? "Orden cancelada. No se cobró nada al cliente — solo se liberó la retención de su tarjeta."
        : "Orden reembolsada. El monto cobrado se devolverá al cliente en 5–10 días hábiles.",
      order: refundedOrder,
    });
  } catch (error) {
    console.error("Error refunding order:", error);
    res.status(500).json({ error: "Error al reembolsar orden" });
  }
});

// POST /api/orders/:id/tip  { tip, tipPaymentMethod }
// Agrega/edita la propina de una orden YA PAGADA (ej. el cliente definió la
// propina después de cerrar). Actualiza tip, método y total a nivel BD; como el
// corte y la barrita leen order.tip/tipPaymentMethod en vivo, ventas del día,
// propinas y efectivo esperado se recalculan solos. No aplica a split.
router.post("/orders/:id/tip", async (req, res) => {
  try {
    const { id } = req.params;
    const { tip, tipPaymentMethod } = req.body;

    const tipAmount = parseFloat(tip ?? "0");
    if (isNaN(tipAmount) || tipAmount < 0) {
      return res.status(400).json({ error: "Propina inválida" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });
    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }
    if (order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "Solo se puede agregar propina a órdenes pagadas" });
    }

    // Split: la propina vive por pago en orderPayments; no se soporta aquí.
    const splits = await db.query.orderPayments.findMany({
      where: eq(schema.orderPayments.orderId, id),
    });
    if (splits.length > 0) {
      return res.status(400).json({ error: "No disponible en órdenes con pago dividido" });
    }

    const subtotal = parseFloat(order.subtotal || "0");
    const newTotal = (subtotal + tipAmount).toFixed(2);

    const [updated] = await db
      .update(schema.orders)
      .set({
        tip: tipAmount.toFixed(2),
        tipPaymentMethod: tipPaymentMethod || order.paymentMethod || "cash",
        total: newTotal,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id))
      .returning();

    emitOrderUpdated(updated);
    res.json({ success: true, order: updated });
  } catch (error) {
    console.error("Error adding tip to order:", error);
    res.status(500).json({ error: "Error al agregar propina" });
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

    console.log("📦 send-to-kitchen: completeOrder.id=", completeOrder?.id, "tableId=", completeOrder?.tableId, "status=", completeOrder?.status);
    emitOrderUpdated(completeOrder);

    // Emit table:updated if dine-in so all POS clients refresh the table
    if (completeOrder?.tableId) {
      const updatedTable = await db.query.tables.findFirst({
        where: eq(schema.tables.id, completeOrder.tableId),
      });
      if (updatedTable) {
        emitTableUpdated(updatedTable);
      }
    }

    res.json({ success: true, order: completeOrder });
  } catch (error) {
    console.error("Error sending to kitchen:", error);
    res.status(500).json({ error: "Error al enviar a cocina" });
  }
});

// POST /api/orders/:id/reprint-comanda
// Reintento manual: por si el print-server/túnel estuvo caído cuando se
// disparó la impresión automática (al crear la orden / agregar items). No
// crea ni modifica nada, solo vuelve a mandar TODOS los items activos de la
// orden a imprimir. A diferencia de la impresión automática, aquí SÍ se
// espera el resultado — el staff quiere saber al toque si funcionó.
router.post("/orders/:id/reprint-comanda", async (req, res) => {
  try {
    const { id } = req.params;
    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });

    const activeItems = (order.items || []).filter((i: any) => !i.voided && !i.isGuest);
    if (activeItems.length === 0) {
      return res.status(400).json({ error: "La orden no tiene items para imprimir" });
    }

    let tableNumber: string | null = null;
    if (order.tableId) {
      const table = await db.query.tables.findFirst({ where: eq(schema.tables.id, order.tableId) });
      tableNumber = table?.number ?? null;
    }

    const success = await printKitchenComanda({
      orderNumber: order.orderNumber,
      tableNumber,
      customerName: order.customerName,
      guestCount: order.guestCount,
      isDelivery: !order.tableId,
      items: activeItems.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        seat: item.seat,
        course: item.course,
        notes: item.notes,
        frostingName: item.frostingName,
        dryToppingName: item.dryToppingName,
        extraName: item.extraName,
        customModifiers: item.customModifiers,
      })),
    });

    if (!success) {
      return res.status(502).json({ error: "No se pudo imprimir — revisa la impresora/conexión e intenta de nuevo" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error reimprimiendo comanda:", error);
    res.status(500).json({ error: "Error al reimprimir" });
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
      loyaltyStamps,
      employeeId,
      discount,
      discountName,
      discountId,
      subtotal,
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

    // Anti-doble-cobro: si ya está pagada, no volver a cobrar ni duplicar la
    // transacción de caja (protege contra doble tap / reintentos de red).
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ error: "La orden ya está pagada", code: "ALREADY_PAID" });
    }

    // Find open cash register
    const openRegister = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.status, "open"),
    });

    const tipAmount = parseFloat(tip || "0");
    const subtotalAmount = subtotal ? parseFloat(subtotal) : parseFloat(order.subtotal);
    const totalWithTip = (subtotalAmount + tipAmount).toString();

    const isTakeout = !order.tableId;

    const updates: any = {
      paymentMethod,
      paymentStatus: "paid",
      paidAt: new Date(),
      amountPaid: amountPaid || totalWithTip,
      tip: tip || "0",
      tipPaymentMethod: tipPaymentMethod || paymentMethod,
      subtotal: subtotalAmount.toString(),
      total: totalWithTip,
    };

    if (discount && parseFloat(discount) > 0) {
      updates.discountAmount = discount.toString();
      updates.discountName = discountName || "Descuento";
      if (discountId) updates.discountId = discountId;
    }

    if (openRegister) {
      updates.cashRegisterId = openRegister.id;
    }

    if (loyaltyCardId) {
      updates.loyaltyCardId = loyaltyCardId;
    }

    // Only mark as completed for dine-in. Takeout stays in current status (preparing).
    if (!isTakeout) {
      updates.status = "completed";
    }

    console.log(`[pay] Updating order ${id} with:`, JSON.stringify(updates));
    const [updatedOrder] = await db
      .update(schema.orders)
      .set(updates)
      .where(eq(schema.orders.id, id))
      .returning();
    console.log(`[pay] Order updated. discountAmount=${updatedOrder?.discountAmount}, discountName=${updatedOrder?.discountName}`);

    // Create cash register transaction
    if (openRegister) {
      await db.insert(schema.cashRegisterTransactions).values({
        registerId: openRegister.id,
        type: "sale",
        amount: amountPaid || order.total,
        paymentMethod,
        orderId: id,
        userId: employeeId || order.userId,
        description: `Venta orden #${order.orderNumber}`,
      });
    }

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: {
        items: true,
      },
    });

    // Free table if dine-in — pero no si quedan otros tickets sin pagar.
    if (order.tableId) {
      const stillOccupied = await hasOtherUnpaidOrdersAtTable(order.tableId, id);
      if (!stillOccupied) {
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
        await unmergeByTableId(order.tableId);
      }
    }
    await unmergeByOrderId(id);

    // Handle loyalty stamps
    if (loyaltyCardId && loyaltyStamps > 0) {
      const card = await db.query.loyaltyCards.findFirst({
        where: eq(schema.loyaltyCards.id, loyaltyCardId),
      });
      if (card) {
        const newStamps = card.stamps + loyaltyStamps;
        const newRewards = Math.floor(newStamps / card.stampsPerReward);
        const remainingStamps = newStamps % card.stampsPerReward;
        const additionalRewards = newRewards > 0 ? newRewards : 0;

        await db
          .update(schema.loyaltyCards)
          .set({
            stamps: newRewards > 0 ? remainingStamps : newStamps,
            totalStamps: card.totalStamps + loyaltyStamps,
            rewardsAvailable: card.rewardsAvailable + additionalRewards,
            updatedAt: new Date(),
          })
          .where(eq(schema.loyaltyCards.id, loyaltyCardId));

        await db.insert(schema.loyaltyTransactions).values({
          cardId: loyaltyCardId,
          orderId: id,
          stampsAdded: loyaltyStamps,
        });

        const updatedCard = await db.query.loyaltyCards.findFirst({
          where: eq(schema.loyaltyCards.id, loyaltyCardId),
        });
        if (updatedCard) {
          sendAppleWalletPush(loyaltyCardId).catch(console.error);
          createOrUpdateGoogleWalletObject(updatedCard).catch(console.error);
        }
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
    const { payments, loyaltyCardId, employeeId, discount, discountName, discountId, subtotal } = req.body;

    console.log(`[pay-split] Order ID: ${id}`);
    console.log(`[pay-split] Body:`, JSON.stringify(req.body, null, 2));

    if (!payments || payments.length === 0) {
      console.log(`[pay-split] ERROR: no payments`);
      return res.status(400).json({ error: "payments es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      console.log(`[pay-split] ERROR: order not found`);
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Anti-doble-cobro: si ya está pagada, no procesar el split de nuevo.
    if (order.paymentStatus === "paid") {
      console.log(`[pay-split] ERROR: order already paid`);
      return res.status(409).json({ error: "La orden ya está pagada", code: "ALREADY_PAID" });
    }

    console.log(`[pay-split] Order found: #${order.orderNumber}, total=${order.total}, subtotal=${order.subtotal}`);

    // Calculate totals — tips are separate from order subtotal
    const totalAmounts = payments.reduce(
      (sum: number, p: any) => sum + parseFloat(p.amount),
      0
    );
    const totalTips = payments.reduce(
      (sum: number, p: any) => sum + parseFloat(p.tip || "0"),
      0
    );
    const totalPaid = totalAmounts + totalTips;
    const orderTotal = subtotal ? parseFloat(subtotal) : parseFloat(order.subtotal || order.total);

    console.log(`[pay-split] totalAmounts=${totalAmounts}, totalTips=${totalTips}, totalPaid=${totalPaid}, orderTotal=${orderTotal}`);
    console.log(`[pay-split] Payments breakdown:`, payments.map((p: any) => `${p.paymentMethod} amount=${p.amount} tip=${p.tip}`));

    if (Math.abs(totalAmounts - orderTotal) > 1) {
      console.log(`[pay-split] ERROR: total mismatch`);
      return res.status(400).json({
        error: `Total pagado ($${totalAmounts.toFixed(2)}) no coincide con total de orden ($${orderTotal.toFixed(2)})`,
      });
    }

    // Find open cash register
    const openRegister = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.status, "open"),
    });
    console.log(`[pay-split] Open register: ${openRegister?.id ?? "none"}`);

    // Create payment records
    const paymentRecords = payments.map((p: any, index: number) => ({
      orderId: id,
      sequenceNumber: index + 1,
      paymentMethod: p.paymentMethod,
      amount: p.amount,
      tip: p.tip || "0",
      tipPaymentMethod: p.tipPaymentMethod || p.paymentMethod,
    }));

    console.log(`[pay-split] Inserting ${paymentRecords.length} payment records`);
    await db.insert(schema.orderPayments).values(paymentRecords);
    console.log(`[pay-split] Payment records inserted`);

    // Update order
    const totalWithTip = (orderTotal + totalTips).toString();
    const isTakeout = !order.tableId;

    const updates: any = {
      paymentMethod: "split",
      paymentStatus: "paid",
      paidAt: new Date(),
      amountPaid: totalPaid.toString(),
      tip: totalTips.toString(),
      subtotal: orderTotal.toString(),
      total: totalWithTip,
    };

    if (discount && parseFloat(discount) > 0) {
      updates.discountAmount = discount.toString();
      updates.discountName = discountName || "Descuento";
      if (discountId) updates.discountId = discountId;
    }

    if (openRegister) {
      updates.cashRegisterId = openRegister.id;
    }

    if (loyaltyCardId) {
      updates.loyaltyCardId = loyaltyCardId;
    }

    // Only mark as completed for dine-in. Takeout stays in current status.
    if (!isTakeout) {
      updates.status = "completed";
    }

    console.log(`[pay-split] Updating order with:`, updates);
    await db.update(schema.orders).set(updates).where(eq(schema.orders.id, id));
    console.log(`[pay-split] Order updated`);

    // Create cash register transactions per payment
    if (openRegister) {
      for (const p of payments) {
        await db.insert(schema.cashRegisterTransactions).values({
          registerId: openRegister.id,
          type: "sale",
          amount: (parseFloat(p.amount) + parseFloat(p.tip || "0")).toString(),
          paymentMethod: p.paymentMethod,
          orderId: id,
          userId: employeeId || order.userId,
          description: `Venta dividida orden #${order.orderNumber}`,
        });
      }
      console.log(`[pay-split] Cash register transactions created`);
    }

    const completeOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });

    // Free table if dine-in — pero no si quedan otros tickets sin pagar.
    if (order.tableId) {
      const stillOccupied = await hasOtherUnpaidOrdersAtTable(order.tableId, id);
      if (!stillOccupied) {
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
        await unmergeByTableId(order.tableId);
      }
    }
    await unmergeByOrderId(id);

    emitOrderPaid(completeOrder);
    res.json(completeOrder);
  } catch (error) {
    console.error("[pay-split] Error processing split payment:", error);
    res.status(500).json({ error: "Error al procesar pago dividido" });
  }
});

// POST /api/orders/:id/split-into-tickets
// Divide una orden en N órdenes/tickets separados — cada uno se cobra después
// con el flujo normal de pago de una sola orden (un solo método por ticket).
// Reemplaza al viejo "split-payment" (una orden, N métodos de pago mezclados).
// Body: { groups: { orderItemId: string; quantity: number }[][] }
// Cada array interno es un ticket nuevo; un mismo orderItemId puede repartirse
// entre varios grupos y/o dejar parte sin asignar (se queda en la orden padre).
router.post("/orders/:id/split-into-tickets", async (req, res) => {
  try {
    const { id } = req.params;
    const { groups } = req.body as { groups: { orderItemId: string; quantity: number }[][] };

    if (!Array.isArray(groups) || groups.length === 0 || !groups.some((g) => g.length > 0)) {
      return res.status(400).json({ error: "groups es requerido" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ error: "La orden ya está pagada", code: "ALREADY_PAID" });
    }

    const itemsById = new Map(order.items.filter((i) => !i.voided).map((i) => [i.id, i]));

    // Validar: cada item existe en esta orden, cantidades son enteros
    // positivos, y no se pide más de lo que hay.
    const requestedByItem = new Map<string, number>();
    const destinationsByItem = new Map<string, number>();
    for (const group of groups) {
      for (const { orderItemId, quantity } of group) {
        if (!itemsById.has(orderItemId)) {
          return res.status(400).json({ error: `Item no encontrado en esta orden: ${orderItemId}` });
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({ error: "Cantidad inválida en split-into-tickets" });
        }
        requestedByItem.set(orderItemId, (requestedByItem.get(orderItemId) || 0) + quantity);
        destinationsByItem.set(orderItemId, (destinationsByItem.get(orderItemId) || 0) + 1);
      }
    }
    for (const [itemId, requested] of requestedByItem) {
      const item = itemsById.get(itemId)!;
      if (requested > item.quantity) {
        return res.status(400).json({
          error: `Se pidieron ${requested} de "${item.productName}" pero la orden solo tiene ${item.quantity}`,
        });
      }
    }

    const splitGroupId = order.splitGroupId || order.id;

    const maxOrderResult = await db
      .select({ max: sql<number>`COALESCE(MAX(${schema.orders.orderNumber}), 0)` })
      .from(schema.orders);
    let nextOrderNumber = (maxOrderResult[0]?.max ?? 0) + 1;

    // Cuánto se le quitó a cada item original vía clonado (no vía el camino
    // barato de reasignar la fila completa) — se usa después para reducir la
    // fila original que se queda en la orden padre.
    const clonedSubtotalByItem = new Map<string, number>();
    const clonedQuantityByItem = new Map<string, number>();

    const tickets: any[] = [];

    for (const group of groups) {
      if (group.length === 0) continue;

      const [newOrder] = await db
        .insert(schema.orders)
        .values({
          orderNumber: nextOrderNumber++,
          tableId: order.tableId,
          customerName: order.customerName,
          cashRegisterId: order.cashRegisterId,
          userId: order.userId,
          guestCount: 1,
          status: order.status,
          paymentStatus: "pending",
          subtotal: "0",
          total: "0",
          tip: "0",
          source: order.source,
          splitGroupId,
        })
        .returning();

      let ticketSubtotal = 0;

      for (const { orderItemId, quantity } of group) {
        const item = itemsById.get(orderItemId)!;
        const isWholeItemSingleDestination =
          destinationsByItem.get(orderItemId) === 1 && quantity === item.quantity;

        if (isWholeItemSingleDestination) {
          // Camino barato: se mueve toda la fila a un solo ticket — sin
          // clonar, conserva el mismo id.
          await db
            .update(schema.orderItems)
            .set({ orderId: newOrder.id })
            .where(eq(schema.orderItems.id, orderItemId));
          ticketSubtotal += parseFloat(item.subtotal);
        } else {
          // Se reparte entre varios tickets y/o se queda una parte en el
          // padre: clonar una fila nueva con la cantidad pedida, subtotal
          // proporcional al original (para no arrastrar error de redondeo
          // entre los distintos pedazos).
          const perUnitSubtotal = parseFloat(item.subtotal) / item.quantity;
          const cloneSubtotal = Math.round(perUnitSubtotal * quantity * 100) / 100;
          await db.insert(schema.orderItems).values({
            orderId: newOrder.id,
            productId: item.productId,
            productName: item.productName,
            quantity,
            unitPrice: item.unitPrice,
            subtotal: cloneSubtotal.toString(),
            notes: item.notes,
            frostingId: item.frostingId,
            frostingName: item.frostingName,
            dryToppingId: item.dryToppingId,
            dryToppingName: item.dryToppingName,
            extraId: item.extraId,
            extraName: item.extraName,
            customModifiers: item.customModifiers,
            seat: item.seat,
            course: item.course,
            deliveredToTable: item.deliveredToTable,
            isGuest: item.isGuest,
            promotionId: item.promotionId,
            promotionName: item.promotionName,
            originalPrice: item.originalPrice,
            promotionDiscount: item.promotionDiscount,
          });
          ticketSubtotal += cloneSubtotal;
          clonedSubtotalByItem.set(orderItemId, (clonedSubtotalByItem.get(orderItemId) || 0) + cloneSubtotal);
          clonedQuantityByItem.set(orderItemId, (clonedQuantityByItem.get(orderItemId) || 0) + quantity);
        }
      }

      await db
        .update(schema.orders)
        .set({ subtotal: ticketSubtotal.toFixed(2), total: ticketSubtotal.toFixed(2) })
        .where(eq(schema.orders.id, newOrder.id));

      const completeTicket = await db.query.orders.findFirst({
        where: eq(schema.orders.id, newOrder.id),
        with: { items: true },
      });
      tickets.push(completeTicket);
      emitOrderNew(completeTicket);
    }

    // Reducir (o borrar si se consumió por completo) las filas originales que
    // se repartieron por clonado. Resta directa contra el subtotal original
    // — no recálculo por precio unitario — para que cuadre exacto centavo a
    // centavo contra lo que se les dio a los clones.
    for (const [itemId, clonedQty] of clonedQuantityByItem) {
      const item = itemsById.get(itemId)!;
      const remainingQty = item.quantity - clonedQty;
      if (remainingQty <= 0) {
        await db.delete(schema.orderItems).where(eq(schema.orderItems.id, itemId));
      } else {
        const clonedSubtotal = clonedSubtotalByItem.get(itemId) || 0;
        const remainingSubtotal = Math.max(0, parseFloat(item.subtotal) - clonedSubtotal);
        await db
          .update(schema.orderItems)
          .set({ quantity: remainingQty, subtotal: remainingSubtotal.toFixed(2) })
          .where(eq(schema.orderItems.id, itemId));
      }
    }

    // Recalcular la orden padre desde sus items restantes (fuente de verdad),
    // en vez de arrastrar aritmética incremental.
    const parentRemainingItems = await db.query.orderItems.findMany({
      where: and(eq(schema.orderItems.orderId, id), eq(schema.orderItems.voided, false)),
    });
    const parentRemainingSubtotal = parentRemainingItems.reduce((s, i) => s + parseFloat(i.subtotal), 0);

    const parentUpdates: any = {
      subtotal: parentRemainingSubtotal.toFixed(2),
      total: parentRemainingSubtotal.toFixed(2),
      updatedAt: new Date(),
    };
    if (parentRemainingItems.length === 0) {
      parentUpdates.status = "cancelled";
    } else {
      parentUpdates.splitGroupId = splitGroupId;
    }
    await db.update(schema.orders).set(parentUpdates).where(eq(schema.orders.id, id));

    const completeParent = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });
    emitOrderUpdated(completeParent);

    res.json({ parent: completeParent, tickets });
  } catch (error) {
    console.error("[split-into-tickets] Error:", error);
    res.status(500).json({ error: "Error al dividir la orden en tickets" });
  }
});

// POST /api/orders/:id/complete
// Used by POS to explicitly finalize a takeout order after payment.
// Sets status to "completed" so the order disappears from KDS.
router.post("/orders/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // "Completar orden" solo aplica a órdenes ya pagadas (flujo de llevar).
    if (order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "La orden debe estar pagada para completarse" });
    }

    await db
      .update(schema.orders)
      .set({ status: "completed" })
      .where(eq(schema.orders.id, id));

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true },
    });

    if (updatedOrder) {
      emitOrderUpdated(updatedOrder);
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error("Error completing order:", error);
    res.status(500).json({ error: "Error al finalizar orden" });
  }
});

// POST /api/orders/transfer  (body: { orderId, newTableId }) — used by Bruma POS/iOS
router.post("/orders/transfer", async (req, res) => {
  try {
    const { orderId, newTableId } = req.body;

    if (!orderId || !newTableId) {
      return res.status(400).json({ error: "orderId y newTableId son requeridos" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
    });

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const oldTableId = order.tableId;

    await db
      .update(schema.orders)
      .set({ tableId: newTableId, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));

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
      where: eq(schema.orders.id, orderId),
      with: { items: true },
    });

    emitOrderUpdated(updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    console.error("Error transferring order:", error);
    res.status(500).json({ error: "Error al transferir orden" });
  }
});

// POST /api/orders/:id/transfer
router.post("/orders/:id/transfer", async (req, res) => {
  try {
    const { id } = req.params;
    const { newTableId } = req.body;

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
      .set({ tableId: newTableId, updatedAt: new Date() })
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
    const { voidReason, voidedBy } = req.body;
    console.log("[PATCH /order-items/:id/void] id=", id, "body=", JSON.stringify(req.body));

    const [voidedItem] = await db
      .update(schema.orderItems)
      .set({
        voided: true,
        voidReason: voidReason || "Cancelado",
        voidedBy: voidedBy || null,
      })
      .where(eq(schema.orderItems.id, id))
      .returning();

    if (!voidedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, voidedItem.orderId),
      with: { items: true },
    });

    emitOrderUpdated(order);
    res.json(voidedItem);
  } catch (error) {
    console.error("[PATCH /order-items/:id/void] 500 error:", error);
    res.status(500).json({ error: "Error al anular item" });
  }
});

// PATCH /api/orders/:id/items/:itemId/void  (iOS legacy path)
router.patch("/orders/:id/items/:itemId/void", async (req, res) => {
  try {
    const { itemId } = req.params;
    const { voidReason, voidedBy } = req.body;
    console.log("[PATCH /orders/:id/items/:itemId/void] itemId=", itemId, "body=", JSON.stringify(req.body));

    const [voidedItem] = await db
      .update(schema.orderItems)
      .set({
        voided: true,
        voidReason: voidReason || "Cancelado",
        voidedBy: voidedBy || null,
      })
      .where(eq(schema.orderItems.id, itemId))
      .returning();

    if (!voidedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, voidedItem.orderId),
      with: { items: true },
    });

    emitOrderUpdated(order);
    res.json(voidedItem);
  } catch (error) {
    console.error("[PATCH /orders/:id/items/:itemId/void] 500 error:", error);
    res.status(500).json({ error: "Error al anular item" });
  }
});

// PATCH /api/order-items/:id  (update quantity, unitPrice, and/or product)
router.patch("/order-items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, productName, quantity, unitPrice, notes, customModifiers } = req.body;
    console.log("[PATCH /api/order-items/:id] id=", id, "body=", JSON.stringify(req.body));

    const isProductChange = productId && productName && unitPrice !== undefined;
    const isQuantityChange = quantity !== undefined && unitPrice !== undefined;

    if (!isProductChange && !isQuantityChange) {
      console.log("[PATCH /api/order-items/:id] 400 - missing fields");
      return res.status(400).json({ error: "Proporciona (productId, productName, unitPrice) o (quantity, unitPrice)" });
    }

    const existing = await db
      .select({
        quantity: schema.orderItems.quantity,
        orderId: schema.orderItems.orderId,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, id))
      .limit(1);

    if (!existing.length) {
      console.log("[PATCH /api/order-items/:id] 404 - item not found");
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const { orderId } = existing[0];
    const finalQty = isQuantityChange ? parseInt(quantity, 10) : existing[0].quantity;
    const finalPrice = parseFloat(unitPrice);
    const newSubtotal = (finalPrice * finalQty).toFixed(2);
    console.log("[PATCH /api/order-items/:id] finalQty=", finalQty, "finalPrice=", finalPrice, "newSubtotal=", newSubtotal);

    const updateFields: Record<string, unknown> = {
      unitPrice: finalPrice.toString(),
      quantity: finalQty,
      subtotal: newSubtotal,
    };

    if (isProductChange) {
      updateFields.productId = productId;
      updateFields.productName = productName;
    }

    if (notes !== undefined) {
      updateFields.notes = notes;
    }

    if (customModifiers !== undefined) {
      updateFields.customModifiers = customModifiers;
    }

    console.log("[PATCH /api/order-items/:id] updateFields=", JSON.stringify(updateFields));

    const [updated] = await db
      .update(schema.orderItems)
      .set(updateFields)
      .where(eq(schema.orderItems.id, id))
      .returning();

    console.log("[PATCH /api/order-items/:id] updated=", updated);

    // Recalc order total
    const allItems = await db
      .select({ subtotal: schema.orderItems.subtotal, voided: schema.orderItems.voided })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));

    const newTotal = allItems
      .filter((i) => !i.voided)
      .reduce((sum, i) => sum + parseFloat(i.subtotal ?? "0"), 0)
      .toFixed(2);

    console.log("[PATCH /api/order-items/:id] newTotal=", newTotal);

    await db
      .update(schema.orders)
      .set({ total: newTotal, subtotal: newTotal, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
      with: { items: true },
    });
    emitOrderUpdated(order);

    res.json(updated);
  } catch (error) {
    console.error("[PATCH /api/order-items/:id] 500 error:", error);
    res.status(500).json({ error: "Error al actualizar item", detail: String(error) });
  }
});

// PATCH /api/order-items/:id/deliver
router.patch("/order-items/:id/deliver", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("[PATCH /order-items/:id/deliver] id=", id);

    const [deliveredItem] = await db
      .update(schema.orderItems)
      .set({
        status: "delivered",
        deliveredAt: new Date(),
      })
      .where(eq(schema.orderItems.id, id))
      .returning();

    if (!deliveredItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, deliveredItem.orderId),
      with: { items: true },
    });

    emitOrderUpdated(order);
    res.json(deliveredItem);
  } catch (error) {
    console.error("[PATCH /order-items/:id/deliver] 500 error:", error);
    res.status(500).json({ error: "Error al entregar item" });
  }
});

// PATCH /api/orders/:id/items/:itemId/deliver  (iOS legacy path)
router.patch("/orders/:id/items/:itemId/deliver", async (req, res) => {
  try {
    const { itemId } = req.params;
    console.log("[PATCH /orders/:id/items/:itemId/deliver] itemId=", itemId);

    const [deliveredItem] = await db
      .update(schema.orderItems)
      .set({
        status: "delivered",
        deliveredAt: new Date(),
      })
      .where(eq(schema.orderItems.id, itemId))
      .returning();

    if (!deliveredItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, deliveredItem.orderId),
      with: { items: true },
    });

    emitOrderUpdated(order);
    res.json(deliveredItem);
  } catch (error) {
    console.error("[PATCH /orders/:id/items/:itemId/deliver] 500 error:", error);
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

    // Get the order to emit update to POS
    if (readyItems.length > 0) {
      const firstItem = readyItems[0];
      let order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, firstItem.orderId),
        with: { items: true },
      });
      
      // If all non-voided items are deliveredToTable, mark dine-in order as ready.
      // Takeout orders stay in "preparing" until POS explicitly finalizes them.
      if (order && order.items && order.tableId) {
        const activeItems = order.items.filter((item: any) => !item.voided);
        const allDelivered = activeItems.length > 0 && activeItems.every((item: any) => item.deliveredToTable);
        console.log("🛎️ batch-ready: order", order.id, "has", activeItems.length, "active items, allDelivered=", allDelivered);
        if (allDelivered) {
          await db
            .update(schema.orders)
            .set({ status: "ready" })
            .where(eq(schema.orders.id, order.id));
          // Re-fetch to get updated status
          order = await db.query.orders.findFirst({
            where: eq(schema.orders.id, order.id),
            with: { items: true },
          });
          console.log("🛎️ Order", order?.id, "marked as ready (all active items delivered)");
        }
      }
      
      if (order) {
        emitOrderUpdated(order);
      }
    }

    emitOrderItemsReady(readyItems);
    res.json({ success: true, count: readyItems.length });
  } catch (error) {
    console.error("Error marking items ready:", error);
    res.status(500).json({ error: "Error al marcar items listos" });
  }
});

// PATCH /api/orders/:id/rush - Mark order as rush priority
router.patch("/orders/:id/rush", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db
      .update(schema.orders)
      .set({ priority: 1, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    emitOrderRush(updated);
    res.json(updated);
  } catch (error) {
    console.error("Error setting rush:", error);
    res.status(500).json({ error: "Error al activar rush" });
  }
});

// PATCH /api/orders/:id/unrush - Remove rush priority
router.patch("/orders/:id/unrush", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db
      .update(schema.orders)
      .set({ priority: 0, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    emitOrderRush(updated);
    res.json(updated);
  } catch (error) {
    console.error("Error removing rush:", error);
    res.status(500).json({ error: "Error al quitar rush" });
  }
});

// PATCH /api/orders/:id/hold - Pause order (hold)
router.patch("/orders/:id/hold", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db
      .update(schema.orders)
      .set({ onHold: true, holdStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    emitOrderHold(updated);
    res.json(updated);
  } catch (error) {
    console.error("Error holding order:", error);
    res.status(500).json({ error: "Error al detener orden" });
  }
});

// PATCH /api/orders/:id/unhold - Resume order from hold
router.patch("/orders/:id/unhold", async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch current to compute accumulated hold time
    const current = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!current) return res.status(404).json({ error: "Order not found" });
    let accumulated = current.holdAccumulatedSeconds ?? 0;
    if (current.holdStartedAt) {
      const holdSeconds = Math.floor((Date.now() - new Date(current.holdStartedAt).getTime()) / 1000);
      accumulated += holdSeconds;
    }
    const [updated] = await db
      .update(schema.orders)
      .set({ onHold: false, holdStartedAt: null, holdAccumulatedSeconds: accumulated, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    emitOrderHold(updated);
    res.json(updated);
  } catch (error) {
    console.error("Error resuming order:", error);
    res.status(500).json({ error: "Error al reanudar orden" });
  }
});

// PATCH /api/order-items/:id/guest - Mark/unmark item as guest and recalculate order total
router.patch("/order-items/:id/guest", async (req, res) => {
  try {
    const { id } = req.params;
    const { isGuest } = req.body;

    const [updatedItem] = await db
      .update(schema.orderItems)
      .set({
        isGuest: isGuest === true,
        subtotal: isGuest === true ? "0" : sql`${schema.orderItems.quantity} * ${schema.orderItems.unitPrice}`,
      })
      .where(eq(schema.orderItems.id, id))
      .returning();

    if (!updatedItem) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    // Recalculate order subtotal excluding guest items
    const orderItemsList = await db.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, updatedItem.orderId),
    });
    const newSubtotal = orderItemsList.reduce((sum: number, item: any) => {
      return item.isGuest ? sum : sum + (parseFloat(item.subtotal) || 0);
    }, 0);

    await db
      .update(schema.orders)
      .set({
        subtotal: newSubtotal.toString(),
        total: newSubtotal.toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, updatedItem.orderId));

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, updatedItem.orderId),
      with: { items: true },
    });

    emitOrderUpdated(order);
    res.json({ item: updatedItem, order });
  } catch (error) {
    console.error("[PATCH /order-items/:id/guest] 500 error:", error);
    res.status(500).json({ error: "Error al actualizar item" });
  }
});

export default router;
