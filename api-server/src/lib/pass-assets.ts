import path from "path";
import fs from "fs";
import { sql } from "drizzle-orm";
import { db } from "../db";

// Wallet card art. The originals live in public/pass-assets/; each season is a
// folder in public/pass-assets/seasons/<name>/ with only the files it changes
// (logo.png, logo@2x.png, sello@2x.png, sello_vacio@2x.png, google-logo.png).
// Anything a season doesn't include falls back to the original.
export const PASS_ASSETS_DIR = path.resolve(__dirname, "..", "..", "public", "pass-assets");
const SEASONS_DIR = path.join(PASS_ASSETS_DIR, "seasons");
const SEASON_NAME = /^[a-z0-9_-]+$/i;

export function listWalletSeasons(): string[] {
  if (!fs.existsSync(SEASONS_DIR)) return [];
  return fs
    .readdirSync(SEASONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SEASON_NAME.test(d.name))
    .map((d) => d.name)
    .sort();
}

// restaurant_settings.wallet_season is read with raw SQL on purpose, not via
// the Drizzle schema: if the column isn't in the DB yet, findFirst() on that
// table would break online orders; here it just means "original design".
export async function getActiveWalletSeason(): Promise<string | null> {
  try {
    const result: any = await db.execute(sql`SELECT wallet_season FROM restaurant_settings LIMIT 1`);
    const season = (result.rows ?? result)[0]?.wallet_season ?? null;
    return season && listWalletSeasons().includes(season) ? season : null;
  } catch (error) {
    console.error("[Pass assets] Could not read wallet_season, using originals:", error);
    return null;
  }
}

export async function setActiveWalletSeason(season: string | null): Promise<void> {
  const updated: any = await db.execute(
    sql`UPDATE restaurant_settings SET wallet_season = ${season}, updated_at = NOW() RETURNING id`
  );
  if ((updated.rows ?? updated).length === 0) {
    await db.execute(sql`INSERT INTO restaurant_settings (wallet_season) VALUES (${season})`);
  }
}

// Returns a resolver: file name → path in the active season, or the original.
export async function getPassAssetResolver(): Promise<(file: string) => string> {
  const season = await getActiveWalletSeason();
  const seasonDir = season ? path.join(SEASONS_DIR, season) : null;
  return (file: string) => {
    if (seasonDir) {
      const seasonal = path.join(seasonDir, file);
      if (fs.existsSync(seasonal)) return seasonal;
    }
    return path.join(PASS_ASSETS_DIR, file);
  };
}
