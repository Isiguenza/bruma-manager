// Categorías de compras/gastos + clasificador por palabras clave.
// ESPEJO A MANO de lib/expenses/categories.ts (raíz) — si cambias una
// lista aquí, cámbiala allá (api-server es un proyecto TS aparte y no puede
// importar de la raíz).

export const EXPENSE_CATEGORIES = [
  "insumos",
  "bebidas",
  "empaque",
  "limpieza",
  "servicios",
  "transporte",
  "mantenimiento",
  "personal",
  "otros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// El orden importa: la primera categoría que matchea gana ("agua mineral" es
// bebida antes de que "agua" la mande a servicios; "gasolina" es transporte
// antes de que "gas" la mande a servicios).
const KEYWORDS: [ExpenseCategory, string[]][] = [
  ["bebidas", ["cerveza", "refresco", "coca", "agua mineral", "topo chico", "topochico", "garrafon", "vino", "mezcal", "tequila", "hielo", "cafe", "jugo", "licor", "ron", "vodka", "ginebra", "whisky", "clamato", "squirt", "sprite"]],
  ["transporte", ["gasolina", "uber", "didi", "taxi", "envio", "flete", "estacionamiento", "caseta", "mandado"]],
  ["empaque", ["desechable", "bolsa", "contenedor", "unicel", "servilleta", "popote", "vaso", "charola", "aluminio", "empaque", "tapa", "domo", "cubierto", "plastico"]],
  ["limpieza", ["cloro", "jabon", "detergente", "limpieza", "fabuloso", "pinol", "trapo", "escoba", "jerga", "desengrasante", "papel de bano", "papel higienico", "sanitizante", "fibra", "guante"]],
  ["servicios", ["luz", "cfe", "agua", "gas", "internet", "telefono", "renta", "telmex", "izzi", "totalplay", "megacable", "software", "suscripcion", "spotify", "netflix", "basura"]],
  ["mantenimiento", ["reparacion", "plomero", "electricista", "mantenimiento", "refaccion", "herramienta", "pintura", "foco", "tornillo", "compostura", "tecnico"]],
  ["personal", ["sueldo", "nomina", "raya", "adelanto", "uniforme", "bono", "comida personal", "comida staff"]],
  ["insumos", ["camaron", "pulpo", "pescado", "marisco", "ostion", "callo", "jaiba", "atun", "salmon", "aguacate", "limon", "tomate", "jitomate", "cebolla", "chile", "verdura", "fruta", "carne", "pollo", "res", "cerdo", "queso", "tortilla", "tostada", "pan", "arroz", "aceite", "abarrote", "mercado", "central", "cilantro", "papa", "pepino", "huevo", "leche", "crema", "mantequilla", "harina", "azucar", "sal", "especia", "salsa", "mayonesa", "catsup", "costco", "sams", "walmart", "soriana"]],
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Palabra completa con plural opcional: "sal" matchea "sal"/"sales", no "salsa".
const MATCHERS: [ExpenseCategory, RegExp][] = KEYWORDS.map(([category, words]) => [
  category,
  new RegExp(`(^|[^a-z0-9])(${words.map(escapeRegex).join("|")})(s|es)?([^a-z0-9]|$)`),
]);

export function guessExpenseCategory(concept: string): ExpenseCategory {
  const text = normalize(concept);
  for (const [category, re] of MATCHERS) {
    if (re.test(text)) return category;
  }
  return "otros";
}

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}
