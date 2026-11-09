import type { Icon } from "@phosphor-icons/react";
import {
  House,
  ClipboardText,
  Armchair,
  CurrencyDollar,
  ClockCounterClockwise,
  Receipt,
  Truck,
  Notepad,
  SquaresFour,
  GitBranch,
  ChatText,
  CreditCard,
  Smiley,
  Tag,
  Percent,
  Package,
  Carrot,
  CookingPot,
  Drop,
  Stack,
  UserCircle,
  Globe,
  Wallet,
} from "@phosphor-icons/react";

/**
 * Única fuente de las páginas del dashboard: la barra lateral, el título del
 * header y la búsqueda ⌘K leen de aquí. Una página nueva se agrega SOLO aquí.
 */
export type NavItem = {
  title: string;
  url: string;
  icon: Icon;
  /** Palabras extra para la búsqueda ⌘K (sinónimos de cómo se busca). */
  keywords?: string[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
  /** Sección plegable en la barra lateral (cerrada si no estás en ella). */
  collapsible?: boolean;
};

export const navSections: NavSection[] = [
  {
    title: "Operación",
    items: [
      { title: "Inicio", url: "/dashboard", icon: House, keywords: ["hoy", "resumen", "dashboard"] },
      { title: "Órdenes", url: "/orders/history", icon: ClipboardText, keywords: ["historial", "pedidos", "tickets"] },
      { title: "Mesas", url: "/tables", icon: Armchair, keywords: ["mapa", "salón"] },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { title: "Caja", url: "/cash-register", icon: CurrencyDollar, keywords: ["corte", "sangría", "depósito", "efectivo"] },
      { title: "Cortes", url: "/cash-register/history", icon: ClockCounterClockwise, keywords: ["historial de cortes", "cierres"] },
      { title: "Compras y gastos", url: "/expenses", icon: Receipt, keywords: ["gastos", "hermes", "compras"] },
      { title: "Proveedores", url: "/suppliers", icon: Truck, keywords: ["pagos", "factura"] },
    ],
  },
  {
    title: "Menú",
    items: [
      { title: "Platillos", url: "/inventory/products", icon: Notepad, keywords: ["menú", "productos", "precios", "extras"] },
      { title: "Categorías", url: "/inventory/categories", icon: SquaresFour, keywords: ["subcategorías"] },
      { title: "Flujos", url: "/flows", icon: GitBranch, keywords: ["paquetes", "modificadores", "pasos"] },
      { title: "Notas rápidas", url: "/inventory/quick-notes", icon: ChatText, keywords: ["comentarios", "cocina"] },
    ],
  },
  {
    title: "Clientes",
    items: [
      { title: "Clientes frecuentes", url: "/loyalty", icon: CreditCard, keywords: ["lealtad", "tarjetas", "wallet", "sellos"] },
      { title: "Encuestas", url: "/surveys", icon: Smiley, keywords: ["nps", "satisfacción", "opiniones"] },
      { title: "Promociones", url: "/promotions", icon: Tag, keywords: ["2x1", "ofertas"] },
      { title: "Descuentos", url: "/discounts", icon: Percent },
    ],
  },
  {
    title: "Inventario",
    collapsible: true,
    items: [
      { title: "Existencias", url: "/inventory/stock", icon: Package, keywords: ["inventario", "stock"] },
      { title: "Ingredientes", url: "/inventory/ingredients", icon: Carrot, keywords: ["insumos"] },
      { title: "Recetas", url: "/inventory/recipes", icon: CookingPot },
      { title: "Escarchados", url: "/inventory/frostings", icon: Drop, keywords: ["toppings", "secos"] },
      { title: "Grupos", url: "/groups", icon: Stack, keywords: ["grupos de productos"] },
    ],
  },
  {
    title: "Configuración",
    collapsible: true,
    items: [
      { title: "Empleados", url: "/settings/employees", icon: UserCircle, keywords: ["meseros", "pin", "roles"] },
      { title: "Pedidos en línea", url: "/settings/online-orders", icon: Globe, keywords: ["web", "delivery", "stripe"] },
      { title: "Mercado Pago", url: "/settings/mercadopago", icon: Wallet, keywords: ["terminal"] },
    ],
  },
];

/** "/cash-register" no debe marcar activa a "/cash-register/history". */
export function isNavActive(url: string, pathname: string): boolean {
  if (pathname === url) return true;
  if (!pathname.startsWith(url + "/")) return false;
  // Gana el item más específico: si otro item cuelga de este url y coincide, no.
  const allUrls = navSections.flatMap((s) => s.items.map((i) => i.url));
  return !allUrls.some((other) => other !== url && other.startsWith(url + "/") && (pathname === other || pathname.startsWith(other + "/")));
}

/** Sección e item de la página actual (para el título del header). */
export function findNav(pathname: string): { section: NavSection; item: NavItem } | null {
  for (const section of navSections) {
    for (const item of section.items) {
      if (isNavActive(item.url, pathname)) return { section, item };
    }
  }
  return null;
}
