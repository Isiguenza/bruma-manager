import { Request, Response, NextFunction } from "express";

// Simple auth middleware - can be extended later
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // For now, all requests are allowed
  // TODO: Add JWT or session-based auth if needed
  next();
}

// Optional: PIN verification helper (used in routes)
export async function verifyEmployeePin(pin: string, db: any): Promise<any> {
  const { schema } = await import("../db");
  const { eq } = await import("drizzle-orm");
  
  const employee = await db.query.userProfiles.findFirst({
    where: eq(schema.userProfiles.pinHash, pin),
  });
  
  if (!employee || !employee.active) {
    throw new Error("Invalid PIN or inactive employee");
  }
  
  return employee;
}
