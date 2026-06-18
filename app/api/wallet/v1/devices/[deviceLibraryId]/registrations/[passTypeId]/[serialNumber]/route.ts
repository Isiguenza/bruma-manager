import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { walletDeviceRegistrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// Register a device for push notifications for a pass
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      deviceLibraryId: string;
      passTypeId: string;
      serialNumber: string;
    }>;
  }
) {
  const { deviceLibraryId, passTypeId, serialNumber } = await params;

  console.log("[Apple Wallet] Device registration attempt:", {
    deviceLibraryId,
    passTypeId,
    serialNumber,
    url: request.url,
  });

  // Verify auth token
  const authHeader = request.headers.get("Authorization");
  console.log("[Apple Wallet] Auth header:", authHeader ? authHeader.substring(0, 30) + "..." : "missing");

  if (!authHeader?.startsWith("ApplePass ")) {
    console.error("[Apple Wallet] Missing or invalid auth header");
    return new NextResponse(null, { status: 401 });
  }

  try {
    const body = await request.json();
    const pushToken = body?.pushToken || null;

    console.log("[Apple Wallet] Push token received:", pushToken ? pushToken.substring(0, 20) + "..." : "null");

    // Check if already registered
    const existing = await db.query.walletDeviceRegistrations.findFirst({
      where: and(
        eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
        eq(walletDeviceRegistrations.serialNumber, serialNumber)
      ),
    });

    if (existing) {
      console.log("[Apple Wallet] Device already registered");
      // Already registered — 200
      return new NextResponse(null, { status: 200 });
    }

    try {
      await db.insert(walletDeviceRegistrations).values({
        deviceLibraryId,
        passTypeId,
        serialNumber,
        pushToken,
      });
      console.log("[Apple Wallet] Device registered successfully:", deviceLibraryId);
    } catch (dbError) {
      console.error("[Apple Wallet] DB insert failed:", dbError);
      return new NextResponse(null, { status: 500 });
    }

    // New registration — 201
    return new NextResponse(null, { status: 201 });
  } catch (error) {
    console.error("[Apple Wallet] Error registering device:", error);
    return new NextResponse(null, { status: 500 });
  }
}

// Unregister a device
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      deviceLibraryId: string;
      passTypeId: string;
      serialNumber: string;
    }>;
  }
) {
  const { deviceLibraryId, serialNumber } = await params;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("ApplePass ")) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    await db
      .delete(walletDeviceRegistrations)
      .where(
        and(
          eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId),
          eq(walletDeviceRegistrations.serialNumber, serialNumber)
        )
      );
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("Error unregistering device:", error);
    return new NextResponse(null, { status: 500 });
  }
}
