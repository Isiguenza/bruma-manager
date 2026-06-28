import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, tables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await db.query.reservations.findFirst({
      where: eq(reservations.id, id),
      with: {
        table: true,
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(reservation);
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return NextResponse.json(
      { error: "Error fetching reservation" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const reservation = await db.query.reservations.findFirst({
      where: eq(reservations.id, id),
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Update reservation
    const [updated] = await db
      .update(reservations)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating reservation:", error);
    return NextResponse.json(
      { error: "Error updating reservation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Delete reservation
    await db.delete(reservations).where(eq(reservations.id, id));

    // Check if table has any other active reservations (skip if no table assigned)
    const otherReservations = reservation.tableId
      ? await db.query.reservations.findMany({
          where: eq(reservations.tableId, reservation.tableId),
        })
      : [];

    const hasActiveReservations = otherReservations.some(
      (r) => r.status === "pending" || r.status === "confirmed"
    );

    // If no active reservations, set table status to available (skip if no table assigned)
    if (!hasActiveReservations && reservation.tableId) {
      await db
        .update(tables)
        .set({ status: "available" })
        .where(eq(tables.id, reservation.tableId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting reservation:", error);
    return NextResponse.json(
      { error: "Error deleting reservation" },
      { status: 500 }
    );
  }
}
