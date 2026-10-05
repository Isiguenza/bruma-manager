import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { handleInboundWhatsApp } from "../lib/whatsapp";

const router = Router();

// Tipos de mensaje entrante que cuentan como "el cliente escribió" (y merecen
// la auto-respuesta). Se ignoran reacciones, recibos, mensajes de sistema, etc.
const REPLYABLE_TYPES = new Set([
  "text", "image", "audio", "video", "document", "sticker", "voice", "button", "interactive", "location", "contacts",
]);

// --------------------------------------------------------------------------
// Bifurcación hacia Hermes (asistente en el server, ver CLAUDE.md)
// --------------------------------------------------------------------------
// Meta permite UN solo Callback URL por app para el campo `messages`, y ya es
// este endpoint. En vez de cedérselo a Hermes (lo que mataría la auto-respuesta
// a clientes), este handler reparte por remitente:
//   - número en HERMES_WA_OWNERS  → se reenvía el payload CRUDO a Hermes y NO
//     se auto-responde. Hermes contesta solo, por Graph API, con el mismo token.
//   - cualquier otro número       → auto-respuesta de siempre.
// Hermes valida `X-Hub-Signature-256` como HMAC-SHA256 del body crudo con su
// WHATSAPP_CLOUD_APP_SECRET, así que re-firmamos el salto local con el secreto
// compartido HERMES_WA_SHARED_SECRET (no es el App Secret real de Meta: ese
// nunca sale del dashboard, y este hop es loopback contra el host).
const onlyDigits = (s: string) => String(s ?? "").replace(/\D/g, "");

const hermesOwners = new Set(
  (process.env.HERMES_WA_OWNERS ?? "").split(",").map(onlyDigits).filter(Boolean)
);
const hermesWebhookUrl    = process.env.HERMES_WA_WEBHOOK_URL ?? "";
const hermesSharedSecret  = process.env.HERMES_WA_SHARED_SECRET ?? "";
const hermesEnabled       = Boolean(hermesOwners.size && hermesWebhookUrl && hermesSharedSecret);

function isHermesOwner(from: string): boolean {
  return hermesEnabled && hermesOwners.has(onlyDigits(from));
}

// El body se reenvía byte por byte: la firma es sobre los bytes crudos, así que
// re-serializar el JSON la invalidaría.
async function forwardToHermes(raw: Buffer): Promise<void> {
  const signature = crypto.createHmac("sha256", hermesSharedSecret).update(raw).digest("hex");
  const response = await fetch(hermesWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${signature}`,
    },
    body: new Uint8Array(raw),
  });
  if (!response.ok) {
    console.error(`❌ Hermes rechazó el webhook (${response.status}): ${await response.text().catch(() => "")}`);
  }
}

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

// POST /api/whatsapp/webhook — incoming events (delivery receipts, replies).
// Se monta en index.ts con express.raw ANTES de express.json: Hermes firma sobre
// el body crudo, así que hay que conservar los bytes originales.
export function whatsappWebhookHandler(req: Request, res: Response) {
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  let body: any = null;
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    console.warn("❌ WhatsApp webhook: body no es JSON válido");
  }

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
      let hasOwnerMessage = false;
      for (const m of value.messages) {
        console.log(`📱 WA message from ${m.from}: ${m.text?.body ?? m.type}`);
        if (isHermesOwner(m.from)) {
          // Es el dueño pidiéndole algo al asistente: lo atiende Hermes, no la
          // auto-respuesta de "este chat es solo para avisos".
          hasOwnerMessage = true;
          continue;
        }
        // El cliente respondió al mensaje de notificación → contestarle una
        // vez que este número no se atiende. Fire-and-forget: Meta espera un
        // 200 rápido, no bloqueamos por esto.
        if (REPLYABLE_TYPES.has(m.type) && m.from) {
          handleInboundWhatsApp(m.from).catch((e) =>
            console.error("Error en auto-respuesta de WhatsApp:", e)
          );
        }
      }
      // Hermes espera el sobre completo de Meta, así que se manda una sola vez
      // el payload crudo (su propio allowlist descarta lo que no le toca).
      if (hasOwnerMessage) {
        console.log(`🤖 Reenviando a Hermes (${value.messages.length} msg)`);
        forwardToHermes(raw).catch((e) =>
          console.error("Error reenviando webhook a Hermes:", e)
        );
      }
    }
  }
  res.sendStatus(200);
}

export default router;
