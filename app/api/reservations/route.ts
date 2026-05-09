import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, tables } from "@/lib/db/schema";
import { eq, and, gte, lte, or, ilike, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const tableId = searchParams.get("tableId");

    let conditions = [];

    // Filter by date
    if (date) {
      conditions.push(eq(reservations.reservationDate, date));
    }

    // Filter by status
    if (status) {
      conditions.push(eq(reservations.status, status as any));
    }

    // Filter by table
    if (tableId) {
      conditions.push(eq(reservations.tableId, tableId));
    }

    // Search by customer name
    if (search) {
      conditions.push(ilike(reservations.customerName, `%${search}%`));
    }

    const result = await db.query.reservations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        table: true,
      },
      orderBy: [desc(reservations.reservationDate), desc(reservations.reservationTime)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    return NextResponse.json(
      { error: "Error fetching reservations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tableId,
      customerName,
      customerPhone,
      guestCount,
      reservationDate,
      reservationTime,
      duration,
      notes,
    } = body;

    // Validate required fields
    if (!tableId || !customerName || !guestCount || !reservationDate || !reservationTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if table exists and has enough capacity
    const table = await db.query.tables.findFirst({
      where: eq(tables.id, tableId),
    });

    if (!table) {
      return NextResponse.json(
        { error: "Table not found" },
        { status: 404 }
      );
    }

    // Log warning if capacity exceeded, but allow reservation
    if (table.capacity < guestCount) {
      console.log(`⚠️ Warning: Table ${table.number} capacity (${table.capacity}) is less than guest count (${guestCount})`);
    }

    // Check for conflicting reservations
    // A reservation conflicts if it overlaps with an existing one
    const existingReservations = await db.query.reservations.findMany({
      where: and(
        eq(reservations.tableId, tableId),
        eq(reservations.reservationDate, reservationDate),
        or(
          eq(reservations.status, "pending"),
          eq(reservations.status, "confirmed")
        )
      ),
    });

    // Parse the requested time
    const [reqHour, reqMinute] = reservationTime.split(':').map(Number);
    const reqStartMinutes = reqHour * 60 + reqMinute;
    const reqEndMinutes = reqStartMinutes + (duration || 120);

    for (const existing of existingReservations) {
      const [existHour, existMinute] = existing.reservationTime.split(':').map(Number);
      const existStartMinutes = existHour * 60 + existMinute;
      const existEndMinutes = existStartMinutes + existing.duration;

      // Check if times overlap
      if (
        (reqStartMinutes >= existStartMinutes && reqStartMinutes < existEndMinutes) ||
        (reqEndMinutes > existStartMinutes && reqEndMinutes <= existEndMinutes) ||
        (reqStartMinutes <= existStartMinutes && reqEndMinutes >= existEndMinutes)
      ) {
        return NextResponse.json(
          { error: `Table is already reserved from ${existing.reservationTime} to ${Math.floor(existEndMinutes / 60)}:${String(existEndMinutes % 60).padStart(2, '0')}` },
          { status: 409 }
        );
      }
    }

    // Create reservation
    const [reservation] = await db
      .insert(reservations)
      .values({
        tableId,
        customerName,
        customerPhone: customerPhone || null,
        guestCount,
        reservationDate,
        reservationTime,
        duration: duration || 120,
        notes: notes || null,
        status: "pending",
      })
      .returning();

    // Don't update table status - let it stay available until customer arrives
    // The table will show "Reservada - HH:MM" in the UI but won't be blocked

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Error creating reservation" },
      { status: 500 }
    );
  }
}
