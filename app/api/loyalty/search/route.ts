import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");
    const email = searchParams.get("email");

    if (!barcode && !email) {
      return NextResponse.json({ error: "Barcode or email required" }, { status: 400 });
    }

    let card;
    if (email) {
      card = await db.query.loyaltyCards.findFirst({
        where: eq(loyaltyCards.customerEmail, email.trim().toLowerCase()),
      });
    } else {
      card = await db.query.loyaltyCards.findFirst({
        where: eq(loyaltyCards.barcodeValue, barcode!),
      });
    }

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    console.error("Error searching loyalty card:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
