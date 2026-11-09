import type { Product } from "@/lib/types";

/**
 * `menuImages` llega de la API como TEXTO JSON (`'["https://cdn…webp"]'`), no
 * como arreglo. La lista anterior hacía `menuImages[0]` sobre el string y
 * pedía la imagen a la URL "[" — por eso las miniaturas salían rotas.
 */
export function parseMenuImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Foto para miniaturas: la portada del menú web; si no hay, la imagen del POS. */
export function productThumb(p: Product): string | null {
  return parseMenuImages((p as { menuImages?: unknown }).menuImages)[0] ?? (p.imageUrl || null);
}

export type Variant = { name: string; price: string; platformPrice?: string };

export function parseVariants(value: unknown): Variant[] {
  if (Array.isArray(value)) return value as Variant[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const money = (n: number | string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(n) || 0);

/** "$95" o "$95 – $160" si tiene variantes. */
export function priceLabel(p: Product): string {
  const variants = p.hasVariants ? parseVariants(p.variants) : [];
  const prices = variants.map((v) => Number(v.price)).filter((n) => n > 0);
  if (prices.length === 0) return money(p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

export async function uploadToCdn(file: Blob, filename = "foto.webp"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, filename);
  const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Error subiendo archivo");
  }
  const { url } = await res.json();
  return url as string;
}
