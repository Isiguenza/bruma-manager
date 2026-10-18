import apn from "apn";
import { db, schema } from "../db";
import { eq, inArray } from "drizzle-orm";

function getApnPrivateKey(): string {
  const key = process.env.APPLE_APN_PRIVATE_KEY || "";
  return key.replace(/\\n/g, "\n");
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

    if (!keyId || !teamId || !privateKey || !passTypeId) {
      console.error("[API Apple Push] MISSING credentials — aborting push");
      return;
    }

    const provider = new apn.Provider({
      token: {
        key: privateKey,
        keyId,
        teamId,
      },
      production: process.env.APPLE_APN_SANDBOX !== "true",
    });

    const tokens = registrations
      .filter((r) => r.pushToken)
      .map((r) => r.pushToken!);

    console.log(`[API Apple Push] Sending to ${tokens.length} devices via apn (HTTP/2)`);

    // Background push: tells Apple Wallet to update the pass
    const notification = new apn.Notification();
    notification.topic = passTypeId;
    notification.contentAvailable = true;

    const result = await provider.send(notification, tokens);
    console.log(`[API Apple Push] Sent: ${result.sent.length}`);
    if (result.failed.length > 0) {
      for (const fail of result.failed) {
        console.error(
          `[API Apple Push] FAILED for ${fail.device?.substring(0, 16)}...`,
          "Response:", fail.response,
          "Status:", fail.status
        );
      }
    }

    provider.shutdown();
  } catch (error) {
    console.error("[API Apple Push] Error:", error);
  }
}

// Push to every registered device at once (one APNs connection), or only the
// devices holding `serialNumbers`. Used after a design change: each Wallet then
// asks which passes changed since its last sync, so the cards' updatedAt must
// be bumped BEFORE calling this.
export async function sendAppleWalletPushToAll(
  serialNumbers?: string[]
): Promise<{ devices: number; sent: number; failed: number }> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID || "";
  const keyId = process.env.APPLE_APN_KEY_ID;
  const teamId = process.env.APPLE_APN_TEAM_ID;
  const privateKey = getApnPrivateKey();

  if (!keyId || !teamId || !privateKey || !passTypeId) {
    throw new Error("Apple Wallet push not configured");
  }

  const registrations = await db.query.walletDeviceRegistrations.findMany({
    where: serialNumbers ? inArray(schema.walletDeviceRegistrations.serialNumber, serialNumbers) : undefined,
  });
  const tokens = [...new Set(registrations.map((r) => r.pushToken).filter((t): t is string => !!t))];
  if (tokens.length === 0) return { devices: 0, sent: 0, failed: 0 };

  const provider = new apn.Provider({
    token: { key: privateKey, keyId, teamId },
    production: process.env.APPLE_APN_SANDBOX !== "true",
  });

  try {
    const notification = new apn.Notification();
    notification.topic = passTypeId;
    notification.contentAvailable = true;

    const result = await provider.send(notification, tokens);
    console.log(`[API Apple Push] Bulk: ${result.sent.length} sent, ${result.failed.length} failed`);
    return { devices: tokens.length, sent: result.sent.length, failed: result.failed.length };
  } finally {
    provider.shutdown();
  }
}
