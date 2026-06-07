const express = require('express');
const cors = require('cors');
const net = require('net');
const sharp = require('sharp');
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

const commands = {
  init: ESC + "@",
  alignCenter: ESC + "a" + "\x01",
  alignLeft: ESC + "a" + "\x00",
  alignRight: ESC + "a" + "\x02",
  bold: ESC + "E" + "\x01",
  boldOff: ESC + "E" + "\x00",
  cut: GS + "V" + "\x00",
  feed: ESC + "d" + "\x03",
  feedLine: "\n",
  textSizeNormal: GS + "!" + "\x00",
  textSizeDouble: GS + "!" + "\x11",
  textSizeLarge: GS + "!" + "\x22",
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
      discount 
    } = req.body;

    let content = "";
    
    // Inicializar impresora
    content += commands.init;
    
    // Logo centrado sin espacio arriba
    content += commands.alignCenter;
    
    // Imprimir logo desde archivo
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
    
    // Dirección centrada
    content += "Av. Panamericana Casa B14\n";
    content += "Col. Pedregal de Carrasco, CDMX\n";
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Fecha y hora centrada
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
    const timeStr = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
    content += `${dateStr} ${timeStr}\n`;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Mesa/Para Llevar y # de Orden con espacio justificado y más grandes
    content += commands.alignLeft;
    content += commands.textSizeDouble;
    content += commands.bold;
    const label = isDelivery ? "PARA LLEVAR" : `MESA ${tableNumber}`;
    content += label;
    content += commands.boldOff;
    const orderText = `#${orderNumber}`;
    const spaces = Math.max(1, 24 - label.length - orderText.length);
    content += " ".repeat(spaces);
    content += commands.bold;
    content += orderText + "\n";
    content += commands.boldOff;
    content += commands.textSizeNormal;
    content += commands.feedLine;
    
    // Si es delivery de plataforma (Uber/Rappi/Didi), mostrar logo + num pedido
    console.log("[TICKET] isDelivery:", isDelivery, "customerName:", JSON.stringify(customerName));
    if (isDelivery && customerName) {
      const platformMatch = customerName.match(/^(Uber|Rappi|Didi)\s*#([A-Za-z0-9]{4})/i);
      console.log("[TICKET] platformMatch:", platformMatch);
      if (platformMatch) {
        const platform = platformMatch[1].toLowerCase();
        const orderDigits = platformMatch[2];
        
        // Intentar imprimir logo de la plataforma
        const platformLogoPath = path.join(__dirname, "public", `${platform}.jpg`);
        if (fs.existsSync(platformLogoPath)) {
          content += commands.alignCenter;
          const platformBitmap = await imageToEscPosBitmap(platformLogoPath, 200);
          content += platformBitmap;
          content += commands.feedLine;
        }
        
        // Número de pedido grande debajo del logo
        content += commands.alignCenter;
        content += commands.textSizeLarge;
        content += commands.bold;
        content += `#${orderDigits}\n`;
        content += commands.boldOff;
        content += commands.textSizeNormal;
        content += commands.alignLeft;
        content += commands.feedLine;
      }
    }
    
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Línea separadora continua (80mm)
    content += commands.alignLeft;
    content += "------------------------------------------------\n";
    content += commands.feedLine;
    
    // Items todos juntos (más compacto, sin separar por asientos)
    const allItems = [];
    for (const seat of Object.keys(items)) {
      allItems.push(...items[seat]);
    }
    
    // Imprimir todos los items juntos
    for (const item of allItems) {
      const qtyName = `${item.qty}x ${item.name}`;
      const price = `$${item.total}`;
      const itemSpaces = Math.max(1, 48 - qtyName.length - price.length);
      content += qtyName + " ".repeat(itemSpaces) + price + "\n";
      
      // Agregar indicador de invitado si existe
      if (item.isGuest) {
        content += `  \u21b3 Invitado\n`;
      }
    }
    
    // Espacio antes del total
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Línea separadora continua (80mm)
    content += "------------------------------------------------\n";
    content += commands.feedLine;
    
    // Subtotal
    content += "Subtotal:";
    const subtotalStr = `$${subtotal}`;
    content += " ".repeat(48 - 9 - subtotalStr.length) + subtotalStr + "\n";
    content += commands.feedLine;
    
    // Envío a domicilio (si hay)
    const deliveryFee = req.body.deliveryFee || 0;
    if (deliveryFee > 0) {
      content += "Envio a domicilio:";
      const deliveryStr = `$${deliveryFee}`;
      content += " ".repeat(48 - 18 - deliveryStr.length) + deliveryStr + "\n";
      content += commands.feedLine;
    }
    
    // Propina (si hay, excluyendo delivery fee)
    const actualTip = deliveryFee > 0 ? tip - deliveryFee : tip;
    if (actualTip > 0) {
      content += "Propina:";
      const tipStr = `$${actualTip}`;
      content += " ".repeat(48 - 8 - tipStr.length) + tipStr + "\n";
      content += commands.feedLine;
    }
    
    // PROMOCIONES - grouped by promotion name
    const promoItems = allItems.filter(item => item.promotionName && item.promotionDiscount > 0);
    if (promoItems.length > 0) {
      // Group by promotion name
      const byPromo = {};
      for (const item of promoItems) {
        if (!byPromo[item.promotionName]) {
          byPromo[item.promotionName] = [];
        }
        byPromo[item.promotionName].push(item);
      }
      
      content += commands.feedLine;
      content += commands.alignCenter;
      content += commands.bold;
      content += "PROMOCIONES\n";
      content += commands.boldOff;
      content += commands.alignLeft;
      content += "────────────────────────────────────────────────\n";
      content += commands.feedLine;
      
      for (const [promoName, items] of Object.entries(byPromo)) {
        const totalQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);
        const totalDiscount = items.reduce((sum, item) => sum + Math.round(item.promotionDiscount || 0), 0);
        const promoLine = `${totalQty}x ${promoName}`;
        const promoPrice = `-$${totalDiscount}`;
        const promoSpaces = Math.max(1, 48 - promoLine.length - promoPrice.length);
        content += promoLine + " ".repeat(promoSpaces) + promoPrice + "\n";
      }
      
      content += "────────────────────────────────────────────────\n";
      content += commands.feedLine;
    }
    
    // Descuento manual (si hay)
    if (discount && discount.amount > 0) {
      const discountLabel = `${discount.name}:`;
      const discountStr = `-$${discount.amount}`;
      content += discountLabel;
      content += " ".repeat(48 - discountLabel.length - discountStr.length) + discountStr + "\n";
      content += commands.feedLine;
    }
    
    // Total en negritas y más grande
    content += commands.feedLine;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "TOTAL:";
    const totalStr = `$${total}`;
    content += " ".repeat(Math.max(1, 24 - 6 - totalStr.length)) + totalStr + "\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Información de pago (solo si está pagado)
    if (paymentMethod) {
      content += "────────────────────────────────────────────────\n";
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
      
      // Propina si hay
      if (tip > 0) {
        content += `Propina: $${tip}\n`;
        content += commands.feedLine;
      }
    }
    
    // Footer
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.feedLine;
    content += commands.alignCenter;
    content += "Gracias por su preferencia\n";
    
    // Espacio final antes de cortar
    content += commands.feedLine;
    content += commands.feedLine;
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
      cashTotal,
      cardTotal,
      transferTotal,
      totalTips,
      grandTotal,
      products
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
    content += "RESUMEN DE VENTAS\n";
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
    content += "------------------------------------------------\n";
    content += commands.feedLine;
    
    // Totales por método de pago
    content += commands.bold;
    content += "VENTAS POR METODO DE PAGO\n";
    content += commands.boldOff;
    content += commands.feedLine;
    
    if (cashTotal > 0) {
      content += "Efectivo:";
      const cashStr = `$${Math.round(cashTotal)}`;
      content += " ".repeat(48 - 9 - cashStr.length) + cashStr + "\n";
    }
    
    if (cardTotal > 0) {
      content += "Tarjeta:";
      const cardStr = `$${Math.round(cardTotal)}`;
      content += " ".repeat(48 - 8 - cardStr.length) + cardStr + "\n";
    }
    
    if (transferTotal > 0) {
      content += "Transferencia:";
      const transferStr = `$${Math.round(transferTotal)}`;
      content += " ".repeat(48 - 14 - transferStr.length) + transferStr + "\n";
    }
    
    content += commands.feedLine;
    
    // Propinas
    if (totalTips > 0) {
      content += "Propinas:";
      const tipsStr = `$${Math.round(totalTips)}`;
      content += " ".repeat(48 - 9 - tipsStr.length) + tipsStr + "\n";
      content += commands.feedLine;
    }
    
    // Línea separadora
    content += "------------------------------------------------\n";
    content += commands.feedLine;
    
    // Total general
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "TOTAL:";
    const totalStr = `$${Math.round(grandTotal)}`;
    content += " ".repeat(Math.max(1, 24 - 6 - totalStr.length)) + totalStr + "\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += commands.feedLine;
    
    content += `Ordenes: ${totalOrders}\n`;
    content += commands.feedLine;
    content += commands.feedLine;
    
    // Productos vendidos
    if (products && products.length > 0) {
      content += "------------------------------------------------\n";
      content += commands.feedLine;
      content += commands.bold;
      content += "PRODUCTOS VENDIDOS\n";
      content += commands.boldOff;
      content += commands.feedLine;
      
      for (const product of products) {
        const qtyName = `${product.qty}x ${product.name}`;
        // Limitar longitud del nombre si es muy largo
        const displayName = qtyName.length > 48 ? qtyName.slice(0, 45) + "..." : qtyName;
        content += displayName + "\n";
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
    content += "================================\n";
    content += commands.alignLeft;

    // Items
    for (const item of items) {
      const itemName = item.name.length > 20 ? item.name.substring(0, 20) : item.name;
      const qty = item.qty;
      const price = item.price;
      const itemTotal = item.total;
      
      content += `${qty}x ${itemName}\n`;
      content += `   $${price.toFixed(2)} c/u    $${itemTotal.toFixed(2)}\n`;
    }

    content += "================================\n";
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
    content += "================================\n";
    
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
    content += "================================\n";
    content += commands.alignLeft;

    // Items
    for (const item of items) {
      const line = `${item.qty}x ${item.name}`;
      content += `${line}\n`;
      content += `  > Invitado\n`;
    }

    content += "\n";
    content += "================================\n";
    content += commands.alignCenter;
    content += commands.bold;
    content += "TOTAL: $0.00\n";
    content += commands.boldOff;
    content += "================================\n";
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
    const { tableNumber, orderNumber, customerName, items, guestCount } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items to print" });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

    let content = "";
    
    // Inicializar impresora
    content += commands.init;
    
    // Header
    content += commands.alignCenter;
    content += commands.bold;
    content += commands.textSizeDouble;
    content += "COMANDA\n";
    content += commands.textSizeNormal;
    content += commands.boldOff;
    content += "==============================\n";
    
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
    content += "==============================\n";
    content += commands.feedLine;
    
    // Separar bebidas y alimentos
    const beverages = items.filter(item => item.isBeverage);
    const food = items.filter(item => !item.isBeverage);
    
    // 1. BEBIDAS PRIMERO
    if (beverages.length > 0) {
      content += commands.bold;
      content += "BEBIDAS\n";
      content += commands.boldOff;
      content += "------------------------------\n";
      
      for (const item of beverages) {
        content += `${item.qty}x ${item.name}\n`;
        
        // Modifiers for beverages (flowSteps, etc.)
        if (item.flowSteps && item.flowSteps.length > 0) {
          for (const step of item.flowSteps) {
            content += commands.bold;
            content += `   • ${step.name}\n`;
            content += commands.boldOff;
          }
        }
        
        if (item.notes) {
          content += commands.bold;
          content += `   > Nota: ${item.notes}\n`;
          content += commands.boldOff;
        }
      }
      
      if (food.length > 0) {
        content += commands.feedLine;
        content += "==============================\n";
        content += commands.feedLine;
      }
    }
    
    // 2. ALIMENTOS POR ASIENTO Y TIEMPO
    if (food.length > 0) {
      // Agrupar por asiento
      const bySeat = {};
      for (const item of food) {
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
        content += seat === 'C' ? 'COMPARTIDO\n' : `ASIENTO ${seat}\n`;
        content += commands.boldOff;
        content += "------------------------------\n";
        
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
          const courseItems = byCourse[course];
          
          // Header de tiempo (solo si hay múltiples tiempos)
          if (courses.length > 1) {
            content += commands.bold;
            content += `  T${course}\n`;
            content += commands.boldOff;
          }
          
          // Items
          for (const item of courseItems) {
            content += `${item.qty}x ${item.name}\n`;
            
            // Modifiers (frosting, topping, extra, flowSteps)
            if (item.frosting) {
              content += commands.bold;
              content += `   • Frosting: ${item.frosting}\n`;
              content += commands.boldOff;
            }
            if (item.topping) {
              content += commands.bold;
              content += `   • Topping: ${item.topping}\n`;
              content += commands.boldOff;
            }
            if (item.extra) {
              content += commands.bold;
              content += `   • Extra: ${item.extra}\n`;
              content += commands.boldOff;
            }
            // Flow steps (category, products, custom modifiers)
            if (item.flowSteps && item.flowSteps.length > 0) {
              for (const step of item.flowSteps) {
                content += commands.bold;
                content += `   • ${step.name}\n`;
                content += commands.boldOff;
              }
            }
            
            if (item.notes) {
              content += commands.bold;
              content += `   > Nota: ${item.notes}\n`;
              content += commands.boldOff;
            }
          }
        }
        
        // Separador entre asientos
        if (i < seats.length - 1) {
          content += commands.feedLine;
          content += "- - - - - - - - - - - - - - -\n";
          content += commands.feedLine;
        }
      }
    }
    
    content += commands.feedLine;
    content += "==============================\n";
    content += commands.alignCenter;
    content += timeStr + "\n";
    content += "==============================\n";
    
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
