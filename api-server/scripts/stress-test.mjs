#!/usr/bin/env node
/**
 * Simula rush hour contra api-server: N "dispositivos" (iPads/Mobile/Dispatch)
 * conectados por socket + haciendo polling real, mientras se disparan olas de
 * creación de órdenes CONCURRENTES.
 *
 * Seguro contra la DB real: usa `isPractice: true` + la mesa oculta
 * `tables.number = 'PRACTICA'` (ver CLAUDE.md "Modo Práctica") — no toca caja,
 * no aparece en reportes/dashboard, se auto-borra sola a las 2h. Corriendo
 * este script contra un api-server LOCAL (`npm run dev`), el hostname
 * `print-server` (default de PRINT_SERVER_URL) no resuelve fuera de Docker
 * Compose, así que tampoco imprime tickets reales — falla silencioso
 * (printKitchenComanda ya está diseñado para no tronar si falla).
 *
 * Uso:
 *   node scripts/stress-test.mjs
 *   STRESS_NAIVE=1 node scripts/stress-test.mjs   # compara contra el
 *     comportamiento VIEJO del iOS (refetch completo en cada order:updated)
 *
 * Env vars: STRESS_BASE_URL, STRESS_DEVICES, STRESS_BURST, STRESS_WAVES,
 * STRESS_TABLE_ID, STRESS_PRODUCT_ID, STRESS_NAIVE.
 */
import { io } from "socket.io-client";

const BASE_URL = process.env.STRESS_BASE_URL || "http://localhost:4000";
const NUM_DEVICES = Number(process.env.STRESS_DEVICES || 4);
const BURST_ORDERS = Number(process.env.STRESS_BURST || 20);
const BURST_WAVES = Number(process.env.STRESS_WAVES || 3);
const NAIVE_REFETCH = process.env.STRESS_NAIVE === "1";
const HANG_THRESHOLD_MS = 10_000;

// tables.number = 'PRACTICA' / products activo real — confirmados en la DB
// real de este proyecto antes de correr el script (ver conversación).
const PRACTICE_TABLE_ID = process.env.STRESS_TABLE_ID || "0ef274c5-8c94-4760-b71f-a407bcf2beef";
const PRODUCT_ID = process.env.STRESS_PRODUCT_ID || "f36b889e-0058-4d1c-9b8b-76d1a29dfb63";

const stats = new Map();
let requestCount = 0;
let errorCount = 0;
let hangCount = 0;
const createdOrderNumbers = [];

