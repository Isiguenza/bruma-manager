import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/callback - Recibir código de autorización de Uber
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.json(
        { error: `Authorization failed: ${error}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "No authorization code received" },
        { status: 400 }
      );
    }

    console.log("✅ Authorization code received:", code);

    // Step 4: Intercambiar código por access token
    const tokenResponse = await fetch(
      "https://sandbox-login.uber.com/oauth/v2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.UBER_CLIENT_ID || "",
          client_secret: process.env.UBER_CLIENT_SECRET || "",
          grant_type: "authorization_code",
          redirect_uri:
            "https://bruma.drinksespantapajaros.com.mx/api/auth/callback",
          code: code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.json(
        { error: "Failed to exchange code for token", details: errorText },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    console.log("✅ Access token obtained!");

    // TODO: Guardar el access token en base de datos o archivo .env
    // Por ahora, solo lo mostramos
    return NextResponse.json({
      success: true,
      message: "¡Autorización exitosa! Copia este access token y guárdalo en tu .env",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      instructions: [
        "1. Copia el access_token de arriba",
        "2. Agrégalo a tu .env como: UBER_ACCESS_TOKEN=...",
        "3. Reinicia tu servidor Next.js",
        "4. ¡Listo para recibir pedidos de Uber Eats!",
      ],
    });
  } catch (error) {
    console.error("Error in OAuth callback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
