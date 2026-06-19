import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Apple Wallet calls this endpoint to get the updated pass
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      passTypeId: string;
      serialNumber: string;
    }>;
  }
) {
  const { passTypeId, serialNumber } = await params;

  console.log("[Apple Wallet] GET updated pass:", {
    passTypeId,
    serialNumber,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    const card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, serialNumber),
    });

    if (!card) {
      console.log("[Apple Wallet] Card not found:", serialNumber);
      return new NextResponse(null, { status: 404 });
    }

    // Redirect to the pass generation endpoint
    const passUrl = `${request.nextUrl.origin}/api/wallet/pass/${serialNumber}`;
    console.log("[Apple Wallet] Redirecting to pass URL:", passUrl);

    const passRes = await fetch(passUrl);
    if (!passRes.ok) {
      console.error("[Apple Wallet] Failed to generate pass:", passRes.status);
      return new NextResponse(null, { status: 500 });
    }

    const buffer = await passRes.arrayBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="bruma-${card.barcodeValue}.pkpass"`,
      },
    });
  } catch (error) {
    console.error("[Apple Wallet] Error getting updated pass:", error);
    return new NextResponse(null, { status: 500 });
  }
}
