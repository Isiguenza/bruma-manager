import path from "path";
import fs from "fs";

const BG_COLOR = { r: 255, g: 255, b: 255 };

let sharpModule: any = null;

async function getSharp() {
  if (!sharpModule) {
    sharpModule = await import("sharp");
  }
  return sharpModule.default || sharpModule;
}

async function generateStripImage(
  stamps: number,
  total: number,
  assetsPath: string
): Promise<{ strip: Buffer; strip2x: Buffer }> {
  const sharp = await getSharp();
  const W2 = 750, H2 = 246;
  const STAMP_SIZE = 80;
  const COLS = 4;
  const ROWS = 2;
  const GAP = 55;
  const totalW = COLS * STAMP_SIZE + (COLS - 1) * GAP;
  const totalH = ROWS * STAMP_SIZE + (ROWS - 1) * GAP;
  const startX = Math.round((W2 - totalW) / 2);
  const startY = Math.round((H2 - totalH) / 2);

  const hatBuf = await sharp(path.join(assetsPath, "sello@2x.png"))
    .resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const emptyBuf = await sharp(path.join(assetsPath, "sello_vacio@2x.png"))
    .resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const composites: any[] = [];
  const totalStamps = Math.min(total, 8);
  for (let i = 0; i < totalStamps; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    composites.push({
      input: i < stamps ? hatBuf : emptyBuf,
      left: startX + col * (STAMP_SIZE + GAP),
      top: startY + row * (STAMP_SIZE + GAP),
    });
  }

  const strip2x = await sharp({
    create: { width: W2, height: H2, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const strip = await sharp(strip2x).resize(375, 123).png().toBuffer();

  return { strip, strip2x };
}

export async function generateApplePass(card: any): Promise<Buffer> {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;

  const hasInlineCerts =
    process.env.APPLE_WWDR_PEM &&
    process.env.APPLE_SIGNER_CERT_PEM &&
    process.env.APPLE_SIGNER_KEY_PEM;
  const hasBase64Certs =
    process.env.APPLE_WWDR_PEM_B64 &&
    process.env.APPLE_SIGNER_CERT_B64 &&
    process.env.APPLE_SIGNER_KEY_B64;
  const projectRoot = path.resolve(__dirname, "..", "..");
  const certsPath = path.resolve(projectRoot, "certs");
  const hasFileCerts =
    fs.existsSync(path.join(certsPath, "wwdr.pem")) &&
    fs.existsSync(path.join(certsPath, "signerCert.pem")) &&
    fs.existsSync(path.join(certsPath, "signerKey.pem"));

  if (!passTypeId || !teamId || (!hasInlineCerts && !hasBase64Certs && !hasFileCerts)) {
    throw new Error("Apple Wallet not configured");
  }

  const { PKPass } = await import("passkit-generator");

  let wwdr: string;
  let signerCert: string;
  let signerKey: string;
  const signerKeyPassphrase = process.env.APPLE_SIGNER_KEY_PASSPHRASE;

  if (hasInlineCerts) {
    wwdr = process.env.APPLE_WWDR_PEM!;
    signerCert = process.env.APPLE_SIGNER_CERT_PEM!;
    signerKey = process.env.APPLE_SIGNER_KEY_PEM!;
  } else if (hasBase64Certs) {
    wwdr = Buffer.from(process.env.APPLE_WWDR_PEM_B64!, "base64").toString("utf-8");
    signerCert = Buffer.from(process.env.APPLE_SIGNER_CERT_B64!, "base64").toString("utf-8");
    signerKey = Buffer.from(process.env.APPLE_SIGNER_KEY_B64!, "base64").toString("utf-8");
  } else {
    wwdr = fs.readFileSync(path.join(certsPath, "wwdr.pem"), "utf-8");
    signerCert = fs.readFileSync(path.join(certsPath, "signerCert.pem"), "utf-8");
    signerKey = fs.readFileSync(path.join(certsPath, "signerKey.pem"), "utf-8");
  }

  const assetsPath = path.resolve(projectRoot, "public", "pass-assets");
  const buffers: Record<string, Buffer> = {};
  const staticFiles = ["icon.png", "icon@2x.png"];
  for (const file of staticFiles) {
    const filePath = path.join(assetsPath, file);
    if (fs.existsSync(filePath)) {
      buffers[file] = fs.readFileSync(filePath);
    }
  }

  const sharp = await getSharp();
  const logoPath = path.join(assetsPath, "logo.png");
  const logo2xPath = path.join(assetsPath, "logo@2x.png");
  if (fs.existsSync(logo2xPath)) {
    buffers["logo@2x.png"] = await sharp(logo2xPath)
      .resize(260, 80, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  }
  if (fs.existsSync(logoPath)) {
    buffers["logo.png"] = await sharp(logoPath)
      .resize(130, 40, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const { strip, strip2x } = await generateStripImage(
    card.stamps,
    card.stampsPerReward,
    assetsPath
  );
  buffers["strip.png"] = strip;
  buffers["strip@2x.png"] = strip2x;

  if (signerKey.includes("\\n")) {
    signerKey = signerKey.replace(/\\n/g, "\n");
  }

  if (!signerKey.includes("-----BEGIN")) {
    throw new Error("Invalid signerKey format. Must be a valid PEM file.");
  }

  const certOptions: any = { wwdr, signerCert, signerKey };
  if (signerKeyPassphrase) {
    certOptions.signerKeyPassphrase = signerKeyPassphrase;
  }

  const pass = new PKPass(
    buffers,
    certOptions,
    {
      serialNumber: card.id,
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      organizationName: "BRUMA",
      description: "Tarjeta de Lealtad",
      foregroundColor: "rgb(0, 75, 73)",
      backgroundColor: `rgb(${BG_COLOR.r}, ${BG_COLOR.g}, ${BG_COLOR.b})`,
      labelColor: "rgb(0, 75, 73)",
      webServiceURL: `${process.env.API_SERVER_URL || "https://api.cocinabruma.com.mx"}/api/wallet`,
      authenticationToken: card.id,
    }
  );

  pass.type = "storeCard";

  pass.setBarcodes({
    message: card.barcodeValue,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
  });

  pass.headerFields.push({
    key: "stamps",
    label: "SELLOS",
    value: `${card.stamps}/${card.stampsPerReward}`,
    changeMessage: "La tarjeta se ha actualizado",
  });

  pass.secondaryFields.push({
    key: "rewards",
    label: "RECOMPENSAS",
    value: `${card.rewardsAvailable}`,
  });

  const fullName = `${card.customerName} ${card.customerLastName || ""}`.trim();
  const displayName = fullName.length > 20 
    ? fullName.substring(0, 20) + "..."
    : fullName;
  pass.auxiliaryFields.push({
    key: "customer",
    label: "CLIENTE",
    value: displayName,
  });

  pass.backFields.push(
    {
      key: "latestMessage",
      label: "Último mensaje",
      value: card.latestMessage || "Sin mensajes recientes",
      changeMessage: "%@",
    },
    {
      key: "totalStamps",
      label: "Total de sellos acumulados",
      value: card.totalStamps.toString(),
    },
    {
      key: "rewardsRedeemed",
      label: "Premios canjeados",
      value: card.rewardsRedeemed.toString(),
    },
    {
      key: "phone",
      label: "Teléfono",
      value: card.customerPhone || "No registrado",
    }
  );

  return pass.getAsBuffer();
}
