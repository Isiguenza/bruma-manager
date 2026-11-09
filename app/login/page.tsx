"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash, Envelope, LockSimple, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Verde del wordmark de Bruma.
const BRAND = "#034a49";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Error en línea: antes se usaba toast, pero el <Toaster> solo vive dentro
  // del dashboard, así que en el login los errores no se veían.
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Escribe tu correo y tu contraseña.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 401 ? "Correo o contraseña incorrectos." : data.error || "No se pudo iniciar sesión.");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1.1fr]">
      {/* Marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={{ backgroundColor: BRAND }}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-40 size-[520px] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #ffffff 0%, transparent 70%)" }}
        />
        <span className="text-sm font-medium tracking-wide text-white/60">Cocina Bruma</span>
        <div className="space-y-4">
          <p className="font-[family-name:var(--font-brand)] text-7xl tracking-[0.18em]">BRUMA</p>
          <p className="max-w-sm text-lg text-white/70">
            Caja, menú, clientes y ventas del restaurante en un solo lugar.
          </p>
        </div>
        <span className="text-xs text-white/40">Panel de administración</span>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="font-[family-name:var(--font-brand)] text-3xl tracking-[0.18em] lg:hidden" style={{ color: BRAND }}>
              BRUMA
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Inicia sesión</h1>
            <p className="text-sm text-muted-foreground">Entra con tu correo y contraseña del panel.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <div className="relative">
                <Envelope className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="tu@correo.com"
                  className="h-11 pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <LockSimple className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  className="h-11 pr-10 pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading ? (
                <>
                  <SpinnerGap className="mr-2 size-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            ¿No puedes entrar? Pide a un administrador que revise tu acceso.
          </p>
        </div>
      </div>
    </div>
  );
}
