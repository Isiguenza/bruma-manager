import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  orders,
  tables,
  cashRegisters,
  cashRegisterTransactions,
  loyaltyCards,
  loyaltyTransactions,
  productIngredients,
  ingredients,
  orderItems,
} from "@/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { sendAppleWalletPush } from "@/lib/apple-push";
import { createOrUpdateGoogleWalletObject } from "@/lib/google-wallet";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { paymentMethod, loyaltyCardId, loyaltyStamps, userId, tip, tipPaymentMethod, subtotal: frontendSubtotal, discount, discountName, discountId, customTimestamp } = body;

    // Get the order
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.paymentStatus === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    // Calcular nuevo total con propina si existe
    const tipAmount = tip || 0;
    const orderSubtotal = frontendSubtotal || parseFloat(order.total);
    const newTotal = orderSubtotal + tipAmount;

    // Mark as paid and delivered for all payment methods (cash, transfer, terminal)
    const timestamp = customTimestamp ? new Date(customTimestamp) : new Date();
    console.log(`💰 [pay] order=${id} method=${paymentMethod} tip=${tipAmount} discount=${discount || 0} discountName=${discountName || '-'} discountId=${discountId || '-'} subtotal=${frontendSubtotal}`);
    await db
      .update(orders)
      .set({
        paymentMethod: paymentMethod,
        paymentStatus: "paid",
        status: "delivered",
        subtotal: orderSubtotal.toString(),
        tip: tipAmount.toString(),
        tipPaymentMethod: tipPaymentMethod || paymentMethod || null,
        total: newTotal.toString(),
        discountAmount: discount ? discount.toString() : null,
        discountName: discount ? (discountName || "Descuento") : null,
        discountId: discountId || null,
        loyaltyCardId: loyaltyCardId || null,
        userId: userId || null,
        updatedAt: timestamp,
        ...(customTimestamp && { createdAt: timestamp }), // También actualizar createdAt si es manual
      })
      .where(eq(orders.id, id));

    // Marcar todos los items como entregados a mesa para que salgan de Dispatch/cocina
    await db
      .update(orderItems)
      .set({ deliveredToTable: true })
      .where(eq(orderItems.orderId, id));
    console.log(`✅ Todos los items de la orden ${id} marcados como deliveredToTable`);

    // Liberar mesa si aplica
    if (order.tableId) {
      await db
        .update(tables)
        .set({ status: "available", guestCount: 1 })
        .where(eq(tables.id, order.tableId));
      console.log(`✅ Mesa ${order.tableId} liberada`);
    }

    // Record cash register transaction
    const currentRegister = await db.query.cashRegisters.findFirst({
      where: eq(cashRegisters.status, "open"),
    });

    if (currentRegister) {
      await db.insert(cashRegisterTransactions).values({
        registerId: currentRegister.id,
        type: "sale",
        amount: newTotal.toString(),
        orderId: order.id,
        paymentMethod: paymentMethod || "cash",
        description: `Orden #${order.orderNumber}${tipAmount > 0 ? ` (propina: $${tipAmount.toFixed(2)})` : ''}`,
      });

      // Update register totals with correct payment method breakdown
      const updateData: Record<string, any> = {
        totalSales: sql`COALESCE(${cashRegisters.totalSales}, 0) + ${newTotal}`,
        totalOrders: sql`COALESCE(${cashRegisters.totalOrders}, 0) + 1`,
        totalTips: sql`COALESCE(${cashRegisters.totalTips}, 0) + ${tipAmount}`,
      };
      if (paymentMethod === "cash") {
        updateData.cashSales = sql`COALESCE(${cashRegisters.cashSales}, 0) + ${newTotal}`;
      } else if (paymentMethod === "transfer") {
        updateData.transferSales = sql`COALESCE(${cashRegisters.transferSales}, 0) + ${newTotal}`;
      } else if (paymentMethod === "terminal_mercadopago" || paymentMethod === "card") {
        updateData.terminalSales = sql`COALESCE(${cashRegisters.terminalSales}, 0) + ${newTotal}`;
      } else if (paymentMethod === "split") {
        // Split bills: total goes to cashSales as default (individual methods vary)
        updateData.cashSales = sql`COALESCE(${cashRegisters.cashSales}, 0) + ${newTotal}`;
      } else if (paymentMethod === "platform_delivery") {
        // Platform delivery: registrar en transferSales (ya que el dinero viene de la plataforma)
        updateData.transferSales = sql`COALESCE(${cashRegisters.transferSales}, 0) + ${newTotal}`;
      }
      
      // Track tips by method
      const finalTipMethod = tipPaymentMethod || paymentMethod || "cash";
      if (finalTipMethod === "cash") {
        updateData.cashTips = sql`COALESCE(${cashRegisters.cashTips}, 0) + ${tipAmount}`;
      } else if (finalTipMethod === "terminal_mercadopago" || finalTipMethod === "card") {
        updateData.cardTips = sql`COALESCE(${cashRegisters.cardTips}, 0) + ${tipAmount}`;
      } else if (finalTipMethod === "transfer") {
        updateData.transferTips = sql`COALESCE(${cashRegisters.transferTips}, 0) + ${tipAmount}`;
      }
      await db
        .update(cashRegisters)
        .set(updateData)
        .where(eq(cashRegisters.id, currentRegister.id));
    }

    // Re-fetch items after consolidation (includes items moved from siblings)
    const consolidatedItems = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });

    // Deduct inventory
    for (const item of consolidatedItems || []) {
      const recipe = await db.query.productIngredients.findMany({
        where: eq(productIngredients.productId, item.productId),
      });
      for (const r of recipe) {
        const deduction = parseFloat(r.quantityNeeded) * item.quantity;
        await db
          .update(ingredients)
          .set({
            currentStock: sql`GREATEST(0, CAST(${ingredients.currentStock} AS NUMERIC) - ${deduction})`,
            updatedAt: new Date(),
          })
          .where(eq(ingredients.id, r.ingredientId));
      }
    }

    // Handle loyalty stamps
    if (loyaltyCardId && loyaltyStamps > 0) {
      const card = await db.query.loyaltyCards.findFirst({
        where: eq(loyaltyCards.id, loyaltyCardId),
      });

      if (card) {
        const newStamps = card.stamps + loyaltyStamps;
        const newRewards = Math.floor(newStamps / card.stampsPerReward);
        const remainingStamps = newStamps % card.stampsPerReward;
        const additionalRewards = newRewards > 0 ? newRewards : 0;

        await db
          .update(loyaltyCards)
          .set({
            stamps: newRewards > 0 ? remainingStamps : newStamps,
            totalStamps: card.totalStamps + loyaltyStamps,
            rewardsAvailable: card.rewardsAvailable + additionalRewards,
            updatedAt: new Date(),
          })
          .where(eq(loyaltyCards.id, loyaltyCardId));

        await db.insert(loyaltyTransactions).values({
          cardId: loyaltyCardId,
          orderId: order.id,
          stampsAdded: loyaltyStamps,
        });

        // Push updates to Apple and Google wallets (non-blocking)
        const updatedCard = await db.query.loyaltyCards.findFirst({
          where: eq(loyaltyCards.id, loyaltyCardId),
        });
        if (updatedCard) {
          sendAppleWalletPush(loyaltyCardId).catch(console.error);
          createOrUpdateGoogleWalletObject(updatedCard).catch(console.error);
        }
      }
    }

    const updatedOrder = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });
    console.log(`[pay] DB updated. discountAmount=${updatedOrder?.discountAmount}, discountName=${updatedOrder?.discountName}`);

    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error("Error processing payment:", error);
    return NextResponse.json({ error: "Error processing payment" }, { status: 500 });
  }
}

