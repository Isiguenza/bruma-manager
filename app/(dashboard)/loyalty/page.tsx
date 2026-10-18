"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  MagnifyingGlass,
  Stamp,
  Gift,
  Eye,
  Barcode,
  ArrowsClockwise,
  Trash,
  PaperPlaneTilt,
  PencilSimple,
  Cake,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { QRCodeSVG } from "qrcode.react";
import { FaApple, FaGoogle } from "react-icons/fa";
import type { LoyaltyCard, LoyaltyTransaction } from "@/lib/types";
import { getApiUrl } from "@/lib/utils";
import { ApplePassPreview } from "@/components/apple-pass-preview";

interface CardForm {
  customerName: string;
  customerLastName: string;
  customerPhone: string;
  customerEmail: string;
  birthDate: string;
  stampsPerReward: string;
}

const emptyForm: CardForm = {
  customerName: "",
  customerLastName: "",
  customerPhone: "",
  customerEmail: "",
  birthDate: "",
  stampsPerReward: "8",
};

type CardFilter = "all" | "reward" | "near" | "birthday" | "inactive";
type CardSort = "recent" | "activity" | "stamps" | "name";

const DAY_MS = 24 * 60 * 60 * 1000;

function fullName(card: LoyaltyCard) {
  return `${card.customerName} ${card.customerLastName || ""}`.trim();
}

// birthDate is a plain "YYYY-MM-DD" date column: read the month from the
// string, never through new Date() (UTC parsing would shift it a day).
function birthdayIsThisMonth(card: LoyaltyCard) {
  if (!card.birthDate) return false;
  return parseInt(card.birthDate.slice(5, 7), 10) === new Date().getMonth() + 1;
}

function formatBirthDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return format(new Date(y, m - 1, d), "d 'de' MMMM", { locale: es });
}

function isNearReward(card: LoyaltyCard) {
  return card.stamps > 0 && card.stampsPerReward - card.stamps <= 2;
}

function lastActivityMs(card: LoyaltyCard) {
  return card.lastActivityAt ? new Date(card.lastActivityAt).getTime() : 0;
}

function isInactive(card: LoyaltyCard) {
  const last = lastActivityMs(card) || new Date(card.createdAt).getTime();
  return Date.now() - last > 60 * DAY_MS;
}

