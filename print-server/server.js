const express = require('express');
const cors = require('cors');
const net = require('net');
const sharp = require('sharp');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// Set timezone to Mexico City
process.env.TZ = 'America/Mexico_City';

const app = express();
const PORT = process.env.PORT || 3001;

// Ticket printer (receipts)
const PRINTER_IP = process.env.PRINTER_IP || "192.168.0.200";
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || "9100");

// Kitchen printer (comandas)
const KITCHEN_PRINTER_IP = process.env.KITCHEN_PRINTER_IP || "YOUR_KITCHEN_PRINTER_IP";
const KITCHEN_PRINTER_PORT = parseInt(process.env.KITCHEN_PRINTER_PORT || "9100");

// Función para imprimir por USB como fallback
function sendToUSBPrinter(content) {
  return new Promise((resolve, reject) => {
    const usbDevice = '/dev/usb/lp1';
    
    console.log(`📝 Escribiendo directamente a ${usbDevice}...`);
    
    // Escribir directamente al dispositivo USB
    fs.writeFile(usbDevice, content, 'binary', (error) => {
      if (error) {
        console.error('❌ Error imprimiendo por USB:', error.message);
        reject(error);
      } else {
        console.log('✅ Impreso por USB exitosamente en', usbDevice);
        resolve();
      }
    });
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// Comandos ESC/POS
const ESC = "\x1B";
const GS = "\x1D";

// Por qué los acentos salían mal ("Camar<0n" en vez de "Camarón"): ESC @
// resetea la impresora a su code page 0 (CP437/OEM437), que NO tiene los
// acentos españoles en los mismos bytes que usa JS/Node al mandar el string
// como binary/latin1 (p.ej. "ó" = byte 0xF3, pero en CP437 ese byte es otro
// símbolo, no "ó"). El self-test de la impresora confirma que sí soporta
// "16:WPC1252" (Windows-1252) — ese code page SÍ tiene los acentos exactos
// en los mismos bytes que Node ya manda, así que basta con seleccionarlo una
// vez después de inicializar. Comando ESC/POS estándar: ESC t n (0x1B 0x74 n).
const SELECT_CODEPAGE_1252 = ESC + "t" + String.fromCharCode(16);

const commands = {
  init: ESC + "@" + SELECT_CODEPAGE_1252,
  alignCenter: ESC + "a" + "\x01",
  alignLeft: ESC + "a" + "\x00",
  alignRight: ESC + "a" + "\x02",
  bold: ESC + "E" + "\x01",
  boldOff: ESC + "E" + "\x00",
  cut: GS + "V" + "\x00",
  feed: ESC + "d" + "\x03",
  feedLine: "\n",
  textSizeNormal: GS + "!" + "\x00",
  // Solo doble alto (mismo ancho/columnas que normal) — para hacer más
  // grandes los renglones de producto en la comanda sin romper el cálculo de
  // columnas de 48 caracteres que sí se usa en otros tickets.
  textSizeTall: GS + "!" + "\x01",
  textSizeDouble: GS + "!" + "\x11",
  textSizeLarge: GS + "!" + "\x22",
  // Font B (más chica, 64 columnas) para leyendas al pie.
  fontSmall: ESC + "M" + "\x01",
  fontNormal: ESC + "M" + "\x00",
  drawerPulse: ESC + "p" + "\x00" + "\x19" + "\xFA",
};

// Función para convertir imagen a bitmap ESC/POS
async function imageToEscPosBitmap(imagePath, maxWidth = 384) {
  try {
    const imageBuffer = await sharp(imagePath)
      .resize({ width: maxWidth, fit: 'contain' })
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = imageBuffer;
    const width = info.width;
    const height = info.height;

    const bytesPerLine = Math.ceil(width / 8);

    let bitmap = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < bytesPerLine; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;
          if (pixelX < width) {
            const pixelIndex = (y * width + pixelX);
            const pixelValue = data[pixelIndex];
            if (pixelValue < 128) {
              byte |= (1 << (7 - bit));
            }
          }
        }
        bitmap += String.fromCharCode(byte);
      }
    }

    const xL = bytesPerLine & 0xFF;
    const xH = (bytesPerLine >> 8) & 0xFF;
    const yL = height & 0xFF;
    const yH = (height >> 8) & 0xFF;

    return GS + "v0" + String.fromCharCode(0, xL, xH, yL, yH) + bitmap;
  } catch (error) {
    console.error("Error processing image:", error);
    return "";
  }
}

// Ancho de impresión en puntos (dots) de la térmica de 80mm — confirmado por
// el self-test de la impresora de tickets (80-VIII, "Print width: 576dots/line").
// Se asume el mismo modelo/ancho para la de cocina; si algún día resulta
// distinta, ajustar aquí.
const PRINTER_DOTS_WIDTH = 576;

/** Línea horizontal SÓLIDA de verdad (barra negra continua), en vez de
 * aproximarla con caracteres de texto ("====" / "----") que dependen de la
 * fuente y casi siempre dejan micro-espacios entre glifos. Se dibuja como
 * imagen raster (mismo comando GS v0 que usa el logo) — no depende de
 * ninguna fuente ni code page, así que se ve igual de sólida sin importar
 * el tamaño de texto activo en ese momento. No necesita sharp/archivo: son
 * puros bytes 0xFF (negro) generados en memoria.
 * `heightDots`: qué tan gruesa se ve la línea (2-3 = delgada, 6-8 = gruesa).
 */
function solidLine(heightDots = 3) {
  const bytesPerLine = Math.ceil(PRINTER_DOTS_WIDTH / 8);
  const xL = bytesPerLine & 0xFF;
  const xH = (bytesPerLine >> 8) & 0xFF;
  const yL = heightDots & 0xFF;
  const yH = (heightDots >> 8) & 0xFF;
  const row = "\xFF".repeat(bytesPerLine); // todo negro
  const bitmap = row.repeat(heightDots);
  return GS + "v0" + String.fromCharCode(0, xL, xH, yL, yH) + bitmap;
}

/**
 * Pie del ticket de cuenta con la encuesta de satisfacción. El POS manda
 * `survey: { url, displayUrl }` SOLO desde su botón de imprimir cuenta (no en
 * el ticket de pago, ni en el pre-ticket ni en el PDF). El QR va como imagen
 * raster (GS v0, igual que el logo). Sin corazón: ni como texto (WPC1252 no
 * tiene emojis) ni como imagen (a 48 px la térmica lo imprimía como un cuadro negro).
 */
async function surveyFooter(survey) {
  if (!survey || typeof survey.url !== "string" || !survey.url) return "";
  let out = "";
  out += hairLine() + vgap(GAP_SECTION);
  out += commands.alignCenter;
  out += commands.bold + "Gracias por visitarnos" + commands.boldOff + "\n";
  out += commands.feedLine;
  out += "Tu opinión hace la diferencia.\n";
  out += "Escanea el QR y dinos cómo te fue.\n";
  out += commands.feedLine;
  try {
    const qrPng = await QRCode.toBuffer(survey.url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 320 });
    out += await imageToEscPosBitmap(qrPng, 320);
  } catch (error) {
    console.error("Error generando QR de encuesta:", error);
  }
  out += commands.feedLine;
  out += `${survey.displayUrl || survey.url}\n`;
  out += commands.alignLeft;
  return out;
}

/**
 * Package children are explicitly identified by the API print path. The POS
 * payment ticket predates that field, but package children are persisted and
 * billed at $0, so retain that narrow fallback for its existing payload.
 * Courtesy items opt out through `isGuest`.
 */
function isPackageChild(item, { allowZeroPriceFallback = false } = {}) {
  if (item?.isPackageChild === true || item?.packageChild === true || item?.parentItemId || item?.parentName) {
    return true;
  }
  return allowZeroPriceFallback && item?.isGuest !== true && Number(item?.total) === 0;
}

function receiptItemLabel(item) {
  const child = isPackageChild(item, { allowZeroPriceFallback: true });
  // The printer runs on codepage WPC1252 and content goes out as 'binary'
  // (one byte per JS char), so only U+0000-U+00FF survive: "↳" (U+21B3) was
  // truncated to 0xB3 and printed as "³". "»" (0xBB) and "·" (0xB7) are safe.
  const prefix = child ? "  » " : "";
  return { child, label: `${prefix}${item.qty}x ${item.name}` };
}

/** Keeps package components under their parent even when the DB insert order
 * placed every parent row before all of its child rows. `parentName` is sent
 * by the API print path; unmatched legacy rows are kept rather than dropped. */
function matchesPackageParent(printedName, parentName) {
  const candidate = String(printedName || "").toLocaleLowerCase();
  return String(parentName || "")
    .toLocaleLowerCase()
    .split(" - ")
    .every((part) => candidate.includes(part));
}

