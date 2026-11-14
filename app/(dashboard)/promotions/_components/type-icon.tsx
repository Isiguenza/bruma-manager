import { Percent, ShoppingBagOpen, Tag } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Promotion } from "@/lib/types";
import { TONE, TYPE_META } from "./shared";

export function TypeIcon({ type, className }: { type: Promotion["type"]; className?: string }) {
  const tone = TONE[TYPE_META[type].tone];
  const icon =
    type === "buy_x_get_y" ? (
      <span className="text-[11px] font-black tracking-tight">2x1</span>
    ) : type === "percentage_discount" ? (
      <Percent className="size-4.5" weight="bold" />
    ) : type === "fixed_discount" ? (
      <Tag className="size-4.5" weight="fill" />
    ) : (
      <ShoppingBagOpen className="size-4.5" weight="fill" />
    );
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone.soft, tone.text, className)}>{icon}</span>
  );
}
