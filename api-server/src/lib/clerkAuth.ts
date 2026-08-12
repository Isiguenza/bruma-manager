import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      /** Solo presente cuando pasó por requireClerkAuth. */
      clerkUserId?: string;
      clerkEmail?: string;
    }
  }
}

/**
 * Middleware compartido para endpoints protegidos llamados directo desde
 * BRUMA Web (sitio estático, sin servidor Next.js — el navegador manda el
 * JWT de sesión de Clerk en el header `Authorization: Bearer`).
 *
 * Verifica el token con `@clerk/backend` y saca el correo REAL desde Clerk
 * (`clerk.users.getUser`) — nunca confía en un correo mandado por el
 * cliente. Deja `req.clerkUserId`/`req.clerkEmail` listos para el handler.
 */
export async function requireClerkAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !process.env.CLERK_SECRET_KEY) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const { verifyToken, createClerkClient } = await import("@clerk/backend");
    const verified = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const user = await clerk.users.getUser(verified.sub);
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return res.status(400).json({ error: "Tu cuenta no tiene correo" });

    req.clerkUserId = verified.sub;
    req.clerkEmail = email;
    next();
  } catch (error) {
    console.error("[requireClerkAuth] token inválido:", error);
    res.status(401).json({ error: "Sesión inválida" });
  }
}
