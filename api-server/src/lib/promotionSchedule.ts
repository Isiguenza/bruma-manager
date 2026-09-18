export interface PromotionSchedule {
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Business schedule used when serving active promotions to POS clients.
 * Dates and times intentionally follow the dashboard active-promotions route:
 * a missing restriction means it is always allowed.
 */
export function isPromotionWithinSchedule(
  promotion: PromotionSchedule,
  now = new Date()
): boolean {
  const currentDate = now.toISOString().split("T")[0];
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
      // Preserve the dashboard behavior: an invalid legacy restriction does
      // not make an otherwise active promotion disappear.
    }
  }

  // PostgreSQL `time` values may include seconds while the configured UI and
  // current time use HH:mm; compare them at the schedule's minute precision.
  const startTime = promotion.startTime?.slice(0, 5);
  const endTime = promotion.endTime?.slice(0, 5);
  if (startTime && currentTime < startTime) return false;
  if (endTime && currentTime > endTime) return false;

  return true;
}
