import { Router } from "express";

const router = Router();

// GET /api/whatsapp/webhook — Meta verification handshake
router.get("/whatsapp/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WA_VERIFY_TOKEN) {
    console.log("✅ WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("❌ WhatsApp webhook verification failed");
    res.sendStatus(403);
  }
});

// POST /api/whatsapp/webhook — incoming events (delivery receipts, replies)
router.post("/whatsapp/webhook", (req, res) => {
  const body = req.body;
  if (body?.object === "whatsapp_business_account") {
    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (value?.statuses) {
      for (const s of value.statuses) {
        console.log(`📱 WA status: ${s.id} → ${s.status}`);
      }
    }
    if (value?.messages) {
      for (const m of value.messages) {
        console.log(`📱 WA message from ${m.from}: ${m.text?.body ?? m.type}`);
      }
    }
  }
  res.sendStatus(200);
});

export default router;
