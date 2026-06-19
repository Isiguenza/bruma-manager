"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface LoyaltyCard {
  id: string;
  customerName: string;
  barcodeValue: string;
  stamps: number;
  totalStamps: number;
  stampsPerReward: number;
  rewardsAvailable: number;
  rewardsRedeemed: number;
}

function getDeviceType() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

export default function CardViewPage({
  params,
}: {
  params: Promise<{ barcodeValue: string }>;
}) {
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deviceType, setDeviceType] = useState<string>("other");

  useEffect(() => {
    setDeviceType(getDeviceType());
  }, []);

  useEffect(() => {
    async function fetchCard() {
      try {
        const { barcodeValue } = await params;
        const res = await fetch(`/api/loyalty/search?barcode=${encodeURIComponent(barcodeValue)}`);
        if (!res.ok) {
          setError("Tarjeta no encontrada");
          return;
        }
        const data = await res.json();
        setCard(data);
      } catch {
        setError("Error al cargar la tarjeta");
      } finally {
        setLoading(false);
      }
    }
    fetchCard();
  }, [params]);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-white">
        <p className="text-[#004b49]">Cargando...</p>
      </main>
    );
  }

  if (error || !card) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
        <p className="text-4xl">😕</p>
        <h1 className="mt-4 text-xl font-bold text-[#004b49]">Tarjeta no encontrada</h1>
        <p className="mt-2 text-sm text-gray-400">{error || "Verifica el código e intenta de nuevo"}</p>
      </main>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const walletUrl = `${origin}/api/wallet/pass/${card.id}`;
  const googleWalletUrl = `${origin}/api/wallet/google-pass/${card.id}`;
  const COLS = 4;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <img
            src="/logos/BRUMA.png"
            alt="BRUMA"
            className="h-28 w-auto object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-wide text-[#004b49]">
            Programa de Lealtad
          </h1>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-100">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-gray-400">Cliente</p>
            <p className="mt-1 text-xl font-bold text-[#004b49]">{card.customerName}</p>
          </div>

          {/* Sellos - 2 filas x 4 */}
          <div className="mt-6 flex flex-col items-center gap-3 py-2">
            {Array.from({ length: Math.ceil(card.stampsPerReward / COLS) }).map((_, row) => (
              <div key={row} className="flex items-center justify-center gap-3">
                {Array.from({ length: COLS }).map((_, col) => {
                  const i = row * COLS + col;
                  if (i >= card.stampsPerReward) return null;
                  const isFilled = i < card.stamps;
                  return (
                    <div key={i} className="size-14">
                      <img
                        src={isFilled ? "/logos/sello.png" : "/logos/sello_vacio.png"}
                        alt={isFilled ? "Sello" : "Vacío"}
                        className="size-full object-contain"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="mt-2 text-center text-sm font-medium text-[#004b49]">
            {card.stamps} / {card.stampsPerReward} sellos
          </p>

          {/* Recompensas */}
          {card.rewardsAvailable > 0 && (
            <div className="mt-4 rounded-2xl bg-[#004b49]/10 p-4 text-center">
              <p className="text-sm font-semibold text-[#004b49]">
                🎉 {card.rewardsAvailable} {card.rewardsAvailable === 1 ? "recompensa" : "recompensas"} disponible{card.rewardsAvailable === 1 ? "" : "s"}
              </p>
            </div>
          )}

          {/* QR para escanear por la camara del POS */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <QRCodeSVG
              value={card.barcodeValue}
              size={160}
              level="M"
              bgColor="#ffffff"
              fgColor="#004b49"
            />
            <p className="text-xs text-gray-400">Presenta este QR al completar tu compra</p>
          </div>

          {/* Barcode */}
          <div className="mt-6 border-t border-gray-100 pt-6 text-center">
            <p className="font-mono text-lg tracking-widest text-[#004b49]">{card.barcodeValue}</p>
            <p className="mt-1 text-xs text-gray-400">Muestra este código al pagar</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#004b49]">{card.totalStamps}</p>
            <p className="mt-1 text-xs text-gray-400">Sellos totales</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#004b49]">{card.rewardsRedeemed}</p>
            <p className="mt-1 text-xs text-gray-400">Recompensas canjeadas</p>
          </div>
        </div>

        {/* Wallet buttons - device specific */}
        <div className="space-y-3">
          {deviceType === "ios" && (
            <a
              href={walletUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Agregar a Apple Wallet
            </a>
          )}

          {deviceType === "android" && (
            <a
              href={googleWalletUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545 10.239v2.821h5.445c-.712 2.315-2.331 4.276-4.5 5.379 1.964-2.258 2.919-4.52 3.028-6.634l.017-.566h-4.19v-2l-4.19-.008v2.821h-2.349c-.446 0-.813-.36-.813-.806V3.86c0-.445.36-.806.806-.806h14.347c.446 0 .806.36.806.806v4.133c0 .446-.36.806-.806.806h-2.349zM3.81 22.19c2.081-1.846 3.54-3.73 4.379-5.65.839 1.92 2.298 3.804 4.379 5.65H3.81z" />
              </svg>
              Agregar a Google Wallet
            </a>
          )}

          {deviceType === "other" && (
            <>
              <a
                href={walletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Apple Wallet
              </a>
              <a
                href={googleWalletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.545 10.239v2.821h5.445c-.712 2.315-2.331 4.276-4.5 5.379 1.964-2.258 2.919-4.52 3.028-6.634l.017-.566h-4.19v-2l-4.19-.008v2.821h-2.349c-.446 0-.813-.36-.813-.806V3.86c0-.445.36-.806.806-.806h14.347c.446 0 .806.36.806.806v4.133c0 .446-.36.806-.806.806h-2.349zM3.81 22.19c2.081-1.846 3.54-3.73 4.379-5.65.839 1.92 2.298 3.804 4.379 5.65H3.81z" />
                </svg>
                Google Wallet
              </a>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Muestra tu tarjeta cada vez que compres para acumular sellos y ganar recompensas
        </p>
      </div>
    </main>
  );
}
