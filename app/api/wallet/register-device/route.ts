import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { walletDeviceRegistrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Manual device registration endpoint
// Called from the loyalty card web page to register the device for push updates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serialNumber, pushToken, deviceLibraryId, passTypeId } = body;

    if (!serialNumber || !pushToken) {
      return NextResponse.json(
        { error: "Missing serialNumber or pushToken" },
        { status: 400 }
      );
    }

    const finalDeviceId = deviceLibraryId || `web-${Date.now()}`;
    const finalPassTypeId = passTypeId || "pass.com.bruma.loyalty";

    // Check if already registered
    const existing = await db.query.walletDeviceRegistrations.findFirst({
      where: and(
        eq(walletDeviceRegistrations.serialNumber, serialNumber),
        eq(walletDeviceRegistrations.pushToken, pushToken)
      ),
    });

    if (existing) {
      return NextResponse.json({ registered: true, message: "Already registered" });
    }

    await db.insert(walletDeviceRegistrations).values({
      deviceLibraryId: finalDeviceId,
      passTypeId: finalPassTypeId,
      serialNumber,
      pushToken,
    });

    console.log("[Apple Wallet] Device registered manually:", {
      deviceLibraryId: finalDeviceId,
      serialNumber,
    });

    return NextResponse.json({ registered: true, message: "Registered successfully" });
  } catch (error) {
    console.error("[Apple Wallet] Error in manual registration:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
