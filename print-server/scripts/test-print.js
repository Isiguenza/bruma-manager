#!/usr/bin/env node
// Imprime un ticket de PRUEBA con datos dummy en la impresora de tickets.
// No toca la caja ni la base de datos: el print-server arma el ticket con
// demoCorteData() / demoSummaryData() de server.js.
//
//   npm run test:corte                            # print-server en localhost:3001
//   npm run test:resumen
//   npm run test:corte -- https://xxxx.ngrok.app  # otro print-server
const tickets = { corte: "/print-corte/test", resumen: "/print-summary/test" };
const [kind, urlArg] = process.argv.slice(2);
if (!tickets[kind]) {
  console.error(`Uso: node scripts/test-print.js <${Object.keys(tickets).join("|")}> [url]`);
  process.exit(1);
}
const base = (urlArg || process.env.PRINT_SERVER_URL || "http://localhost:3001").replace(/\/$/, "");

fetch(`${base}${tickets[kind]}`, { method: "POST" })
  .then(async (res) => {
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body}`);
    console.log(`✅ ${kind} de prueba enviado a ${base}`);
  })
  .catch((error) => {
    console.error(`❌ No se pudo imprimir en ${base}: ${error.message}`);
    process.exit(1);
  });