export default function LoyaltyPage() {
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [cardSort, setCardSort] = useState<CardSort>("recent");

  // Create / edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Detail
  const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const [stampDialogOpen, setStampDialogOpen] = useState(false);
  const [stampCard, setStampCard] = useState<LoyaltyCard | null>(null);
  const [stampsToAdd, setStampsToAdd] = useState(1);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCard, setQrCard] = useState<LoyaltyCard | null>(null);

  // Promotion dialog
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoTarget, setPromoTarget] = useState<"all" | "birthday" | "specific">("all");
  const [selectedCardsForPromo, setSelectedCardsForPromo] = useState<string[]>([]);

  // Refresh wallet cards dialog
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [refreshTarget, setRefreshTarget] = useState<"all" | "specific">("specific");
  const [refreshSearch, setRefreshSearch] = useState("");
  const [selectedCardsForRefresh, setSelectedCardsForRefresh] = useState<string[]>([]);
  // Wallet design: "" = original, otherwise a folder in api-server/public/pass-assets/seasons/
  const [walletSeasons, setWalletSeasons] = useState<string[]>([]);
  const [activeWalletSeason, setActiveWalletSeason] = useState("");
  const [refreshSeason, setRefreshSeason] = useState("");
  const [origin, setOrigin] = useState("");
  const [deviceType, setDeviceType] = useState<string>("other");

  useEffect(() => {
    setOrigin(window.location.origin);
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setDeviceType("ios");
    else if (/android/.test(ua)) setDeviceType("android");
    else setDeviceType("other");
  }, []);

  const registerUrl = `${origin}/loyalty/register`;

  useEffect(() => {
    fetchCards();
  }, []);

  async function fetchCards(): Promise<LoyaltyCard[]> {
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards`);
      if (res.ok) {
        const data: LoyaltyCard[] = await res.json();
        setCards(data);
        return data;
      }
    } catch {
      toast.error("Error cargando tarjetas");
    } finally {
      setLoading(false);
    }
    return [];
  }

  // Refetch the list and keep the open detail in sync with it.
  async function reloadCards(detailCardId?: string) {
    const data = await fetchCards();
    if (detailCardId) {
      const fresh = data.find((c) => c.id === detailCardId);
      if (fresh) setSelectedCard(fresh);
    }
  }

  async function loadTransactions(cardId: string) {
    setTransactionsLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/${cardId}/transactions`);
      if (res.ok) setTransactions(await res.json());
    } catch {
      toast.error("Error cargando historial");
    } finally {
      setTransactionsLoading(false);
    }
  }

  function openDetail(card: LoyaltyCard) {
    setSelectedCard(card);
    setTransactions([]);
    loadTransactions(card.id);
  }

  function openCreateDialog() {
    setEditingCardId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(card: LoyaltyCard) {
    setEditingCardId(card.id);
    setForm({
      customerName: card.customerName,
      customerLastName: card.customerLastName || "",
      customerPhone: card.customerPhone || "",
      customerEmail: card.customerEmail || "",
      birthDate: card.birthDate || "",
      stampsPerReward: String(card.stampsPerReward),
    });
    setDialogOpen(true);
  }

  async function handleSaveCard() {
    if (!form.customerName.trim() || !form.customerLastName.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    if (!editingCardId && !form.customerPhone.trim()) {
      toast.error("El teléfono es requerido");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        customerName: form.customerName,
        customerLastName: form.customerLastName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        birthDate: form.birthDate || null,
        ...(editingCardId ? {} : { stampsPerReward: parseInt(form.stampsPerReward) || 8 }),
      };
      const res = await fetch(
        editingCardId
          ? `${getApiUrl()}/api/loyalty-cards/${editingCardId}`
          : `${getApiUrl()}/api/loyalty-cards`,
        {
          method: editingCardId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error);
      }
      toast.success(editingCardId ? "Cliente actualizado" : "Tarjeta creada exitosamente");
      setDialogOpen(false);
      setForm(emptyForm);
      await reloadCards(editingCardId && selectedCard?.id === editingCardId ? editingCardId : undefined);
      setEditingCardId(null);
    } catch (error) {
      toast.error(
        (error as Error).message ||
          (editingCardId ? "Error actualizando cliente" : "Error creando tarjeta")
      );
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

  async function handleRedeemReward(card: LoyaltyCard) {
    const confirmed = confirm(
      `¿Canjear 1 premio de ${fullName(card)}? Le quedarán ${card.rewardsAvailable - 1}.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/${card.id}/redeem`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Premio canjeado");
      // Keep the detail open with the updated card and history.
      await reloadCards(card.id);
      loadTransactions(card.id);
    } catch {
      toast.error("Error canjeando premio");
    }
  }

  async function openRefreshDialog() {
    setRefreshDialogOpen(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/wallet-seasons`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWalletSeasons(data.seasons ?? []);
      setActiveWalletSeason(data.active ?? "");
      setRefreshSeason(data.active ?? "");
    } catch {
      toast.error("No se pudieron cargar las temporadas");
    }
  }

  async function handleRefreshCards() {
    const designName = refreshSeason || "Original";
    if (refreshTarget === "all") {
      const confirmed = confirm(
        `¿Actualizar las ${cards.length} tarjetas con el diseño "${designName}"?`
      );
      if (!confirmed) return;
    } else if (refreshSeason !== activeWalletSeason) {
      const confirmed = confirm(
        `El diseño "${designName}" queda activo para TODAS las tarjetas: las que no actualices ahora lo recibirán en su próximo sello. ¿Continuar?`
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/refresh-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: refreshTarget === "specific" ? selectedCardsForRefresh : undefined,
          season: refreshSeason || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setActiveWalletSeason(data.season ?? "");
      toast.success(
        data.apple
          ? `${data.cards} tarjeta(s) actualizada(s) · aviso enviado a ${data.apple.sent} iPhone(s)`
          : `${data.cards} tarjeta(s) actualizada(s) (no se pudo avisar a Apple Wallet)`
      );
      setRefreshDialogOpen(false);
      setSelectedCardsForRefresh([]);
      setRefreshSearch("");
    } catch {
      toast.error("Error al actualizar tarjetas");
    } finally {
      setSubmitting(false);
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

  const birthdayCards = useMemo(() => cards.filter(birthdayIsThisMonth), [cards]);

  async function handleSendPromotion() {
    if (!promoMessage.trim()) {
      toast.error("El mensaje es requerido");
      return;
    }
    const targetCardIds =
      promoTarget === "specific"
        ? selectedCardsForPromo
        : promoTarget === "birthday"
          ? birthdayCards.map((c) => c.id)
          : undefined;
    if (targetCardIds && targetCardIds.length === 0) {
      toast.error("No hay tarjetas seleccionadas");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/loyalty-cards/promotions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promoMessage.trim(),
          targetType: targetCardIds ? "specific" : "all",
          targetCardIds,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        data.apple
          ? `Promoción enviada a ${data.sentTo} tarjetas · ${data.apple.sent} iPhone(s) avisados, Android en camino`
          : `Promoción enviada a ${data.sentTo} tarjetas`
      );
      setPromoDialogOpen(false);
      setPromoMessage("");
      setSelectedCardsForPromo([]);
      fetchCards();
    } catch {
      toast.error("Error enviando promoción");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadPass(cardId: string) {
    window.open(`${getApiUrl()}/api/wallet/pass/${cardId}`, "_blank");
  }

  function addToGoogleWallet(cardId: string) {
    window.open(`${getApiUrl()}/api/wallet/google-pass/${cardId}`, "_blank");
  }

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: cards.length,
      withApple: cards.filter((c) => (c.appleDevices ?? 0) > 0).length,
      active30: cards.filter((c) => lastActivityMs(c) > now - 30 * DAY_MS).length,
      pendingRewards: cards.reduce((sum, c) => sum + c.rewardsAvailable, 0),
      withPendingRewards: cards.filter((c) => c.rewardsAvailable > 0).length,
      near: cards.filter(isNearReward).length,
    };
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cards.filter((c) => {
      if (cardFilter === "reward" && c.rewardsAvailable === 0) return false;
      if (cardFilter === "near" && !isNearReward(c)) return false;
      if (cardFilter === "birthday" && !birthdayIsThisMonth(c)) return false;
      if (cardFilter === "inactive" && !isInactive(c)) return false;
      if (!q) return true;
      return (
        fullName(c).toLowerCase().includes(q) ||
        (c.customerPhone ?? "").toLowerCase().includes(q) ||
        (c.customerEmail ?? "").toLowerCase().includes(q) ||
        c.barcodeValue.toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    if (cardSort === "activity") sorted.sort((a, b) => lastActivityMs(b) - lastActivityMs(a));
    else if (cardSort === "stamps")
      sorted.sort(
        (a, b) =>
          b.rewardsAvailable - a.rewardsAvailable ||
          b.stamps - a.stamps ||
          b.totalStamps - a.totalStamps
      );
    else if (cardSort === "name") sorted.sort((a, b) => fullName(a).localeCompare(fullName(b), "es"));
    else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [cards, search, cardFilter, cardSort]);

  const filterOptions: { value: CardFilter; label: string; count?: number }[] = [
    { value: "all", label: "Todos", count: cards.length },
    { value: "reward", label: "Con premio", count: stats.withPendingRewards },
    { value: "near", label: "Cerca del premio", count: stats.near },
    { value: "birthday", label: "Cumplen este mes", count: birthdayCards.length },
    { value: "inactive", label: "Sin venir +60 días" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Clientes Frecuentes
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPromoDialogOpen(true)}>
            <PaperPlaneTilt className="mr-1 size-4" /> Enviar Promoción
          </Button>
          <Button variant="outline" onClick={openRefreshDialog}>
            <ArrowsClockwise className="mr-1 size-4" /> Actualizar Tarjetas
          </Button>
          <Button onClick={openCreateDialog}>
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
              Muestra este QR a tus clientes para que se registren desde su celular y guarden su tarjeta en Apple Wallet o Google Wallet.
            </p>
            <code className="block text-xs text-muted-foreground">
              {registerUrl}
            </code>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tarjetas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">
              {stats.withApple} con Apple Wallet
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activos (30 días)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active30}</p>
            <p className="text-xs text-muted-foreground">
              con un sello o canje reciente
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Premios por Canjear</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pendingRewards}</p>
            <p className="text-xs text-muted-foreground">
              de {stats.withPendingRewards} cliente(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cerca del Premio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.near}</p>
            <p className="text-xs text-muted-foreground">
              a 1–2 sellos · buen blanco para promo
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, apellido, teléfono, email o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={cardSort} onValueChange={(v) => setCardSort(v as CardSort)}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Más recientes</SelectItem>
              <SelectItem value="activity">Última visita</SelectItem>
              <SelectItem value="stamps">Más sellos / premios</SelectItem>
              <SelectItem value="name">Nombre (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={cardFilter === option.value ? "default" : "outline"}
              onClick={() => setCardFilter(option.value)}
            >
              {option.label}
              {option.count !== undefined && (
                <span className="ml-1 opacity-70">{option.count}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-center">Sellos</TableHead>
                <TableHead className="text-center">Premios</TableHead>
                <TableHead>Última visita</TableHead>
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
                    {cards.length === 0
                      ? "No hay tarjetas registradas"
                      : "Ningún cliente coincide con el filtro"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <div>
                        <p className="flex items-center gap-1.5 font-medium">
                          {fullName(card)}
                          {(card.appleDevices ?? 0) > 0 && (
                            <span title="Tiene la tarjeta en Apple Wallet">
                              <FaApple className="size-3.5 text-muted-foreground" />
                            </span>
                          )}
                          {birthdayIsThisMonth(card) && (
                            <span title="Cumple este mes">
                              <Cake className="size-4 text-pink-500" weight="fill" />
                            </span>
                          )}
                        </p>
                        {card.customerPhone && (
                          <p className="text-xs text-muted-foreground">
                            {card.customerPhone}
                          </p>
                        )}
                      </div>
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
                      {card.lastActivityAt
                        ? formatDistanceToNow(new Date(card.lastActivityAt), {
                            locale: es,
                            addSuffix: true,
                          })
                        : "—"}
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
                          onClick={() => openDetail(card)}
                          title="Ver detalle"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(card)}
                          title="Editar cliente"
                        >
                          <PencilSimple className="size-4" />
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
                          <FaApple className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addToGoogleWallet(card.id)}
                          title="Google Wallet"
                        >
                          <FaGoogle className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCard(card.id, fullName(card))}
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

      {/* Create / Edit Card Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingCardId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCardId ? "Editar Cliente" : "Nueva Tarjeta de Cliente"}
            </DialogTitle>
            <DialogDescription>
              {editingCardId
                ? "Los cambios también se reflejan en su tarjeta de Wallet."
                : "Crea una tarjeta de lealtad para un nuevo cliente"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={form.customerName}
                  onChange={(e) =>
                    setForm({ ...form, customerName: e.target.value })
                  }
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label>Apellido *</Label>
                <Input
                  value={form.customerLastName}
                  onChange={(e) =>
                    setForm({ ...form, customerLastName: e.target.value })
                  }
                  placeholder="Apellido"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono{editingCardId ? "" : " *"}</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cumpleaños</Label>
                <Input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm({ ...form, birthDate: e.target.value })
                  }
                />
              </div>
              {!editingCardId && (
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
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCard} disabled={submitting}>
              {submitting
                ? "Guardando..."
                : editingCardId
                  ? "Guardar Cambios"
                  : "Crear Tarjeta"}
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
              {stampCard && fullName(stampCard)} — {stampCard?.stamps}/
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCard && fullName(selectedCard)}</DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-4">
              <ApplePassPreview card={selectedCard} />

              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Teléfono</span>
                <span>{selectedCard.customerPhone || "—"}</span>
                <span className="text-muted-foreground">Email</span>
                <span className="break-all">{selectedCard.customerEmail || "—"}</span>
                <span className="text-muted-foreground">Cumpleaños</span>
                <span>
                  {selectedCard.birthDate ? formatBirthDate(selectedCard.birthDate) : "—"}
                </span>
                <span className="text-muted-foreground">Código</span>
                <code className="text-xs">{selectedCard.barcodeValue}</code>
                <span className="text-muted-foreground">Total sellos</span>
                <span>{selectedCard.totalStamps}</span>
                <span className="text-muted-foreground">
                  Premios canjeados
                </span>
                <span>{selectedCard.rewardsRedeemed}</span>
                <span className="text-muted-foreground">Apple Wallet</span>
                <span>
                  {(selectedCard.appleDevices ?? 0) > 0
                    ? `Instalada (${selectedCard.appleDevices} dispositivo${selectedCard.appleDevices === 1 ? "" : "s"})`
                    : "No instalada"}
                </span>
                {selectedCard.latestMessage && (
                  <>
                    <span className="text-muted-foreground">Último mensaje</span>
                    <span>{selectedCard.latestMessage}</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedCard.rewardsAvailable > 0 && (
                  <Button
                    onClick={() => handleRedeemReward(selectedCard)}
                    className="flex-1"
                  >
                    <Gift className="mr-1 size-4" />
                    Canjear Premio
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => openEditDialog(selectedCard)}
                  className="flex-1"
                >
                  <PencilSimple className="mr-1 size-4" />
                  Editar
                </Button>
                {(deviceType === "ios" || deviceType === "other") && (
                  <Button
                    variant="outline"
                    onClick={() => downloadPass(selectedCard.id)}
                    className="flex-1"
                  >
                    <FaApple className="mr-1 size-4" />
                    Apple Wallet
                  </Button>
                )}
                {(deviceType === "android" || deviceType === "other") && (
                  <Button
                    variant="outline"
                    onClick={() => addToGoogleWallet(selectedCard.id)}
                    className="flex-1"
                  >
                    <FaGoogle className="mr-1 size-4" />
                    Google Wallet
                  </Button>
                )}
              </div>

              {/* Stamp / redeem history */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Historial</p>
                <div className="max-h-56 overflow-y-auto rounded-lg border">
                  {transactionsLoading ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      Cargando...
                    </p>
                  ) : transactions.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      Sin movimientos todavía
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {transactions.map((tx) => (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {tx.rewardRedeemed ? (
                              <Gift className="size-4 text-primary" />
                            ) : (
                              <Stamp className="size-4 text-muted-foreground" />
                            )}
                            <div>
                              <p>
                                {tx.rewardRedeemed
                                  ? "Premio canjeado"
                                  : `+${tx.stampsAdded} sello${tx.stampsAdded === 1 ? "" : "s"}`}
                              </p>
                              {tx.orderNumber !== null && (
                                <p className="text-xs text-muted-foreground">
                                  Orden #{tx.orderNumber}
                                  {tx.orderTotal && ` · $${Number(tx.orderTotal).toFixed(2)}`}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(new Date(tx.createdAt), "dd MMM yy, HH:mm", {
                              locale: es,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Dialog (quick QR for a specific card) */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">{qrCard && fullName(qrCard)}</DialogTitle>
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

      {/* Promotion Dialog */}
      <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar Promoción</DialogTitle>
            <DialogDescription>
              Llega como notificación a las tarjetas en Apple Wallet y Google Wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="promo-message">Mensaje</Label>
              <Input
                id="promo-message"
                value={promoMessage}
                onChange={(e) => setPromoMessage(e.target.value)}
                placeholder="Ej: ¡2x1 en cafés este fin de semana!"
                maxLength={140}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {promoMessage.length}/140 caracteres · Google solo notifica hasta 3
                mensajes por tarjeta al día (los demás quedan en la tarjeta sin aviso).
              </p>
            </div>

            <div>
              <Label>Destinatarios</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  type="button"
                  variant={promoTarget === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPromoTarget("all")}
                >
                  Todas las tarjetas
                </Button>
                <Button
                  type="button"
                  variant={promoTarget === "birthday" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPromoTarget("birthday")}
                >
                  <Cake className="mr-1 size-4" />
                  Cumplen este mes ({birthdayCards.length})
                </Button>
                <Button
                  type="button"
                  variant={promoTarget === "specific" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPromoTarget("specific")}
                >
                  Seleccionar tarjetas
                </Button>
              </div>
            </div>

            {promoTarget === "birthday" && birthdayCards.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {birthdayCards.map(fullName).join(", ")}
              </p>
            )}

            {promoTarget === "specific" && (
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-2">
                  Selecciona las tarjetas:
                </p>
                {filtered.map((card) => (
                  <label
                    key={card.id}
                    className="flex items-center gap-2 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCardsForPromo.includes(card.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCardsForPromo((prev) => [...prev, card.id]);
                        } else {
                          setSelectedCardsForPromo((prev) =>
                            prev.filter((id) => id !== card.id)
                          );
                        }
                      }}
                    />
                    <span className="text-sm">
                      {fullName(card)} — {card.customerPhone}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendPromotion}
              disabled={submitting || !promoMessage.trim()}
            >
              {submitting ? "Enviando..." : "Enviar Promoción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refresh Wallet Cards Dialog */}
      <Dialog open={refreshDialogOpen} onOpenChange={setRefreshDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Actualizar Tarjetas</DialogTitle>
            <DialogDescription>
              Reenvía el diseño elegido (logo y sellos) a Apple Wallet y Google Wallet.
              Prueba primero con tu tarjeta antes de mandarlo a todas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Diseño</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {["", ...walletSeasons].map((season) => (
                  <Button
                    key={season || "original"}
                    type="button"
                    variant={refreshSeason === season ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRefreshSeason(season)}
                  >
                    {season || "Original"}
                    {season === activeWalletSeason && " (activo)"}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>Tarjetas</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={refreshTarget === "specific" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRefreshTarget("specific")}
                >
                  Seleccionar tarjetas
                </Button>
                <Button
                  type="button"
                  variant={refreshTarget === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRefreshTarget("all")}
                >
                  Todas las tarjetas ({cards.length})
                </Button>
              </div>
            </div>

            {refreshTarget === "specific" && (
              <div className="space-y-2">
                <Input
                  value={refreshSearch}
                  onChange={(e) => setRefreshSearch(e.target.value)}
                  placeholder="Buscar por nombre o teléfono..."
                />
                <div className="border rounded-md p-3 max-h-60 overflow-y-auto">
                  {cards
                    .filter((card) => {
                      const q = refreshSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        fullName(card).toLowerCase().includes(q) ||
                        (card.customerPhone ?? "").includes(q)
                      );
                    })
                    .map((card) => (
                      <label
                        key={card.id}
                        className="flex items-center gap-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCardsForRefresh.includes(card.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCardsForRefresh((prev) => [...prev, card.id]);
                            } else {
                              setSelectedCardsForRefresh((prev) =>
                                prev.filter((id) => id !== card.id)
                              );
                            }
                          }}
                        />
                        <span className="text-sm">
                          {fullName(card)} — {card.customerPhone}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefreshDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRefreshCards}
              disabled={
                submitting ||
                (refreshTarget === "specific" && selectedCardsForRefresh.length === 0)
              }
            >
              {submitting
                ? "Actualizando..."
                : refreshTarget === "all"
                  ? "Actualizar todas"
                  : `Actualizar ${selectedCardsForRefresh.length} tarjeta(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
