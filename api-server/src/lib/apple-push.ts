import jwt from "jsonwebtoken";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const APN_URL = process.env.APPLE_APN_SANDBOX === "true"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

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
    header: { alg: "ES256", kid: keyId, typ: "JWT" },
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

    const passTypeId = process.env.APPLE_PASS_TYPE_ID || "";
    const keyId = process.env.APPLE_APN_KEY_ID;
    const teamId = process.env.APPLE_APN_TEAM_ID;
    const privateKey = getApnPrivateKey();

    console.log(`[API Apple Push] APPLE_PASS_TYPE_ID: ${passTypeId || "MISSING"}`);
    console.log(`[API Apple Push] APPLE_APN_KEY_ID: ${keyId || "MISSING"}`);
    console.log(`[API Apple Push] APPLE_APN_TEAM_ID: ${teamId || "MISSING"}`);
    console.log(`[API Apple Push] Private key length: ${privateKey.length}`);
    console.log(`[API Apple Push] Private key starts with: ${privateKey.substring(0, 40)}...`);

    if (!keyId || !teamId || !privateKey || !passTypeId) {
      console.error("[API Apple Push] MISSING credentials — aborting push");
      return;
    }

    const token = generateApnToken();

    console.log(`[API Apple Push] Using APN URL: ${APN_URL}`);
    console.log(`[API Apple Push] Pass type: ${passTypeId}`);
    console.log(`[API Apple Push] Token preview: ${token.substring(0, 20)}...`);

    let sent = 0;
    const results = await Promise.allSettled(
      registrations.map(async (reg) => {
        if (!reg.pushToken) {
          console.log("[API Apple Push] Skipping empty pushToken");
          return "skipped";
        }
        const url = `${APN_URL}/3/device/${reg.pushToken}`;
        console.log(`[API Apple Push] Sending to: ${url}`);
        try {
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
              `[API Apple Push] FAILED HTTP ${res.status} for token ${reg.pushToken.substring(0, 16)}...`,
              "Body:", body
            );
            return "failed";
          }
          sent++;
          console.log(`[API Apple Push] SUCCESS for token ${reg.pushToken.substring(0, 16)}...`);
          return "success";
        } catch (err: any) {
          console.error(
            `[API Apple Push] NETWORK ERROR for token ${reg.pushToken.substring(0, 16)}...`,
            "Type:", err.name,
            "Message:", err.message,
            "Code:", err.code,
            "Cause:", err.cause?.message || err.cause || "N/A"
          );
          if (err.stack) {
            console.error("[API Apple Push] Stack:", err.stack.split("\n").slice(0, 3).join("\n"));
          }
          return "error";
        }
      })
    );

    console.log("[API Apple Push] Per-device results:", results.map((r, i) => ({
      token: registrations[i]?.pushToken?.substring(0, 16),
      status: r.status,
      value: r.status === "fulfilled" ? (r.value as string) : undefined,
      reason: r.status === "rejected" ? String(r.reason) : undefined,
    })));

    console.log(`[API Apple Push] RESULT: ${sent}/${registrations.length} devices OK`);
  } catch (error) {
    console.error("[API Apple Push] Error:", error);
  }
}
