import { Router } from "express";
import Stripe from "stripe";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { requireClerkAuth } from "../lib/clerkAuth";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as any,
});

/** Busca o crea (una sola vez) el Stripe Customer ligado a esta cuenta de Clerk. */
export async function getOrCreateStripeCustomer(clerkUserId: string, email: string): Promise<string> {
  const existing = await db.query.customerStripeAccounts.findFirst({
    where: eq(schema.customerStripeAccounts.clerkUserId, clerkUserId),
  });
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({ email });
  await db.insert(schema.customerStripeAccounts).values({
    clerkUserId,
    stripeCustomerId: customer.id,
  });
  return customer.id;
}

// POST /api/public/payment-methods/setup-intent
// Prepara el guardado de una tarjeta nueva (sin cobrar nada) — el frontend
// confirma esto con Stripe PaymentElement en modo SetupIntent.
router.post("/public/payment-methods/setup-intent", requireClerkAuth, async (req, res) => {
  try {
    const stripeCustomerId = await getOrCreateStripeCustomer(req.clerkUserId!, req.clerkEmail!);
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error("[payment-methods/setup-intent] error:", error);
    res.status(500).json({ error: "Error al preparar el guardado de tarjeta" });
  }
});

// GET /api/public/payment-methods — tarjetas guardadas del usuario logueado.
router.get("/public/payment-methods", requireClerkAuth, async (req, res) => {
  try {
    const account = await db.query.customerStripeAccounts.findFirst({
      where: eq(schema.customerStripeAccounts.clerkUserId, req.clerkUserId!),
    });
    if (!account) return res.json([]);

    const methods = await stripe.paymentMethods.list({ customer: account.stripeCustomerId, type: "card" });
    res.json(
      methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "card",
        last4: pm.card?.last4 ?? "----",
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
      }))
    );
  } catch (error) {
    console.error("[payment-methods] GET error:", error);
    res.status(500).json({ error: "Error al obtener tus tarjetas" });
  }
});

// DELETE /api/public/payment-methods/:id
router.delete("/public/payment-methods/:id", requireClerkAuth, async (req, res) => {
  try {
    const account = await db.query.customerStripeAccounts.findFirst({
      where: eq(schema.customerStripeAccounts.clerkUserId, req.clerkUserId!),
    });
    if (!account) return res.status(404).json({ error: "No tienes tarjetas guardadas" });

    // Verifica que la tarjeta sea de este customer antes de desasociarla —
    // evita que alguien borre/detach una tarjeta ajena (IDOR).
    const pm = await stripe.paymentMethods.retrieve(req.params.id);
    if (pm.customer !== account.stripeCustomerId) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }
    await stripe.paymentMethods.detach(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("[payment-methods] DELETE error:", error);
    res.status(500).json({ error: "Error al borrar la tarjeta" });
  }
});

export default router;
