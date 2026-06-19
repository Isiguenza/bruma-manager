import apn from "apn";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

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

    // 1. Background push: tells Apple Wallet to update the pass silently
    const backgroundNotif = new apn.Notification();
    backgroundNotif.topic = passTypeId;
    backgroundNotif.contentAvailable = true;

    const bgResult = await provider.send(backgroundNotif, tokens);
    console.log(`[API Apple Push] Background sent: ${bgResult.sent.length}`);
    if (bgResult.failed.length > 0) {
      for (const fail of bgResult.failed) {
        console.error(
          `[API Apple Push] BACKGROUND FAILED for ${fail.device?.substring(0, 16)}...`,
          "Response:", fail.response,
          "Status:", fail.status
        );
      }
    }

    // 2. Alert push: visible notification to the user
    const alertNotif = new apn.Notification();
    alertNotif.topic = passTypeId;
    alertNotif.alert = {
      title: "Nuevo sello en Bruma",
      body: "¡Acabas de recibir un sello en tu tarjeta de lealtad!",
    };
    alertNotif.sound = "default";

    const alertResult = await provider.send(alertNotif, tokens);
    console.log(`[API Apple Push] Alert sent: ${alertResult.sent.length}`);
    if (alertResult.failed.length > 0) {
      for (const fail of alertResult.failed) {
        console.error(
          `[API Apple Push] ALERT FAILED for ${fail.device?.substring(0, 16)}...`,
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
