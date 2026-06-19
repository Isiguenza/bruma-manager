"use client";

import { useState, useEffect } from "react";
import { getApiUrl } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  price: string;
  hasVariants?: boolean;
  variants?: string; // JSON string
}

interface ManualOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface ManualOrderDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManualOrderDialog({ open, onClose, onSuccess }: ManualOrderDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [items, setItems] = useState<ManualOrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantPrice, setSelectedVariantPrice] = useState<string>("");
  const [productSearch, setProductSearch] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [customPrice, setCustomPrice] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [tip, setTip] = useState<string>("0");
  const [closedAt, setClosedAt] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    if (open) {
      loadProducts();
      // Set default time to now
      const now = new Date();
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setClosedAt(localDateTime);
    }
  }, [open]);

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products?active=true");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Error cargando productos");
    } finally {
      setLoadingProducts(false);
    }
  }

  function handleAddItem() {
    if (!selectedProductId || !quantity || parseFloat(quantity) <= 0) {
      toast.error("Selecciona un producto y cantidad válida");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    // Use variant price if selected, otherwise use base price
    const priceToUse = selectedVariantPrice || product.price;

    const newItem: ManualOrderItem = {
      productId: product.id,
      productName: product.name,
      quantity: parseFloat(quantity),
      unitPrice: parseFloat(priceToUse),
    };

    setItems([...items, newItem]);
    setSelectedProductId("");
    setSelectedVariantPrice("");
    setQuantity("1");
  }

  function handleRemoveItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tipAmount = parseFloat(tip) || 0;
  const total = subtotal + tipAmount;

  async function handleCreate() {
    if (items.length === 0) {
      toast.error("Añade al menos un producto");
      return;
    }

    if (!paymentMethod) {
      toast.error("Selecciona un método de pago");
      return;
    }

    if (!closedAt) {
      toast.error("Selecciona la hora de cierre");
      return;
    }

    setCreating(true);
    try {
      // Create order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            notes: "",
            seat: "C",
            course: 1,
          })),
          status: "delivered",
          customerName: customerName || null,
          tableId: null,
          orderNumber: orderNumber ? parseInt(orderNumber) : undefined,
        }),
      });

      if (!orderRes.ok) throw new Error("Error creating order");
      const order = await orderRes.json();

      // Mark as paid with custom timestamp
      const payRes = await fetch(`${getApiUrl()}/api/orders/${order.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          tip: tipAmount,
          subtotal,
          customTimestamp: new Date(closedAt).toISOString(),
        }),
      });

      if (!payRes.ok) throw new Error("Error marking as paid");

      toast.success("Orden manual creada exitosamente");
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("Error creating manual order:", error);
      toast.error("Error al crear la orden manual");
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setItems([]);
    setSelectedProductId("");
    setQuantity("1");
    setPaymentMethod("cash");
    setTip("0");
    setCustomerName("");
    setOrderNumber("");
    setClosedAt("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Añadir Orden Manual</DialogTitle>
          <DialogDescription>
            Registra una orden que se pagó fuera del sistema (ticket manual)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order Number */}
          <div className="space-y-2">
            <Label># de Orden</Label>
            <Input
              type="number"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Número de orden del ticket"
              min="1"
            />
          </div>

          {/* Customer Name */}
          <div className="space-y-2">
            <Label>Cliente (opcional)</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
            />
          </div>

          {/* Add Products */}
          <div className="space-y-2">
            <Label>Productos</Label>
            <Button
              onClick={() => setShowProductPicker(true)}
              variant="outline"
              className="w-full justify-start"
              type="button"
            >
              <Plus className="size-4 mr-2" />
              Añadir productos
            </Button>
          </div>

          {/* Items List */}
          {items.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3">
              <Label>Items añadidos</Label>
              {items.map((item, index) => (
                <div key={index} className="flex items-center justify-between gap-2 p-2 bg-muted rounded">
                  <div className="flex-1">
                    <div className="font-medium">{item.productName}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.quantity}x ${item.unitPrice.toFixed(2)} = ${(item.quantity * item.unitPrice).toFixed(2)}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRemoveItem(index)}
                    size="icon"
                    variant="ghost"
                    className="size-8"
                  >
                    <Trash className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Método de Pago</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="terminal_mercadopago">Terminal</SelectItem>
                <SelectItem value="split">Dividido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tip */}
          <div className="space-y-2">
            <Label>Propina</Label>
            <Input
              type="number"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>

          {/* Closed At */}
          <div className="space-y-2">
            <Label>Fecha y Hora del Ticket</Label>
            <Input
              type="datetime-local"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
            />
          </div>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Propina:</span>
              <span>${tipAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating || items.length === 0}>
            {creating ? "Creando..." : "Crear Orden"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Product Picker Modal */}
      <Dialog open={showProductPicker} onOpenChange={setShowProductPicker}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleccionar Producto</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <Input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="mb-4"
          />

          {/* Show product details OR product grid */}
          {selectedProductId && (() => {
            const product = products.find(p => p.id === selectedProductId);
            if (!product) return null;
            
            // Parse variants if exists
            let parsedVariants: Array<{ name: string; price: number }> = [];
            if (product.hasVariants && product.variants) {
              try {
                parsedVariants = JSON.parse(product.variants);
              } catch (e) {
                console.error('Error parsing variants:', e);
              }
            }
            
            return (
              <div className="flex-1 flex flex-col">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedProductId("");
                    setCustomPrice("");
                    setQuantity("1");
                  }}
                  className="self-start mb-4"
                >
                  ← Volver a productos
                </Button>
                <div className="text-lg font-semibold mb-4">
                  {product.name}
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      min="1"
                      step="1"
                    />
                  </div>
                  
                  {/* Show variants or base price */}
                  {parsedVariants.length > 0 ? (
                    <div>
                      <Label>Selecciona variante</Label>
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        <Button
                          variant="outline"
                          className="h-auto py-3 flex justify-between items-center"
                          onClick={() => {
                            const newItem: ManualOrderItem = {
                              productId: product.id,
                              productName: product.name,
                              quantity: parseFloat(quantity),
                              unitPrice: parseFloat(product.price),
                            };
                            setItems([...items, newItem]);
                            setSelectedProductId("");
                            setQuantity("1");
                            setShowProductPicker(false);
                          }}
                        >
                          <span className="font-semibold">Precio base</span>
                          <span className="text-lg font-bold">${parseFloat(product.price).toFixed(2)}</span>
                        </Button>
                        {parsedVariants.map((variant, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            className="h-auto py-3 flex justify-between items-center"
                            onClick={() => {
                              const newItem: ManualOrderItem = {
                                productId: product.id,
                                productName: `${product.name} (${variant.name})`,
                                quantity: parseFloat(quantity),
                                unitPrice: parseFloat(variant.price.toString()),
                              };
                              setItems([...items, newItem]);
                              setSelectedProductId("");
                              setQuantity("1");
                              setShowProductPicker(false);
                            }}
                          >
                            <span className="font-semibold">{variant.name}</span>
                            <span className="text-lg font-bold">${parseFloat(variant.price.toString()).toFixed(2)}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => {
                        const newItem: ManualOrderItem = {
                          productId: product.id,
                          productName: product.name,
                          quantity: parseFloat(quantity),
                          unitPrice: parseFloat(product.price),
                        };
                        setItems([...items, newItem]);
                        setSelectedProductId("");
                        setQuantity("1");
                        setShowProductPicker(false);
                      }}
                      className="w-full"
                    >
                      Añadir ${(parseFloat(product.price) * parseFloat(quantity)).toFixed(2)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })() || (
            /* Products Grid */
            <div className="flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Cargando productos...
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {products
                    .filter((p) => 
                      !productSearch || 
                      p.name.toLowerCase().includes(productSearch.toLowerCase())
                    )
                    .map((product) => (
                      <div
                        key={product.id}
                        className="border rounded-lg p-3 hover:border-primary cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedProductId(product.id);
                          setCustomPrice("");
                        }}
                      >
                        <div className="font-medium mb-1">{product.name}</div>
                        <div className="text-sm text-muted-foreground">
                          ${parseFloat(product.price).toFixed(2)}
                        </div>
                        {product.hasVariants && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            Tiene variantes
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
