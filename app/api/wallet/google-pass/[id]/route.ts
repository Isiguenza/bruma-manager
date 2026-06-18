import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT, importPKCS8 } from "jose";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const key = await importPKCS8(privateKey, "RS256");

    const fullClassId = `${issuerId}.${classId}`;
    const objectId = `${fullClassId}.${card.id}`;

    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const jwt = await new SignJWT({
      aud: "google",
      iss: clientEmail,
      sub: clientEmail,
      iat: Math.floor(Date.now() / 1000),
      typ: "savetowallet",
      origins: [origin],
      payload: {
        loyaltyObjects: [
          {
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
              balance: {
                int: card.stamps,
              },
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
          },
        ],
      },
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience("google")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    return NextResponse.json({ saveUrl });
  } catch (error) {
    console.error("Error generating Google Wallet pass:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
