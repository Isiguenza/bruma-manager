"use client";

import { useState } from "react";
import Image from "next/image";

interface CreatedCard {
  id: string;
  customerName: string;
  barcodeValue: string;
  stamps: number;
  stampsPerReward: number;
}

export default function LoyaltyRegisterPage() {
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<CreatedCard | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Tu nombre es requerido");
      return;
    }
    if (!lastName.trim()) {
      setError("Tu apellido es requerido");
      return;
    }
    if (!email.trim()) {
      setError("Tu correo es requerido");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Correo electrónico inválido");
      return;
    }
    if (!birthDate.trim()) {
      setError("Tu fecha de nacimiento es requerida");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerLastName: lastName.trim(),
          customerPhone: phone.trim() || null,
          customerEmail: email.trim(),
          birthDate: birthDate.trim() || null,
          pin: pin.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.details || data?.error || "Error al crear tarjeta");
      setCard(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hubo un error, intenta de nuevo";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function walletUrl() {
    if (!card) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/wallet/pass/${card.id}`;
  }

  function googleWalletSaveUrl() {
    if (!card) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/wallet/google-pass/${card.id}`;
  }

  // Logo + title block reused in both states
  const BrandHeader = () => (
    <div className="flex flex-col items-center">
      <Image
        src="/bruma-logo.png"
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
  );

  // Success state
  if (card) {
    const cardViewUrl = `/loyalty/card/${card.barcodeValue}`;
    return (
      <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
        <div className="w-full max-w-sm space-y-8">
          <BrandHeader />

          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-100">
            <div className="text-center">
              <p className="text-4xl">🎉</p>
              <h2 className="mt-3 text-xl font-bold text-[#004b49]">
                ¡Bienvenido, {card.customerName}!
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Tu tarjeta de lealtad está lista
              </p>
            </div>

            <div className="mt-6 space-y-4 text-center">
              <p className="font-mono text-lg tracking-widest text-[#004b49]">
                {card.barcodeValue}
              </p>
              <p className="text-sm text-gray-400">
                Muestra este código en tu próxima visita
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={walletUrl()}
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
              href={googleWalletSaveUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Agregar a Google Wallet
            </a>

            <a
              href={cardViewUrl}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold text-[#004b49] transition hover:bg-[#004b49]/5"
            >
              Ver mi tarjeta en la web
            </a>
          </div>

          <p className="text-center text-xs text-gray-400">
            Muestra tu tarjeta cada vez que compres para acumular sellos y ganar recompensas
          </p>
        </div>
      </main>
    );
  }

  // Registration form
  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
      <div className="w-full max-w-sm">
        <BrandHeader />

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-3xl bg-white p-6 shadow-xl shadow-gray-100"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre *"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
            autoFocus
          />

          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Apellido *"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
          />

          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-4">
              <span className="text-lg">🇲🇽</span>
              <span className="text-sm text-gray-500">+52</span>
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Celular"
              className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
            />
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico *"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
          />

          <div className="relative">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
            />
            {!birthDate && (
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                Fecha de nacimiento *
              </span>
            )}
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="PIN de seguridad (4 dígitos)"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
          />
          <p className="px-1 text-xs text-gray-400">
            Para proteger tu tarjeta cuando la consultes en la web
          </p>

          {error && (
            <p className="text-sm font-medium text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black disabled:opacity-50"
          >
            {submitting ? "Registrando..." : "Obtener mi tarjeta"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Cada compra = 1 sello · 8 sellos = 1 recompensa
          </p>
        </form>
      </div>
    </main>
  );
}
