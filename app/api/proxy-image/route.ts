import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = process.env.R2_PUBLIC_URL ?? "https://cdn.cocinabruma.com.mx";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No URL" }, { status: 400 });

  if (!url.startsWith(ALLOWED_ORIGIN + "/")) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("Upstream error");
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/webp",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to proxy image" }, { status: 500 });
  }
}
