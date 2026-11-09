"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, DotsThree, Pencil, Phone, Plus, Power, Stack, Truck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { Supplier, SupplierCalculationLine } from "@/lib/types";
import { type Period, PeriodPicker, periodLabel, periodRange } from "./_components/period";

const emptyForm = { name: "", contactName: "", phone: "", email: "", address: "", notes: "" };

type Bucket = { supplierId: string; supplierName: string; lines: SupplierCalculationLine[]; total: number };

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => periodRange("week"));
  const [buckets, setBuckets] = useState<Map<string, Bucket> | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) setSuppliers(await res.json());
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      toast.error("Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Cuánto le debemos a cada quien en el periodo (mismo cálculo que el detalle y el PDF).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/suppliers/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom: period.dateFrom, dateTo: period.dateTo }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { bySupplier: Bucket[]; grandTotal: number }) => {
        if (cancelled) return;
        setBuckets(new Map(data.bySupplier.map((b) => [b.supplierId, b])));
        setGrandTotal(data.grandTotal);
      })
      .catch(() => !cancelled && toast.error("No se pudo calcular lo que se debe"));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const sorted = useMemo(
    () =>
      [...suppliers].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (buckets?.get(b.id)?.total ?? 0) - (buckets?.get(a.id)?.total ?? 0) ||
          a.name.localeCompare(b.name)
      ),
    [suppliers, buckets]
  );
  const owing = sorted.filter((s) => (buckets?.get(s.id)?.total ?? 0) > 0);
  const linkPeriod = `from=${period.dateFrom}&to=${period.dateTo}`;

  function handleNew() {
    setEditing(null);
    setFormData(emptyForm);
    setShowDialog(true);
  }

  function handleEdit(supplier: Supplier) {
    setEditing(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }
      toast.success(editing ? "Proveedor actualizado" : "Proveedor creado");
      setShowDialog(false);
      fetchSuppliers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar proveedor");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(supplier: Supplier) {
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !supplier.active }),
      });
      if (!res.ok) throw new Error();
      toast.success(supplier.active ? "Proveedor desactivado" : "Proveedor activado");
      fetchSuppliers();
    } catch {
      toast.error("Error al actualizar proveedor");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Cuánto le debemos a cada quien según lo que se vendió de sus productos"
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <Button onClick={handleNew} className="gap-2">
              <Plus className="size-4" weight="bold" />
              Nuevo proveedor
            </Button>
          </>
        }
      />

      {/* Total por pagar */}
      <Card className="py-0">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <p className="text-sm text-muted-foreground">
              Por pagar · <span className="font-medium text-foreground">{periodLabel(period)}</span>
            </p>
            {buckets === null ? (
              <Skeleton className="mt-2 h-12 w-48" />
            ) : (
              <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{money(grandTotal)}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {buckets === null ? "Calculando…" : `${owing.length} de ${suppliers.filter((s) => s.active).length} proveedores con ventas en el periodo`}
            </p>
            <Button variant="outline" size="sm" className="mt-4 gap-2" asChild>
              <Link href={`/suppliers/all?${linkPeriod}`}>
                <Stack className="size-4" />
                Consolidado, ticket y PDF
              </Link>
            </Button>
          </div>
          <div className="space-y-2.5">
            {buckets !== null && owing.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas de productos de proveedores en este periodo.</p>
            )}
            {owing.slice(0, 6).map((s) => {
              const total = buckets?.get(s.id)?.total ?? 0;
              return (
                <Link key={s.id} href={`/suppliers/${s.id}?${linkPeriod}`} className="group block space-y-1">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="truncate font-medium group-hover:underline">{s.name}</span>
                    <span className="ml-auto tabular-nums">{money(total)}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                      {grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${grandTotal > 0 ? (total / grandTotal) * 100 : 0}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Proveedores */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Truck className="size-10 text-muted-foreground" weight="duotone" />
          <p className="font-medium">Aún no hay proveedores</p>
          <p className="max-w-sm text-sm text-muted-foreground">Crea uno y asígnale los platillos que le compras para saber cuánto le debes cada semana.</p>
          <Button onClick={handleNew} className="mt-2 gap-2">
            <Plus className="size-4" weight="bold" />
            Nuevo proveedor
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((s) => {
            const bucket = buckets?.get(s.id);
            const pieces = bucket?.lines.reduce((sum, l) => sum + l.quantitySold, 0) ?? 0;
            const topLine = bucket?.lines.slice().sort((a, b) => b.lineTotal - a.lineTotal)[0];
            return (
              <Card key={s.id} className={cn("gap-0 py-0 transition-colors hover:bg-muted/30", !s.active && "opacity-60")}>
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/suppliers/${s.id}?${linkPeriod}`} className="block truncate font-semibold hover:underline">
                        {s.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{s.contactName || "Sin contacto"}</p>
                    </div>
                    {!s.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactivo</span>}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <DotsThree className="size-5" weight="bold" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(s)}>
                          <Pencil className="mr-2 size-4" /> Editar datos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(s)}>
                          <Power className="mr-2 size-4" /> {s.active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Le debemos · {periodLabel(period)}</p>
                    {buckets === null ? (
                      <Skeleton className="mt-1 h-8 w-32" />
                    ) : (
                      <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(bucket?.total ?? 0)}</p>
                    )}
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {bucket
                        ? `${pieces} piezas · ${bucket.lines.filter((l) => l.quantitySold > 0).length} productos con venta${topLine ? ` · más: ${topLine.productName}` : ""}`
                        : "Sin ventas en el periodo"}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center gap-2 border-t pt-3">
                    {s.phone ? (
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <Phone className="size-4" /> {s.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">Sin teléfono</span>
                    )}
                    <Link href={`/suppliers/${s.id}?${linkPeriod}`} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Ver detalle <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="supplier-name">Nombre *</Label>
              <Input id="supplier-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Punto Napa" />
            </div>
            <div>
              <Label htmlFor="supplier-contact">Contacto</Label>
              <Input
                id="supplier-contact"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                placeholder="Nombre de la persona de contacto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="supplier-phone">Teléfono</Label>
                <Input id="supplier-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="supplier-email">Email</Label>
                <Input id="supplier-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="supplier-address">Dirección</Label>
              <Textarea id="supplier-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
            </div>
            <div>
              <Label htmlFor="supplier-notes">Notas</Label>
              <Textarea id="supplier-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
