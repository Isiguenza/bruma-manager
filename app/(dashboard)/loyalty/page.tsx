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
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  MagnifyingGlass,
  CreditCard,
  Stamp,
  Gift,
  Eye,
  DownloadSimple,
  Camera,
  Barcode,
  ArrowsClockwise,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { QRCodeSVG } from "qrcode.react";
import type { LoyaltyCard } from "@/lib/types";
import { getApiUrl } from "@/lib/utils";

interface CardForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  stampsPerReward: string;
}

const emptyForm: CardForm = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  stampsPerReward: "8",
};

export default function LoyaltyPage() {
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null);

  // Stamp dialog
  const [stampDialogOpen, setStampDialogOpen] = useState(false);
  const [stampCard, setStampCard] = useState<LoyaltyCard | null>(null);
  const [stampsToAdd, setStampsToAdd] = useState(1);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCard, setQrCard] = useState<LoyaltyCard | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const registerUrl = `${origin}/loyalty/register`;

  useEffect(() => {
    fetchCards();
  }, []);

  async function fetchCards() {
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards`);
      if (res.ok) setCards(await res.json());
    } catch {
      toast.error("Error cargando tarjetas");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.customerName) {
      toast.error("El nombre es requerido");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone || null,
          customerEmail: form.customerEmail || null,
          stampsPerReward: parseInt(form.stampsPerReward) || 8,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tarjeta creada exitosamente");
      setDialogOpen(false);
      setForm(emptyForm);
      fetchCards();
    } catch {
      toast.error("Error creando tarjeta");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddStamps() {
    if (!stampCard) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/${stampCard.id}/stamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stamps: stampsToAdd }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${stampsToAdd} sello(s) agregado(s)`);
      setStampDialogOpen(false);
      setStampsToAdd(1);
      fetchCards();
    } catch {
      toast.error("Error agregando sellos");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRedeemReward(cardId: string) {
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/${cardId}/redeem`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Premio canjeado");
      fetchCards();
      setSelectedCard(null);
    } catch {
      toast.error("Error canjeando premio");
    }
  }

  async function handleInvalidateAll() {
    const confirmed = confirm(
      "¿Actualizar todos los passes de Apple Wallet? Esto forzará la actualización en los dispositivos de los clientes."
    );
    if (!confirmed) return;
    
    try {
      const res = await fetch("/api/wallet/invalidate-all", {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
    } catch {
      toast.error("Error al invalidar passes");
    }
  }

  async function handleDeleteCard(cardId: string, cardName: string) {
    const confirmed = confirm(
      `¿Eliminar la tarjeta de ${cardName}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Tarjeta eliminada");
      fetchCards();
      setSelectedCard(null);
    } catch {
      toast.error("Error al eliminar tarjeta");
    }
  }

  function downloadPass(cardId: string) {
    window.open(`/api/wallet/pass/${cardId}`, "_blank");
  }

  async function addToGoogleWallet(cardId: string) {
    try {
      const res = await fetch(`/api/wallet/google-pass/${cardId}`);
      if (!res.ok) {
        toast.error("Error generando tarjeta Google Wallet");
        return;
      }
      const data = await res.json();
      if (data.saveUrl) {
        window.open(data.saveUrl, "_blank");
      }
    } catch {
      toast.error("Error generando tarjeta Google Wallet");
    }
  }

  const filtered = cards.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.customerName.toLowerCase().includes(q) ||
      c.customerPhone?.toLowerCase().includes(q) ||
      c.barcodeValue.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Clientes Frecuentes
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleInvalidateAll}>
            <ArrowsClockwise className="mr-1 size-4" /> Actualizar Passes
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" /> Nueva Tarjeta
          </Button>
        </div>
      </div>

      {/* Registration QR */}
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="flex items-center gap-6 p-6">
          <div className="shrink-0 rounded-xl bg-white p-3">
            {origin && (
              <QRCodeSVG
                value={registerUrl}
                size={120}
                level="M"
                bgColor="#ffffff"
                fgColor="#4f46e5"
              />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">Registro de clientes</h3>
            <p className="text-sm text-muted-foreground">
              Muestra este QR a tus clientes para que se registren desde su celular y obtengan su tarjeta de Apple Wallet.
            </p>
            <code className="block text-xs text-muted-foreground">
              {registerUrl}
            </code>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tarjetas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cards.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Sellos Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {cards.reduce((sum, c) => sum + c.totalStamps, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Premios Canjeados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {cards.reduce((sum, c) => sum + c.rewardsRedeemed, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, teléfono o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-center">Sellos</TableHead>
                <TableHead className="text-center">Premios</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No hay tarjetas registradas
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{card.customerName}</p>
                        {card.customerPhone && (
                          <p className="text-xs text-muted-foreground">
                            {card.customerPhone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{card.barcodeValue}</code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        <Stamp className="mr-1 size-3" />
                        {card.stamps}/{card.stampsPerReward}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          card.rewardsAvailable > 0 ? "default" : "outline"
                        }
                      >
                        <Gift className="mr-1 size-3" />
                        {card.rewardsAvailable}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(card.createdAt), "dd MMM yy", {
                        locale: es,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setStampCard(card);
                            setStampDialogOpen(true);
                          }}
                          title="Agregar sellos"
                        >
                          <Stamp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedCard(card)}
                          title="Ver detalle"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setQrCard(card);
                            setQrDialogOpen(true);
                          }}
                          title="QR Apple Wallet"
                        >
                          <Barcode className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadPass(card.id)}
                          title="Apple Wallet"
                        >
                          <DownloadSimple className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addToGoogleWallet(card.id)}
                          title="Google Wallet"
                        >
                          <CreditCard className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCard(card.id, card.customerName)}
                          title="Eliminar tarjeta"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Card Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Tarjeta de Cliente</DialogTitle>
            <DialogDescription>
              Crea una tarjeta de lealtad para un nuevo cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del cliente *</Label>
              <Input
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
                placeholder="Nombre completo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.customerPhone}
                  onChange={(e) =>
                    setForm({ ...form, customerPhone: e.target.value })
                  }
                  placeholder="+52..."
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) =>
                    setForm({ ...form, customerEmail: e.target.value })
                  }
                  placeholder="email@ejemplo.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sellos para premio</Label>
              <Input
                type="number"
                value={form.stampsPerReward}
                onChange={(e) =>
                  setForm({ ...form, stampsPerReward: e.target.value })
                }
                placeholder="8"
              />
              <p className="text-xs text-muted-foreground">
                Cantidad de sellos necesarios para obtener un premio
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creando..." : "Crear Tarjeta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stamps Dialog */}
      <Dialog open={stampDialogOpen} onOpenChange={setStampDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Sellos</DialogTitle>
            <DialogDescription>
              {stampCard?.customerName} — {stampCard?.stamps}/
              {stampCard?.stampsPerReward} sellos actuales
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4 py-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setStampsToAdd(Math.max(1, stampsToAdd - 1))}
            >
              -
            </Button>
            <span className="text-4xl font-bold">{stampsToAdd}</span>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setStampsToAdd(stampsToAdd + 1)}
            >
              +
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStampDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddStamps} disabled={submitting}>
              {submitting ? "Agregando..." : `Agregar ${stampsToAdd} sello(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCard?.customerName}</DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-4">
              {/* Visual stamp card */}
              <div className="rounded-xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #004b49 0%, #003d3b 100%)' }}>
                <p className="text-lg font-bold">BRUMA</p>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {Array.from({ length: selectedCard.stampsPerReward }).map(
                    (_, i) => (
                      <div
                        key={i}
                        className={`flex size-12 items-center justify-center rounded-full border-2 ${
                          i < selectedCard.stamps
                            ? "border-white bg-white/20"
                            : "border-white/30"
                        }`}
                      >
                        {i < selectedCard.stamps ? (
                          <span className="text-lg">🍹</span>
                        ) : (
                          <span className="text-xs opacity-40">{i + 1}</span>
                        )}
                      </div>
                    )
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase opacity-70">Sellos</p>
                    <p className="text-xl font-bold">
                      {selectedCard.stamps} sellos
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase opacity-70">
                      Premios Disponibles
                    </p>
                    <p className="text-xl font-bold">
                      {selectedCard.rewardsAvailable} premios
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Teléfono</span>
                <span>{selectedCard.customerPhone || "—"}</span>
                <span className="text-muted-foreground">Email</span>
                <span>{selectedCard.customerEmail || "—"}</span>
                <span className="text-muted-foreground">Código</span>
                <code className="text-xs">{selectedCard.barcodeValue}</code>
                <span className="text-muted-foreground">Total sellos</span>
                <span>{selectedCard.totalStamps}</span>
                <span className="text-muted-foreground">
                  Premios canjeados
                </span>
                <span>{selectedCard.rewardsRedeemed}</span>
              </div>

              {/* QR for this card's Wallet pass */}
              <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
                <p className="text-xs font-medium text-muted-foreground">Escanea para Apple Wallet</p>
                {origin && (
                  <QRCodeSVG
                    value={`${origin}/api/wallet/pass/${selectedCard.id}`}
                    size={140}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                )}
              </div>

              <div className="flex gap-2">
                {selectedCard.rewardsAvailable > 0 && (
                  <Button
                    onClick={() => handleRedeemReward(selectedCard.id)}
                    className="flex-1"
                  >
                    <Gift className="mr-1 size-4" />
                    Canjear Premio
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => downloadPass(selectedCard.id)}
                  className="flex-1"
                >
                  <DownloadSimple className="mr-1 size-4" />
                  Apple Wallet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addToGoogleWallet(selectedCard.id)}
                  className="flex-1"
                >
                  <CreditCard className="mr-1 size-4" />
                  Google Wallet
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* QR Dialog (quick QR for a specific card) */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">{qrCard?.customerName}</DialogTitle>
            <DialogDescription className="text-center">
              Escanea para descargar Apple Wallet
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            {qrCard && origin && (
              <QRCodeSVG
                value={`${origin}/api/wallet/pass/${qrCard.id}`}
                size={200}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            )}
            <code className="text-xs text-muted-foreground">
              {qrCard?.barcodeValue}
            </code>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
