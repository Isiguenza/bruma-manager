import { Router } from "express";
import { db, schema } from "../db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { emitCashRegisterOpened, emitCashRegisterClosed } from "../sockets/events";

const router = Router();

// GET /api/cash-register/current
router.get("/cash-register/current", async (req, res) => {
  try {
    const currentRegister = await db.query.cashRegisters.findFirst({
      where: isNull(schema.cashRegisters.closedAt),
      orderBy: desc(schema.cashRegisters.openedAt),
    });

    if (!currentRegister) {
      return res.status(404).json({ error: "No hay caja abierta" });
    }

    res.json(currentRegister);
  } catch (error) {
    console.error("Error fetching current cash register:", error);
    res.status(500).json({ error: "Error al obtener caja actual" });
  }
});

// POST /api/cash-register
router.post("/cash-register", async (req, res) => {
  try {
    const { initialCash, employeeId } = req.body;

    if (initialCash === undefined || !employeeId) {
      return res.status(400).json({ error: "initialCash y employeeId son requeridos" });
    }

    // Check if there's already an open register
    const existingRegister = await db.query.cashRegisters.findFirst({
      where: isNull(schema.cashRegisters.closedAt),
    });

    if (existingRegister) {
      return res.status(400).json({ error: "Ya hay una caja abierta" });
    }

    const [newRegister] = await db
      .insert(schema.cashRegisters)
      .values({
        initialCash: initialCash.toString(),
        openedBy: employeeId,
      })
      .returning();

    emitCashRegisterOpened(newRegister);
    res.json(newRegister);
  } catch (error) {
    console.error("Error opening cash register:", error);
    res.status(500).json({ error: "Error al abrir caja" });
  }
});

// POST /api/cash-register/:id/close
router.post("/cash-register/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const { finalCash, closedBy, notes } = req.body;

    if (finalCash === undefined || !closedBy) {
      return res.status(400).json({ error: "finalCash y closedBy son requeridos" });
    }

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    if (register.closedAt) {
      return res.status(400).json({ error: "La caja ya está cerrada" });
    }

    // Calculate totals from paid orders linked to this register
    const paidOrders = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.cashRegisterId, id),
        eq(schema.orders.paymentStatus, "paid"),
        eq(schema.orders.isPractice, false)
      ),
    });

    const cashSales = paidOrders
      .filter(o => o.paymentMethod === "cash")
      .reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

    const terminalSales = paidOrders
      .filter(o => o.paymentMethod === "terminal_mercadopago" || o.paymentMethod === "card")
      .reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

    const transferSales = paidOrders
      .filter(o => o.paymentMethod === "transfer")
      .reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

    const totalSales = cashSales + terminalSales + transferSales;

    // Get deposits and withdrawals from transactions
    const transactions = await db.query.cashRegisterTransactions.findMany({
      where: eq(schema.cashRegisterTransactions.registerId, id),
    });

    const withdrawals = transactions
      .filter(t => t.type === "withdrawal")
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const deposits = transactions
      .filter(t => t.type === "deposit")
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const expectedCash = parseFloat(register.initialCash) + cashSales - withdrawals + deposits;
    const difference = parseFloat(finalCash.toString()) - expectedCash;

    const [closedRegister] = await db
      .update(schema.cashRegisters)
      .set({
        finalCash: parseFloat(finalCash.toString()).toFixed(2),
        closedBy,
        closedAt: new Date(),
        status: "closed",
        notes: notes || null,
        totalSales: totalSales.toFixed(2),
        cashSales: cashSales.toFixed(2),
        terminalSales: terminalSales.toFixed(2),
        transferSales: transferSales.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        difference: difference.toFixed(2),
        totalOrders: paidOrders.length,
        withdrawals: withdrawals.toFixed(2),
        deposits: deposits.toFixed(2),
      })
      .where(eq(schema.cashRegisters.id, id))
      .returning();

    emitCashRegisterClosed(closedRegister);
    res.json(closedRegister);
  } catch (error) {
    console.error("Error closing cash register:", error);
    res.status(500).json({ error: "Error al cerrar caja" });
  }
});

