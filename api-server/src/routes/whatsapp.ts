import { Router } from "express";
import { handleInboundWhatsApp } from "../lib/whatsapp";

const router = Router();

// Tipos de mensaje entrante que cuentan como "el cliente escribió" (y merecen
// la auto-respuesta). Se ignoran reacciones, recibos, mensajes de sistema, etc.
const REPLYABLE_TYPES = new Set([
  "text", "image", "audio", "video", "document", "sticker", "voice", "button", "interactive", "location", "contacts",
]);

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
        // El cliente respondió al mensaje de notificación → contestarle una
        // vez que este número no se atiende. Fire-and-forget: Meta espera un
        // 200 rápido, no bloqueamos por esto.
        if (REPLYABLE_TYPES.has(m.type) && m.from) {
          handleInboundWhatsApp(m.from).catch((e) =>
            console.error("Error en auto-respuesta de WhatsApp:", e)
          );
        }
      }
    }
  }
  res.sendStatus(200);
});

export default router;
