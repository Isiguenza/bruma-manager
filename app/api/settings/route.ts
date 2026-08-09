import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { restaurantSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_TIERS = [
  { maxMeters: 600, fee: 25 },
  { maxMeters: 1200, fee: 40 },
];

// Devuelve la (única) fila de ajustes, creándola con defaults si no existe.
async function getOrCreate() {
  let row = await db.query.restaurantSettings.findFirst();
  if (!row) {
    [row] = await db
      .insert(restaurantSettings)
      .values({
        onlineOrderingEnabled: false,
        deliveryTiers: JSON.stringify(DEFAULT_TIERS),
      })
      .returning();
  }
  return row;
}

function serialize(row: any) {
  return {
    id: row.id,
    onlineOrderingEnabled: row.onlineOrderingEnabled ?? false,
    serviceHours: row.serviceHours ? JSON.parse(row.serviceHours) : null,
    restaurantLat: row.restaurantLat != null ? parseFloat(row.restaurantLat) : null,
    restaurantLng: row.restaurantLng != null ? parseFloat(row.restaurantLng) : null,
    deliveryTiers: row.deliveryTiers ? JSON.parse(row.deliveryTiers) : DEFAULT_TIERS,
  };
}

export async function GET() {
  try {
    const row = await getOrCreate();
    return NextResponse.json(serialize(row));
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const existing = await getOrCreate();

    const updates: any = { updatedAt: new Date() };
    if (body.onlineOrderingEnabled !== undefined)
      updates.onlineOrderingEnabled = !!body.onlineOrderingEnabled;
    if (body.serviceHours !== undefined)
      updates.serviceHours = body.serviceHours ? JSON.stringify(body.serviceHours) : null;
    if (body.restaurantLat !== undefined)
      updates.restaurantLat = body.restaurantLat != null ? String(body.restaurantLat) : null;
    if (body.restaurantLng !== undefined)
      updates.restaurantLng = body.restaurantLng != null ? String(body.restaurantLng) : null;
    if (body.deliveryTiers !== undefined)
      updates.deliveryTiers = body.deliveryTiers ? JSON.stringify(body.deliveryTiers) : null;

    const [row] = await db
      .update(restaurantSettings)
      .set(updates)
      .where(eq(restaurantSettings.id, existing.id))
      .returning();

    return NextResponse.json(serialize(row));
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
