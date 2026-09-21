"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Printer, FilePdf, Stack } from "@phosphor-icons/react";
import type { SupplierCalculationLine } from "@/lib/types";

interface SupplierBucket {
  supplierId: string;
  supplierName: string;
  lines: SupplierCalculationLine[];
  total: number;
}

export default function AllSuppliersPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bySupplier, setBySupplier] = useState<SupplierBucket[] | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  async function handleCalculate() {
    if (!dateFrom || !dateTo) {
      toast.error("Elige un rango de fechas");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/suppliers/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBySupplier(data.bySupplier);
      setGrandTotal(data.grandTotal);
    } catch (error) {
      console.error(error);
      toast.error("Error al calcular");
    } finally {
      setLoading(false);
    }
  }

  async function fetchPrintData() {
    if (!dateFrom || !dateTo) {
      toast.error("Elige un rango de fechas");
      return null;
    }
    const res = await fetch("/api/suppliers/print-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "all", dateFrom, dateTo }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al preparar impresión");
      return null;
    }
    return { ...data, bySupplier };
  }

  async function handlePrintTicket() {
    setPrinting(true);
    try {
      const data = await fetchPrintData();
      if (!data) return;
      const printServerUrl = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://192.168.0.152:3001";
      const res = await fetch(`${printServerUrl}/print-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success("Ticket enviado a impresora");
    } catch (error) {
      console.error(error);
      toast.error("Error al imprimir ticket");
    } finally {
      setPrinting(false);
    }
  }

  function handleDownloadPdf() {
    if (!dateFrom || !dateTo) {
      toast.error("Elige un rango de fechas");
      return;
    }
    const qs = new URLSearchParams({ scope: "all", dateFrom, dateTo });
    window.location.href = `/api/suppliers/pdf?${qs.toString()}`;
  }

  return (
    <div className="p-6 space-y-6">
      <Link href="/suppliers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-4" />
        Proveedores
      </Link>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Stack className="size-6" weight="duotone" />
          Todos los proveedores
        </h1>
        <p className="text-sm text-muted-foreground">Cuánto le debemos a cada proveedor en un rango de fechas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calculadora consolidada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="all-date-from">Desde</Label>
              <Input id="all-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="all-date-to">Hasta</Label>
              <Input id="all-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button onClick={handleCalculate} disabled={loading}>
              {loading ? "Calculando..." : "Calcular"}
            </Button>
          </div>

          {bySupplier !== null && (
            <>
              {bySupplier.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay ventas de productos de proveedores en el rango seleccionado.
                </p>
              ) : (
                <div className="space-y-6">
                  {bySupplier.map((bucket) => (
                    <div key={bucket.supplierId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/suppliers/${bucket.supplierId}`} className="font-medium hover:underline">
                          {bucket.supplierName}
                        </Link>
                        <span className="text-sm text-muted-foreground">Subtotal: ${bucket.total.toFixed(2)}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cant.</TableHead>
                            <TableHead className="text-right">Reparto</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bucket.lines.map((l) => (
                            <TableRow key={l.supplierItemId}>
                              <TableCell>
                                {l.productName}
                                {l.variantName && <span className="text-muted-foreground"> — {l.variantName}</span>}
                              </TableCell>
                              <TableCell className="text-right">{l.quantitySold}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {l.pricingType === "percentage" && l.businessCutPercent !== null
                                  ? `Bruma ${l.businessCutPercent}% / Prov. ${(100 - l.businessCutPercent).toFixed(0)}%`
                                  : `$${l.costPrice.toFixed(2)} c/u`}
                              </TableCell>
                              <TableCell className="text-right">${l.lineTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end text-lg font-semibold border-t pt-4">
                Gran total: ${grandTotal.toFixed(2)}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" onClick={handlePrintTicket} disabled={printing}>
              <Printer className="size-4 mr-2" />
              Imprimir ticket
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf} disabled={printing}>
              <FilePdf className="size-4 mr-2" />
              Descargar PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