// POST /api/cash-register/:id/deposit
router.post("/cash-register/:id/deposit", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, userId, description } = req.body;

    if (amount === undefined || !userId) {
      return res.status(400).json({ error: "amount y userId son requeridos" });
    }

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    if (register.closedAt) {
      return res.status(400).json({ error: "La caja está cerrada" });
    }

    // Create transaction record
    await db.insert(schema.cashRegisterTransactions).values({
      registerId: id,
      type: "deposit",
      amount: amount.toString(),
      userId,
      description: description || "Depósito",
    });

    // Keep the register's running deposits total in sync (used by the client
    // mid-shift; the corte computes from transactions independently).
    const newDeposits = parseFloat(register.deposits || "0") + parseFloat(amount.toString());
    await db
      .update(schema.cashRegisters)
      .set({ deposits: newDeposits.toFixed(2) })
      .where(eq(schema.cashRegisters.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error depositing to cash register:", error);
    res.status(500).json({ error: "Error al realizar depósito" });
  }
});

// POST /api/cash-register/:id/withdraw
router.post("/cash-register/:id/withdraw", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, userId, description } = req.body;

    if (amount === undefined || !userId) {
      return res.status(400).json({ error: "amount y userId son requeridos" });
    }

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    if (register.closedAt) {
      return res.status(400).json({ error: "La caja está cerrada" });
    }

    // Create transaction record
    await db.insert(schema.cashRegisterTransactions).values({
      registerId: id,
      type: "withdrawal",
      amount: amount.toString(),
      userId,
      description: description || "Sangría",
    });

    // Keep the register's running withdrawals total in sync (used by the client
    // mid-shift; the corte computes from transactions independently).
    const newWithdrawals = parseFloat(register.withdrawals || "0") + parseFloat(amount.toString());
    await db
      .update(schema.cashRegisters)
      .set({ withdrawals: newWithdrawals.toFixed(2) })
      .where(eq(schema.cashRegisters.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error withdrawing from cash register:", error);
    res.status(500).json({ error: "Error al realizar sangría" });
  }
});

