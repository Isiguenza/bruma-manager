import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, tables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await db.query.reservations.findFirst({
      where: eq(reservations.id, id),
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    if (reservation.status === "arrived") {
      return NextResponse.json(
        { error: "Reservation already confirmed" },
        { status: 400 }
      );
    }

    // Update reservation status to arrived
    const [updated] = await db
      .update(reservations)
      .set({
        status: "arrived",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, id))
      .returning();

    // Update table status to available (skip if no table assigned — web reservation)
    if (reservation.tableId) {
      await db
        .update(tables)
        .set({ status: "available" })
        .where(eq(tables.id, reservation.tableId));
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error confirming reservation:", error);
    return NextResponse.json(
      { error: "Error confirming reservation" },
      { status: 500 }
    );
  }
}