function record(label, ms, ok) {
  requestCount++;
  if (!ok) errorCount++;
  if (ms > HANG_THRESHOLD_MS) hangCount++;
  if (!stats.has(label)) stats.set(label, []);
  stats.get(label).push(ms);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(spreadMs) {
  return Math.random() * spreadMs;
}

async function timedFetch(label, url, opts = {}) {
  const start = performance.now();
  try {
    const res = await fetch(url, opts);
    const ms = performance.now() - start;
    record(label, ms, res.ok);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[${label}] HTTP ${res.status} (${ms.toFixed(0)}ms): ${body.slice(0, 200)}`);
    } else if (ms > HANG_THRESHOLD_MS) {
      console.error(`[${label}] LENTO: ${ms.toFixed(0)}ms (> ${HANG_THRESHOLD_MS}ms)`);
    }
    return res;
  } catch (err) {
    const ms = performance.now() - start;
    record(label, ms, false);
    console.error(`[${label}] FALLÓ tras ${ms.toFixed(0)}ms: ${err.message}`);
    return null;
  }
}

// --- dispositivo simulado: socket conectado + polling realista ---
function startDevice(deviceId, room) {
  const socket = io(BASE_URL, { transports: ["websocket"], reconnection: true });
  let disposed = false;

  socket.on("connect", () => socket.emit("join", room));
  socket.on("connect_error", (e) => console.error(`[device${deviceId}] socket connect_error: ${e.message}`));

  if (NAIVE_REFETCH) {
    // Comportamiento VIEJO del iOS (antes del fix): cualquier order:updated
    // dispara un refetch completo — esto es lo que queremos que YA NO pase.
    socket.on("order:updated", async () => {
      if (disposed) return;
      await timedFetch(`d${deviceId}:reactive-orders`, `${BASE_URL}/api/orders`);
      await timedFetch(`d${deviceId}:reactive-tables`, `${BASE_URL}/api/tables`);
    });
  }

  const pollLoop = async (label, path, intervalMs) => {
    while (!disposed) {
      await timedFetch(`d${deviceId}:${label}`, `${BASE_URL}${path}`);
      await sleep(intervalMs + jitter(2000));
    }
  };

  pollLoop("orders", "/api/orders", 15000);
  pollLoop("tables", "/api/tables", 20000);
  pollLoop("pending-online", "/api/orders/pending-online", 25000);

  return {
    stop: () => {
      disposed = true;
      socket.close();
    },
  };
}

// --- ola de órdenes concurrentes (el "rush") ---
async function createAndSendOrder(tag) {
  const res = await timedFetch("burst:create-order", `${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: PRACTICE_TABLE_ID,
      isPractice: true,
      status: "preparing",
      source: "pos",
      guestCount: 2,
      items: [
        {
          productId: PRODUCT_ID,
          productName: `Stress ${tag}`,
          quantity: 1,
          unitPrice: 63,
          subtotal: 63,
        },
      ],
    }),
  });
  if (!res || !res.ok) return null;
  const order = await res.json().catch(() => null);
  if (!order?.id) return null;

  // Segunda ronda a la misma orden — ejercita send-to-kitchen bajo la misma
  // carga concurrente (el otro endpoint reescrito con Promise.all).
  await timedFetch("burst:send-to-kitchen", `${BASE_URL}/api/orders/${order.id}/send-to-kitchen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemCount: 1, itemNames: [`Stress ${tag}`] }),
  });

  return order.orderNumber;
}

async function runBurst(wave) {
  console.log(`\n--- Ola ${wave}: ${BURST_ORDERS} órdenes concurrentes ---`);
  const results = await Promise.all(
    Array.from({ length: BURST_ORDERS }, (_, i) => createAndSendOrder(`w${wave}-${i}`))
  );
  const numbers = results.filter((n) => n != null);
  createdOrderNumbers.push(...numbers);
  const unique = new Set(numbers);
  console.log(`Ola ${wave}: ${numbers.length}/${BURST_ORDERS} órdenes creadas, ${unique.size} order_number únicos`);
  if (unique.size !== numbers.length) {
    console.error(`  !!! order_number DUPLICADO en la ola ${wave}: ${JSON.stringify(numbers)}`);
  }
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printReport() {
  console.log("\n=== REPORTE ===");
  console.log(`Total requests: ${requestCount} | errores: ${errorCount} | lentas(>${HANG_THRESHOLD_MS}ms): ${hangCount}`);
  const allNumbers = createdOrderNumbers;
  const uniqueAll = new Set(allNumbers);
  console.log(
    `order_number: ${allNumbers.length} órdenes creadas en total, ${uniqueAll.size} únicos ` +
      (uniqueAll.size === allNumbers.length ? "(OK, sin duplicados)" : "(!!! DUPLICADOS !!!)")
  );

  const rows = [];
  for (const [label, arr] of stats) {
    rows.push({
      label,
      n: arr.length,
      avg_ms: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      p50_ms: Math.round(percentile(arr, 50)),
      p95_ms: Math.round(percentile(arr, 95)),
      p99_ms: Math.round(percentile(arr, 99)),
      max_ms: Math.round(Math.max(...arr)),
    });
  }
  rows.sort((a, b) => b.p95_ms - a.p95_ms);
  console.table(rows);

  if (hangCount > 0) {
    console.log(`\n⚠️  ${hangCount} requests tardaron más de ${HANG_THRESHOLD_MS}ms — aquí es donde "se traba".`);
  }
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} requests fallaron — revisa los logs de arriba y los del server.`);
  }
}

async function main() {
  console.log(
    `Stress test -> ${BASE_URL} | devices=${NUM_DEVICES} burst=${BURST_ORDERS} waves=${BURST_WAVES} naiveRefetch=${NAIVE_REFETCH}`
  );
  const devices = Array.from({ length: NUM_DEVICES }, (_, i) =>
    startDevice(i, i % 2 === 0 ? "room:pos" : "room:tables")
  );
  await sleep(2000);

  for (let w = 1; w <= BURST_WAVES; w++) {
    await runBurst(w);
    await sleep(5000);
  }

  await sleep(5000);
  devices.forEach((d) => d.stop());
  printReport();
  process.exit(errorCount > 0 || hangCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Stress test crasheó:", err);
  process.exit(1);
});
