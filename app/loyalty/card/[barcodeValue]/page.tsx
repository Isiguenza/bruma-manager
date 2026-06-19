"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

function RegisterDeviceButton({ cardId }: { cardId: string }) {
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleRegister() {
    setRegistering(true);
    try {
      // Generate a simple push token (in production this would come from the device)
      const pushToken = `push-${Date.now()}`;
      const res = await fetch("/api/wallet/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumber: cardId,
          pushToken,
          deviceLibraryId: `web-${Date.now()}`,
          passTypeId: "pass.com.bruma.loyalty",
        }),
      });
      if (res.ok) {
        setRegistered(true);
      }
    } catch {
      // ignore
    } finally {
      setRegistering(false);
    }
  }

  if (registered) {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#004b49]/30 bg-[#004b49]/5 py-3 text-sm font-medium text-[#004b49]"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
        Notificaciones activadas
      </button>
    );
  }

  return (
    <button
      onClick={handleRegister}
      disabled={registering}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#004b49]/20 py-3 text-sm font-medium text-[#004b49] transition hover:bg-[#004b49]/5"
    >
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      {registering ? "Activando..." : "Recibir notificaciones de sellos"}
    </button>
  );
}

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

export default function CardViewPage({
  params,
}: {
  params: Promise<{ barcodeValue: string }>;
}) {
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Image
            src="/logos/BRUMA.png"
            alt="BRUMA"
            width={220}
            height={90}
            className="object-contain"
            priority
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

          {/* Sellos */}
          <div className="mt-6 flex items-center justify-center gap-2 py-2">
            {Array.from({ length: card.stampsPerReward }).map((_, i) => (
              <div key={i} className="size-10">
                <Image
                  src={i < card.stamps ? "/logos/sello.png" : "/logos/sello_vacio.png"}
                  alt={i < card.stamps ? "Sello" : "Vacío"}
                  width={40}
                  height={40}
                  className="size-full object-contain"
                />
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

        {/* Wallet buttons */}
        <div className="space-y-3">
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

          <a
            href={googleWalletUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            Agregar a Google Wallet
          </a>

          {/* Manual device registration for push notifications */}
          <RegisterDeviceButton cardId={card.id} />
        </div>

        <p className="text-center text-xs text-gray-400">
          Muestra tu tarjeta cada vez que compres para acumular sellos y ganar recompensas
        </p>
      </div>
    </main>
  );
}
