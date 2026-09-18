import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type PromotionSchedule = {
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

// Kept in sync with api-server/src/lib/promotionSchedule.ts. These are two
// independently built apps, and schedules are business-local process time.
function isPromotionWithinSchedule(
  promotion: PromotionSchedule,
  now = new Date()
): boolean {
  const currentDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const currentTime = now.toTimeString().split(" ")[0].substring(0, 5);
  const currentDay = now.getDay();

  if (promotion.startDate && currentDate < promotion.startDate) return false;
  if (promotion.endDate && currentDate > promotion.endDate) return false;

  if (promotion.daysOfWeek) {
    try {
      const allowedDays = JSON.parse(promotion.daysOfWeek);
      if (
        Array.isArray(allowedDays) &&
        allowedDays.length > 0 &&
        !allowedDays.includes(currentDay)
      ) {
        return false;
      }
    } catch {
      // Invalid legacy restrictions preserve the existing permissive behavior.
    }
  }

  // PostgreSQL time values may include seconds; schedules are minute-precise.
  const startTime = promotion.startTime?.slice(0, 5);
  const endTime = promotion.endTime?.slice(0, 5);
  if (startTime && currentTime < startTime) return false;
  if (endTime && currentTime > endTime) return false;

  return true;
}

// GET /api/promotions/active - Get active promotions (with date/time validation)
export async function GET(request: NextRequest) {
  try {
    // Get all active promotions
    const allPromotions = await db
      .select()
      .from(promotions)
      .where(eq(promotions.active, true));

    console.log('📋 Total promociones con active=true:', allPromotions.length);
    console.log('📋 Promociones:', allPromotions.map(p => ({ id: p.id, name: p.name, active: p.active, startDate: p.startDate, endDate: p.endDate })));

    // Filter promotions based on date/time restrictions
    const activePromotions = allPromotions.filter((promo) =>
      isPromotionWithinSchedule(promo)
    );

    console.log('\n🎉 Total promociones activas después de filtros:', activePromotions.length);

    // Sort by priority (higher priority first)
    activePromotions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return NextResponse.json(activePromotions);
  } catch (error) {
    console.error("Error fetching active promotions:", error);
    return NextResponse.json(
      { error: "Error al obtener promociones activas" },
      { status: 500 }
    );
  }
}
