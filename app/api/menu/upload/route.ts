import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuid } from "uuid";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_MB = 50;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: `Tipo no soportado: ${file.type}. Acepta imágenes (jpg/png/webp) o video (mp4/mov/webm)` },
        { status: 400 }
      );
    }

    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `Video muy grande (máx ${MAX_VIDEO_MB}MB)` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes) as Buffer;
    let contentType = file.type;
    let ext = isVideo ? (file.name.split(".").pop() ?? "mp4") : "webp";
    let uploadBuffer: Buffer;

    if (isImage) {
      uploadBuffer = (await sharp(rawBuffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()) as Buffer;
      contentType = "image/webp";
      ext = "webp";
    } else {
      uploadBuffer = rawBuffer;
    }

    const key = `menu/${uuid()}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: uploadBuffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `${PUBLIC_URL}/${key}`;
    return NextResponse.json({ url, type: isVideo ? "video" : "image" });
  } catch (error: any) {
    console.error("Error uploading to R2:", error);
    return NextResponse.json({ error: `Error subiendo archivo: ${error.message}` }, { status: 500 });
  }
}
