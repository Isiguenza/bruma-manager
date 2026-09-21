"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash,
  Printer,
  FilePdf,
  ArrowsClockwise,
  Calculator,
} from "@phosphor-icons/react";
import { PromotionProductPicker, type PromotionProductSelection } from "@/components/promotion-product-picker";
import type { Supplier, SupplierItem, Product, Category, SupplierCalculationLine } from "@/lib/types";

interface SupplierDetail extends Supplier {
  items: (SupplierItem & { product: Product & { category: Category | null } })[];
}

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [calcLines, setCalcLines] = useState<SupplierCalculationLine[] | null>(null);
  const [calcTotal, setCalcTotal] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [printScope, setPrintScope] = useState("supplier");
  const [printing, setPrinting] = useState(false);
  const [groupPercentDraft, setGroupPercentDraft] = useState<Record<string, string>>({});

  const emptyPickerValue: PromotionProductSelection = { applyTo: "specific_products", productIds: [], categoryId: "" };

  const fetchSupplier = useCallback(async () => {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      if (res.ok) setSupplier(await res.json());
    } catch (error) {
      console.error("Error fetching supplier:", error);
      toast.error("Error al cargar proveedor");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    fetchSupplier();
    fetch("/api/products?active=true").then((r) => r.ok && r.json()).then((d) => d && setProducts(d));
    fetch("/api/categories").then((r) => r.ok && r.json()).then((d) => d && setCategories(d));
  }, [fetchSupplier]);

  async function handlePickerChange(selection: PromotionProductSelection) {
    if (selection.applyTo === "category" && selection.categoryId) {
      const res = await fetch(`/api/suppliers/${supplierId}/items/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: selection.categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al asignar categoría");
        return;
      }
      toast.success(
        `${data.created.length} agregado(s)` +
          (data.skipped.length > 0 ? `, ${data.skipped.length} ya estaban asignados` : "")
      );
      fetchSupplier();
      return;
    }

    let createdCount = 0;
    let skippedCount = 0;
    for (const rawId of selection.productIds) {
      const [productId, variantName] = rawId.split("::");
      const res = await fetch(`/api/suppliers/${supplierId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantName: variantName || null, costPrice: 0 }),
      });
      if (res.ok) createdCount++;
      else skippedCount++;
    }
    toast.success(`${createdCount} agregado(s)` + (skippedCount > 0 ? `, ${skippedCount} no se pudieron asignar` : ""));
    fetchSupplier();
  }

  async function handleResync(categoryId: string) {
    const res = await fetch(`/api/suppliers/${supplierId}/items/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al resincronizar");
      return;
    }
    toast.success(data.created.length > 0 ? `${data.created.length} producto(s) nuevo(s) agregado(s)` : "Ya estaba al día");
    fetchSupplier();
  }

  function patchLocalItem(itemId: string, patch: Partial<SupplierDetail["items"][number]>) {
    setSupplier((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : prev
    );
  }

  function handleCostChange(itemId: string, value: string) {
    patchLocalItem(itemId, { costPrice: value });
  }

  async function handleCostBlur(itemId: string, value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    try {
      await fetch(`/api/suppliers/${supplierId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPrice: num }),
      });
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar costo");
    }
  }

  async function handlePricingTypeChange(itemId: string, pricingType: "fixed_cost" | "percentage") {
    patchLocalItem(itemId, { pricingType });
    try {
      await fetch(`/api/suppliers/${supplierId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricingType }),
      });
    } catch (error) {
      console.error(error);
      toast.error("Error al cambiar el modelo de costo");
    }
  }

  function handlePercentChange(itemId: string, value: string) {
    patchLocalItem(itemId, { businessCutPercent: value });
  }

  async function handlePercentBlur(itemId: string, value: string) {
    const num = value === "" ? null : parseFloat(value);
    if (num !== null && (isNaN(num) || num < 0 || num > 100)) return;
    try {
      await fetch(`/api/suppliers/${supplierId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCutPercent: num }),
      });
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el porcentaje");
    }
  }

  async function handleApplyPercentToGroup(groupKey: string, items: SupplierDetail["items"]) {
    const raw = groupPercentDraft[groupKey];
    const num = parseFloat(raw);
    if (isNaN(num) || num < 0 || num > 100) {
      toast.error("Escribe un porcentaje válido (0-100)");
      return;
    }
    await Promise.all(
      items.map((item) =>
        fetch(`/api/suppliers/${supplierId}/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pricingType: "percentage", businessCutPercent: num }),
        })
      )
    );
    toast.success(`Reparto aplicado a ${items.length} producto(s): Bruma ${num}% / proveedor ${100 - num}%`);
    fetchSupplier();
  }

  async function handleRemoveItem(itemId: string) {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Producto quitado");
      fetchSupplier();
    } catch (error) {
      console.error(error);
      toast.error("Error al quitar producto");
    }
  }

  async function handleCalculate() {
    if (!dateFrom || !dateTo) {
      toast.error("Elige un rango de fechas");
      return;
    }
    setCalculating(true);
    try {
      const res = await fetch("/api/suppliers/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCalcLines(data.lines);
      setCalcTotal(data.grandTotal);
    } catch (error) {
      console.error(error);
      toast.error("Error al calcular");
    } finally {
      setCalculating(false);
    }
  }

  async function fetchPrintData(scope: "supplier" | "category") {
    if (!dateFrom || !dateTo) {
      toast.error("Elige un rango de fechas");
      return null;
    }
    const categoryId = scope === "category" ? printScope : undefined;
    const res = await fetch("/api/suppliers/print-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, supplierId, categoryId, dateFrom, dateTo }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Error al preparar impresión");
      return null;
    }
    return data;
  }

  async function handlePrintTicket() {
    const scope = printScope === "supplier" ? "supplier" : "category";
    setPrinting(true);
    try {
      const data = await fetchPrintData(scope);
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
    const scope = printScope === "supplier" ? "supplier" : "category";
    const qs = new URLSearchParams({ scope, supplierId, dateFrom, dateTo });
    if (scope === "category") qs.set("categoryId", printScope);
    window.location.href = `/api/suppliers/pdf?${qs.toString()}`;
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  if (!supplier) return <div className="p-6 text-sm text-muted-foreground">Proveedor no encontrado.</div>;

  const groups = new Map<string, { label: string; categoryId: string | null; items: typeof supplier.items }>();
  for (const item of supplier.items) {
    const key = item.sourceCategory?.id ?? item.product?.category?.id ?? "__individual__";
    const label = item.sourceCategory?.name ?? item.product?.category?.name ?? "Individual";
    if (!groups.has(key)) groups.set(key, { label, categoryId: item.sourceCategory?.id ?? null, items: [] });
    groups.get(key)!.items.push(item);
  }
  const printableCategories = Array.from(
    new Map(
      supplier.items
        .filter((i) => i.product?.category)
        .map((i) => [i.product!.category!.id, i.product!.category!.name])
    ).entries()
  );

  return (
    <div className="p-6 space-y-6">
      <Link href="/suppliers" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-4" />
        Proveedores
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Productos asignados</CardTitle>
          <PromotionProductPicker
            products={products}
            categories={categories}
            value={emptyPickerValue}
            onChange={handlePickerChange}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.size === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aún no hay productos asignados a este proveedor.
            </p>
          )}
          {Array.from(groups.entries()).map(([key, group]) => (
            <div key={key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">{group.label}</Badge>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="% Bruma"
                    className="h-8 w-24"
                    value={groupPercentDraft[key] ?? ""}
                    onChange={(e) => setGroupPercentDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleApplyPercentToGroup(key, group.items)}>
                    Aplicar % a todos
                  </Button>
                  {group.categoryId && (
                    <Button variant="ghost" size="sm" onClick={() => handleResync(group.categoryId!)}>
                      <ArrowsClockwise className="size-3.5 mr-1" />
                      Resincronizar categoría
                    </Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-40">Modelo</TableHead>
                    <TableHead className="w-32">Valor</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.product?.name}
                        {item.variantName && <span className="text-muted-foreground"> — {item.variantName}</span>}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.pricingType}
                          onValueChange={(v) => handlePricingTypeChange(item.id, v as "fixed_cost" | "percentage")}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed_cost">Costo fijo</SelectItem>
                            <SelectItem value="percentage">% reparto</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {item.pricingType === "percentage" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="% Bruma"
                              className="h-8 w-24"
                              value={item.businessCutPercent ?? ""}
                              onChange={(e) => handlePercentChange(item.id, e.target.value)}
                              onBlur={(e) => handlePercentBlur(item.id, e.target.value)}
                            />
                            {item.businessCutPercent && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                prov. {(100 - parseFloat(item.businessCutPercent)).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-28"
                            value={item.costPrice}
                            onChange={(e) => handleCostChange(item.id, e.target.value)}
                            onBlur={(e) => handleCostBlur(item.id, e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(item.id)}>
                          <Trash className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="size-4" />
            Calculadora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="date-from">Desde</Label>
              <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="date-to">Hasta</Label>
              <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button onClick={handleCalculate} disabled={calculating}>
              {calculating ? "Calculando..." : "Calcular"}
            </Button>
          </div>

          {calcLines !== null && (
            <>
              {calcLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay ventas de productos de este proveedor en el rango seleccionado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant. vendida</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">Reparto</TableHead>
                      <TableHead className="text-right">Le corresponde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calcLines.map((l) => (
                      <TableRow key={l.supplierItemId}>
                        <TableCell>
                          {l.productName}
                          {l.variantName && <span className="text-muted-foreground"> — {l.variantName}</span>}
                        </TableCell>
                        <TableCell className="text-right">{l.quantitySold}</TableCell>
                        <TableCell className="text-right">${l.revenue.toFixed(2)}</TableCell>
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
              )}
              <div className="flex justify-end text-lg font-semibold">
                Total a pagar: ${calcTotal.toFixed(2)}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Select value={printScope} onValueChange={setPrintScope}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Alcance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">Este proveedor (todo)</SelectItem>
                {printableCategories.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    Categoría: {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
