import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT, importPKCS8 } from "jose";

const GOOGLE_AUTH_URL = "https://oauth2.googleapis.com/token";
const WALLET_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";

async function getGoogleAccessToken(sa: any): Promise<string> {
  const privateKey = sa.private_key.replace(/\\n/g, "\n");
  const clientEmail = sa.client_email;

  const key = await importPKCS8(privateKey, "RS256");

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience(GOOGLE_AUTH_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(GOOGLE_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google auth failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const debug = request.nextUrl.searchParams.get("debug") === "1";

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, id),
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const classId = process.env.GOOGLE_WALLET_CLASS_ID;

    if (!serviceAccountKey || !issuerId || !classId) {
      return NextResponse.json(
        { error: "Google Wallet not configured" },
        { status: 500 }
      );
    }

    const sa = JSON.parse(serviceAccountKey);
    const privateKey = sa.private_key.replace(/\\n/g, "\n");
    const clientEmail = sa.client_email;

    const fullClassId = `${issuerId}.${classId}`;
    const objectId = `${fullClassId}.${card.id}`;
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const loyaltyObject = {
      id: objectId,
      classId: fullClassId,
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
          header: "Recompensas Disponibles",
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

    // If debug mode, return the exact JSON payload for Google validation console
    if (debug) {
      const jwtPayload = {
        iss: clientEmail,
        aud: "google",
        iat: Math.floor(Date.now() / 1000),
        typ: "savetowallet",
        origins: [origin],
        payload: {
          loyaltyObjects: [loyaltyObject],
        },
      };
      return NextResponse.json({
        message: "Copia este JSON y pegalo en la consola de validacion de Google Wallet",
        objectId,
        classId: fullClassId,
        origin,
        clientEmail,
        loyaltyObject,
        jwtPayload,
      });
    }

    console.log("[Google Wallet] Using client_email:", clientEmail);
    console.log("[Google Wallet] Issuer ID:", issuerId);
    console.log("[Google Wallet] Class ID:", classId);
    console.log("[Google Wallet] Full classId:", fullClassId);
    console.log("[Google Wallet] Origin:", origin);
    console.log("[Google Wallet] Private key starts with:", privateKey.substring(0, 50));

    const key = await importPKCS8(privateKey, "RS256");

    // Step 1: Verify API access by getting an access token
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(sa);
      console.log("[Google Wallet] API access token obtained successfully");
    } catch (authErr) {
      console.error("[Google Wallet] Auth failed:", authErr);
      return NextResponse.json(
        {
          error: "Google Wallet auth failed",
          details:
            "La Service Account no puede autenticar. Verifica que: 1) Wallet API este activada en Google Cloud, 2) La service account tenga permisos, 3) El JSON de la service account sea valido.",
        },
        { status: 500 }
      );
    }

    // Step 1.5: Check if class exists
    try {
      const classRes = await fetch(`${WALLET_API_BASE}/loyaltyClass/${fullClassId}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      console.log("[Google Wallet] Class check status:", classRes.status);
      if (!classRes.ok) {
        const classBody = await classRes.text();
        console.error("[Google Wallet] Class not found:", classBody);
        return NextResponse.json(
          {
            error: "Google Wallet class not found",
            details: `La clase ${fullClassId} no existe. Crealo primero en la Google Pay & Wallet Console.`,
          },
          { status: 500 }
        );
      }
    } catch (classErr) {
      console.error("[Google Wallet] Class check error:", classErr);
    }

    // Step 2: Create/update the loyalty object via API first
    try {
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

      if (updateRes.ok) {
        console.log("[Google Wallet] Object updated:", objectId);
      } else if (updateRes.status === 404) {
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
          console.error("[Google Wallet] Create failed:", createRes.status, body);
          return NextResponse.json(
            {
              error: "Google Wallet object creation failed",
              details: `Status ${createRes.status}: ${body}`,
            },
            { status: 500 }
          );
        }
        console.log("[Google Wallet] Object created:", objectId);
      } else {
        const body = await updateRes.text();
        console.error("[Google Wallet] Update failed:", updateRes.status, body);
        return NextResponse.json(
          {
            error: "Google Wallet object update failed",
            details: `Status ${updateRes.status}: ${body}`,
          },
          { status: 500 }
        );
      }
    } catch (apiErr) {
      console.error("[Google Wallet] API error:", apiErr);
      return NextResponse.json(
        { error: "Google Wallet API error", details: String(apiErr) },
        { status: 500 }
      );
    }

    // Step 3: Generate the save-to-wallet JWT following Google spec exactly
    // See: https://developers.google.com/wallet/generic/resources/savetoandroidpay
    const saveJwt = await new SignJWT({
      iss: clientEmail,
      aud: "google",
      iat: Math.floor(Date.now() / 1000),
      typ: "savetowallet",
      origins: [origin],
      payload: {
        loyaltyObjects: [
          {
            id: objectId,
            classId: fullClassId,
          },
        ],
      },
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setExpirationTime("1h")
      .sign(key);

    const saveUrl = `https://pay.google.com/gp/v/save/${saveJwt}`;

    console.log("[Google Wallet] Save URL generated:", saveUrl.substring(0, 100) + "...");

    return NextResponse.json({ saveUrl });
  } catch (error) {
    console.error("Error generating Google Wallet pass:", error);
    return NextResponse.json(
      { error: "Error", details: String(error) },
      { status: 500 }
    );
  }
}
