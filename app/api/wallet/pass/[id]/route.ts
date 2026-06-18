import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const BG_COLOR = { r: 255, g: 255, b: 255 };

async function generateStripImage(
  stamps: number,
  total: number,
  assetsPath: string
): Promise<{ strip: Buffer; strip2x: Buffer }> {
  // @2x strip: 750 x 246, 2 rows of 4 stamps
  const W2 = 750, H2 = 246;
  const STAMP_SIZE = 80;          // slightly smaller stamps
  const COLS = 4;
  const ROWS = 2;
  const GAP = 55;                 // wider gap between stamps
  const MARGIN_X = 30;            // closer to left/right edges
  const MARGIN_Y = 28;            // closer to top/bottom edges
  const startX = MARGIN_X;
  const startY = MARGIN_Y;

  const hatBuf = await sharp(path.join(assetsPath, "sello@2x.png"))
    .resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const emptyBuf = await sharp(path.join(assetsPath, "sello_vacio@2x.png"))
    .resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, id),
    });

    if (!card) {
      card = await db.query.loyaltyCards.findFirst({
        where: eq(loyaltyCards.barcodeValue, id),
      });
    }

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Check if Apple Wallet is fully configured
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
    const hasFileCerts =
      fs.existsSync(path.resolve(process.cwd(), "certs", "wwdr.pem")) &&
      fs.existsSync(path.resolve(process.cwd(), "certs", "signerCert.pem")) &&
      fs.existsSync(path.resolve(process.cwd(), "certs", "signerKey.pem"));

    if (!passTypeId || !teamId || (!hasInlineCerts && !hasBase64Certs && !hasFileCerts)) {
      return NextResponse.json(
        {
          error: "Apple Wallet not configured",
          message:
            "Faltan certificados o configuración. Agrega APPLE_WWDR_PEM_B64, APPLE_SIGNER_CERT_B64 y APPLE_SIGNER_KEY_B64 al .env, o los archivos en /certs/",
          card: {
            customerName: card.customerName,
            barcodeValue: card.barcodeValue,
            stamps: card.stamps,
            stampsPerReward: card.stampsPerReward,
            rewardsAvailable: card.rewardsAvailable,
          },
        },
        { status: 501 }
      );
    }

    // Generate Apple Wallet pass using passkit-generator
    try {
      const { PKPass } = await import("passkit-generator");

      // Read certificates: prefer env vars, fallback to files for local dev
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
        const certsPath = path.resolve(process.cwd(), "certs");
        wwdr = fs.readFileSync(path.join(certsPath, "wwdr.pem"), "utf-8");
        signerCert = fs.readFileSync(path.join(certsPath, "signerCert.pem"), "utf-8");
        signerKey = fs.readFileSync(path.join(certsPath, "signerKey.pem"), "utf-8");
      }

      // Read static pass assets (icon, logo)
      const assetsPath = path.resolve(process.cwd(), "public", "pass-assets");
      const buffers: Record<string, Buffer> = {};
      const staticFiles = ["icon.png", "icon@2x.png"];
      for (const file of staticFiles) {
        const filePath = path.join(assetsPath, file);
        if (fs.existsSync(filePath)) {
          buffers[file] = fs.readFileSync(filePath);
        }
      }

      // Resize logo to be smaller (80% of original recommended size)
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

      // Generate dynamic strip image with stamps
      const { strip, strip2x } = await generateStripImage(
        card.stamps,
        card.stampsPerReward,
        assetsPath
      );
      buffers["strip.png"] = strip;
      buffers["strip@2x.png"] = strip2x;

      console.log("[Apple Pass] wwdr length:", wwdr?.length);
      console.log("[Apple Pass] signerCert length:", signerCert?.length);
      console.log("[Apple Pass] signerKey length:", signerKey?.length);
      console.log("[Apple Pass] signerKey starts with:", signerKey?.substring(0, 50));

      // Check for literal \n characters (common when env vars are copy-pasted incorrectly)
      if (signerKey.includes("\\n")) {
        console.warn("[Apple Pass] WARNING: signerKey contains literal \\n characters! Fixing...");
        signerKey = signerKey.replace(/\\n/g, "\n");
      }

      if (!signerKey.includes("-----BEGIN")) {
        console.error("[Apple Pass] ERROR: signerKey is not a valid PEM!");
        return NextResponse.json(
          { error: "Invalid signerKey format. Must be a valid PEM file." },
          { status: 500 }
        );
      }

      const certOptions: any = { wwdr, signerCert, signerKey };
      if (signerKeyPassphrase) {
        certOptions.signerKeyPassphrase = signerKeyPassphrase;
        console.log("[Apple Pass] Using signerKeyPassphrase");
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
          webServiceURL: `${request.nextUrl.origin}/api/wallet/v1`,
          authenticationToken: card.id,
        }
      );

      pass.type = "storeCard";

      // Set barcode
      pass.setBarcodes({
        message: card.barcodeValue,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      });

      // Header fields
      pass.headerFields.push({
        key: "stamps",
        label: "SELLOS",
        value: `${card.stamps}/${card.stampsPerReward}`,
      });

      // Secondary fields
      pass.secondaryFields.push({
        key: "rewards",
        label: "RECOMPENSAS",
        value: `${card.rewardsAvailable}`,
      });

      // Auxiliary fields - customer name (trimmed)
      const fullName = `${card.customerName} ${card.customerLastName || ""}`.trim();
      const displayName = fullName.length > 20 
        ? fullName.substring(0, 20) + "..."
        : fullName;
      pass.auxiliaryFields.push({
        key: "customer",
        label: "CLIENTE",
        value: displayName,
      });

      // Back fields
      pass.backFields.push(
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

      const buffer = pass.getAsBuffer();

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": `attachment; filename="bruma-${card.barcodeValue}.pkpass"`,
        },
      });
    } catch (passError) {
      console.error("Error generating pass:", passError);
      return NextResponse.json(
        {
          error: "Error generating Apple Wallet pass",
          details: String(passError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
