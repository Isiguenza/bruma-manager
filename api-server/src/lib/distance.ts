// Distancia en línea recta (Haversine) y resolución de tarifa de envío por tramos.

export interface DeliveryTier {
  maxMeters: number;
  fee: number;
}

/** Distancia en metros entre dos coordenadas (Haversine). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Devuelve la tarifa del primer tramo cuyo `maxMeters` cubre la distancia.
 * Si la distancia excede el mayor tramo, devuelve `null` (fuera de rango → sin envío).
 */
export function resolveDeliveryFee(
  distanceMeters: number,
  tiers: DeliveryTier[]
): number | null {
  const sorted = [...tiers].sort((a, b) => a.maxMeters - b.maxMeters);
  for (const tier of sorted) {
    if (distanceMeters <= tier.maxMeters) return tier.fee;
  }
  return null;
}
