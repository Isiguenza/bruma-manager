"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { FaApple, FaGoogle } from "react-icons/fa";

function getDeviceType() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

interface CreatedCard {
  id: string;
  customerName: string;
  barcodeValue: string;
  stamps: number;
  stampsPerReward: number;
}

export default function LoyaltyRegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");

  // Register form
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<CreatedCard | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [deviceType, setDeviceType] = useState<string>("other");

  useEffect(() => {
    setDeviceType(getDeviceType());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Tu nombre es requerido"); return; }
    if (!lastName.trim()) { setError("Tu apellido es requerido"); return; }
    if (!email.trim()) { setError("Tu correo es requerido"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { setError("Correo electrónico inválido"); return; }
    if (!birthDate.trim()) { setError("Tu fecha de nacimiento es requerida"); return; }
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) { setLoginError("Ingresa tu correo"); return; }
    if (!loginPin.trim() || loginPin.length !== 4) { setLoginError("Ingresa tu PIN de 4 dígitos"); return; }
    setLoginError("");
    setLoginSubmitting(true);
    try {
      const res = await fetch("/api/loyalty/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), pin: loginPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al iniciar sesión");
      if (data.verified && data.card) {
        router.push(`/loyalty/card/${data.card.barcodeValue}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hubo un error, intenta de nuevo";
      setLoginError(msg);
    } finally {
      setLoginSubmitting(false);
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

  // Success state
  if (card) {
    const cardViewUrl = `/loyalty/card/${card.barcodeValue}`;
    return (
      <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center">
            <img
              src="/logos/BRUMA.png"
              alt="BRUMA"
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 text-2xl font-bold tracking-wide text-[#004b49]">
              Programa de Lealtad
            </h1>
          </div>

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

          {/* QR Code */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <p className="text-xs font-medium text-gray-400">Escanea para descargar tu tarjeta</p>
            <div className="mt-3 flex justify-center">
              <QRCodeSVG
                value={walletUrl()}
                size={180}
                level="M"
                bgColor="#ffffff"
                fgColor="#004b49"
              />
            </div>
          </div>

          {/* Wallet buttons - device specific */}
          <div className="space-y-3">
            {deviceType === "ios" && (
              <a
                href={walletUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black"
              >
                <FaApple className="size-5" />
                Agregar a Apple Wallet
              </a>
            )}

            {deviceType === "android" && (
              <a
                href={googleWalletSaveUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
              >
                <FaGoogle className="size-5" />
                Agregar a Google Wallet
              </a>
            )}

            {deviceType === "other" && (
              <>
                <a
                  href={walletUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black"
                >
                  <FaApple className="size-5" />
                  Apple Wallet
                </a>
                <a
                  href={googleWalletSaveUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-semibold text-gray-800 transition hover:bg-gray-50"
                >
                  <FaGoogle className="size-5" />
                  Google Wallet
                </a>
              </>
            )}

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

  // Login form
  if (mode === "login") {
    return (
      <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center">
            <img
              src="/logos/BRUMA.png"
              alt="BRUMA"
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 text-2xl font-bold tracking-wide text-[#004b49]">
              Programa de Lealtad
            </h1>
          </div>

          <form
            onSubmit={handleLogin}
            className="mt-8 space-y-4 rounded-3xl bg-white p-6 shadow-xl shadow-gray-100"
          >
            <p className="text-center text-sm text-gray-500">
              Ingresa tu correo y PIN para ver tu tarjeta
            </p>

            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="Correo electrónico"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
              autoFocus
            />

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={loginPin}
              onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN de 4 dígitos"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-center text-xl tracking-widest text-gray-900 placeholder:text-gray-400 placeholder:tracking-normal placeholder:text-base focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
            />

            {loginError && (
              <p className="text-sm font-medium text-red-500">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full rounded-2xl bg-[#2d3436] py-4 font-semibold text-white transition hover:bg-black disabled:opacity-50"
            >
              {loginSubmitting ? "Verificando..." : "Ver mi tarjeta"}
            </button>

            <button
              type="button"
              onClick={() => { setMode("register"); setLoginError(""); }}
              className="w-full py-2 text-sm text-gray-400 transition hover:text-[#004b49]"
            >
              ¿No tienes tarjeta? Regístrate
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Registration form
  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center">
          <img
            src="/logos/BRUMA.png"
            alt="BRUMA"
            className="h-20 w-auto object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-wide text-[#004b49]">
            Programa de Lealtad
          </h1>
        </div>

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

          <div className="space-y-1">
            <label className="block text-xs text-gray-400 px-1">Fecha de nacimiento *</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 focus:border-[#004b49] focus:outline-none focus:ring-1 focus:ring-[#004b49]/20"
            />
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

          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className="w-full py-3 text-sm font-medium text-[#004b49] transition hover:text-[#003634]"
          >
            ¿Ya tienes tarjeta? Inicia sesión
          </button>
        </form>
      </div>
    </main>
  );
}
