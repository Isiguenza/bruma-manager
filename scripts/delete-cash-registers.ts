import { db } from "../lib/db/index";
import { eq, inArray } from "drizzle-orm";
import {
  cashRegisters,
  orders,
  cashRegisterTransactions,
  salesHistory,
  loyaltyTransactions,
  deliveryOrders,
} from "../lib/db/schema";

const CASH_REGISTER_IDS = [
  "3f61131d-5b16-42a1-aca4-bbc6f29c84e9",
  "26e3b401-4867-47f3-bc79-6ebf15b1be22",
];

async function deleteCashRegisters() {
  console.log("🔍 Buscando órdenes asociadas a las cajas...");

  const relatedOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(inArray(orders.cashRegisterId, CASH_REGISTER_IDS));

  const orderIds = relatedOrders.map((o) => o.id);
  console.log(`   ${orderIds.length} órdenes encontradas`);

  if (orderIds.length > 0) {
    // 1) loyaltyTransactions
    const lt = await db
      .delete(loyaltyTransactions)
      .where(inArray(loyaltyTransactions.orderId, orderIds));
    console.log(`   loyaltyTransactions borradas: ${lt.rowCount}`);

    // 2) deliveryOrders
    const do_ = await db
      .delete(deliveryOrders)
      .where(inArray(deliveryOrders.orderId, orderIds));
    console.log(`   deliveryOrders borradas: ${do_.rowCount}`);

    // 3) cashRegisterTransactions con orderId
    const crt = await db
      .delete(cashRegisterTransactions)
      .where(inArray(cashRegisterTransactions.orderId, orderIds));
    console.log(`   cashRegisterTransactions (por orderId) borradas: ${crt.rowCount}`);

    // 4) orders (orderItems y orderPayments se borran en cascade)
    const o = await db
      .delete(orders)
      .where(inArray(orders.cashRegisterId, CASH_REGISTER_IDS));
    console.log(`   orders borradas: ${o.rowCount}`);
  }

  // 5) salesHistory por cashRegisterId
  const sh = await db
    .delete(salesHistory)
    .where(inArray(salesHistory.cashRegisterId, CASH_REGISTER_IDS));
  console.log(`   salesHistory borradas: ${sh.rowCount}`);

  // 6) cashRegisterTransactions restantes por registerId
  const crt2 = await db
    .delete(cashRegisterTransactions)
    .where(inArray(cashRegisterTransactions.registerId, CASH_REGISTER_IDS));
  console.log(`   cashRegisterTransactions (por registerId) borradas: ${crt2.rowCount}`);

  // 7) cashRegisters
  const cr = await db
    .delete(cashRegisters)
    .where(inArray(cashRegisters.id, CASH_REGISTER_IDS));
  console.log(`   cashRegisters borradas: ${cr.rowCount}`);

  console.log("✅ Listo");
  process.exit(0);
}

deleteCashRegisters().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
