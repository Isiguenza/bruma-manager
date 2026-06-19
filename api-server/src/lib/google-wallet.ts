import jwt, { SignOptions } from "jsonwebtoken";
import path from "path";
import fs from "fs";

const GOOGLE_AUTH_URL = "https://oauth2.googleapis.com/token";
const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";

let cachedToken: { token: string; expiresAt: number } | null = null;
let sharpModule: any = null;

async function getSharp() {
  if (!sharpModule) {
    sharpModule = await import("sharp");
  }
  return sharpModule.default || sharpModule;
}

// Generate a stamp strip image showing filled/empty circles
async function generateStampImage(stamps: number, total: number): Promise<Buffer> {
  const sharp = await getSharp();
  const assetsPath = path.join(process.cwd(), "public", "pass-assets");

  const W = 750;
  const H = 180;
  const STAMP_SIZE = 70;
  const GAP = 20;

  const totalW = total * STAMP_SIZE + (total - 1) * GAP;
  const startX = Math.round((W - totalW) / 2);
  const startY = Math.round((H - STAMP_SIZE) / 2);

  const composites: any[] = [];

  const filledPath = path.join(assetsPath, "sello@2x.png");
  const emptyPath = path.join(assetsPath, "sello_vacio@2x.png");

  for (let i = 0; i < total; i++) {
    const isFilled = i < stamps;
    const imgPath = isFilled ? filledPath : emptyPath;
    if (fs.existsSync(imgPath)) {
      composites.push({
        input: imgPath,
        top: startY,
        left: startX + i * (STAMP_SIZE + GAP),
        blend: "over" as any,
      });
    }
  }

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

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

  const options: SignOptions = {
    algorithm: "RS256",
    issuer: clientEmail,
    subject: clientEmail,
    audience: GOOGLE_AUTH_URL,
    expiresIn: "1h",
  };
  const token = jwt.sign(
    { scope: "https://www.googleapis.com/auth/wallet_object.issuer" },
    privateKey,
    options
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

export function generateGoogleWalletSaveUrl(cardId: string): string {
  const serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing GOOGLE_WALLET_SERVICE_ACCOUNT_KEY");
  }

  const sa = JSON.parse(serviceAccountKey);
  const privateKey = sa.private_key.replace(/\\n/g, "\n");
  const clientEmail = sa.client_email;
  const objectId = buildObjectId(cardId);

  const claims = {
    iss: clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      loyaltyObjects: [{ id: objectId }],
    },
  };

  const token = jwt.sign(claims, privateKey, { algorithm: "RS256" } as SignOptions);
  return `https://pay.google.com/gp/v/save/${token}`;
}

export async function createOrUpdateGoogleWalletClass() {
  try {
    const accessToken = await getGoogleAccessToken();
    const classId = buildClassId();

    const loyaltyClass = {
      id: classId,
      issuerName: "BRUMA",
      programName: "Tarjeta de Lealtad BRUMA",
      programLogo: {
        sourceUri: {
          uri: "https://cdn.cocinabruma.com.mx/logo.png",
        },
        contentDescription: {
          defaultValue: {
            language: "es",
            value: "BRUMA Logo",
          },
        },
      },
      hexBackgroundColor: "#FFFFFF",
      hexPrimaryColor: "#e94560",
      reviewStatus: "UNDER_REVIEW",
      linksModuleData: {
        uris: [
          {
            uri: "https://cocinabruma.com.mx",
            description: "Visita BRUMA",
            id: "website",
          },
        ],
      },
    };

    const updateRes = await fetch(
      `${WALLET_API_BASE}/loyaltyClass/${encodeURIComponent(classId)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(loyaltyClass),
      }
    );

    if (updateRes.ok || updateRes.status === 200) {
      console.log("[API Google Wallet] Class updated:", classId);
      return;
    }

    if (updateRes.status === 404) {
      const createRes = await fetch(`${WALLET_API_BASE}/loyaltyClass`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(loyaltyClass),
      });

      if (!createRes.ok) {
        const body = await createRes.text();
        throw new Error(`Google Wallet class create failed: ${createRes.status} ${body}`);
      }

      console.log("[API Google Wallet] Class created:", classId);
      return;
    }

    const body = await updateRes.text();
    throw new Error(`Google Wallet class update failed: ${updateRes.status} ${body}`);
  } catch (error) {
    console.error("[API Google Wallet] Class error:", error);
  }
}

// AWS Signature V4 helpers for R2 (S3-compatible)
function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string) {
  const crypto = require("crypto");
  const kDate = crypto.createHmac("sha256", "AWS4" + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  return kSigning;
}

async function uploadStampToR2(buffer: Buffer, cardId: string): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrlBase = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretKey || !bucket || !publicUrlBase) {
    throw new Error("Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL");
  }

  const key = `bruma-stamps/${cardId}.png`;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}/${bucket}/${key}`;

  const crypto = require("crypto");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");

  const headers: Record<string, string> = {
    "host": host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": "image/png",
  };

  const sortedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaders.map((k) => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = sortedHeaders.join(";");

  const canonicalRequest = [
    "PUT",
    `/${bucket}/${key}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(secretKey, dateStamp, "auto", "s3");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: authHeader,
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`R2 upload failed: ${res.status} ${body}`);
  }

  // Return public URL
  return `${publicUrlBase}/${key}`;
}

export async function createOrUpdateGoogleWalletObject(card: any) {
  try {
    await createOrUpdateGoogleWalletClass();

    // Generate and upload stamp image
    let stampImageUrl: string | undefined;
    try {
      const stampBuffer = await generateStampImage(card.stamps || 0, card.totalStamps || 10);
      stampImageUrl = await uploadStampToR2(stampBuffer, card.id);
      console.log("[API Google Wallet] Stamp image uploaded:", stampImageUrl);
    } catch (imgError) {
      console.error("[API Google Wallet] Stamp image error (continuing without):", imgError);
    }

    const accessToken = await getGoogleAccessToken();
    const classId = buildClassId();
    const objectId = buildObjectId(card.id);

    const loyaltyObject: any = {
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
      secondaryLoyaltyPoints: {
        balance: { string: `${card.customerName} ${card.customerLastName || ""}`.trim() },
        label: "Cliente",
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
        {
          header: "Último mensaje",
          body: card.latestMessage || "Sin mensajes recientes",
          id: "latest_message",
        },
      ],
      linksModuleData: {
        uris: [
          {
            uri: "https://cocinabruma.com.mx",
            description: "Visita BRUMA",
            id: "website",
          },
        ],
      },
    };

    if (stampImageUrl) {
      loyaltyObject.heroImage = {
        sourceUri: {
          uri: stampImageUrl,
        },
        contentDescription: {
          defaultValue: {
            language: "es",
            value: "Sellos BRUMA",
          },
        },
      };
    }

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
