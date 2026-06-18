import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const result = await db.query.loyaltyCards.findMany({
      orderBy: [desc(loyaltyCards.createdAt)],
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching loyalty cards:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerName, customerLastName, customerPhone, customerEmail, birthDate, stampsPerReward, pin } = body;

    if (!customerName?.trim()) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }
    if (!customerLastName?.trim()) {
      return NextResponse.json({ error: "Apellido requerido" }, { status: 400 });
    }
    if (!customerEmail?.trim()) {
      return NextResponse.json({ error: "Correo electrónico requerido" }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail.trim())) {
      return NextResponse.json({ error: "Correo electrónico inválido" }, { status: 400 });
    }

    // Validate PIN if provided (4 digits)
    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN debe ser de 4 dígitos" }, { status: 400 });
    }

    // Generate unique barcode value
    const barcodeValue = `ESP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    // Hash PIN if provided
    let pinHash = null;
    if (pin) {
      pinHash = await bcrypt.hash(pin, 10);
    }

    const [card] = await db
      .insert(loyaltyCards)
      .values({
        customerName: customerName.trim(),
        customerLastName: customerLastName.trim(),
        customerPhone: customerPhone?.trim() || null,
        customerEmail: customerEmail.trim(),
        birthDate: birthDate || null,
        barcodeValue,
        pinHash,
        stampsPerReward: stampsPerReward || 8,
      })
      .returning();

    // Don't return pinHash to client
    const { pinHash: _, ...cardWithoutPin } = card;
    return NextResponse.json(cardWithoutPin, { status: 201 });
  } catch (error) {
    console.error("Error creating loyalty card:", error);
    return NextResponse.json({ error: "Error creating card", details: String(error) }, { status: 500 });
  }
}