// Columnas del ticket de cuenta (48 caracteres en fuente normal):
// Producto (con salto de línea) | Cant | Precio.
const RECEIPT_NAME_W = 33;
const RECEIPT_QTY_W = 5;
const RECEIPT_PRICE_W = 48 - RECEIPT_NAME_W - RECEIPT_QTY_W;
// Espaciado vertical del ticket de cuenta. Esta impresora IGNORA "ESC J n"
// (avanzar n puntos): se probó y los platillos salían pegados. Lo que sí
// respeta es "ESC 3 n" (alto de renglón), así que un hueco es un salto de
// línea vacío con el alto que queramos y luego se regresa al alto normal.
const LINE_BODY = 34;      // alto normal de renglón (default de fábrica ≈ 30)
const GAP_ITEM = 26;       // aire entre platillos
const GAP_SECTION = 44;    // aire entre secciones (encabezado, totales, pie)
function lineSpacing(dots) {
  return ESC + "3" + String.fromCharCode(Math.min(255, dots));
}
function vgap(dots) {
  return lineSpacing(dots) + "\n" + lineSpacing(LINE_BODY);
}
/** Línea divisoria de 1 punto: sutil, en vez de las barras gruesas. */
function hairLine() {
  return solidLine(1) + "\n";
}

function wrapText(text, width) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += " " + word;
    else { lines.push(line); line = word; }
    while (line.length > width) { lines.push(line.slice(0, width)); line = line.slice(width); }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Renglón(es) de la tabla: el nombre se parte dentro de su columna y la
 * cantidad/precio van solo en el primer renglón, como el ticket de Tim Hortons. */
function receiptRow(indent, text, qty = "", price = "") {
  const nameW = RECEIPT_NAME_W - indent.length;
  return wrapText(text, nameW).map((part, i) => {
    const name = (i === 0 ? indent : " ".repeat(indent.length)) + part;
    if (i > 0) return name + "\n";
    return name.padEnd(RECEIPT_NAME_W) +
      String(qty).padStart(Math.ceil((RECEIPT_QTY_W + String(qty).length) / 2)).padEnd(RECEIPT_QTY_W) +
      String(price).padStart(RECEIPT_PRICE_W) + "\n";
  }).join("");
}

function receiptHeader() {
  return "Producto".padEnd(RECEIPT_NAME_W) + "Cant".padEnd(RECEIPT_QTY_W) +
    "Precio".padStart(RECEIPT_PRICE_W) + "\n";
}

/** Lista de platillos del ticket de cuenta (/print y /print-seat-bill). */
function receiptItemsBlock(items) {
  let out = lineSpacing(LINE_BODY) + receiptHeader();
  out += hairLine() + vgap(GAP_ITEM);
  let lastParentName = "";
  items.forEach((item, index) => {
    const isChild = isPackageChild(item, { allowZeroPriceFallback: true });
    // El paquete se queda junto: sin espacio entre el padre y sus incluidos.
    if (index > 0 && !isChild) out += vgap(GAP_ITEM);
    // Un incluido de paquete no lleva precio propio: su valor ya va en el
    // padre. El POS manda su total como (0 - modificadores), o sea "-$5"
    // cuando la bebida del paquete trae un extra de $5, y eso confundía.
    const price = isChild ? "" : item.isGuest ? "$0" : `$${item.total}`;
    out += receiptRow(isChild ? "  » " : "", item.name, item.qty, price);

    for (const mod of item.modifiers || []) {
      const modPrice = Number(mod.price) ? `+$${mod.price}` : "";
      out += receiptRow(isChild ? "      · " : "    · ", mod.name, "", modPrice);
    }
    if (item.isGuest) out += receiptRow("    · ", "Invitado");
    // Qué platillo se llevó la promoción (el refresco gratis del combo, el
    // segundo del 2x1). El resumen por promoción sigue en los totales.
    if (!isChild && !item.isGuest && item.promotionName && item.promotionDiscount > 0) {
      out += item.promotionFree
        ? receiptRow("    · ", `GRATIS - ${item.promotionName}`, "", `-$${Math.round(item.promotionDiscount)}`)
        : receiptRow("    · ", item.promotionName, "", `-$${Math.round(item.promotionDiscount)}`);
    }

    // Solo para renglones que llegan fuera de orden (builds viejos del POS).
    if (isChild && item.parentName && !matchesPackageParent(lastParentName, item.parentName)) {
      out += receiptRow("      ", `Paquete: ${item.parentName}`);
    }
    if (!isChild) lastParentName = item.name;
  });
  return out;
}

/** "MESA 5" en doble tamaño a la izquierda y "Orden #123" en letra normal a
 * la derecha del mismo renglón. Un carácter doble ocupa 2 columnas normales.
 * Un "número" que no es número (el pre-ticket manda "PRE-TICKET") va tal cual. */
function tableOrderHeader(label, orderNumber) {
  const orderText = /^\d+$/.test(String(orderNumber)) ? `Orden #${orderNumber}` : String(orderNumber);
  const spaces = Math.max(1, 48 - label.length * 2 - orderText.length);
  return commands.alignLeft +
    commands.textSizeDouble + commands.bold + label + commands.boldOff + commands.textSizeNormal +
    " ".repeat(spaces) + orderText + "\n";
}

/** Fecha con formato fijo "01/11/2026 13:18" (toLocaleDateString daba "1/11/2026"). */
function ticketDateTime(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Renglón de totales: etiqueta alineada a la derecha y el monto en la
 * columna de Precio, para que todo el ticket se lea como una sola tabla. */
function totalRow(label, value, bold = false) {
  const labelW = RECEIPT_NAME_W + RECEIPT_QTY_W;
  let text = String(label);
  if (text.length > labelW - 1) text = text.slice(0, labelW - 1);
  const row = text.padStart(labelW) + String(value).padStart(RECEIPT_PRICE_W);
  return (bold ? commands.bold + row + commands.boldOff : row) + "\n";
}

function paymentMethodLabel(method) {
  return {
    cash: "Efectivo",
    card: "Tarjeta",
    transfer: "Transferencia",
    terminal_mercadopago: "Terminal",
  }[method] || method;
}

/** Leyenda legal en letra chica (font B) al pie del ticket de cuenta. */
function receiptLegalFooter() {
  return vgap(GAP_SECTION) + commands.alignCenter + commands.fontSmall +
    "Este ticket no es un comprobante fiscal\n" + commands.fontNormal + commands.alignLeft;
}

function keepPackageItemsTogether(items) {
  const childrenByParentName = new Map();
  const unmatchedChildren = [];

  for (const item of items) {
    if (!isPackageChild(item)) continue;
    if (item.parentName) {
      const children = childrenByParentName.get(item.parentName) || [];
      children.push(item);
      childrenByParentName.set(item.parentName, children);
    } else {
      unmatchedChildren.push(item);
    }
  }

  const ordered = [];
  for (const item of items) {
    if (isPackageChild(item)) continue;
    ordered.push(item);
    // Kitchen names may add a subcategory or reverse a variant, while
    // parentName is the original menu name. Match every original segment.
    for (const [parentName, children] of childrenByParentName.entries()) {
      if (!matchesPackageParent(item.name, parentName)) continue;
      ordered.push(...children);
      childrenByParentName.delete(parentName);
    }
  }

  for (const children of childrenByParentName.values()) ordered.push(...children);
  ordered.push(...unmatchedChildren);
  return ordered;
}

/**
 * Older POS clients send a kitchen payload directly to this server without
 * parent ids. Their package parent does include the selected flow steps, so
 * use the "Hacer paquete" choice to mark its immediately following child
 * items. New API payloads already carry explicit metadata and take priority.
 */
function inferLegacyPackageChildren(items) {
  const resolved = items.map((item) => ({ ...item }));

  for (let index = 0; index < resolved.length; index++) {
    const parent = resolved[index];
    if (isPackageChild(parent)) continue;
    const steps = Array.isArray(parent.flowSteps) ? parent.flowSteps : [];
    const hasPackageChoice = steps.some((step) => /hacer\s+paquete/i.test(String(step?.name || "")));
    if (!hasPackageChoice) continue;

    // The package-choice step itself is not a child. The remaining flow
    // choices correspond to the items that follow this parent in the legacy
    // POS payload (for example, entrada and bebida).
    let remainingChildren = steps.filter((step) => !/hacer\s+paquete/i.test(String(step?.name || ""))).length;
    for (let childIndex = index + 1; childIndex < resolved.length && remainingChildren > 0; childIndex++) {
      const candidate = resolved[childIndex];
      if (isPackageChild(candidate)) continue;
      const candidateSteps = Array.isArray(candidate.flowSteps) ? candidate.flowSteps : [];
      if (candidateSteps.some((step) => /hacer\s+paquete/i.test(String(step?.name || "")))) break;
      resolved[childIndex] = { ...candidate, isPackageChild: true, parentName: parent.name };
      remainingChildren -= 1;
    }
  }

  return resolved;
}

function isPackageParent(item) {
  if (item?.packageLabel) return true;
  const steps = Array.isArray(item?.flowSteps) ? item.flowSteps : [];
  return steps.some((step) => /hacer\s+paquete/i.test(String(step?.name || "")));
}

// Función para enviar a la impresora con fallback USB
function sendToPrinter(content) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let connectionFailed = false;
    
    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log("Conectado a la impresora");
      client.write(content, "binary");
    });
    
    client.on("data", (data) => {
      console.log("Respuesta de impresora:", data);
      client.destroy();
      resolve();
    });
    
    client.on("close", () => {
      console.log("Conexión cerrada");
      if (!connectionFailed) {
        resolve();
      }
    });
    
    client.on("error", async (err) => {
      connectionFailed = true;
      console.error("Error de conexión:", err);
      
      // Intentar fallback USB
      if (err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Intentando imprimir por USB...');
        try {
          await sendToUSBPrinter(content);
          resolve();
        } catch (usbError) {
          console.error('❌ Fallback USB también falló:', usbError.message);
          reject(err);
        }
      } else {
        reject(err);
      }
    });
    
    setTimeout(() => {
      if (!connectionFailed) {
        client.destroy();
        resolve();
      }
    }, 5000);
  });
}

