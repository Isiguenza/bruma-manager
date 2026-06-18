import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, pin } = body;

    if (!email || !pin) {
      return NextResponse.json(
        { error: "Correo y PIN son requeridos" },
        { status: 400 }
      );
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.customerEmail, email.trim().toLowerCase()),
    });

    if (!card) {
      return NextResponse.json(
        { error: "Tarjeta no encontrada" },
        { status: 404 }
      );
    }

    // If card has no PIN, allow access
    if (!card.pinHash) {
      return NextResponse.json({ verified: true, card });
    }

    // Verify PIN
    const isValid = await bcrypt.compare(pin, card.pinHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "PIN incorrecto" },
        { status: 401 }
      );
    }

    return NextResponse.json({ verified: true, card });
  } catch (error) {
    console.error("Error login loyalty:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
