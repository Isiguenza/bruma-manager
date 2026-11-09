"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findNav } from "@/lib/nav";

/**
 * Encabezado estándar de página: eyebrow (sección, tomada de la navegación),
 * título, descripción y acciones a la derecha. Mismo look que Encuestas y
 * Gastos — úsalo en vez de armar `<h1>` a mano en cada página.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Por default, la sección de la navegación ("Finanzas", "Menú"…). */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const sectionTitle = eyebrow ?? findNav(pathname)?.section.title;

  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {sectionTitle && <p className="text-xs font-medium text-muted-foreground">{sectionTitle}</p>}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
