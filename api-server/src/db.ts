import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

const NEON_REQUEST_TIMEOUT_MS = 9_000;
const NEON_RETRY_DELAYS_MS = [200, 600];

function isTransientConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|connecttimeout|connect timeout|econnreset|econnrefused|socket hang up|network|abort|timeout/i.test(message);
}

// The Neon HTTP driver uses this function for every query (including its
// server-side transaction endpoint). Bound each request and retry only the
// connection failures that have caused the API to stall in production.
neonConfig.fetchFunction = async (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1]
) => {
  for (let attempt = 0; attempt <= NEON_RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NEON_REQUEST_TIMEOUT_MS);

    try {
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (attempt === NEON_RETRY_DELAYS_MS.length || !isTransientConnectionError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, NEON_RETRY_DELAYS_MS[attempt]));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Neon request retry loop exited unexpectedly");
};

export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export type Database = NeonHttpDatabase<typeof schema>;
export { schema };