// GET /api/cash-register/:id/report
router.get("/cash-register/:id/report", async (req, res) => {
  try {
    const { id } = req.params;

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    // Get transactions
    const transactions = await db.query.cashRegisterTransactions.findMany({
      where: eq(schema.cashRegisterTransactions.registerId, id),
      orderBy: desc(schema.cashRegisterTransactions.createdAt),
    });

    // Get orders for this register (con items y empleado para reportes)
    const orders = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.cashRegisterId, id),
        eq(schema.orders.paymentStatus, "paid"),
        eq(schema.orders.isPractice, false)
      ),
      with: {
        items: true,
        user: { columns: { id: true, name: true } },
      },
    });

    // --- Reportes: por empleado / producto / hora ---
    const byEmployeeMap: Record<string, { employeeId: string | null; employeeName: string; orders: number; total: number }> = {};
    const byProductMap: Record<string, { productName: string; qty: number; total: number }> = {};
    const byHourMap: Record<number, { hour: number; orders: number; total: number }> = {};

    for (const o of orders) {
      const orderTotal = parseFloat(o.total || "0");

      // Por empleado
      const empKey = o.userId || "sin_asignar";
      if (!byEmployeeMap[empKey]) {
        byEmployeeMap[empKey] = {
          employeeId: o.userId ?? null,
          employeeName: (o as any).user?.name || "Sin asignar",
          orders: 0,
          total: 0,
        };
      }
      byEmployeeMap[empKey].orders++;
      byEmployeeMap[empKey].total += orderTotal;

      // Por producto (excluye anulados)
      for (const it of ((o as any).items || [])) {
        if (it.voided) continue;
        const name = it.productName as string;
        if (!byProductMap[name]) byProductMap[name] = { productName: name, qty: 0, total: 0 };
        byProductMap[name].qty += it.quantity;
        byProductMap[name].total += parseFloat(it.subtotal || "0");
      }

      // Por hora (usa la hora de pago; cae a creación)
      const when = (o as any).paidAt ? new Date((o as any).paidAt) : new Date(o.createdAt);
      const hour = when.getHours();
      if (!byHourMap[hour]) byHourMap[hour] = { hour, orders: 0, total: 0 };
      byHourMap[hour].orders++;
      byHourMap[hour].total += orderTotal;
    }

    const byEmployee = Object.values(byEmployeeMap).sort((a, b) => b.total - a.total);
    const byProduct = Object.values(byProductMap).sort((a, b) => b.qty - a.qty);
    const byHour = Object.values(byHourMap).sort((a, b) => a.hour - b.hour);

    const report = {
      register,
      transactions,
      orders,
      summary: {
        totalOrders: orders.length,
        totalSales: orders.reduce((sum, o) => sum + parseFloat(o.total), 0),
        totalDeposits: transactions
          .filter((t) => t.type === "deposit")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        totalWithdrawals: transactions
          .filter((t) => t.type === "withdrawal")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
      },
      reports: {
        byEmployee,
        byProduct,
        byHour,
      },
    };

    res.json(report);
  } catch (error) {
    console.error("Error generating cash register report:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /api/cash-register/:id/corte
router.get("/cash-register/:id/corte", async (req, res) => {
  try {
    const { id } = req.params;

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    // Get all paid orders for this register
    const registerOrders = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.cashRegisterId, id),
        eq(schema.orders.paymentStatus, "paid"),
        eq(schema.orders.isPractice, false)
      ),
      with: {
        items: true,
      },
    });

    const orderIds = registerOrders.map((o) => o.id);

    // Get split payments for these orders
    const splitPayments = orderIds.length > 0
      ? await db.query.orderPayments.findMany({
          where: sql`${schema.orderPayments.orderId} IN ${orderIds}`,
        })
      : [];

    // Terminal física (MercadoPago).
    const COMMISSION_RATE = 0.035;
    const COMMISSION_WITH_IVA = COMMISSION_RATE * 1.16;
    // Pedidos en línea (Stripe): 3.6% + $3.00 MXN por transacción, +IVA.
    const ONLINE_PCT_RATE = 0.036;
    const ONLINE_FIXED_FEE = 3.0;
    const IVA = 1.16;

    // Calculate sales by payment method
    let cashSales = 0;
    let cardSales = 0;
    let transferSales = 0;

    // Calculate tips by payment method
    let cashTips = 0;
    let cardTips = 0;
    let transferTips = 0;

    // Pedidos en línea (Stripe) — sección propia en el corte, con su propia
    // comisión (distinta a la de la terminal física).
    let onlineSales = 0;
    let onlineTips = 0;
    let onlineOrderCount = 0;
    let onlineCommissionSales = 0;
    let onlineCommissionTips = 0;

    let splitOrderCount = 0;

    for (const order of registerOrders) {
      const orderSplits = splitPayments.filter((p) => p.orderId === order.id);

      if (orderSplits.length > 0) {
        splitOrderCount++;
        for (const payment of orderSplits) {
          const amount = parseFloat(payment.amount);
          const tip = parseFloat(payment.tip || "0");
          const paymentMethod = payment.paymentMethod;
          const tipMethod = payment.tipPaymentMethod || paymentMethod;

          if (paymentMethod === "cash") cashSales += amount;
          else if (paymentMethod === "card" || paymentMethod === "terminal_mercadopago") cardSales += amount;
          else if (paymentMethod === "transfer") transferSales += amount;
          else if (paymentMethod === "online") {
            onlineSales += amount;
            onlineOrderCount++;
            onlineCommissionSales += (amount * ONLINE_PCT_RATE + ONLINE_FIXED_FEE) * IVA;
          }

          if (tipMethod === "cash") cashTips += tip;
          else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") cardTips += tip;
          else if (tipMethod === "transfer") transferTips += tip;
          else if (tipMethod === "online") {
            onlineTips += tip;
            onlineCommissionTips += tip * ONLINE_PCT_RATE * IVA;
          }
        }
      } else {
        const orderTotal = parseFloat(order.total || "0");
        const orderTip = parseFloat(order.tip || "0");
        const orderSubtotal = parseFloat(order.subtotal || "0") || (orderTotal - orderTip);
        const paymentMethod = order.paymentMethod;
        const tipMethod = order.tipPaymentMethod || paymentMethod;

        if (paymentMethod === "cash") cashSales += orderSubtotal;
        else if (paymentMethod === "card" || paymentMethod === "terminal_mercadopago") cardSales += orderSubtotal;
        else if (paymentMethod === "transfer") transferSales += orderSubtotal;
        else if (paymentMethod === "online") {
          onlineSales += orderSubtotal;
          onlineOrderCount++;
          // El fee fijo ($3) se carga una vez por transacción, sobre el renglón de venta.
          onlineCommissionSales += (orderSubtotal * ONLINE_PCT_RATE + ONLINE_FIXED_FEE) * IVA;
        }

        if (tipMethod === "cash") cashTips += orderTip;
        else if (tipMethod === "card" || tipMethod === "terminal_mercadopago") cardTips += orderTip;
        else if (tipMethod === "transfer") transferTips += orderTip;
        else if (tipMethod === "online") {
          onlineTips += orderTip;
          onlineCommissionTips += orderTip * ONLINE_PCT_RATE * IVA;
        }
      }
    }

    const totalSales = cashSales + cardSales + transferSales + onlineSales;
    const totalTips = cashTips + cardTips + transferTips + onlineTips;

    // Calculate commissions — terminal física (rate fijo) y online (rate + fee fijo) por separado.
    const cardCommission = (cardSales + cardTips) * COMMISSION_WITH_IVA;
    const netCardSales = cardSales - (cardSales * COMMISSION_WITH_IVA);
    const netCardTips = cardTips - (cardTips * COMMISSION_WITH_IVA);

    const onlineCommission = onlineCommissionSales + onlineCommissionTips;
    const netOnlineSales = onlineSales - onlineCommissionSales;
    const netOnlineTips = onlineTips - onlineCommissionTips;

    // Get cash movements
    const transactions = await db.query.cashRegisterTransactions.findMany({
      where: eq(schema.cashRegisterTransactions.registerId, id),
    });

    const deposits = transactions.filter((t) => t.type === "deposit");
    const withdrawals = transactions.filter((t) => t.type === "withdrawal");

    const totalDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);

    // Expected cash = initial + cash sales + cash tips + deposits - withdrawals
    const expectedCash =
      parseFloat(register.initialCash) +
      cashSales +
      cashTips +
      totalDeposits -
      totalWithdrawals;

    const cashOrders = registerOrders.filter(o => o.paymentMethod === "cash").length;
    const cardOrders = registerOrders.filter(o => o.paymentMethod === "card" || o.paymentMethod === "terminal_mercadopago").length;
    const transferOrders = registerOrders.filter(o => o.paymentMethod === "transfer").length;

    const corteData = {
      register: {
        id: register.id,
        openedAt: register.openedAt instanceof Date ? register.openedAt.toISOString() : register.openedAt,
        closedAt: register.closedAt instanceof Date ? register.closedAt.toISOString() : (register.closedAt ?? null),
        openedBy: register.openedBy ?? null,
        closedBy: register.closedBy ?? null,
        status: register.status,
        initialCash: parseFloat(register.initialCash),
      },
      sales: {
        total: totalSales,
        cash: cashSales,
        card: cardSales,
        transfer: transferSales,
        online: onlineSales,
        platformDelivery: 0,
        netCard: netCardSales,
        netOnline: netOnlineSales,
      },
      tips: {
        total: totalTips,
        cash: cashTips,
        card: cardTips,
        transfer: transferTips,
        online: onlineTips,
        netCard: netCardTips,
        netOnline: netOnlineTips,
      },
      commissions: {
        rate: COMMISSION_WITH_IVA,
        rateWithIVA: COMMISSION_WITH_IVA,
        total: cardCommission,
        salesCommission: cardSales * COMMISSION_WITH_IVA,
        tipsCommission: cardTips * COMMISSION_WITH_IVA,
        // Comisión de pedidos en línea (Stripe): 3.6% + $3 MXN por transacción, +IVA.
        online: {
          percentRate: ONLINE_PCT_RATE,
          fixedFee: ONLINE_FIXED_FEE,
          rateWithIVA: ONLINE_PCT_RATE * IVA,
          fixedFeeWithIVA: ONLINE_FIXED_FEE * IVA,
          total: onlineCommission,
          salesCommission: onlineCommissionSales,
          tipsCommission: onlineCommissionTips,
        },
      },
      movements: {
        deposits: {
          total: totalDeposits,
          count: deposits.length,
          items: deposits.map(d => ({
            id: d.id,
            amount: parseFloat(d.amount),
            description: d.description,
            createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
          })),
        },
        withdrawals: {
          total: totalWithdrawals,
          count: withdrawals.length,
          items: withdrawals.map(w => ({
            id: w.id,
            amount: parseFloat(w.amount),
            description: w.description,
            createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
          })),
        },
      },
      summary: {
        totalOrders: registerOrders.length,
        cashOrders,
        cardOrders,
        transferOrders,
        onlineOrders: onlineOrderCount,
        splitOrders: splitOrderCount,
        expectedCash,
        finalCash: register.finalCash ? parseFloat(register.finalCash) : null,
        difference: register.finalCash ? (parseFloat(register.finalCash) - expectedCash) : null,
      },
      notes: {
        opening: register.notes ?? null,
        closure: register.closureNotes ?? null,
      },
    };

    res.json(corteData);
  } catch (error) {
    console.error("Error generating corte:", error);
    res.status(500).json({ error: "Error al generar corte" });
  }
});

