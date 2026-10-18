"use client";

import { QRCodeSVG } from "qrcode.react";
import type { LoyaltyCard } from "@/lib/types";
import { getApiUrl } from "@/lib/utils";

// Mirror of the Apple Wallet storeCard built in api-server/src/lib/apple-pass.ts:
// same colors, same fields and the same 750×246 strip geometry (2 rows × 4
// stamps of 80px, 55px gap). Images come from the api-server so the preview
// follows the active season. If you change the pass layout, change this too.
const FG = "rgb(0, 75, 73)";
const STRIP_W = 750;
const STRIP_H = 246;
const STAMP = 80;
const GAP = 55;
const COLS = 4;
const ROWS = 2;
const START_X = (STRIP_W - (COLS * STAMP + (COLS - 1) * GAP)) / 2;
const START_Y = (STRIP_H - (ROWS * STAMP + (ROWS - 1) * GAP)) / 2;

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export function ApplePassPreview({ card }: { card: LoyaltyCard }) {
  const assets = `${getApiUrl()}/api/wallet/assets`;
  const total = Math.min(card.stampsPerReward, 8);
  const fullName = `${card.customerName} ${card.customerLastName || ""}`.trim();
  const name = fullName.length > 20 ? fullName.substring(0, 20) + "..." : fullName;

  return (
    <div
      className="mx-auto w-full max-w-[343px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10"
      style={{ color: FG }}
    >
      {/* Header: logo + header field */}
      <div className="flex items-start justify-between px-3 pt-3 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${assets}/logo@2x.png`}
          alt="BRUMA"
          className="h-10 w-auto max-w-[130px] object-contain object-left"
        />
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide">Sellos</p>
          <p className="text-lg leading-tight">
            {card.stamps}/{card.stampsPerReward}
          </p>
        </div>
      </div>

      {/* Strip: stamps */}
      <div className="relative w-full bg-white" style={{ aspectRatio: `${STRIP_W} / ${STRIP_H}` }}>
        {Array.from({ length: total }).map((_, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`${assets}/${i < card.stamps ? "sello@2x.png" : "sello_vacio@2x.png"}`}
              alt=""
              className="absolute object-contain"
              style={{
                left: pct(START_X + col * (STAMP + GAP), STRIP_W),
                top: pct(START_Y + row * (STAMP + GAP), STRIP_H),
                width: pct(STAMP, STRIP_W),
                height: pct(STAMP, STRIP_H),
              }}
            />
          );
        })}
      </div>

      {/* Secondary + auxiliary fields */}
      <div className="flex justify-between gap-4 px-3 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide">Recompensas</p>
          <p className="text-base">{card.rewardsAvailable}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide">Cliente</p>
          <p className="text-base">{name}</p>
        </div>
      </div>

      {/* Barcode */}
      <div className="flex justify-center px-3 pt-6 pb-5">
        <div className="rounded-md bg-white p-2 ring-1 ring-black/10">
          <QRCodeSVG value={card.barcodeValue} size={120} level="M" />
        </div>
      </div>
    </div>
  );
}
