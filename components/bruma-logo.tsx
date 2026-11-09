import { cn } from "@/lib/utils";

// Los SVG de marca (public/logos) vienen en blanco. Se pintan como máscara con
// `bg-current`, así toman el color del texto: oscuros en tema claro, claros en
// oscuro, o el que se pase con `text-*`. Tamaño: alto por className (`h-8`), el
// ancho sale solo del aspect ratio de cada archivo.
const LOGOS = {
  /** Isotipo + BRUMA en una línea. */
  horizontal: { src: "/logos/Horiz.svg", ratio: 956.76 / 312.75 },
  /** Solo el pez. */
  isotipo: { src: "/logos/Iso_w.svg", ratio: 935.82 / 812.32 },
  /** Isotipo arriba, BRUMA · Marisquería abajo. */
  full: { src: "/logos/LogoBruma.svg", ratio: 664.46 / 821.55 },
} as const;

interface BrumaLogoProps {
  variant?: keyof typeof LOGOS;
  className?: string;
}

export function BrumaLogo({ variant = "horizontal", className }: BrumaLogoProps) {
  const { src, ratio } = LOGOS[variant];
  const mask = `url(${src}) center / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label="BRUMA Marisquería"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{ aspectRatio: ratio, mask, WebkitMask: mask }}
    />
  );
}
