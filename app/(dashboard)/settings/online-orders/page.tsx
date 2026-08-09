"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash, MapPin, Crosshair } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Tier {
  maxMeters: number;
  fee: number;
}
interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const emptyDay: DayHours = { open: "09:00", close: "22:00", closed: false };

export default function OnlineOrdersSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [tiers, setTiers] = useState<Tier[]>([
    { maxMeters: 600, fee: 25 },
    { maxMeters: 1200, fee: 40 },
  ]);
  const [hours, setHours] = useState<Record<string, DayHours>>(
    Object.fromEntries(DAYS.map((d) => [d.key, { ...emptyDay }]))
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const s = await res.json();
          setEnabled(!!s.onlineOrderingEnabled);
          setLat(s.restaurantLat != null ? String(s.restaurantLat) : "");
          setLng(s.restaurantLng != null ? String(s.restaurantLng) : "");
          if (Array.isArray(s.deliveryTiers) && s.deliveryTiers.length) setTiers(s.deliveryTiers);
          if (s.serviceHours) {
            setHours((prev) => ({ ...prev, ...s.serviceHours }));
          }
        }
      } catch {
        toast.error("Error cargando ajustes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocalización no disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        toast.success("Ubicación capturada");
      },
      () => toast.error("No se pudo obtener la ubicación")
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onlineOrderingEnabled: enabled,
          restaurantLat: lat ? parseFloat(lat) : null,
          restaurantLng: lng ? parseFloat(lng) : null,
          deliveryTiers: tiers
            .filter((t) => t.maxMeters > 0)
            .sort((a, b) => a.maxMeters - b.maxMeters),
          serviceHours: hours,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ajustes guardados");
    } catch {
      toast.error("Error guardando ajustes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pedidos en línea</h1>
        <p className="text-muted-foreground mt-1">
          Configura los pedidos web, la ubicación del restaurante y las tarifas de envío.
        </p>
      </div>

      {/* Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Aceptar pedidos en línea</CardTitle>
              <CardDescription>
                Actívalo para recibir pedidos de la web. Desactívalo para pausarlos (ej. saturación).
              </CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
      </Card>

      {/* Ubicación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5" /> Ubicación del restaurante
          </CardTitle>
          <CardDescription>
            Se usa para medir la distancia (línea recta) al cliente y calcular el envío.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Latitud</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="19.4326" />
            </div>
            <div>
              <Label>Longitud</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-99.1332" />
            </div>
          </div>
          <Button variant="outline" onClick={useMyLocation} className="gap-2">
            <Crosshair className="size-4" /> Usar mi ubicación actual
          </Button>
        </CardContent>
      </Card>

      {/* Tarifas */}
      <Card>
        <CardHeader>
          <CardTitle>Tarifas de envío por distancia</CardTitle>
          <CardDescription>
            Cada tramo cubre hasta cierta distancia (en metros). Si la distancia excede el mayor
            tramo, el pedido a domicilio no se permite (solo recoger).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs">Hasta (metros)</Label>
                <Input
                  type="number"
                  value={t.maxMeters}
                  onChange={(e) =>
                    setTiers((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, maxMeters: Number(e.target.value) } : x))
                    )
                  }
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Precio ($)</Label>
                <Input
                  type="number"
                  value={t.fee}
                  onChange={(e) =>
                    setTiers((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, fee: Number(e.target.value) } : x))
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5"
                onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setTiers((prev) => [...prev, { maxMeters: 0, fee: 0 }])}
          >
            <Plus className="size-4" /> Agregar tramo
          </Button>
        </CardContent>
      </Card>

      {/* Horario */}
      <Card>
        <CardHeader>
          <CardTitle>Horario de servicio</CardTitle>
          <CardDescription>Los pedidos en línea solo se aceptan dentro del horario.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DAYS.map((d) => {
            const h = hours[d.key] || emptyDay;
            return (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-24 text-sm">{d.label}</span>
                <Switch
                  checked={!h.closed}
                  onCheckedChange={(v) =>
                    setHours((prev) => ({ ...prev, [d.key]: { ...h, closed: !v } }))
                  }
                />
                {h.closed ? (
                  <span className="text-sm text-muted-foreground">Cerrado</span>
                ) : (
                  <>
                    <Input
                      type="time"
                      value={h.open}
                      className="w-32"
                      onChange={(e) =>
                        setHours((prev) => ({ ...prev, [d.key]: { ...h, open: e.target.value } }))
                      }
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={h.close}
                      className="w-32"
                      onChange={(e) =>
                        setHours((prev) => ({ ...prev, [d.key]: { ...h, close: e.target.value } }))
                      }
                    />
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg">
        {saving ? "Guardando…" : "Guardar ajustes"}
      </Button>
    </div>
  );
}
