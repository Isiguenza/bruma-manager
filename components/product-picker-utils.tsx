import { Check, Minus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ProductVariant } from "@/lib/types";

export type TriStateValue = "checked" | "partial" | "unchecked";

// Keep variant-scoped selections stable if an admin reorders the variants.
// A bare product id still means the entire product (all of its variants).
export function variantId(productId: string, variantName: string) {
  return `${productId}::${variantName}`;
}

export function parseVariants(raw: string | null | undefined): ProductVariant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function TriState({ state }: { state: TriStateValue }) {
  return (
    <div
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors",
        state === "unchecked"
          ? "border-primary"
          : "bg-primary border-primary text-primary-foreground"
      )}
    >
      {state === "checked" && <Check className="h-3 w-3" weight="bold" />}
      {state === "partial" && <Minus className="h-3 w-3" weight="bold" />}
    </div>
  );
}
