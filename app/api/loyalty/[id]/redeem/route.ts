import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loyaltyCards, loyaltyTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendAppleWalletPush } from "@/lib/apple-push";
import { createOrUpdateGoogleWalletObject } from "@/lib/google-wallet";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, id),
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (card.rewardsAvailable < 1) {
      return NextResponse.json(
        { error: "No rewards available" },
        { status: 400 }
      );
    }

    await db
      .update(loyaltyCards)
      .set({
        rewardsAvailable: card.rewardsAvailable - 1,
        rewardsRedeemed: card.rewardsRedeemed + 1,
        updatedAt: new Date(),
      })
      .where(eq(loyaltyCards.id, id));

    await db.insert(loyaltyTransactions).values({
      cardId: id,
      stampsAdded: 0,
      rewardRedeemed: true,
    });

    const updated = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, id),
    });

    // Push updates to Apple and Google wallets (non-blocking)
    if (updated) {
      sendAppleWalletPush(id).catch(console.error);
      createOrUpdateGoogleWalletObject(updated).catch(console.error);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error redeeming reward:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
