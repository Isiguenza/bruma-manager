import jwt from "jsonwebtoken";

const GOOGLE_AUTH_URL = "https://oauth2.googleapis.com/token";
const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60 * 1000) {
    return cachedToken.token;
  }

  const serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing GOOGLE_WALLET_SERVICE_ACCOUNT_KEY");
  }

  const sa = JSON.parse(serviceAccountKey);
  const privateKey = sa.private_key.replace(/\\n/g, "\n");
  const clientEmail = sa.client_email;

  const token = jwt.sign(
    { scope: "https://www.googleapis.com/auth/wallet_object.issuer" },
    privateKey,
    {
      algorithm: "RS256",
      header: { typ: "JWT" },
      issuer: clientEmail,
      subject: clientEmail,
      audience: GOOGLE_AUTH_URL,
      expiresIn: "1h",
    }
  );

  const res = await fetch(GOOGLE_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google auth failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

function buildClassId(): string {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  if (!issuerId || !classId) {
    throw new Error("Missing Google Wallet class config");
  }
  return `${issuerId}.${classId}`;
}

function buildObjectId(cardId: string): string {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID;
  if (!issuerId || !classId) {
    throw new Error("Missing Google Wallet class config");
  }
  return `${issuerId}.${classId}.${cardId}`;
}

export async function createOrUpdateGoogleWalletObject(card: any) {
  try {
    const accessToken = await getGoogleAccessToken();
    const classId = buildClassId();
    const objectId = buildObjectId(card.id);

    const loyaltyObject = {
      id: objectId,
      classId,
      state: "active",
      accountId: card.barcodeValue,
      accountName: `${card.customerName} ${card.customerLastName || ""}`.trim(),
      barcode: {
        type: "QR_CODE",
        value: card.barcodeValue,
        alternateText: card.barcodeValue,
      },
      loyaltyPoints: {
        balance: { int: card.stamps },
        label: "Sellos",
      },
      textModulesData: [
        {
          header: "Premios Disponibles",
          body: String(card.rewardsAvailable),
          id: "rewards",
        },
        {
          header: "Total Sellos",
          body: String(card.totalStamps),
          id: "total_stamps",
        },
      ],
    };

    const updateRes = await fetch(
      `${WALLET_API_BASE}/loyaltyObject/${objectId}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(loyaltyObject),
      }
    );

    if (updateRes.ok || updateRes.status === 200) {
      console.log("[API Google Wallet] Object updated:", objectId);
      return;
    }

    if (updateRes.status === 404) {
      const createRes = await fetch(`${WALLET_API_BASE}/loyaltyObject`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(loyaltyObject),
      });

      if (!createRes.ok) {
        const body = await createRes.text();
        throw new Error(
          `Google Wallet create failed: ${createRes.status} ${body}`
        );
      }

      console.log("[API Google Wallet] Object created:", objectId);
      return;
    }

    const body = await updateRes.text();
    throw new Error(`Google Wallet update failed: ${updateRes.status} ${body}`);
  } catch (error) {
    console.error("[API Google Wallet] Error:", error);
  }
}
