import { loyaltyCards } from "./db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { getApiUrl } from "./utils";

type LoyaltyCard = InferSelectModel<typeof loyaltyCards>;

// The Google Wallet object is built only by the api-server
// (api-server/src/lib/google-wallet.ts): it knows the active season's art.
// This used to be a second copy that re-rendered the card with the original
// stamps on every stamp added from a Next.js route, undoing the season on
// Android. Awaited (not fire-and-forget) so a serverless runtime can't drop it.
export async function createOrUpdateGoogleWalletObject(card: LoyaltyCard) {
  try {
    const apiBase = process.env.API_SERVER_URL || getApiUrl();
    const res = await fetch(`${apiBase}/api/loyalty-cards/refresh-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds: [card.id] }),
    });
    if (!res.ok) console.error("[Google Wallet] api-server refresh failed:", res.status);
  } catch (error) {
    console.error("[Google Wallet] api-server refresh error:", error);
  }
}