async function createMercadoPagoPaymentIntent(order: {
  id: string;
  orderNumber: number;
  total: string;
}) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");
  }

  // Get the first active device
  const device = await db.query.mercadopagoDevices.findFirst({
    where: (d, { eq }) => eq(d.active, true),
  });

  if (!device) {
    throw new Error("No active Mercado Pago device found");
  }

  // Try to create payment intent
  const amount = Math.round(parseFloat(order.total) * 100);
  console.log(`[MP] Creating payment intent for device ${device.deviceId}, amount: ${amount} centavos (${order.total} pesos)`);
  
  const response = await fetch(
    `https://api.mercadopago.com/point/integration-api/devices/${device.deviceId}/payment-intents`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        additional_info: {
          external_reference: order.id,
          print_on_terminal: true,
        },
      }),
    }
  );
  
  console.log(`[MP] Payment intent response status: ${response.status}`);

  // If there's a queued intent (409), try to get and cancel it, then retry
  if (response.status === 409) {
    try {
      // Get current payment intents
      const listResponse = await fetch(
        `https://api.mercadopago.com/point/integration-api/devices/${device.deviceId}/payment-intents`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (listResponse.ok) {
        const intents = await listResponse.json();
        // Cancel any open/pending intents
        if (intents.payment_intents && intents.payment_intents.length > 0) {
          for (const intent of intents.payment_intents) {
            if (intent.state === 'OPEN' || intent.state === 'PROCESSING') {
              await fetch(
                `https://api.mercadopago.com/point/integration-api/devices/${device.deviceId}/payment-intents/${intent.id}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                }
              );
            }
          }
        }
      }

      // Retry creating the payment intent
      const retryResponse = await fetch(
        `https://api.mercadopago.com/point/integration-api/devices/${device.deviceId}/payment-intents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: Math.round(parseFloat(order.total) * 100),
            additional_info: {
              external_reference: order.id,
              print_on_terminal: true,
            },
          }),
        }
      );

      if (!retryResponse.ok) {
        const errorData = await retryResponse.text();
        throw new Error(`MP API error: ${retryResponse.status} - ${errorData}`);
      }

      console.log(`[MP] Retry successful, payment intent created`);
      return retryResponse.json();
    } catch (cancelError) {
      console.error("[MP] Error canceling previous intent:", cancelError);
      throw new Error("Hay un cobro pendiente en la terminal. Cancélalo desde la terminal e intenta de nuevo.");
    }
  }

  if (!response.ok) {
    const errorData = await response.text();
    console.error(`[MP] API Error ${response.status}:`, errorData);
    throw new Error(`MP API error: ${response.status} - ${errorData}`);
  }

  const result = await response.json();
  console.log(`[MP] Payment intent created successfully:`, result.id);
  return result;
}
