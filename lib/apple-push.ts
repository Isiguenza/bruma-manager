import { SignJWT } from "jose";
import { db } from "./db";
import { walletDeviceRegistrations } from "./db/schema";
import { eq } from "drizzle-orm";

const APN_URL = "https://api.push.apple.com";
const APN_DEV_URL = "https://api.sandbox.push.apple.com";

function getApnPrivateKey(): string {
  const key = process.env.APPLE_APN_PRIVATE_KEY || "";
  return key.replace(/\\n/g, "\n");
}

async function generateApnToken(): Promise<string> {
  const keyId = process.env.APPLE_APN_KEY_ID;
  const teamId = process.env.APPLE_APN_TEAM_ID;
  const privateKey = getApnPrivateKey();

  if (!keyId || !teamId || !privateKey) {
    throw new Error("Missing Apple APN credentials");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "pkcs8",
    encoder.encode(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  return token;
}

export async function sendAppleWalletPush(serialNumber: string) {
  try {
    const registrations = await db.query.walletDeviceRegistrations.findMany({
      where: eq(walletDeviceRegistrations.serialNumber, serialNumber),
    });

    if (registrations.length === 0) {
      console.log("[Apple Push] No registered devices for", serialNumber);
      return;
    }

    const jwt = await generateApnToken();
    const passTypeId = process.env.APPLE_PASS_TYPE_ID || "";

    const results = await Promise.allSettled(
      registrations.map(async (reg) => {
        if (!reg.pushToken) return;

        const url = `${APN_URL}/3/device/${reg.pushToken}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": passTypeId,
            "apns-push-type": "background",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[Apple Push] Failed for ${reg.pushToken}:`,
            res.status,
            body
          );
        } else {
          console.log(`[Apple Push] Sent to ${reg.pushToken}`);
        }
      })
    );

    const sent = results.filter(
      (r) => r.status === "fulfilled"
    ).length;
    console.log(`[Apple Push] Sent to ${sent}/${registrations.length} devices`);
  } catch (error) {
    console.error("[Apple Push] Error:", error);
  }
}
