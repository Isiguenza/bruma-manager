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
    const body = await request.json();
    const { stamps } = body;

    if (!stamps || stamps < 1) {
      return NextResponse.json({ error: "Invalid stamps" }, { status: 400 });
    }

    const card = await db.query.loyaltyCards.findFirst({
      where: eq(loyaltyCards.id, id),
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const newStamps = card.stamps + stamps;
    const newRewards = Math.floor(newStamps / card.stampsPerReward);
    const remainingStamps = newStamps % card.stampsPerReward;

    await db
      .update(loyaltyCards)
      .set({
        stamps: newRewards > 0 ? remainingStamps : newStamps,
        totalStamps: card.totalStamps + stamps,
        rewardsAvailable: card.rewardsAvailable + newRewards,
        updatedAt: new Date(),
      })
      .where(eq(loyaltyCards.id, id));

    await db.insert(loyaltyTransactions).values({
      cardId: id,
      stampsAdded: stamps,
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
    console.error("Error adding stamps:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
