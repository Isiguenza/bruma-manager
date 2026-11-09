"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FilePdf, Printer } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SupplierCalculationLine } from "@/lib/types";
import { type Period, PeriodPicker, periodFromUrl, periodLabel, periodRange } from "../_components/period";

interface SupplierBucket {
  supplierId: string;
  supplierName: string;
  lines: SupplierCalculationLine[];
  total: number;
}

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

/** Consolidado de todos los proveedores: mismo cálculo que el ticket y el PDF. */
export default function AllSuppliersPage() {
  const [period, setPeriod] = useState<Period>(() => periodFromUrl() ?? periodRange("week"));
  const [bySupplier, setBySupplier] = useState<SupplierBucket[] | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [printing, setPrinting] = useState(false);
  const { dateFrom, dateTo } = period;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/suppliers/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom: period.dateFrom, dateTo: period.dateTo }),
    })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error);
        setBySupplier(data.bySupplier);
        setGrandTotal(data.grandTotal);
      })
      .catch(() => !cancelled && toast.error("Error al calcular"));
    return () => {
      cancelled = true;
    };
  }, [period.dateFrom, period.dateTo]);

  async function handlePrintTicket() {
    setPrinting(true);
    try {
      const res = await fetch("/api/suppliers/print-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all", dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al preparar impresión");
        return;
      }
      const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.152:3001";
      const printRes = await fetch(`${printServerUrl}/print-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, bySupplier }),
      });
      if (!printRes.ok) throw new Error();
      toast.success("Ticket enviado a impresora");
    } catch (error) {
      console.error(error);
      toast.error("Error al imprimir ticket");
    } finally {
      setPrinting(false);
    }
  }

  function handleDownloadPdf() {
    const qs = new URLSearchParams({ scope: "all", dateFrom, dateTo });
    window.location.href = `/api/suppliers/pdf?${qs.toString()}`;
  }

  const sorted = [...(bySupplier ?? [])].sort((a, b) => b.total - a.total);
  const linkPeriod = `from=${dateFrom}&to=${dateTo}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/suppliers" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Proveedores
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Consolidado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cuánto le debemos a todos los proveedores · {periodLabel(period)}</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <Card className="py-0">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-muted-foreground">Gran total</p>
            {bySupplier === null ? (
              <Skeleton className="mt-2 h-12 w-48" />
            ) : (
              <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{money(grandTotal)}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{bySupplier ? `${bySupplier.length} proveedores con ventas` : "Calculando…"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintTicket} disabled={printing || !bySupplier?.length} className="gap-2">
              <Printer className="size-4" />
              Imprimir ticket
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf} disabled={!bySupplier?.length} className="gap-2">
              <FilePdf className="size-4" />
              Descargar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {bySupplier !== null && sorted.length === 0 && (
        <Card className="py-16 text-center text-sm text-muted-foreground">No hay ventas de productos de proveedores en este periodo.</Card>
      )}

      <div className="space-y-4">
        {sorted.map((bucket) => (
          <Card key={bucket.supplierId} className="gap-0 overflow-hidden py-0">
            <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-3">
              <Link href={`/suppliers/${bucket.supplierId}?${linkPeriod}`} className="font-semibold hover:underline">
                {bucket.supplierName}
              </Link>
              <span className="text-xs text-muted-foreground">{grandTotal > 0 ? Math.round((bucket.total / grandTotal) * 100) : 0}% del total</span>
              <span className="ml-auto text-lg font-semibold tabular-nums">{money(bucket.total)}</span>
              <Link href={`/suppliers/${bucket.supplierId}?${linkPeriod}`} aria-label={`Ver ${bucket.supplierName}`} className="text-muted-foreground hover:text-foreground">
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 text-left font-bold">Producto</th>
                  <th className="w-20 px-3 py-2 text-right font-bold">Cant.</th>
                  <th className="hidden px-3 py-2 text-right font-bold sm:table-cell">Reparto</th>
                  <th className="w-32 px-5 py-2 text-right font-bold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bucket.lines.map((l) => (
                  <tr key={l.supplierItemId} className={l.quantitySold === 0 ? "text-muted-foreground/60" : undefined}>
                    <td className="px-5 py-2.5">
                      {l.productName}
                      {l.variantName && <span className="text-muted-foreground"> — {l.variantName}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.quantitySold}</td>
                    <td className="hidden px-3 py-2.5 text-right text-muted-foreground sm:table-cell">
                      {l.pricingType === "percentage" && l.businessCutPercent !== null
                        ? `Bruma ${l.businessCutPercent}% / Prov. ${(100 - l.businessCutPercent).toFixed(0)}%`
                        : `${money(l.costPrice)} c/u`}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  );
}
