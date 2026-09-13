import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, userProfiles } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

// Trazabilidad de Caja > Reportes: quién comandó/cobró qué orden y cuándo.
// Lee `audit_log`, poblada por api-server (orders.ts) en send-to-kitchen y
// en los endpoints de pago — ver CLAUDE.md, sección de auto-relock/auditoría.
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const action = searchParams.get("action");
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 1000);

    const conditions = [
      inArray(auditLog.action, ["order.sent_to_kitchen", "order.paid"]),
    ];
    if (action) conditions.push(eq(auditLog.action, action));
    if (startDate) conditions.push(gte(auditLog.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(auditLog.createdAt, new Date(endDate)));

    const rows = await db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        employeeName: userProfiles.name,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(userProfiles, eq(auditLog.userId, userProfiles.id))
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null,
      }))
    );
  } catch (error) {
    console.error("Error fetching audit log:", error);
    return NextResponse.json({ error: "Error al obtener el log de auditoría" }, { status: 500 });
  }
}
