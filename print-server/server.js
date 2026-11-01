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
app.post('/print-summary', async (req, res) => {
  try {
    const {
      date,
      registerName,
      totalOrders,
      takeoutCount,
      tableCount,
      products,
      promotionSummary
    } = req.body;

    let content = "";
    
    // Inicializar impresora
    content += commands.init;
    
    // Header centrado
    content += commands.alignCenter;
    content += commands.feedLine;
    content += commands.bold;
    content += "BRUMA\n";
    content += commands.boldOff;
    content += "Mariscos y Cocteles\n";
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Título
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "RESUMEN DEL TURNO\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    
    // Fecha y hora
    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleDateString('es-MX', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      timeZone: 'America/Mexico_City'
    });
    const timeStr = dateObj.toLocaleTimeString('es-MX', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'America/Mexico_City'
    });
    content += `${dateStr} - ${timeStr}\n`;
    content += `${registerName}\n`;
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Línea separadora
    content += commands.alignLeft;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;
    
    // Conteo de órdenes (sin dinero — los montos van en el Corte)
    const countLine = (label, value) => {
      const v = `${value}`;
      return label + " ".repeat(Math.max(1, 48 - label.length - v.length)) + v + "\n";
    };

    content += commands.bold;
    content += commands.textSizeDouble;
    content += "ORDENES:";
    const ordersStr = `${totalOrders ?? 0}`;
    content += " ".repeat(Math.max(1, 24 - 8 - ordersStr.length)) + ordersStr + "\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;

    content += countLine("Para llevar:", takeoutCount ?? 0);
    content += countLine("En mesa:", tableCount ?? 0);
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Productos vendidos
    if (products && products.length > 0) {
      content += solidLine() + commands.feedLine;
      content += commands.feedLine;
      content += commands.bold;
      content += "PRODUCTOS VENDIDOS\n";
      content += commands.boldOff;
      content += commands.feedLine;
      
      for (const product of products) {
        const productName = product.hasPromo ? `*${product.name}` : product.name;
        const qtyName = `${product.qty}x ${productName}`;
        // Limitar longitud del nombre si es muy largo
        const displayName = qtyName.length > 48 ? qtyName.slice(0, 45) + "..." : qtyName;
        content += displayName + "\n";
      }
      
      content += commands.feedLine;
    }

    if (promotionSummary && promotionSummary.length > 0) {
      content += solidLine() + commands.feedLine;
      content += commands.feedLine;
      content += commands.bold;
      content += "PROMOCIONES APLICADAS\n";
      content += commands.boldOff;
      content += commands.feedLine;

      for (const promotion of promotionSummary) {
        content += `${promotion.name} x${promotion.count}\n`;
      }

      content += commands.feedLine;
    }
    
    // Footer
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.alignCenter;
    content += "Gracias por su preferencia\n";
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.cut;
    
    // Enviar a impresora con fallback USB
    const client = new net.Socket();
    let responseSent = false;
    
    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log('✅ Conectado a impresora para resumen');
      client.write(content);
      client.end();
    });
    
    client.on('error', async (err) => {
      console.error('❌ Error de conexión:', err.message);
      
      // Intentar fallback USB
      if (err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Intentando imprimir resumen por USB...');
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
            res.status(500).json({ error: 'Error de conexión con impresora' });
          }
        }
      } else {
        if (!responseSent) {
          responseSent = true;
          res.status(500).json({ error: 'Error de conexión con impresora' });
        }
      }
    });
    
    client.on('close', () => {
      console.log('✅ Resumen enviado a impresora');
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
app.post('/print-corte', async (req, res) => {
  try {
    const {
      registerName,
      openedAt,
      closedAt,
      sales,
      tips,
      commissions,
      movements,
      summary
    } = req.body;

    let content = "";
    content += commands.init;
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "BRUMA\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += "Mariscos y Cocteles\n";
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Título
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "CORTE\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    
    // Fecha
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
    content += `${dateStr} ${timeStr}\n`;
    content += commands.feedLine;
    
    // VENTAS
    content += commands.alignLeft;
    content += commands.bold;
    content += "VENTAS\n";
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    if (sales.cash > 0) content += `Efectivo:      $${Math.round(sales.cash)}\n`;
    if (sales.card > 0) {
      content += `Tarjeta:       $${Math.round(sales.card)}\n`;
      if (sales.netCard !== sales.card) {
        content += `  Neto real:   $${Math.round(sales.netCard)}\n`;
      }
    }
    if (sales.transfer > 0) content += `Transferencia: $${Math.round(sales.transfer)}\n`;
    if (sales.online > 0) {
      content += `Online:        $${Math.round(sales.online)}\n`;
      if (sales.netOnline !== sales.online) {
        content += `  Neto real:   $${Math.round(sales.netOnline)}\n`;
      }
    }
    content += solidLine() + commands.feedLine;
    content += `Total bruto:   $${Math.round(sales.total)}\n`;
    if ((sales.netCard && sales.netCard !== sales.card) || (sales.netOnline && sales.netOnline !== sales.online)) {
      content += `Total neto:    $${Math.round(sales.cash + sales.transfer + (sales.netCard ?? sales.card) + (sales.netOnline ?? sales.online))}\n`;
    }
    content += commands.feedLine;

    // PROPINAS
    content += commands.bold;
    content += "PROPINAS\n";
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    if (tips.cash > 0) content += `Efectivo:      $${Math.round(tips.cash)}\n`;
    if (tips.card > 0) {
      content += `Tarjeta:       $${Math.round(tips.card)}\n`;
      if (tips.netCard !== tips.card) {
        content += `  Neto real:   $${Math.round(tips.netCard)}\n`;
      }
    }
    if (tips.transfer > 0) content += `Transferencia: $${Math.round(tips.transfer)}\n`;
    if (tips.online > 0) {
      content += `Online:        $${Math.round(tips.online)}\n`;
      if (tips.netOnline !== tips.online) {
        content += `  Neto real:   $${Math.round(tips.netOnline)}\n`;
      }
    }
    content += solidLine() + commands.feedLine;
    content += `Total bruto:   $${Math.round(tips.total)}\n`;
    content += commands.feedLine;

    // COMISIONES
    if (commissions && commissions.total > 0) {
      content += commands.bold;
      content += "COMISIONES BANCARIAS\n";
      content += commands.boldOff;
      content += `Tasa: ${(commissions.rateWithIVA * 100).toFixed(2)}%\n`;
      content += `Total: -$${Math.round(commissions.total)}\n`;
      content += commands.feedLine;
    }

    // COMISIÓN ONLINE (Stripe) — distinta a la de terminal
    if (commissions && commissions.online && commissions.online.total > 0) {
      content += commands.bold;
      content += "COMISION PEDIDOS EN LINEA\n";
      content += commands.boldOff;
      content += `Tasa: ${(commissions.online.rateWithIVA * 100).toFixed(2)}% + $${commissions.online.fixedFeeWithIVA.toFixed(2)}/op.\n`;
      content += `Total: -$${Math.round(commissions.online.total)}\n`;
      content += commands.feedLine;
    }
    
    // MOVIMIENTOS DE CAJA
    content += commands.bold;
    content += "MOVIMIENTOS DE CAJA\n";
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    if (movements.deposits.total > 0) {
      content += `Depósitos:     $${Math.round(movements.deposits.total)} (${movements.deposits.count})\n`;
    }
    if (movements.withdrawals.total > 0) {
      content += `Sangrías:     -$${Math.round(movements.withdrawals.total)} (${movements.withdrawals.count})\n`;
    }
    content += commands.feedLine;
    
    // RESUMEN
    content += commands.bold;
    content += "RESUMEN\n";
    content += commands.boldOff;
    content += solidLine() + commands.feedLine;
    content += `Órdenes:       ${summary.totalOrders}\n`;
    if (summary.splitOrders > 0) content += `Pagos divididos: ${summary.splitOrders}\n`;
    content += `Efectivo esperado: $${Math.round(summary.expectedCash)}\n`;
    if (summary.finalCash) {
      content += `Efectivo contado:  $${Math.round(summary.finalCash)}\n`;
      const diff = summary.finalCash - summary.expectedCash;
      if (diff >= 0) {
        content += `Diferencia:    +$${Math.round(diff)}\n`;
      } else {
        content += `Faltante:      -$${Math.round(Math.abs(diff))}\n`;
      }
    }
    content += commands.feedLine;
    
    // Footer
    content += commands.alignCenter;
    content += solidLine() + commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feed;
    content += commands.cut;

    await sendToPrinter(content);
    res.json({ success: true });
  } catch (error) {
    console.error("Error printing corte:", error);
    res.status(500).json({ error: "Error al imprimir corte" });
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
