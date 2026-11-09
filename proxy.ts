import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

const PUBLIC_LOYALTY_URL = 'https://cocinabruma.com.mx/lealtad';

async function isValidToken(token: string) {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El registro de lealtad se mudó a la web pública. Los links viejos (QRs
  // impresos, /links, tarjetas compartidas) se mandan al nuevo dominio.
  if (pathname === '/loyalty/register' || pathname.startsWith('/loyalty/register/')) {
    return NextResponse.redirect(PUBLIC_LOYALTY_URL);
  }
  if (pathname.startsWith('/loyalty/card/')) {
    const barcode = pathname.slice('/loyalty/card/'.length).split('/')[0];
    return NextResponse.redirect(`${PUBLIC_LOYALTY_URL}/tarjeta?c=${barcode}`);
  }

  // Public routes that don't need authentication
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('auth_token')?.value;

  // /loyalty es el panel de Clientes Frecuentes: con sesión se ve; sin sesión
  // (un cliente con el link viejo) se va al registro público.
  if (pathname === '/loyalty' && !(token && (await isValidToken(token)))) {
    return NextResponse.redirect(PUBLIC_LOYALTY_URL);
  }

  if (!token) {
    // Redirect to login if accessing protected route without token
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Verify JWT token
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch (error) {
    // Invalid token, redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('auth_token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|logos|pass-assets|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff|woff2)).*)',
  ],
};
