import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { walletDeviceRegistrations, loyaltyCards } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// Get serial numbers for passes associated with a device
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      deviceLibraryId: string;
      passTypeId: string;
    }>;
  }
) {
  const { deviceLibraryId, passTypeId } = await params;
  const { searchParams } = new URL(request.url);
  const passesUpdatedSince = searchParams.get("passesUpdatedSince");

  console.log("[Apple Wallet] GET list passes:", {
    deviceLibraryId,
    passTypeId,
    passesUpdatedSince,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    const registrations = await db.query.walletDeviceRegistrations.findMany({
      where: and(
        eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
        eq(walletDeviceRegistrations.passTypeId, passTypeId)
      ),
    });

    if (registrations.length === 0) {
      console.log("[Apple Wallet] No registrations found for device:", deviceLibraryId);
      return new NextResponse(null, { status: 204 });
    }

    const serialNumbers: string[] = [];
    let lastUpdated = new Date(0);

    for (const reg of registrations) {
      const card = await db.query.loyaltyCards.findFirst({
        where: eq(loyaltyCards.id, reg.serialNumber),
      });

      if (!card) continue;

      // If passesUpdatedSince is provided, only include updated passes
      if (passesUpdatedSince) {
        const since = new Date(passesUpdatedSince);
        if (card.updatedAt <= since) continue;
      }

      serialNumbers.push(reg.serialNumber);
      if (card.updatedAt > lastUpdated) {
        lastUpdated = card.updatedAt;
      }
    }

    if (serialNumbers.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({
      serialNumbers,
      lastUpdated: lastUpdated.toISOString(),
    });
  } catch (error) {
    console.error("Error getting serial numbers:", error);
    return new NextResponse(null, { status: 500 });
  }
}