// Abrir cajón de dinero vía ESC/POS TCP
function openCashDrawer() {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const OPEN_DRAWER = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    let done = false;

    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log('💰 Conectado a impresora para abrir cajón');
      client.write(OPEN_DRAWER, () => {
        client.end();
        done = true;
        resolve();
      });
    });

    client.on('error', (err) => {
      if (!done) {
        console.error('❌ Error abriendo cajón:', err.message);
        reject(err);
      }
    });

    setTimeout(() => {
      if (!done) {
        client.destroy();
        reject(new Error('Timeout abriendo cajón'));
      }
    }, 5000);
  });
}

app.post('/open-drawer', async (req, res) => {
  try {
    await openCashDrawer();
    console.log('✅ Cajón abierto');
    res.json({ success: true, message: 'Cajón abierto' });
  } catch (error) {
    console.error('❌ Error en /open-drawer:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de impresión
app.post('/print', async (req, res) => {
  try {
    const {
      customerName,
      orderNumber,
      items,
      subtotal,
      tip,
      total,
      tableNumber,
      isDelivery,
      paymentMethod,
      discount,
      openDrawer,
      customerPhone,
      deliveryAddress,
      survey,
      waiterName,
      guestCount
    } = req.body;

    let content = "";

    // Inicializar impresora
    content += commands.init;

    // Abrir cajón primero si se solicita (mismo socket = sin delay extra)
    if (openDrawer) {
      content += commands.drawerPulse;
    }

    // Logo + dirección, centrados y compactos
    content += lineSpacing(LINE_BODY);
    content += commands.alignCenter;
    const logoPath = path.join(__dirname, "public", "logo.jpg");
    if (fs.existsSync(logoPath)) {
      content += await imageToEscPosBitmap(logoPath, 400);
    } else {
      content += commands.textSizeLarge + commands.bold + "BRUMA\n" + commands.boldOff + commands.textSizeNormal;
    }
    content += vgap(GAP_SECTION);
    content += "Av. Panamericana Casa B14\n";
    content += "Col. Pedregal de Carrasco, CDMX\n";
    content += vgap(GAP_SECTION);

    // Datos de la orden: fecha fija dd/mm/aaaa hh:mm y quién atendió
    content += `${ticketDateTime()}\n`;
    content += vgap(GAP_ITEM);
    const serviceInfo = [
      waiterName ? `Atendió: ${waiterName}` : "",
      !isDelivery && guestCount > 0 ? `${guestCount} ${guestCount === 1 ? "persona" : "personas"}` : "",
    ].filter(Boolean).join(" · ");
    if (serviceInfo) content += `${serviceInfo}\n`;
    content += vgap(GAP_SECTION);

    // Mesa/Para Llevar grande y # de Orden chico, en el mismo renglón
    const label = isDelivery ? "PARA LLEVAR" : `MESA ${tableNumber}`;
    content += tableOrderHeader(label, orderNumber);

    // Si es delivery de plataforma (Uber/Rappi/Didi), mostrar logo + num pedido
    if (isDelivery && customerName) {
      const platformMatch = customerName.match(/^(Uber|Rappi|Didi)\s*#([A-Za-z0-9]{4})/i);
      if (platformMatch) {
        const platform = platformMatch[1].toLowerCase();
        const orderDigits = platformMatch[2];

        content += commands.feedLine;
        content += commands.alignCenter;
        const platformLogoPath = path.join(__dirname, "public", `${platform}.jpg`);
        if (fs.existsSync(platformLogoPath)) {
          content += await imageToEscPosBitmap(platformLogoPath, 200);
          content += commands.feedLine;
        }
        // Número de pedido grande debajo del logo (se lo dicen al repartidor)
        content += commands.textSizeLarge + commands.bold + `#${orderDigits}\n` + commands.boldOff + commands.textSizeNormal;
        content += commands.alignLeft;
      }
    }
    content += vgap(GAP_ITEM);

    // Platillos: encabezado con línea fina debajo y otra al cierre
    const allItems = [];
    for (const seat of Object.keys(items)) {
      allItems.push(...items[seat]);
    }
    content += commands.alignLeft;
    content += vgap(GAP_ITEM);
    content += receiptItemsBlock(allItems);
    content += vgap(GAP_SECTION);
    content += hairLine() + vgap(GAP_SECTION);

    // Totales alineados con la columna de Precio
    content += totalRow("Subtotal", `$${subtotal}`) + vgap(GAP_ITEM);

    const deliveryFee = req.body.deliveryFee || 0;
    if (deliveryFee > 0) content += totalRow("Envío a domicilio", `$${deliveryFee}`) + vgap(GAP_ITEM);

    // Promociones agrupadas por nombre. Sin prefijo de cantidad: el nombre
    // (p. ej. "2x1 Orden Pescaditos") ya lo dice y "2x 2x1" se leía raro.
    const byPromo = {};
    for (const item of allItems) {
      if (!item.promotionName || !(item.promotionDiscount > 0)) continue;
      byPromo[item.promotionName] = (byPromo[item.promotionName] || 0) + Math.round(item.promotionDiscount);
    }
    for (const [promoName, amount] of Object.entries(byPromo)) {
      content += totalRow(promoName, `-$${amount}`) + vgap(GAP_ITEM);
    }

    if (discount && discount.amount > 0) content += totalRow(discount.name || "Descuento", `-$${discount.amount}`) + vgap(GAP_ITEM);

    // Propina (si hay, excluyendo delivery fee)
    const actualTip = deliveryFee > 0 ? tip - deliveryFee : tip;
    if (actualTip > 0) content += totalRow("Propina", `$${actualTip}`) + vgap(GAP_ITEM);

    // TOTAL grande, separado del subtotal y cerrando en la columna de precios
    content += vgap(GAP_ITEM);
    content += commands.bold + commands.textSizeDouble;
    content += `TOTAL  $${total}`.padStart(24) + "\n";
    content += commands.textSizeNormal + commands.boldOff;
    content += vgap(GAP_SECTION);

    // Información de pago (solo si está pagado)
    if (paymentMethod) {
      content += totalRow("Pagado con", paymentMethodLabel(paymentMethod), true);
      const tipMethod = req.body.tipPaymentMethod || paymentMethod;
      if (tip > 0 && tipMethod !== paymentMethod) {
        content += totalRow("Propina pagada con", paymentMethodLabel(tipMethod));
      }
    }

    // Datos de contacto (pedidos en línea) — nombre, teléfono y, si es a
    // domicilio, la dirección de entrega, hasta el fondo del ticket.
    if (customerPhone || deliveryAddress) {
      content += hairLine() + vgap(GAP_SECTION);
      content += commands.alignLeft;
      if (customerName) content += `Cliente: ${customerName}\n`;
      if (customerPhone) content += `Tel: ${customerPhone}\n`;
      if (deliveryAddress) content += `Direccion: ${deliveryAddress}\n`;
    }

    // Footer: la encuesta ya da las gracias; sin ella, la línea de siempre.
    content += vgap(GAP_SECTION);
    if (survey) {
      content += await surveyFooter(survey);
    } else {
      content += hairLine() + vgap(GAP_SECTION);
      content += commands.alignCenter;
      content += "Gracias por su preferencia\n";
    }
    content += receiptLegalFooter();

    // Espacio final antes de cortar
    content += commands.feedLine;

    // Cortar papel
    content += commands.feed;
    content += commands.cut;

    // Enviar a la impresora
    await sendToPrinter(content);

    res.json({ success: true });
  } catch (error) {
    console.error("Error printing:", error);
    res.status(500).json({ error: "Error al imprimir" });
  }
});

// Endpoint para imprimir resumen de ventas
// ── Resumen del turno (productos vendidos, SIN dinero) ─────────────────────
// Mismo lenguaje visual que el ticket de cuenta y el corte.
//
// Payload nuevo (iPad ResumenView y dashboard /cash-register):
//   items: [{ productId, name, qty, category, categorySort, kind, hasPromo }]
//   kind: "sold" | "package" (incluido de un paquete) | "guest" (cortesía)
// Los anulados ya NO vienen (el cliente los filtra). El payload viejo
// (`products: [{ name, qty, hasPromo }]`, ya sumado y sin categoría) se sigue
// aceptando: sale como una sola categoría.

/** Nombre a la izquierda (se parte en renglones si no cabe) y cantidad en la
 * columna derecha del primer renglón. */
function summaryRow(indent, name, qty, { bold = false } = {}) {
  const qtyW = 6;
  const nameW = 48 - qtyW - indent.length;
  const rows = wrapText(name, nameW).map((part, i) => {
    const text = (i === 0 ? indent : " ".repeat(indent.length)) + part;
    return i === 0 ? text.padEnd(48 - qtyW) + String(qty).padStart(qtyW) : text;
  });
  rows[0] = bold ? commands.bold + rows[0] + commands.boldOff : rows[0];
  return rows.join("\n") + "\n";
}

/** "Espresso - Doble" → { base: "Espresso", variant: "Doble" }.
 * order_items.productName de una variante es "<producto> - <variante>". */
function splitVariant(name) {
  const i = String(name).lastIndexOf(" - ");
  return i > 0 ? { base: name.slice(0, i), variant: name.slice(i + 3) } : { base: name, variant: null };
}

/** Agrupa por categoría → producto → variante. */
function groupSummaryItems(items) {
  const categories = new Map();
  for (const item of items) {
    const catName = item.category || "Otros";
    if (!categories.has(catName)) {
      categories.set(catName, { name: catName, sort: item.category ? Number(item.categorySort ?? 9999) : 99999, qty: 0, products: new Map() });
    }
    const cat = categories.get(catName);
    const key = item.productId || splitVariant(item.name).base;
    if (!cat.products.has(key)) cat.products.set(key, { qty: 0, names: new Map(), hasPromo: false });
    const product = cat.products.get(key);
    const qty = Number(item.qty) || 0;
    cat.qty += qty;
    product.qty += qty;
    product.hasPromo = product.hasPromo || !!item.hasPromo;
    product.names.set(item.name, (product.names.get(item.name) || 0) + qty);
  }

  return [...categories.values()]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((cat) => ({
      name: cat.name,
      qty: cat.qty,
      products: [...cat.products.values()].map((p) => {
        const names = [...p.names.entries()];
        // Un solo nombre: se imprime completo ("Boing Sabores - Mango").
        if (names.length === 1) return { name: names[0][0], qty: p.qty, hasPromo: p.hasPromo, variants: [] };
        const base = splitVariant(names[0][0]).base;
        return {
          name: base,
          qty: p.qty,
          hasPromo: p.hasPromo,
          variants: names
            .map(([n, q]) => ({ name: splitVariant(n).base === base ? (splitVariant(n).variant || n) : n, qty: q }))
            .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
        };
      }).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
    }));
}

function sumByName(items) {
  const totals = new Map();
  for (const item of items) totals.set(item.name, (totals.get(item.name) || 0) + (Number(item.qty) || 0));
  return [...totals.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

async function buildSummaryTicket(data) {
  const items = Array.isArray(data.items)
    ? data.items
    : (data.products || []).map((p) => ({ name: p.name, qty: p.qty, hasPromo: p.hasPromo, kind: "sold", category: "Productos", categorySort: 0 }));
  const sold = items.filter((i) => (i.kind || "sold") === "sold");
  const packageItems = items.filter((i) => i.kind === "package");
  const guestItems = items.filter((i) => i.kind === "guest");
  const categories = groupSummaryItems(sold);
  const soldPieces = sold.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  const promoMark = (p) => (p.hasPromo ? `*${p.name}` : p.name);

  let c = commands.init + lineSpacing(LINE_BODY);

  // Encabezado
  c += commands.alignCenter;
  const logoPath = path.join(__dirname, "public", "logo.jpg");
  if (fs.existsSync(logoPath)) {
    c += await imageToEscPosBitmap(logoPath, 400);
  } else {
    c += commands.textSizeLarge + commands.bold + "BRUMA\n" + commands.boldOff + commands.textSizeNormal;
  }
  c += vgap(GAP_SECTION);
  c += commands.textSizeTall + commands.bold + "RESUMEN DEL TURNO\n" + commands.boldOff + commands.textSizeNormal;
  c += vgap(GAP_ITEM);
  if (data.openedAt) c += `Turno abierto · ${ticketDateTime(new Date(data.openedAt))}\n`;
  c += `Impreso${data.printedBy ? ` por ${data.printedBy}` : ""} · ${ticketDateTime()}\n`;
  c += commands.alignLeft;
  c += vgap(GAP_SECTION);

  // Conteos
  c += commands.textSizeTall;
  c += corteRow("Órdenes", String(Number(data.totalOrders) || 0), { bold: true });
  c += commands.textSizeNormal;
  if (data.tableCount != null) c += corteRow("En mesa", String(data.tableCount), { indent: 2 });
  if (data.takeoutCount != null) c += corteRow("Para llevar", String(data.takeoutCount), { indent: 2 });
  c += vgap(GAP_ITEM);
  c += commands.textSizeTall;
  c += corteRow("Piezas vendidas", String(soldPieces), { bold: true });
  c += commands.textSizeNormal;
  c += vgap(GAP_SECTION);

  // Lo más vendido (por producto, todas las variantes juntas)
  const top = categories.flatMap((cat) => cat.products).sort((a, b) => b.qty - a.qty).slice(0, 5);
  if (top.length) {
    c += corteSection("LO MÁS VENDIDO");
    top.forEach((p, i) => { c += summaryRow(`${i + 1}. `, promoMark(p), p.qty); });
    c += vgap(GAP_SECTION);
  }

  // Por categoría
  for (const cat of categories) {
    c += commands.bold + summaryRow("", cat.name.toUpperCase(), cat.qty).replace(/\n$/, "") + commands.boldOff + "\n";
    c += hairLine() + vgap(GAP_ITEM);
    cat.products.forEach((p, i) => {
      if (i > 0 && (p.variants.length || cat.products[i - 1].variants.length)) c += vgap(GAP_ITEM);
      c += summaryRow("", promoMark(p), p.qty);
      for (const v of p.variants) c += summaryRow("    ", v.name, v.qty);
    });
    c += vgap(GAP_SECTION);
  }

  // Lo que salió pero no se vendió suelto
  if (packageItems.length) {
    c += corteSection("INCLUIDOS EN PAQUETES");
    for (const p of sumByName(packageItems)) c += summaryRow("", p.name, p.qty);
    c += vgap(GAP_SECTION);
  }
  if (guestItems.length) {
    c += corteSection("CORTESÍAS");
    for (const p of sumByName(guestItems)) c += summaryRow("", p.name, p.qty);
    c += vgap(GAP_SECTION);
  }

  const promotions = data.promotionSummary || [];
  if (promotions.length) {
    c += corteSection("PROMOCIONES APLICADAS");
    for (const promo of promotions) c += summaryRow("", promo.name, promo.count);
    c += vgap(GAP_SECTION);
  }
  if (sold.some((i) => i.hasPromo)) {
    c += commands.fontSmall + "* Con promoción aplicada\n" + commands.fontNormal;
    c += vgap(GAP_SECTION);
  }

  c += commands.feed + commands.cut;
  return c;
}

function demoSummaryData() {
  const opened = new Date(Date.now() - 11 * 3600 * 1000);
  const cat = (category, categorySort) => (productId, name, qty, extra = {}) =>
    ({ productId, name, qty, category, categorySort, kind: "sold", ...extra });
  const bebidas = cat("Bebidas", 1), entradas = cat("Entradas", 2), cocteles = cat("Cocteles", 3), fuertes = cat("Platos fuertes", 4);
  return {
    openedAt: opened.toISOString(),
    printedBy: "Luis (PRUEBA)",
    totalOrders: 64,
    tableCount: 50,
    takeoutCount: 14,
    items: [
      bebidas("p1", "Limonada - Natural", 18), bebidas("p1", "Limonada - Mineral", 9),
      bebidas("p2", "Espresso - Doble", 8), bebidas("p2", "Espresso - Sencillo", 4),
      bebidas("p3", "Boing Sabores - Mango", 7), bebidas("p4", "Agua mineral", 11),
      entradas("p5", "Tostada de pulpo", 14), entradas("p6", "Empanada Mixta", 9, { hasPromo: true }),
      entradas("p7", "Quesadilla de camarón - Pieza", 6),
      cocteles("p8", "Coctel de camarón - Grande", 12), cocteles("p8", "Coctel de camarón - Chico", 5),
      cocteles("p9", "Aguachile Verde", 16),
      fuertes("p10", "Caldo de camarón pelado con verduras de temporada", 7), fuertes("p11", "Camarones Coco", 10),
      { productId: "p7", name: "Quesadilla de camarón - Pieza", qty: 8, kind: "package" },
      { productId: "p3", name: "Boing Sabores - Mango", qty: 8, kind: "package" },
      { productId: "p4", name: "Agua mineral", qty: 2, kind: "guest" },
    ],
    promotionSummary: [{ name: "2x1 Empanadas", count: 9 }],
  };
}

app.post('/print-summary', async (req, res) => {
  try {
    await sendToPrinter(await buildSummaryTicket(req.body));
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing summary:", error);
    res.status(500).json({ error: "Error al imprimir resumen" });
  }
});

// Prueba del resumen con datos dummy: `npm run test:resumen`.
app.post('/print-summary/test', async (req, res) => {
  try {
    await sendToPrinter(await buildSummaryTicket(demoSummaryData()));
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing resumen de prueba:", error);
    res.status(500).json({ error: "Error al imprimir resumen de prueba" });
  }
});

// Endpoint para imprimir ticket por asiento (cuenta dividida)
app.post('/print-seat-bill', async (req, res) => {
  try {
    const { tableNumber, orderNumber, seatLabel, items, subtotal, tip, discount, total, paymentMethod } = req.body;
    console.log('🪑 Imprimiendo ticket por asiento:', seatLabel, '| Mesa:', tableNumber);

    let content = "";

    // Inicializar impresora
    content += commands.init;
    content += commands.alignCenter;

    // Logo
    const logoPath = path.join(__dirname, "public", "logo.jpg");
    if (fs.existsSync(logoPath)) {
      const logoBitmap = await imageToEscPosBitmap(logoPath, 400);
      content += logoBitmap;
      content += commands.feedLine;
      content += commands.feedLine;
    } else {
      content += commands.textSizeLarge;
      content += commands.bold;
      content += "BRUMA\n";
      content += commands.boldOff;
      content += commands.textSizeNormal;
    }
    content += commands.feedLine;

    // Dirección
    content += "Av. Panamericana Casa B14\n";
    content += "Col. Pedregal de Carrasco, CDMX\n";
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;

    // Fecha y hora
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
    const timeStr = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
    content += `${dateStr} ${timeStr}\n`;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;

    // Mesa y orden
    const tableLabel = tableNumber ? `MESA ${tableNumber}` : "PARA LLEVAR";
    content += tableOrderHeader(tableLabel, orderNumber);
    content += commands.feedLine;

    // Encabezado de cuenta dividida
    content += commands.alignCenter;
    content += commands.bold;
    content += `CUENTA DIVIDIDA\n`;
    content += commands.textSizeDouble;
    content += `${seatLabel.toUpperCase()}\n`;
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    content += commands.feedLine;

    // Separador
    content += commands.alignLeft;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;

    // Items (tabla Producto | Cant | Precio)
    content += receiptItemsBlock(items);

    content += commands.feedLine;
    content += commands.feedLine;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;

    // Subtotal
    content += "Subtotal:";
    const subtotalStr = `$${typeof subtotal === 'number' ? subtotal.toFixed(2) : subtotal}`;
    content += " ".repeat(Math.max(1, 48 - 9 - subtotalStr.length)) + subtotalStr + "\n";
    content += commands.feedLine;

    // Descuento (si aplica)
    if (discount && discount.amount > 0) {
      const discLabel = `${discount.name || 'Descuento'}:`;
      const discStr = `-$${parseFloat(discount.amount).toFixed(2)}`;
      content += discLabel;
      content += " ".repeat(Math.max(1, 48 - discLabel.length - discStr.length)) + discStr + "\n";
      content += commands.feedLine;
    }

    // Propina (si aplica)
    if (tip && tip > 0) {
      content += "Propina:";
      const tipStr = `$${parseFloat(tip).toFixed(2)}`;
      content += " ".repeat(Math.max(1, 48 - 8 - tipStr.length)) + tipStr + "\n";
      content += commands.feedLine;
    }

    // Total
    content += commands.feedLine;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "TOTAL:";
    const totalStr = `$${typeof total === 'number' ? total.toFixed(2) : total}`;
    content += " ".repeat(Math.max(1, 24 - 6 - totalStr.length)) + totalStr + "\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    content += commands.feedLine;

    // Sección de pago (solo si ya pagó)
    if (paymentMethod) {
      content += solidLine() + commands.feedLine;
      content += commands.feedLine;
      content += commands.bold;
      content += "PAGADO\n";
      content += commands.boldOff;
      content += commands.feedLine;
      const methodLabel = paymentMethod === 'cash' ? 'Efectivo' :
                         paymentMethod === 'card' ? 'Tarjeta' :
                         paymentMethod === 'transfer' ? 'Transferencia' :
                         paymentMethod === 'terminal_mercadopago' ? 'Terminal' : paymentMethod;
      content += `Metodo: ${methodLabel}\n`;
      content += commands.feedLine;
    } else {
      // Pre-cuenta - nota al pie
      content += commands.alignCenter;
      content += solidLine(2) + commands.feedLine;
      content += commands.feedLine;
      content += "PRE-CUENTA\n";
      content += "No es comprobante de pago\n";
      content += commands.feedLine;
    }

    // Footer
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.alignCenter;
    content += "Gracias por su preferencia\n";
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;

    content += commands.feed;
    content += commands.cut;

    await sendToPrinter(content);

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error imprimiendo ticket por asiento:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para imprimir ticket de cuenta dividida
app.post('/print-split', async (req, res) => {
  try {
    const { tableNumber, orderNumber, customerName, items, subtotal, tip, total, paymentMethod, splitInfo } = req.body;
    console.log('💰 Imprimiendo ticket dividido:', splitInfo);

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

    let content = "";
    content += commands.init;
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "ESPANTAPAJAROS\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += `${dateStr} ${timeStr}\n`;
    
    // Split info
    content += commands.bold;
    content += `${splitInfo}\n`;
    content += commands.boldOff;
    
    if (tableNumber) {
      content += `Mesa: ${tableNumber}\n`;
    } else if (customerName) {
      content += `Cliente: ${customerName}\n`;
    }
    content += `Orden: ${orderNumber}\n`;
    content += solidLine() + commands.feedLine;
    content += commands.alignLeft;

    // Items
    for (const item of items) {
      const { child: isChild, label } = receiptItemLabel(item);
      const itemName = label.length > 20 ? label.substring(0, 20) : label;
      const qty = item.qty;
      const price = item.price;
      const itemTotal = item.total;
      
      content += `${qty}x ${itemName}\n`;
      content += `   $${price.toFixed(2)} c/u    $${itemTotal.toFixed(2)}\n`;

      if (item.modifiers && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          content += `   + ${mod.name} (+$${mod.price})\n`;
        }
      }
      if (isChild && item.parentName) content += `      Paquete: ${item.parentName}\n`;
    }

    content += solidLine() + commands.feedLine;
    content += commands.alignRight;
    content += `Subtotal:    $${subtotal.toFixed(2)}\n`;
    
    if (tip > 0) {
      content += `Propina:     $${tip.toFixed(2)}\n`;
    }
    
    content += commands.bold;
    content += commands.textSizeDouble;
    content += `TOTAL:       $${total.toFixed(2)}\n`;
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    
    // Payment method
    if (paymentMethod) {
      content += commands.alignCenter;
      const methodText = paymentMethod === 'cash' ? 'EFECTIVO' :
                        paymentMethod === 'terminal_mercadopago' ? 'TERMINAL' :
                        paymentMethod === 'transfer' ? 'TRANSFERENCIA' : paymentMethod.toUpperCase();
      content += `Método: ${methodText}\n`;
    }
    
    content += "\n";
    content += commands.alignCenter;
    content += "¡Gracias por su visita!\n";
    content += "\n\n";
    content += commands.feed;
    content += commands.cut;

    // Enviar a impresora con fallback USB
    const client = new net.Socket();
    let responseSent = false;

    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log('📡 Conectado a impresora para ticket dividido');
      client.write(content, 'binary', () => {
        client.end();
      });
    });

    client.on('error', async (err) => {
      console.error('❌ Error impresora:', err.message);
      
      // Intentar fallback USB
      if (err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Intentando imprimir ticket dividido por USB...');
        try {
          await sendToUSBPrinter(content);
          if (!responseSent) {
            responseSent = true;
            res.json({ success: true, message: 'Impreso por USB' });
          }
        } catch (usbError) {
          console.error('❌ Fallback USB también falló:', usbError.message);
          if (!responseSent) {
            responseSent = true;
            res.status(500).json({ error: err.message });
          }
        }
      } else {
        if (!responseSent) {
          responseSent = true;
          res.status(500).json({ error: err.message });
        }
      }
    });

    client.on('close', () => {
      console.log('✅ Ticket dividido enviado a impresora');
      if (!responseSent) {
        responseSent = true;
        res.json({ success: true });
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para imprimir ticket de cortesía con línea de firma
app.post('/print-guest', async (req, res) => {
  try {
    const { items, orderNumber } = req.body;
    console.log('🎁 Imprimiendo ticket de cortesía:', items);

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

    let content = "";
    content += commands.init;
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "CORTESIA\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += `${dateStr} ${timeStr}\n`;
    content += `Orden: ${orderNumber}\n`;
    content += solidLine() + commands.feedLine;
    content += commands.alignLeft;

    // Items
    for (const item of items) {
      const line = `${item.qty}x ${item.name}`;
      content += `${line}\n`;
      content += `  > Invitado\n`;
    }

    content += "\n";
    content += solidLine() + commands.feedLine;
    content += commands.alignCenter;
    content += commands.bold;
    content += "TOTAL: $0.00\n";
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    content += "\n\n\n";
    content += "________________________________\n";
    content += "\n";
    content += "Firma del responsable\n";
    content += "\n\n";
    content += commands.feed;
    content += commands.cut;

    // Enviar a impresora con fallback USB
    const client = new net.Socket();
    let responseSent = false;

    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log('📡 Conectado a impresora para ticket cortesía');
      client.write(content, 'binary', () => {
        client.end();
      });
    });

    client.on('error', async (err) => {
      console.error('❌ Error impresora:', err.message);
      
      // Intentar fallback USB
      if (err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Intentando imprimir ticket cortesía por USB...');
        try {
          await sendToUSBPrinter(content);
          if (!responseSent) {
            responseSent = true;
            res.json({ success: true, message: 'Impreso por USB' });
          }
        } catch (usbError) {
          console.error('❌ Fallback USB también falló:', usbError.message);
          if (!responseSent) {
            responseSent = true;
            res.status(500).json({ error: err.message });
          }
        }
      } else {
        if (!responseSent) {
          responseSent = true;
          res.status(500).json({ error: err.message });
        }
      }
    });

    client.on('close', () => {
      console.log('✅ Ticket cortesía enviado a impresora');
      if (!responseSent) {
        responseSent = true;
        res.json({ success: true });
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Función para enviar a la impresora de cocina
function sendToKitchenPrinter(content) {
  return new Promise((resolve, reject) => {
    if (KITCHEN_PRINTER_IP === "YOUR_KITCHEN_PRINTER_IP") {
      console.warn("⚠️  Kitchen printer IP not configured, skipping print");
      resolve();
      return;
    }
    const client = new net.Socket();
    
    client.connect(KITCHEN_PRINTER_PORT, KITCHEN_PRINTER_IP, () => {
      console.log("🍳 Conectado a impresora de cocina");
      client.write(content, "binary");
    });
    
    client.on("data", (data) => {
      console.log("Respuesta de impresora cocina:", data);
      client.destroy();
      resolve();
    });
    
    client.on("close", () => {
      console.log("Conexión cocina cerrada");
      resolve();
    });
    
    client.on("error", (err) => {
      console.error("Error de conexión cocina:", err);
      reject(err);
    });
    
    setTimeout(() => {
      client.destroy();
      resolve();
    }, 5000);
  });
}

// Endpoint para imprimir comanda en cocina
app.post('/print-comanda', async (req, res) => {
  try {
    const { tableNumber, orderNumber, customerName, items, guestCount, isPractice } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items to print" });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

    let content = "";

    // Inicializar impresora
    content += commands.init;

    // Modo Práctica: letrero grande hasta arriba, antes que nada más — la
    // comanda es real (imprime/aparece en el Pase) pero nunca se debe
    // confundir con un pedido real de cocina.
    if (isPractice) {
      content += commands.alignCenter;
      content += commands.bold;
      content += commands.textSizeLarge;
      content += "MODO\nPRACTICA\n";
      content += commands.textSizeNormal;
      content += commands.boldOff;
      content += commands.feedLine;
      content += solidLine() + commands.feedLine;
      content += commands.feedLine;
    }

    // Header
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "COMANDA\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;

    // Mesa y número de orden
    content += commands.alignLeft;
    content += commands.bold;
    content += commands.textSizeDouble;
    const label = tableNumber ? `MESA ${tableNumber}` : "PARA LLEVAR";
    const orderText = `#${orderNumber || ''}`;
    const spaces = Math.max(1, 24 - label.length - orderText.length);
    content += label + " ".repeat(spaces) + orderText + "\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    
    // Guest count (pax) - SIEMPRE mostrar
    const paxCount = guestCount || 1;
    content += commands.alignCenter;
    content += commands.bold;
    content += `${paxCount} PAX\n`;
    content += commands.boldOff;
    
    // Nombre del cliente (si es delivery con plataforma, mostrar logo)
    if (customerName) {
      const platformMatchComanda = customerName.match(/^(Uber|Rappi|Didi)\s*#([A-Za-z0-9]{4})/i);
      if (platformMatchComanda) {
        const platformName = platformMatchComanda[1];
        const digits = platformMatchComanda[2];
        content += commands.alignCenter;
        content += commands.textSizeLarge;
        content += commands.bold;
        content += `${platformName} #${digits}\n`;
        content += commands.boldOff;
        content += commands.textSizeNormal;
      } else {
        content += commands.alignCenter;
        content += commands.bold;
        content += customerName + "\n";
        content += commands.boldOff;
      }
    }
    
    content += commands.alignLeft;
    content += commands.feedLine;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;

    // Cocina prepara el paquete como un bloque: fuerte, entrada y bebida.
    // El Pase conserva su propio ruteo; esta agrupación solo cambia papel.
    const packageAwareItems = inferLegacyPackageChildren(items);

    const appendItem = (item, { packageChild = false } = {}) => {
      const childPrefix = packageChild ? "   -> " : "";
      const packageBadge = !packageChild && isPackageParent(item)
        ? ` [${String(item.packageLabel || "PAQUETE").toUpperCase()}]`
        : "";
      const detailIndent = packageChild ? "      " : "   ";

      content += commands.bold;
      content += commands.textSizeTall;
      content += `${childPrefix}${item.qty}x ${item.name}${packageBadge}\n`;
      content += commands.textSizeNormal;
      content += commands.boldOff;

      if (item.frosting) {
        content += commands.bold;
        content += `${detailIndent}+ Frosting: ${item.frosting}\n`;
        content += commands.boldOff;
      }
      if (item.topping) {
        content += commands.bold;
        content += `${detailIndent}+ Topping: ${item.topping}\n`;
        content += commands.boldOff;
      }
      if (item.extra) {
        content += commands.bold;
        content += `${detailIndent}+ Extra: ${item.extra}\n`;
        content += commands.boldOff;
      }
      // Entrada y bebida ya están debajo del fuerte como componentes. Las
      // demás notas del flujo sí se conservan; el API marca las selecciones
      // que ya tienen un hijo para no repetirlas aquí.
      const hasSelectionMetadata = Array.isArray(item.flowSteps)
        && item.flowSteps.some((step) => Object.prototype.hasOwnProperty.call(step || {}, "isChildItemSelection"));
      const printableFlowSteps = Array.isArray(item.flowSteps) && (!isPackageParent(item) || hasSelectionMetadata)
        ? item.flowSteps.filter((step) => {
            const name = String(step?.name || "");
            if (/hacer\s+paquete/i.test(name)) return false;
            if (/^sin\s+paquete$/i.test(name)) return false;
            return step?.isChildItemSelection !== true;
          })
        : [];
      if (printableFlowSteps.length > 0) {
        for (const step of printableFlowSteps) {
          content += commands.bold;
          content += `${detailIndent}-> ${step.name}\n`;
          content += commands.boldOff;
        }
      }
      if (item.notes) {
        content += commands.bold;
        content += `${detailIndent}> Nota: ${item.notes}\n`;
        content += commands.boldOff;
      }
      content += commands.feedLine;
    };
    
    // Todos los componentes (incluida la bebida) permanecen con el paquete.
    if (packageAwareItems.length > 0) {
      // Agrupar por asiento
      const bySeat = {};
      for (const item of packageAwareItems) {
        const seat = item.seat || 'C';
        if (!bySeat[seat]) bySeat[seat] = [];
        bySeat[seat].push(item);
      }
      
      // Ordenar asientos (C al final)
      const seats = Object.keys(bySeat).sort((a, b) => {
        if (a === 'C') return 1;
        if (b === 'C') return -1;
        return a.localeCompare(b);
      });
      
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i];
        const seatItems = bySeat[seat];
        
        // Header de asiento
        content += commands.bold;
        content += commands.textSizeTall;
        content += seat === 'C' ? 'COMPARTIDO\n' : `ASIENTO ${seat}\n`;
        content += commands.textSizeNormal;
        content += commands.boldOff;
        content += commands.feedLine;
        content += solidLine() + commands.feedLine;
        content += commands.feedLine;

        // Agrupar por tiempo dentro del asiento
        const byCourse = {};
        for (const item of seatItems) {
          const course = item.course || 1;
          if (!byCourse[course]) byCourse[course] = [];
          byCourse[course].push(item);
        }
        
        const courses = Object.keys(byCourse).sort((a, b) => a - b);
        
        for (let j = 0; j < courses.length; j++) {
          const course = courses[j];
          const courseItems = keepPackageItemsTogether(byCourse[course]);
          
          // Header de tiempo (solo si hay múltiples tiempos)
          if (courses.length > 1) {
            content += commands.bold;
            content += `  T${course}\n`;
            content += commands.boldOff;
          }
          
          // Parent rows and child rows are inserted in separate DB batches,
          // so their incoming order is not necessarily adjacent. The helper
          // has already placed each identifiable child under its parent.
          for (const item of courseItems) {
            appendItem(item, { packageChild: isPackageChild(item) });
          }
        }

        // Separador entre asientos
        if (i < seats.length - 1) {
          content += commands.feedLine;
          content += solidLine(2) + commands.feedLine;
          content += commands.feedLine;
        }
      }
    }
    
    content += commands.feedLine;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;
    content += commands.alignCenter;
    content += timeStr + "\n";
    content += commands.feedLine;
    content += solidLine() + commands.feedLine;

    // Espacio y corte
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feed;
    content += commands.cut;

    // Enviar a la impresora de cocina
    await sendToKitchenPrinter(content);

    console.log(`🍳 Comanda impresa: ${label} - ${items.length} items`);
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing comanda:", error);
    res.status(500).json({ error: "Error al imprimir comanda" });
  }
});

// Endpoint para imprimir corte
// ── Corte de caja ─────────────────────────────────────────────────────────
// Mismo lenguaje visual que el ticket de cuenta: logo, líneas finas, cifras
// alineadas a la derecha y aire entre secciones (vgap/hairLine, ver arriba).

/** "$12,450" — redondeado y con separador de miles. Negativos como "-$200"
 * (el signo menos tipográfico no existe en WPC1252). */
function money(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US")}`;
}

/** Etiqueta a la izquierda y monto a la derecha, a lo ancho del papel. */
function corteRow(label, value, { indent = 0, bold = false } = {}) {
  const v = String(value);
  let l = " ".repeat(indent) + String(label);
  if (l.length > 47 - v.length) l = l.slice(0, 47 - v.length);
  const row = l + " ".repeat(48 - l.length - v.length) + v;
  return (bold ? commands.bold + row + commands.boldOff : row) + "\n";
}

function corteSection(title) {
  return commands.bold + title + commands.boldOff + "\n" + hairLine() + vgap(GAP_ITEM);
}

/** Etiqueta chica centrada y el monto grande debajo. */
function corteHero(label, value, size) {
  return commands.alignCenter + label + "\n" +
    size + commands.bold + value + "\n" + commands.boldOff + commands.textSizeNormal +
    commands.alignLeft;
}

function corteTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
}

/** Construye los bytes del corte. Separado del endpoint para poder imprimir
 * una prueba con datos dummy (POST /print-corte/test). Todo lo que no sea
 * sales/tips es opcional: un iPad con build viejo no manda `register`,
 * `printedBy` ni el detalle de movimientos, y el corte sale igual sin eso. */
async function buildCorteTicket(data) {
  const sales = data.sales || {};
  const tips = data.tips || {};
  const commissions = data.commissions || {};
  const movements = data.movements || {};
  const deposits = movements.deposits || { total: 0, count: 0 };
  const withdrawals = movements.withdrawals || { total: 0, count: 0 };
  const summary = data.summary || {};
  const register = data.register || {};
  const num = (v) => Number(v) || 0;
  // Si la tarjeta/online no traen neto (sin comisión registrada), neto = bruto.
  const netCard = sales.netCard ?? sales.card;
  const netOnline = sales.netOnline ?? sales.online;
  const tipsNetCard = tips.netCard ?? tips.card;
  const tipsNetOnline = tips.netOnline ?? tips.online;

  // Mismas fórmulas que CorteViewModel (iPad): "Ventas netas" es el número
  // grande de la vista de Caja.
  const netSales = num(sales.cash) + num(sales.transfer) + num(netCard) + num(netOnline);
  const netTips = num(tips.cash) + num(tips.transfer) + num(tipsNetCard) + num(tipsNetOnline);
  const cashTotal = num(sales.cash) + num(tips.cash);
  const electronicTotal = netSales + netTips - cashTotal;

  let c = commands.init + lineSpacing(LINE_BODY);

  // Encabezado
  c += commands.alignCenter;
  const logoPath = path.join(__dirname, "public", "logo.jpg");
  if (fs.existsSync(logoPath)) {
    c += await imageToEscPosBitmap(logoPath, 400);
  } else {
    c += commands.textSizeLarge + commands.bold + "BRUMA\n" + commands.boldOff + commands.textSizeNormal;
  }
  c += vgap(GAP_SECTION);
  c += commands.textSizeTall + commands.bold + "CORTE DE CAJA\n" + commands.boldOff + commands.textSizeNormal;
  c += vgap(GAP_ITEM);
  if (register.openedAt) {
    c += `Abrió${register.openedByName ? ` ${register.openedByName}` : ""} · ${ticketDateTime(new Date(register.openedAt))}\n`;
  }
  c += `Impreso${data.printedBy ? ` por ${data.printedBy}` : ""} · ${ticketDateTime()}\n`;
  c += commands.alignLeft;
  c += vgap(GAP_SECTION);

  // Ventas
  c += corteSection("VENTAS");
  c += corteRow("Efectivo", money(sales.cash));
  c += corteRow("Tarjeta", money(sales.card));
  if (num(netCard) !== num(sales.card)) c += corteRow("Neto", money(netCard), { indent: 2 });
  if (num(sales.transfer) > 0) c += corteRow("Transferencia", money(sales.transfer));
  if (num(sales.online) > 0) {
    c += corteRow("En línea", money(sales.online));
    if (num(netOnline) !== num(sales.online)) c += corteRow("Neto", money(netOnline), { indent: 2 });
  }
  c += vgap(GAP_ITEM);
  c += corteRow("Total bruto", money(sales.total), { bold: true });
  c += vgap(GAP_SECTION);

  // Propinas
  c += corteSection("PROPINAS");
  c += corteRow("Efectivo", money(tips.cash));
  c += corteRow("Tarjeta", money(tips.card));
  if (num(tipsNetCard) !== num(tips.card)) c += corteRow("Neto", money(tipsNetCard), { indent: 2 });
  if (num(tips.transfer) > 0) c += corteRow("Transferencia", money(tips.transfer));
  if (num(tips.online) > 0) {
    c += corteRow("En línea", money(tips.online));
    if (num(tipsNetOnline) !== num(tips.online)) c += corteRow("Neto", money(tipsNetOnline), { indent: 2 });
  }
  c += vgap(GAP_ITEM);
  c += corteRow("Total bruto", money(tips.total), { bold: true });
  c += vgap(GAP_SECTION);

  // Comisiones
  const onlineCommission = commissions.online || {};
  if (num(commissions.total) > 0 || num(onlineCommission.total) > 0) {
    c += corteSection("COMISIONES");
    if (num(commissions.total) > 0) {
      c += corteRow(`Terminal (${(num(commissions.rateWithIVA) * 100).toFixed(2)}%)`, money(-num(commissions.total)));
    }
    if (num(onlineCommission.total) > 0) {
      const fee = num(onlineCommission.fixedFeeWithIVA);
      c += corteRow(`En línea (${(num(onlineCommission.rateWithIVA) * 100).toFixed(2)}% + $${fee.toFixed(2)})`, money(-num(onlineCommission.total)));
    }
    c += vgap(GAP_SECTION);
  }

  // Cómo se reparte el dinero: lo que está en la caja vs. lo que llega al banco
  c += corteSection("POR FORMA DE PAGO");
  c += corteRow("Efectivo + propinas efectivo", money(cashTotal), { bold: true });
  c += vgap(GAP_ITEM);
  c += corteRow("Tarjeta y transferencias", money(electronicTotal), { bold: true });
  c += corteRow("Tarjeta neto", money(netCard), { indent: 2 });
  c += corteRow("Propinas tarjeta neto", money(tipsNetCard), { indent: 2 });
  if (num(netOnline) + num(tipsNetOnline) > 0) {
    c += corteRow("En línea neto (con propinas)", money(num(netOnline) + num(tipsNetOnline)), { indent: 2 });
  }
  if (num(sales.transfer) + num(tips.transfer) > 0) {
    c += corteRow("Transferencias", money(num(sales.transfer) + num(tips.transfer)), { indent: 2 });
  }
  c += vgap(GAP_SECTION);

  // Los dos números grandes
  c += hairLine() + vgap(GAP_SECTION);
  c += corteHero("VENTAS NETAS", money(netSales), commands.textSizeDouble);
  c += vgap(GAP_SECTION);
  c += corteHero("Total con propinas", money(netSales + netTips), commands.textSizeDouble);
  c += vgap(GAP_SECTION);
  c += hairLine() + vgap(GAP_SECTION);

  // Movimientos de caja, uno por uno si el iPad manda el detalle
  const movementRows = [
    ...(deposits.items || []).map((m) => ({ ...m, sign: 1 })),
    ...(withdrawals.items || []).map((m) => ({ ...m, sign: -1 })),
  ].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (num(deposits.total) > 0 || num(withdrawals.total) > 0) {
    c += corteSection("MOVIMIENTOS DE CAJA");
    if (movementRows.length) {
      for (const m of movementRows) {
        const what = m.description || (m.sign > 0 ? "Depósito" : "Sangría");
        c += corteRow(`${corteTime(m.createdAt)}  ${what}`, money(m.sign * num(m.amount)));
      }
      c += vgap(GAP_ITEM);
    }
    if (num(deposits.total) > 0) c += corteRow(`Depósitos (${deposits.count})`, money(deposits.total), { bold: true });
    if (num(withdrawals.total) > 0) c += corteRow(`Sangrías (${withdrawals.count})`, money(-num(withdrawals.total)), { bold: true });
    c += vgap(GAP_SECTION);
  }

  // Cuadre de efectivo: la suma explícita, para poder revisarla en papel
  c += corteSection("EFECTIVO EN CAJA");
  if (register.initialCash != null) {
    c += corteRow("Fondo inicial", money(register.initialCash));
    c += corteRow("+ Ventas en efectivo", money(sales.cash));
    c += corteRow("+ Propinas en efectivo", money(tips.cash));
    if (num(deposits.total) > 0) c += corteRow("+ Depósitos", money(deposits.total));
    if (num(withdrawals.total) > 0) c += corteRow("- Sangrías", money(-num(withdrawals.total)));
    c += hairLine() + vgap(GAP_ITEM);
  }
  c += commands.textSizeTall;
  c += corteRow("Efectivo esperado", money(summary.expectedCash), { bold: true });
  c += commands.textSizeNormal;
  c += vgap(GAP_SECTION);

  // Resumen
  const orders = num(summary.totalOrders);
  c += corteSection("RESUMEN");
  c += corteRow("Órdenes", String(orders));
  if (num(summary.splitOrders) > 0) c += corteRow("Pagos divididos", String(summary.splitOrders));
  if (orders > 0) c += corteRow("Ticket promedio", money(netSales / orders));
  c += vgap(GAP_SECTION);

  // Firmas
  c += vgap(GAP_SECTION) + vgap(GAP_SECTION);
  c += "  ________________      ________________\n";
  c += "       Entregó               Recibió\n";

  c += vgap(GAP_SECTION);
  c += commands.feed + commands.cut;
  return c;
}

/** Datos inventados para imprimir una prueba del corte sin tocar la caja. */
function demoCorteData() {
  const today = new Date();
  const opened = new Date(today.getTime() - 11 * 3600 * 1000);
  const at = (h) => new Date(opened.getTime() + h * 3600 * 1000).toISOString();
  return {
    register: { openedAt: opened.toISOString(), closedAt: null, initialCash: 1000, openedByName: "Ana (PRUEBA)" },
    printedBy: "Luis (PRUEBA)",
    sales: { total: 28450, cash: 8450, card: 15800, transfer: 1200, online: 3000, netCard: 15250, netOnline: 2890 },
    tips: { total: 3320, cash: 620, card: 2500, transfer: 0, online: 200, netCard: 2413, netOnline: 193 },
    commissions: { rateWithIVA: 0.0348, total: 637, online: { rateWithIVA: 0.0418, fixedFeeWithIVA: 3.48, total: 117 } },
    movements: {
      deposits: { total: 500, count: 1, items: [{ amount: 500, description: "Cambio extra", createdAt: at(2) }] },
      withdrawals: { total: 1200, count: 2, items: [
        { amount: 200, description: "Hielo", createdAt: at(4.5) },
        { amount: 1000, description: "Pago proveedor pescado", createdAt: at(7) },
      ] },
    },
    summary: { totalOrders: 64, splitOrders: 3, expectedCash: 9370 },
  };
}

app.post('/print-corte', async (req, res) => {
  try {
    await sendToPrinter(await buildCorteTicket(req.body));
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing corte:", error);
    res.status(500).json({ error: "Error al imprimir corte" });
  }
});

// Prueba del corte con datos dummy: `npm run test:corte` (ver package.json).
app.post('/print-corte/test', async (req, res) => {
  try {
    await sendToPrinter(await buildCorteTicket(demoCorteData()));
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing corte de prueba:", error);
    res.status(500).json({ error: "Error al imprimir corte de prueba" });
  }
});

// Ticket de "cuánto le debemos a un proveedor" — módulo Proveedores del
// dashboard. scope: "supplier" | "category" | "all". Para "all" las líneas
// vienen agrupadas por proveedor en `bySupplier`; para los otros dos casos
// vienen planas en `lines`.
app.post('/print-supplier', async (req, res) => {
  try {
    const { scope, supplierName, categoryName, dateFrom, dateTo, lines, grandTotal, bySupplier } = req.body;

    let content = "";
    content += commands.init;
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "BRUMA\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;

    content += commands.bold;
    content += commands.textSizeDouble;
    content += "NOTA PROVEEDOR\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;

    if (scope === "supplier") content += `Proveedor: ${supplierName}\n`;
    if (scope === "category") content += `Proveedor: ${supplierName}\nCategoria: ${categoryName}\n`;
    if (scope === "all") content += "Consolidado: TODOS LOS PROVEEDORES\n";
    content += `Periodo: ${dateFrom} a ${dateTo}\n`;
    content += commands.feedLine;

    content += commands.alignLeft;

    function printLine(l) {
      const label = l.variantName ? `${l.productName} - ${l.variantName}` : l.productName;
      const detail =
        l.pricingType === "percentage" && l.businessCutPercent != null
          ? `Bruma ${l.businessCutPercent}% / Prov ${100 - l.businessCutPercent}%`
          : `$${l.costPrice} c/u`;
      content += `${l.quantitySold}x ${label}\n`;
      content += `   ${detail} = $${Math.round(l.lineTotal)}\n`;
    }

    if (scope === "all" && Array.isArray(bySupplier)) {
      for (const s of bySupplier) {
        content += commands.bold + `${s.supplierName}\n` + commands.boldOff;
        content += solidLine() + commands.feedLine;
        for (const l of s.lines) printLine(l);
        content += `Subtotal: $${Math.round(s.total)}\n`;
        content += commands.feedLine;
      }
    } else {
      content += solidLine() + commands.feedLine;
      for (const l of lines || []) printLine(l);
    }

    content += solidLine() + commands.feedLine;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += `TOTAL: $${Math.round(grandTotal)}\n`;
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feed;
    content += commands.cut;

    await sendToPrinter(content);
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing supplier ticket:", error);
    res.status(500).json({ error: "Error al imprimir ticket de proveedor" });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    ticketPrinter: `${PRINTER_IP}:${PRINTER_PORT}`,
    kitchenPrinter: `${KITCHEN_PRINTER_IP}:${KITCHEN_PRINTER_PORT}` 
  });
});

app.listen(PORT, () => {
  console.log(`🖨️  Servidor de impresión corriendo en http://localhost:${PORT}`);
  console.log(`📡 Impresora tickets: ${PRINTER_IP}:${PRINTER_PORT}`);
  console.log(`🍳 Impresora cocina: ${KITCHEN_PRINTER_IP}:${KITCHEN_PRINTER_PORT}`);
});
