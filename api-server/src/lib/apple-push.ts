import jwt from "jsonwebtoken";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const APN_URL = "https://api.push.apple.com";

function getApnPrivateKey(): string {
  const key = process.env.APPLE_APN_PRIVATE_KEY || "";
  return key.replace(/\\n/g, "\n");
}

function generateApnToken(): string {
  const keyId = process.env.APPLE_APN_KEY_ID;
  const teamId = process.env.APPLE_APN_TEAM_ID;
  const privateKey = getApnPrivateKey();

  if (!keyId || !teamId || !privateKey) {
    throw new Error("Missing Apple APN credentials");
  }

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    header: { kid: keyId, typ: "JWT" },
    issuer: teamId,
    expiresIn: "1h",
  });
}

export async function sendAppleWalletPush(serialNumber: string) {
  try {
    const registrations = await db.query.walletDeviceRegistrations.findMany({
      where: eq(schema.walletDeviceRegistrations.serialNumber, serialNumber),
    });

    if (registrations.length === 0) {
      console.log("[API Apple Push] No registered devices for", serialNumber);
      return;
    }

    const token = generateApnToken();
    const passTypeId = process.env.APPLE_PASS_TYPE_ID || "";

    let sent = 0;
    await Promise.allSettled(
      registrations.map(async (reg) => {
        if (!reg.pushToken) return;
        const url = `${APN_URL}/3/device/${reg.pushToken}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `bearer ${token}`,
            "apns-topic": passTypeId,
            "apns-push-type": "background",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[API Apple Push] Failed for ${reg.pushToken}:`,
            res.status,
            body
          );
        } else {
          sent++;
          console.log(`[API Apple Push] Sent to ${reg.pushToken}`);
        }
      })
    );

    console.log(`[API Apple Push] Sent to ${sent}/${registrations.length} devices`);
  } catch (error) {
    console.error("[API Apple Push] Error:", error);
  }
}
