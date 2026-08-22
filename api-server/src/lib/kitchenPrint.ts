// Impresión de comanda disparada desde el backend — en vez de que cada
// cliente (POS, Waitress, el bar del dashboard web) le hable directo al
// print-server desde su propia red/wifi (frágil: el celular de un mesero
// puede estar fuera del wifi del restaurante y la impresión falla en
// silencio), el api-server —que cualquier dispositivo con el API alcanza
// siempre— es quien manda imprimir, con reintentos. Sigue el mismo patrón
// que ya usa POST /api/open-drawer (proxy a PRINT_SERVER_URL).
//
// PRINT_SERVER_URL debe apuntar, en producción, a un túnel público estable
// (Cloudflare Tunnel recomendado) hacia la máquina del restaurante — el
// default de Docker-Compose (print-server:3001) solo resuelve cuando ambos
// corren en la misma red interna.

import { db, schema } from "../db";
import { inArray, and, eq } from "drizzle-orm";

export interface PrintableItem {
  productId?: string | null;
  productName: string;
  quantity: number;
  seat?: string | null;
  course?: number | null;
  notes?: string | null;
  frostingName?: string | null;
  dryToppingName?: string | null;
  extraName?: string | null;
  customModifiers?: string | null; // JSON string: { [stepId]: { stepName, options: [{name, price}] } }
}

interface PrintKitchenComandaOptions {
  orderNumber: number;
  tableNumber?: string | null;
  customerName?: string | null;
  guestCount?: number | null;
  isDelivery?: boolean;
  items: PrintableItem[];
}

/** ¿Cuáles de estos productos son bebida? Misma lógica que GET /orders usa
 * para el ruteo "solo bebidas": categoría marcada isBeverage, o el flujo del
 * producto mismo lo marca así. */
async function resolveBeverageFlags(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const uniqueIds = Array.from(new Set(productIds));

  const products = await db.query.products.findMany({
    where: inArray(schema.products.id, uniqueIds),
    columns: { id: true, categoryId: true },
    with: {
      category: { columns: { isBeverage: true } },
    },
  });

  const categoryBeverageIds = new Set(
    products.filter((p: any) => p.category?.isBeverage === true).map((p) => p.id)
  );

  const flows = await db
    .select({ productId: schema.productFlows.productId })
    .from(schema.productFlows)
    .where(and(inArray(schema.productFlows.productId, uniqueIds), eq(schema.productFlows.isBeverage, true)));

  const flowBeverageIds = new Set(flows.map((f) => f.productId));

  return new Set([...categoryBeverageIds, ...flowBeverageIds]);
}

/** Convierte el customModifiers (JSON de flujo por categoría/producto) que ya
 * mandan los clientes al formato plano {name} que espera print-server. */
function buildFlowSteps(customModifiers: string | null | undefined): { name: string }[] {
  if (!customModifiers) return [];
  try {
    const parsed = JSON.parse(customModifiers);
    const steps: { name: string }[] = [];
    for (const value of Object.values<any>(parsed)) {
      const options = value?.options;
      if (Array.isArray(options)) {
        for (const opt of options) {
          if (opt?.name) steps.push({ name: opt.name });
        }
      }
    }
    return steps;
  } catch {
    return [];
  }
}

async function postWithRetry(url: string, body: unknown, attempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) return true;
      console.error(`[kitchenPrint] intento ${attempt}/${attempts} — status ${response.status}`);
    } catch (error: any) {
      console.error(`[kitchenPrint] intento ${attempt}/${attempts} — error:`, error.message);
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  return false;
}

/** Imprime la comanda de cocina para un set de items — no lanza si falla (el
 * pedido/orden ya se guardó bien independientemente de que esto imprima o
 * no); solo loguea el fallo final tras agotar los reintentos. */
export async function printKitchenComanda(opts: PrintKitchenComandaOptions): Promise<boolean> {
  if (!opts.items.length) return true;

  const printServerUrl = process.env.PRINT_SERVER_URL || "http://print-server:3001";
  const beverageIds = await resolveBeverageFlags(
    opts.items.map((i) => i.productId).filter((id): id is string => !!id)
  );

  const items = opts.items.map((item) => ({
    name: item.productName,
    qty: item.quantity,
    seat: item.seat || "C",
    course: item.course || 1,
    isBeverage: item.productId ? beverageIds.has(item.productId) : false,
    ...(item.notes ? { notes: item.notes } : {}),
    ...(item.frostingName ? { frosting: item.frostingName } : {}),
    ...(item.dryToppingName ? { topping: item.dryToppingName } : {}),
    ...(item.extraName ? { extra: item.extraName } : {}),
    ...(() => {
      const flowSteps = buildFlowSteps(item.customModifiers);
      return flowSteps.length > 0 ? { flowSteps } : {};
    })(),
  }));

  const body = {
    orderNumber: String(opts.orderNumber),
    items,
    isDelivery: opts.isDelivery ?? !opts.tableNumber,
    ...(opts.tableNumber ? { tableNumber: opts.tableNumber } : {}),
    ...(opts.customerName ? { customerName: opts.customerName } : {}),
    ...(opts.guestCount ? { guestCount: opts.guestCount } : {}),
  };

  const ok = await postWithRetry(`${printServerUrl}/print-comanda`, body);
  if (!ok) {
    console.error(`[kitchenPrint] no se pudo imprimir la comanda de la orden #${opts.orderNumber} tras varios intentos`);
  }
  return ok;
}
