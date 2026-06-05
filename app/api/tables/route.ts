import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tables, reservations, orders, orderItems } from "@/lib/db/schema";
import { eq, and, gte, count, sql } from "drizzle-orm";

// GET /api/tables - Obtener todas las mesas
export async function GET() {
  try {
    const allTables = await db
      .select()
      .from(tables)
      .where(eq(tables.active, true))
      .orderBy(tables.number);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Fetch next reservation for each table (only for today)
    const tablesWithReservations = await Promise.all(
      allTables.map(async (table) => {
        const nextReservation = await db.query.reservations.findFirst({
          where: and(
            eq(reservations.tableId, table.id),
            eq(reservations.reservationDate, today),
            eq(reservations.status, 'pending')
          ),
          orderBy: (reservations, { asc }) => [asc(reservations.reservationTime)],
          columns: {
            reservationTime: true,
            customerName: true,
          }
        });

        // Fetch active order for this table (pending payment)
        const [activeOrder] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.tableId, table.id),
              eq(orders.paymentStatus, "pending")
            )
          )
          .orderBy(orders.createdAt)
          .limit(1);

        // Get item count for the active order
        let itemCount = 0;
        if (activeOrder) {
          const [result] = await db
            .select({ count: count() })
            .from(orderItems)
            .where(eq(orderItems.orderId, activeOrder.id));
          itemCount = result?.count ?? 0;
        }

        return {
          ...table,
          next_reservation: nextReservation || null,
          active_order: activeOrder ? {
            id: activeOrder.id,
            order_number: activeOrder.orderNumber,
            status: activeOrder.status,
            total: activeOrder.total,
            item_count: itemCount,
          } : null,
        };
      })
    );

    return NextResponse.json(tablesWithReservations);
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json(
      { error: "Error al obtener mesas" },
      { status: 500 }
    );
  }
}

// POST /api/tables - Crear nueva mesa
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { number, name, capacity } = body;

    if (!number) {
      return NextResponse.json(
        { error: "El número de mesa es requerido" },
        { status: 400 }
      );
    }

    const [newTable] = await db
      .insert(tables)
      .values({
        number,
        name: name || null,
        capacity: capacity || 4,
        status: "available",
        active: true,
      })
      .returning();

    return NextResponse.json(newTable, { status: 201 });
  } catch (error: any) {
    console.error("Error creating table:", error);
    
    // Verificar código de error (puede estar en error.code o error.cause.code)
    const errorCode = error.code || error.cause?.code;
    
    if (errorCode === "23505") {
      return NextResponse.json(
        { error: "Ya existe una mesa con ese número" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Error al crear mesa" },
      { status: 500 }
    );
  }
}