// GET /api/cash-register/:id/report
router.get("/cash-register/:id/report", async (req, res) => {
  try {
    const { id } = req.params;

    const register = await db.query.cashRegisters.findFirst({
      where: eq(schema.cashRegisters.id, id),
    });

    if (!register) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    // Get all transactions for this register
    const transactions = await db.query.cashRegisterTransactions.findMany({
      where: eq(schema.cashRegisterTransactions.registerId, id),
      orderBy: desc(schema.cashRegisterTransactions.createdAt),
    });

    // Get all orders paid during this register
    const orders = await db.query.orders.findMany({
      where: and(
        eq(schema.orders.cashRegisterId, id),
        eq(schema.orders.paymentStatus, "paid")
      ),
      with: {
        items: true,
      },
    });

    // Calculate totals
    const totalSales = orders.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const totalCash = orders
      .filter((o) => o.paymentMethod === "cash")
      .reduce((sum, order) => sum + parseFloat(order.total), 0);
    const totalCard = orders
      .filter((o) => o.paymentMethod === "card" || o.paymentMethod === "terminal_mercadopago")
      .reduce((sum, order) => sum + parseFloat(order.total), 0);
    const totalTransfer = orders
      .filter((o) => o.paymentMethod === "transfer")
      .reduce((sum, order) => sum + parseFloat(order.total), 0);

    // Calculate tips
    const totalCashTips = orders
      .filter((o) => o.tipPaymentMethod === "cash")
      .reduce((sum, order) => sum + parseFloat(order.tip || "0"), 0);
    const totalCardTips = orders
      .filter((o) => o.tipPaymentMethod === "card" || o.tipPaymentMethod === "terminal_mercadopago")
      .reduce((sum, order) => sum + parseFloat(order.tip || "0"), 0);

    const deposits = transactions.filter((t) => t.type === "deposit");
    const withdrawals = transactions.filter((t) => t.type === "withdrawal");

    const totalDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);

    // Expected cash = initial + cash sales + cash tips + deposits - withdrawals
    const expectedCash = parseFloat(register.initialCash) + totalCash + totalCashTips + totalDeposits - totalWithdrawals;

    const report = {
      register: {
        id: register.id,
        openedAt: register.openedAt,
        closedAt: register.closedAt,
        openedBy: register.openedBy,
        closedBy: register.closedBy,
        status: register.status,
        initialCash: parseFloat(register.initialCash),
        finalCash: register.finalCash ? parseFloat(register.finalCash) : null,
      },
      sales: {
        totalOrders: orders.length,
        totalSales,
        cash: totalCash,
        card: totalCard,
        transfer: totalTransfer,
      },
      tips: {
        cash: totalCashTips,
        card: totalCardTips,
        total: totalCashTips + totalCardTips,
      },
      // Return transactions as flat array for frontend compatibility
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        paymentMethod: t.paymentMethod,
        description: t.description,
        createdAt: t.createdAt,
        orderId: t.orderId,
        userId: t.userId,
      })),
      deposits: {
        count: deposits.length,
        total: totalDeposits,
      },
      withdrawals: {
        count: withdrawals.length,
        total: totalWithdrawals,
      },
      expectedCash,
    };

    res.json(report);
  } catch (error) {
    console.error("Error generating cash register report:", error);
    res.status(500).json({ error: "Error al generar reporte de caja" });
  }
});

export default router;
