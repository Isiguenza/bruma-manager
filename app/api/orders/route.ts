import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, cashRegisters, cashRegisterTransactions, productIngredients, ingredients } from "@/lib/db/schema";
import { eq, desc, inArray, sql, and, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const tableId = searchParams.get("tableId");
    const noTable = searchParams.get("noTable") === "true";
    const paymentStatus = searchParams.get("paymentStatus");
    const startDate = searchParams.get("startDate");
    const userId = searchParams.get("userId");
    const source = searchParams.get("source");
    const limit = parseInt(searchParams.get("limit") || "50");

    console.log("🔍 GET /api/orders - Params:", { status, tableId, noTable, paymentStatus, startDate, limit });

    const whereClauses = [];
    
    if (status) {
      const statuses = status.split(",") as ("pending" | "preparing" | "ready" | "delivered" | "cancelled")[];
      console.log("📊 Filtrando por statuses:", statuses);
      if (statuses.length === 1) {
        whereClauses.push(eq(orders.status, statuses[0]));
      } else {
        whereClauses.push(inArray(orders.status, statuses));
      }
    }
    
    if (paymentStatus) {
      console.log("💰 Filtrando por paymentStatus:", paymentStatus);
      whereClauses.push(eq(orders.paymentStatus, paymentStatus as "pending" | "paid" | "failed"));
    }
    
    if (tableId) {
      console.log("🏓 Filtrando por tableId:", tableId);
      console.log("🏓 Tipo de tableId:", typeof tableId);
      const tableIdClause = eq(orders.tableId, tableId);
      console.log("🏓 Clause generado:", tableIdClause);
      whereClauses.push(tableIdClause);
    }
    
    if (noTable) {
      console.log("📦 Filtrando órdenes sin mesa");
      whereClauses.push(sql`${orders.tableId} IS NULL`);
    }
    
    if (startDate) {
      console.log("📅 Filtrando desde fecha:", startDate);
      whereClauses.push(gte(orders.createdAt, new Date(startDate)));
    }
    
    if (userId) {
      console.log("👤 Filtrando por userId:", userId);
      whereClauses.push(eq(orders.userId, userId));
    }
    
    if (source) {
      console.log("🏷️ Filtrando por source:", source);
      whereClauses.push(eq(orders.source, source));
    }

    const whereClause = whereClauses.length > 0 
      ? whereClauses.length === 1 
        ? whereClauses[0] 
        : and(...whereClauses)
      : undefined;

    console.log("🔎 WHERE clause construido:", whereClause ? "SÍ" : "NO (sin filtros)");
    console.log("📋 Total whereClauses:", whereClauses.length);
    
    const result = await db.query.orders.findMany({
      where: whereClause,
      with: { 
        items: {
          columns: {
            id: true,
            orderId: true,
            productId: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            notes: true,
            frostingId: true,
            frostingName: true,
            dryToppingId: true,
            dryToppingName: true,
            extraId: true,
            extraName: true,
            customModifiers: true,
            seat: true,
            course: true,
            deliveredToTable: true,
            voided: true,
            voidReason: true,
            voidedBy: true,
            isGuest: true,
            promotionId: true,
            promotionName: true,
            originalPrice: true,
            promotionDiscount: true,
            createdAt: true,
          },
          with: {
            product: {
              columns: {
                id: true,
                categoryId: true,
              },
              with: {
                category: {
                  columns: {
                    id: true,
                    name: true,
                    isBeverage: true,
                  },
                },
              },
            },
          },
        },
        table: true,
        user: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(orders.createdAt)],
      limit,
    });

    console.log("✅ Órdenes encontradas:", result.length);
    
    // Log tableId de cada orden para debugging
    if (tableId) {
      console.log("🔍 Verificando tableId de órdenes retornadas:");
      let mismatchCount = 0;
      result.forEach((order, idx) => {
        const matches = order.tableId === tableId;
        console.log(`  Orden[${idx}]: id=${order.id}, tableId=${order.tableId}, matches=${matches ? "✅" : "❌"}, customerName=${order.customerName || "null"}, items=${order.items?.length || 0}`);
        if (!matches) {
          mismatchCount++;
          console.error(`  ❌❌❌ MISMATCH! Orden ${order.id} tiene tableId=${order.tableId} pero se pidió tableId=${tableId}`);
        }
      });
      if (mismatchCount > 0) {
        console.error(`⚠️⚠️⚠️ PROBLEMA DETECTADO: ${mismatchCount} órdenes NO coinciden con el tableId solicitado!`);
      }
    }
    
    // Ensure items have createdAt serialized as ISO string and add tableName/employeeName
    const serialized = result.map(order => ({
      ...order,
      tableName: order.table?.name || null,
      employeeName: order.user?.name || null,
      items: (order.items || []).map(item => ({
        ...item,
        createdAt: item.createdAt instanceof Date 
          ? item.createdAt.toISOString() 
          : (item.createdAt ? String(item.createdAt) : null),
        deliveredToTable: item.deliveredToTable ?? false,
      })),
    }));
    
    if (serialized.length > 0 && serialized[0].items.length > 0) {
      const fi = serialized[0].items[0];
      console.log(`  📋 Sample item keys: ${Object.keys(fi).join(', ')}`);
      console.log(`  📋 Sample item: createdAt=${fi.createdAt}, deliveredToTable=${fi.deliveredToTable}`);
    }

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, customerName, notes, status: orderStatus, tableId, paymentMethod, loyaltyCardId, orderNumber: manualOrderNumber } = body;

    console.log("📦 API recibió orden:", { customerName, orderStatus, tableId, manualOrderNumber });

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Items required" }, { status: 400 });
    }

    // Use manual order number if provided, otherwise auto-generate
    let nextNumber: number;
    if (manualOrderNumber) {
      nextNumber = manualOrderNumber;
      console.log(`📝 Usando # de orden manual: ${nextNumber}`);
    } else {
      // Get next order number for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const lastOrder = await db.query.orders.findFirst({
        where: sql`${orders.createdAt} >= ${today.toISOString()}`,
        orderBy: [desc(orders.orderNumber)],
      });
      nextNumber = (lastOrder?.orderNumber ?? 0) + 1;
    }

    // Calculate total (excluding guest/invited items)
    const total = items.reduce(
      (sum: number, item: { unitPrice: number; quantity: number; isGuest?: boolean }) =>
        item.isGuest ? sum : sum + item.unitPrice * item.quantity,
      0
    );

    // Find current open cash register
    const currentRegister = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.status, "open"),
    });

    // Create order
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: nextNumber,
        total: total.toFixed(2),
        customerName: customerName || null,
        notes: notes || null,
        tableId: tableId || null,
        cashRegisterId: currentRegister?.id || null,
        status: orderStatus || "pending", // Respetar el status enviado
        paymentStatus: "pending",
        paymentMethod: paymentMethod || null,
        loyaltyCardId: loyaltyCardId || null,
      })
      .returning();

    // Create order items
    const itemsToInsert = items.map(
      (item: {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        notes: string | null;
        frostingId?: string | null;
        frostingName?: string | null;
        dryToppingId?: string | null;
        dryToppingName?: string | null;
        extraId?: string | null;
        extraName?: string | null;
        customModifiers?: string | null;
        seat?: string | null;
        course?: number | null;
        isGuest?: boolean;
      }) => ({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        subtotal: (item.isGuest ? 0 : item.unitPrice * item.quantity).toFixed(2),
        notes: item.notes,
        frostingId: item.frostingId || null,
        frostingName: item.frostingName || null,
        dryToppingId: item.dryToppingId || null,
        dryToppingName: item.dryToppingName || null,
        extraId: item.extraId || null,
        extraName: item.extraName || null,
        customModifiers: item.customModifiers || null,
        seat: item.seat || null,
        course: item.course || 1,
        isGuest: item.isGuest || false,
      })
    );

    await db.insert(orderItems).values(itemsToInsert);

    // Return order with items
    const fullOrder = await db.query.orders.findFirst({
      where: eq(orders.id, order.id),
      with: { items: true },
    });

    return NextResponse.json(fullOrder, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json({ error: "Error creating order" }, { status: 500 });
  }
}
